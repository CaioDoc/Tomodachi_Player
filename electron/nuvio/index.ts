// electron/nuvio/index.ts
// Integração com os plugins (scrapers locais) do Nuvio.
//
// - Os plugins são código JavaScript de terceiros. Eles rodam numa janela oculta do
//   Chromium com sandbox (sem Node, sem acesso a arquivos) e numa sessão separada.
// - A rede e a criptografia passam por aqui, com limites de tamanho e tempo.
// - O código de cada plugin fica em cache no disco (atualiza quando a versão muda).

import { app, BrowserWindow, ipcMain } from 'electron';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { registerStreamHeaders } from '../streamHeaders';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const MAX_BODY = 25 * 1024 * 1024;
const MAX_CODE = 8 * 1024 * 1024;
const FETCH_TIMEOUT = 25_000;

let host: BrowserWindow | null = null;
let hostReady: Promise<BrowserWindow> | null = null;

const isHttp = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

function runtimeSource(): string {
  const candidates = [path.join(__dirname, 'nuvio-runtime.js'), path.join(__dirname, '..', 'dist-electron', 'nuvio-runtime.js')];
  for (const c of candidates) {
    try {
      return fs.readFileSync(c, 'utf8');
    } catch {
      /* próximo */
    }
  }
  throw new Error('nuvio-runtime.js não encontrado (rode o build do Electron)');
}

function ensureHost(): Promise<BrowserWindow> {
  if (host && !host.isDestroyed() && hostReady) return hostReady;
  hostReady = (async () => {
    const win = new BrowserWindow({
      show: false,
      skipTaskbar: true,
      width: 400,
      height: 300,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        spellcheck: false,
        backgroundThrottling: false,
        partition: 'nuvio-plugins',
        preload: path.join(__dirname, 'nuvio-host-preload.js'),
      },
    });
    host = win;
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    win.webContents.on('render-process-gone', () => destroyNuvioHost());
    win.on('closed', () => {
      if (host === win) {
        host = null;
        hostReady = null;
      }
    });
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><meta charset="utf-8"><title>Tomodachi · Nuvio</title>'));
    await win.webContents.executeJavaScript(runtimeSource(), true);
    const ok = await win.webContents.executeJavaScript('typeof window.__nuvioRun === "function"', true);
    if (!ok) throw new Error('Falha ao iniciar o ambiente dos plugins');
    return win;
  })().catch((err) => {
    destroyNuvioHost();
    throw err;
  });
  return hostReady;
}

export function destroyNuvioHost() {
  const win = host;
  host = null;
  hostReady = null;
  try {
    if (win && !win.isDestroyed()) win.destroy();
  } catch {
    /* ignore */
  }
}

/* ───────────── rede ───────────── */

async function doFetch(req: { url: string; method?: string; headers?: Record<string, string>; body?: Uint8Array | string | null; redirect?: string }) {
  if (!isHttp(req?.url)) return { ok: false, status: 0, statusText: '', url: String(req?.url || ''), redirected: false, headers: [], body: new Uint8Array(0), error: 'URL inválida' };
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers || {})) {
    if (!k || v == null || /[\r\n]/.test(String(v))) continue;
    headers[k] = String(v);
  }
  if (!Object.keys(headers).some((k) => k.toLowerCase() === 'user-agent')) headers['User-Agent'] = UA;
  const method = String(req.method || 'GET').toUpperCase();
  try {
    const res = await fetch(req.url, {
      method,
      headers,
      body: method === 'GET' || method === 'HEAD' || req.body == null ? undefined : (req.body as any),
      redirect: req.redirect === 'manual' ? 'manual' : 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT),
    });
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (res.body) {
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > MAX_BODY) {
          try {
            await reader.cancel();
          } catch {
            /* ignore */
          }
          break;
        }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(Math.min(size, MAX_BODY));
    let o = 0;
    for (const c of chunks) {
      body.set(c.subarray(0, Math.max(0, body.length - o)), o);
      o += c.length;
    }
    const outHeaders: [string, string][] = [];
    res.headers.forEach((v, k) => outHeaders.push([k, v]));
    return { ok: res.ok, status: res.status, statusText: res.statusText, url: res.url || req.url, redirected: res.redirected, headers: outHeaders, body };
  } catch (err: any) {
    return { ok: false, status: 0, statusText: '', url: req.url, redirected: false, headers: [], body: new Uint8Array(0), error: String(err?.cause?.code || err?.message || err) };
  }
}

/* ───────────── criptografia (para o crypto-js dos plugins) ───────────── */

const HASHES = new Set(['md5', 'sha1', 'sha224', 'sha256', 'sha384', 'sha512', 'ripemd160']);
const toBuf = (v: any) => Buffer.from(v instanceof Uint8Array ? v : new Uint8Array(v || []));

function doCrypto(op: any): { data?: Uint8Array; error?: string } {
  try {
    switch (op?.op) {
      case 'hash':
        if (!HASHES.has(op.alg)) throw new Error(`hash ${op.alg} indisponível`);
        return { data: new Uint8Array(crypto.createHash(op.alg).update(toBuf(op.data)).digest()) };
      case 'hmac':
        if (!HASHES.has(op.alg)) throw new Error(`hmac ${op.alg} indisponível`);
        return { data: new Uint8Array(crypto.createHmac(op.alg, toBuf(op.key)).update(toBuf(op.data)).digest()) };
      case 'cipher': {
        const iv = op.iv ? toBuf(op.iv) : null;
        const c = op.decrypt ? crypto.createDecipheriv(op.alg, toBuf(op.key), iv) : crypto.createCipheriv(op.alg, toBuf(op.key), iv);
        c.setAutoPadding(!!op.autoPadding);
        return { data: new Uint8Array(Buffer.concat([c.update(toBuf(op.data)), c.final()])) };
      }
      case 'pbkdf2': {
        const iterations = Math.max(1, Math.min(5_000_000, Math.floor(op.iterations || 1)));
        const keylen = Math.max(1, Math.min(1024, Math.floor(op.keylen || 16)));
        const digest = HASHES.has(op.digest) ? op.digest : 'sha256';
        return { data: new Uint8Array(crypto.pbkdf2Sync(toBuf(op.password), toBuf(op.salt), iterations, keylen, digest)) };
      }
      case 'random':
        return { data: new Uint8Array(crypto.randomBytes(Math.max(0, Math.min(4096, Math.floor(op.n || 0))))) };
      default:
        throw new Error('operação desconhecida');
    }
  } catch (err: any) {
    return { error: String(err?.message || err) };
  }
}

/* ───────────── código dos plugins ───────────── */

const memCode = new Map<string, { version: string; code: string }>();
const cacheDir = () => path.join(app.getPath('userData'), 'nuvio-plugins');
const cacheFile = (url: string) => path.join(cacheDir(), crypto.createHash('sha1').update(url).digest('hex') + '.json');

async function loadCode(url: string, version: string, force = false): Promise<string> {
  const mem = memCode.get(url);
  if (!force && mem && mem.version === version) return mem.code;
  let disk: { version: string; code: string } | null = null;
  try {
    disk = JSON.parse(await fsp.readFile(cacheFile(url), 'utf8'));
  } catch {
    disk = null;
  }
  if (!force && disk && disk.version === version && disk.code) {
    memCode.set(url, disk);
    return disk.code;
  }
  const res = await doFetch({ url, headers: { 'Cache-Control': 'no-cache' } });
  if (!res.error && res.status >= 200 && res.status < 300 && res.body.length > 0 && res.body.length < MAX_CODE) {
    const code = new TextDecoder('utf-8').decode(res.body);
    const entry = { version, code };
    memCode.set(url, entry);
    try {
      await fsp.mkdir(cacheDir(), { recursive: true });
      await fsp.writeFile(cacheFile(url), JSON.stringify(entry));
    } catch {
      /* cache opcional */
    }
    return code;
  }
  if (disk?.code) return disk.code; // sem internet: usa a versão guardada
  throw new Error(res.error || `HTTP ${res.status} ao baixar o plugin`);
}

/* ───────────── IPC ───────────── */

export function registerNuvioIpc() {
  // Só a janela dos plugins pode usar a rede e a criptografia desta ponte
  const fromHost = (e: Electron.IpcMainEvent | Electron.IpcMainInvokeEvent) => !!host && !host.isDestroyed() && e.sender.id === host.webContents.id;

  ipcMain.handle('nuvio:host-fetch', async (e, req) => {
    if (!fromHost(e)) return { ok: false, status: 0, statusText: '', url: '', redirected: false, headers: [], body: new Uint8Array(0), error: 'negado' };
    return doFetch(req);
  });

  ipcMain.on('nuvio:host-crypto', (e, op) => {
    e.returnValue = fromHost(e) ? doCrypto(op) : { error: 'negado' };
  });

  // Manifesto do repositório / catálogo (sem CORS)
  ipcMain.handle('nuvio:fetchText', async (_e, args: { url: string; headers?: Record<string, string> }) => {
    if (!isHttp(args?.url)) return { success: false, error: 'URL inválida' };
    const res = await doFetch({ url: args.url, headers: { Accept: 'application/json, text/plain, */*', ...(args.headers || {}) } });
    if (res.error) return { success: false, error: res.error };
    return { success: res.status >= 200 && res.status < 300, status: res.status, text: new TextDecoder('utf-8').decode(res.body), url: res.url, error: res.status >= 400 ? `HTTP ${res.status}` : undefined };
  });

  ipcMain.handle(
    'nuvio:runScraper',
    async (
      _e,
      args: { id: string; codeUrl: string; version?: string; tmdbId: string; mediaType: 'movie' | 'tv'; season?: number | null; episode?: number | null; timeoutMs?: number }
    ) => {
      if (!args || !isHttp(args.codeUrl) || !args.tmdbId) return { success: false, error: 'Parâmetros inválidos' };
      const started = Date.now();
      try {
        const code = await loadCode(args.codeUrl, String(args.version || ''));
        const win = await ensureHost();
        const key = `${args.id}@${args.version || ''}@${crypto.createHash('sha1').update(code).digest('hex').slice(0, 10)}`;
        const call = `window.__nuvioRun(${JSON.stringify(key)}, ${JSON.stringify(code)}, ${JSON.stringify({
          tmdbId: String(args.tmdbId),
          mediaType: args.mediaType === 'tv' ? 'tv' : 'movie',
          season: args.season ?? null,
          episode: args.episode ?? null,
        })})`;
        const timeout = Math.max(5_000, Math.min(120_000, args.timeoutMs || 45_000));
        const result: any = await Promise.race([
          win.webContents.executeJavaScript(call, true),
          new Promise((resolve) => setTimeout(() => resolve({ ok: false, error: 'Tempo esgotado' }), timeout)),
        ]);
        if (!result?.ok) return { success: false, error: result?.error || 'Falha no plugin', ms: Date.now() - started };
        return { success: true, streams: Array.isArray(result.streams) ? result.streams : [], ms: Date.now() - started };
      } catch (err: any) {
        return { success: false, error: String(err?.message || err), ms: Date.now() - started };
      }
    }
  );

  // Antes de tocar um stream: guarda os cabeçalhos exigidos (Referer etc.)
  ipcMain.handle('nuvio:registerStream', (_e, args: { url: string; headers?: Record<string, string> }) => {
    if (!isHttp(args?.url)) return { success: false };
    registerStreamHeaders(args.url, args.headers);
    return { success: true };
  });

  ipcMain.handle('nuvio:clearCache', async () => {
    memCode.clear();
    destroyNuvioHost();
    try {
      await fsp.rm(cacheDir(), { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    return { success: true };
  });

  app.on('before-quit', destroyNuvioHost);
}
