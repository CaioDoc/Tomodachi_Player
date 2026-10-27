// electron/torrent/index.ts
// Gerencia o motor de torrent (processo separado) e expõe IPC para o renderer:
//   torrent:available → o motor está disponível?
//   torrent:start     → adiciona o torrent, espera os metadados e devolve a URL local do vídeo
//   torrent:status    → peers, velocidade e progresso
//   torrent:stop      → para e apaga o torrent

import { app, ipcMain, utilityProcess, type UtilityProcess } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';

/** Trackers públicos usados além dos que o addon/plugin informar */
const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.demonii.com:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://exodus.desync.com:6969/announce',
  'udp://tracker.openbittorrent.com:6969/announce',
  'udp://explodie.org:6969/announce',
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.btorrent.xyz',
];

let proc: UtilityProcess | null = null;
let ready: Promise<number> | null = null;
let unavailableReason: string | null = null;

function enginePath(): string {
  return path.join(__dirname, 'torrent-engine.js');
}

function startEngine(): Promise<number> {
  if (ready) return ready;
  ready = new Promise<number>((resolve, reject) => {
    const file = enginePath();
    if (!fs.existsSync(file)) {
      unavailableReason = 'torrent-engine.js não encontrado (rode o build de novo)';
      reject(new Error(unavailableReason));
      return;
    }
    let settled = false;
    const done = (fn: () => void) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        fn();
      }
    };
    const timer = setTimeout(() => done(() => reject(new Error('O motor de torrent não respondeu')))
      , 20_000);
    try {
      proc = utilityProcess.fork(file, [], { serviceName: 'Tomodachi Torrent', stdio: 'pipe' });
    } catch (err: any) {
      done(() => reject(err));
      return;
    }
    proc.stdout?.on('data', (d) => console.log('[torrent]', String(d).trim()));
    proc.stderr?.on('data', (d) => console.warn('[torrent]', String(d).trim()));
    proc.on('message', (msg: any) => {
      if (msg?.type === 'ready') done(() => resolve(Number(msg.port)));
      else if (msg?.type === 'unavailable') {
        unavailableReason = String(msg.error || 'indisponível');
        done(() => reject(new Error(unavailableReason!)));
      } else if (msg?.type === 'log') console.warn('[torrent]', msg.error);
    });
    proc.on('exit', (code) => {
      proc = null;
      // Permite tentar de novo depois (a não ser que o motor diga que está indisponível)
      if (!unavailableReason) ready = null;
      done(() => reject(new Error(`O motor de torrent fechou (código ${code})`)));
    });
  });
  ready.catch(() => {
    /* tratado por quem chamou */
  });
  return ready;
}

function getJson(port: number, pathname: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port, path: pathname, timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const data = JSON.parse(body || '{}');
          if ((res.statusCode || 500) >= 400) reject(new Error(data?.error || `HTTP ${res.statusCode}`));
          else resolve(data);
        } catch {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado')));
    req.on('error', reject);
  });
}

export interface TorrentStartArgs {
  magnet?: string;
  infoHash?: string;
  fileIdx?: number | null;
  /** Trackers no formato do Stremio ("tracker:udp://…") ou URLs diretas */
  sources?: string[];
  /** Nome do arquivo esperado (behaviorHints.filename) */
  filename?: string;
  name?: string;
}

/** Monta o link magnet com os trackers do addon + os públicos */
export function buildMagnet(args: TorrentStartArgs): string | null {
  let magnet = String(args.magnet || '');
  const hash = String(args.infoHash || '').trim().toLowerCase();
  if (!/^magnet:\?/i.test(magnet)) {
    if (!/^[a-f0-9]{40}$|^[a-z2-7]{32}$/i.test(hash)) return null;
    magnet = `magnet:?xt=urn:btih:${hash}`;
    if (args.name) magnet += `&dn=${encodeURIComponent(args.name)}`;
  }
  const trackers = new Set<string>();
  for (const s of args.sources || []) {
    const v = String(s).replace(/^tracker:/i, '');
    if (/^(udp|https?|wss?):\/\//i.test(v)) trackers.add(v);
  }
  for (const t of DEFAULT_TRACKERS) trackers.add(t);
  for (const t of trackers) if (!magnet.includes(encodeURIComponent(t))) magnet += `&tr=${encodeURIComponent(t)}`;
  return magnet;
}

export function registerTorrentIpc() {
  ipcMain.handle('torrent:available', async () => {
    try {
      await startEngine();
      return { available: true };
    } catch (err: any) {
      return { available: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('torrent:start', async (_e, args: TorrentStartArgs) => {
    const magnet = buildMagnet(args || {});
    if (!magnet) return { success: false, error: 'Link de torrent inválido' };
    try {
      const port = await startEngine();
      const q = new URLSearchParams({ magnet });
      if (args.fileIdx != null && Number.isFinite(Number(args.fileIdx))) q.set('fileIdx', String(args.fileIdx));
      if (args.filename) q.set('name', args.filename);
      const data = await getJson(port, `/add?${q}`, 100_000);
      return { success: true, url: `http://127.0.0.1:${port}${data.path}`, infoHash: data.infoHash, name: data.name, length: data.length };
    } catch (err: any) {
      return { success: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('torrent:status', async (_e, infoHash: string) => {
    try {
      const port = await startEngine();
      return { success: true, ...(await getJson(port, `/status/${encodeURIComponent(String(infoHash || '').toLowerCase())}`, 5000)) };
    } catch (err: any) {
      return { success: false, error: String(err?.message || err) };
    }
  });

  ipcMain.handle('torrent:stop', async (_e, infoHash: string) => {
    if (!proc || !ready) return { success: true };
    try {
      const port = await ready;
      await getJson(port, `/remove/${encodeURIComponent(String(infoHash || '').toLowerCase())}`, 5000);
    } catch {
      /* ignore */
    }
    return { success: true };
  });

  app.on('will-quit', stopTorrentEngine);
}

export function stopTorrentEngine() {
  const p = proc;
  if (!p) return;
  proc = null;
  try {
    p.postMessage({ type: 'shutdown' });
  } catch {
    /* ignore */
  }
  setTimeout(() => {
    try {
      p.kill();
    } catch {
      /* ignore */
    }
  }, 1500);
}
