// electron/siteFetch.ts
// Baixa o HTML de uma página de site de anime para o app ler (a busca e a leitura ficam no renderer,
// com o DOMParser do Chromium). Primeiro tenta um pedido simples (rápido); se o site bloquear ou montar a
// página com JavaScript (ex.: proteção do Cloudflare), carrega numa janela escondida como um navegador,
// usando a mesma sessão do navegador do app (cookies de quem já passou pela verificação).

import { BrowserWindow, ipcMain } from 'electron';
import axios from 'axios';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; html: string; url: string }>();
// Sites que só abrem como navegador (proteção): vão direto para ele, sem esperar o pedido simples falhar
const browserHosts = new Set<string>();
// Sites fora do ar: falham na hora por 10 min, em vez de esperar o tempo limite a cada busca
const DOWN_MS = 10 * 60 * 1000;
const downHosts = new Map<string, number>();
const hostOf = (u: string) => {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return '';
  }
};

export interface FetchHtmlResult {
  success: boolean;
  html?: string;
  /** Endereço final (depois de redirecionamentos) */
  url?: string;
  via?: 'http' | 'browser';
  error?: string;
}

/** Página de verificação/bloqueio em vez do conteúdo */
const looksBlocked = (html: string) =>
  /<title>\s*(?:just a moment|attention required|un momento|um momento|access denied|ddos-guard)/i.test(html) || /cf-browser-verification|challenge-platform|cf_chl_opt/i.test(html);

async function viaHttp(url: string, referer?: string): Promise<FetchHtmlResult> {
  const res = await axios.get(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8',
      ...(referer ? { Referer: referer } : {}),
    },
    timeout: 9000,
    maxRedirects: 5,
    responseType: 'text',
    validateStatus: (s) => s >= 200 && s < 400,
  });
  const html = typeof res.data === 'string' ? res.data : '';
  const finalUrl = (res.request as any)?.res?.responseUrl || url;
  if (!html || looksBlocked(html)) return { success: false, error: 'blocked' };
  return { success: true, html, url: finalUrl, via: 'http' };
}

function viaBrowser(url: string, timeoutMs = 15000): Promise<FetchHtmlResult> {
  return new Promise((resolve) => {
    let done = false;
    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: { images: false, partition: 'persist:user_session', backgroundThrottling: false, sandbox: true, contextIsolation: true },
    });
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    const finish = (r: FetchHtmlResult) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearInterval(poll);
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
      resolve(r);
    };
    const grab = async () => {
      if (done || win.isDestroyed()) return;
      try {
        const html: string = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true);
        // Verificação do Cloudflare costuma sumir sozinha em poucos segundos: espera
        if (html && !looksBlocked(html) && html.length > 2000) finish({ success: true, html, url: win.webContents.getURL(), via: 'browser' });
      } catch {
        /* página ainda carregando */
      }
    };
    const timer = setTimeout(() => finish({ success: false, error: 'O site demorou demais para responder' }), timeoutMs);
    // Lê a página assim que carregar e de novo a cada 1,5 s (conteúdo montado por JavaScript)
    const poll = setInterval(() => void grab(), 1500);
    win.webContents.on('did-finish-load', () => setTimeout(() => void grab(), 700));
    // Site fora do ar / endereço inexistente: falha na hora (sem ler a página de erro do Chromium)
    win.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (isMainFrame && code !== -3) finish({ success: false, error: `${desc || 'falha'} (${code})` });
    });
    win.loadURL(url, { userAgent: UA }).catch(() => {
      /* redirecionamentos abortam a navegação inicial; o poll continua */
    });
  });
}

export async function fetchHtml(url: string, opts: { referer?: string; noCache?: boolean } = {}): Promise<FetchHtmlResult> {
  if (!/^https?:\/\//i.test(url)) return { success: false, error: 'URL inválida' };
  const hit = cache.get(url);
  if (!opts.noCache && hit && Date.now() - hit.at < CACHE_MS) return { success: true, html: hit.html, url: hit.url, via: 'http' };
  const host = hostOf(url);
  const downAt = downHosts.get(host);
  if (downAt && Date.now() - downAt < DOWN_MS) return { success: false, error: 'O site não respondeu' };
  let result: FetchHtmlResult = { success: false, error: 'blocked' };
  if (!browserHosts.has(host)) {
    try {
      result = await viaHttp(url, opts.referer);
    } catch (err: any) {
      result = { success: false, error: String(err?.message || err) };
    }
  }
  // 404 de verdade não precisa do navegador; o resto (403, 503, bloqueio, timeout) tenta como navegador
  if (!result.success && !/status code 404/.test(result.error || '')) {
    const httpError = result.error || '';
    result = await viaBrowser(url);
    if (result.success) browserHosts.add(host);
    else if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|timeout|EAI_AGAIN|certificate/i.test(httpError) || browserHosts.has(host)) downHosts.set(host, Date.now());
  }
  if (result.success && result.html) {
    cache.set(url, { at: Date.now(), html: result.html, url: result.url || url });
    if (cache.size > 80) cache.delete(cache.keys().next().value as string);
  }
  return result;
}

export function registerSiteFetchIpc() {
  ipcMain.handle('site:fetchHtml', (_e, args: { url: string; referer?: string; noCache?: boolean }) => fetchHtml(String(args?.url || ''), { referer: args?.referer, noCache: !!args?.noCache }));
}
