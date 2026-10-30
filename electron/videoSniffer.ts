// electron/videoSniffer.ts
// Acha o vídeo de verdade (m3u8/mp4/mpd) por trás da página de um episódio, para tocar no player do app.
// Abre a página numa janela escondida e muda, aperta "play" em todos os players (inclusive dentro de
// iframes) e escuta a rede: o primeiro pedido de mídia é o vídeo. Nunca devolve a página do site.

import { BrowserWindow, session, type Session } from 'electron';
import { handleAdblockBeforeRequest } from './adblocker';

export interface SniffResult {
  /** Endereço do vídeo (m3u8, mp4…) */
  url: string;
  /** Página que pediu o vídeo (muitos servidores exigem esse Referer) */
  referer: string;
  kind: 'hls' | 'mp4' | 'dash' | 'other';
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Anúncios, rastreadores e vídeos de propaganda que não são o episódio
const NOT_THE_VIDEO =
  /analytics|track(?:ing|er)?[/.?]|doubleclick|googlesyndication|googlevideo\.com\/videoplayback.*(?:ad|ads)=|imasdk|vast|vpaid|preroll|popunder|popads|pemsrv|smartpop|mayzaent|greentrafsa|silent-basis|exoclick|syndication|adserver|\/ads?\/|adsterra|propellerads|juicyads|trafficjunky|banner/i;

const MEDIA_EXT = /\.(m3u8|mp4|mpd|webm|mkv)(?:[?#]|$)/i;
const SEGMENT = /\.(ts|m4s|aac|key)(?:[?#]|$)|\/seg(?:ment)?[-_]?\d+/i;

function classify(url: string, contentType = ''): SniffResult['kind'] | null {
  if (!/^https?:\/\//i.test(url) || NOT_THE_VIDEO.test(url) || SEGMENT.test(url)) return null;
  const ct = contentType.toLowerCase();
  const ext = (url.match(MEDIA_EXT) || [])[1]?.toLowerCase();
  if (ext === 'm3u8' || ct.includes('mpegurl')) return 'hls';
  if (ext === 'mpd' || ct.includes('dash+xml')) return 'dash';
  if (ext === 'mp4' || ext === 'webm' || ext === 'mkv' || ct.startsWith('video/')) return 'mp4';
  return null;
}

// Aperta play onde der: botões de play conhecidos, o <video> e o centro do player
const PLAY_SCRIPT = `(() => {
  try {
    if (typeof start_player === 'function') start_player();
    const sel = ['.jw-icon-display', '.vjs-big-play-button', '.plyr__control--overlaid', '.fp-play', '#overlay_layer',
      '.playbutton', '.play-btn', '.btn-play', '.play-button', 'button[class*="play" i]', 'div[class*="play" i][role="button"]', '[aria-label*="play" i]'];
    for (const s of sel) { const el = document.querySelector(s); if (el) { el.click(); break; } }
    for (const v of document.querySelectorAll('video')) { v.muted = true; const p = v.play && v.play(); if (p && p.catch) p.catch(() => {}); }
    const src = [...document.querySelectorAll('video')].map((v) => v.currentSrc || v.src).find((u) => /^https?:/i.test(u || ''));
    return src || null;
  } catch { return null; }
})()`;

// Uma busca por vez, numa sessão só dela (em memória, separada do navegador do app)
let queue: Promise<unknown> = Promise.resolve();

export function sniffMedia(pageUrl: string, opts: { timeoutMs?: number; referer?: string } = {}): Promise<SniffResult | null> {
  const run = queue.then(() => sniffOnce(pageUrl, opts));
  queue = run.catch(() => null);
  return run;
}

function sniffOnce(pageUrl: string, opts: { timeoutMs?: number; referer?: string }): Promise<SniffResult | null> {
  const timeoutMs = opts.timeoutMs ?? 25000;
  return new Promise((resolve) => {
    const ses: Session = session.fromPartition('tp-video-sniffer');
    let done = false;
    let best: SniffResult | null = null;
    let mp4Timer: NodeJS.Timeout | null = null;
    let pokeTimer: NodeJS.Timeout | null = null;

    const win = new BrowserWindow({
      show: false,
      width: 1280,
      height: 720,
      webPreferences: {
        session: ses,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        autoplayPolicy: 'no-user-gesture-required',
      },
    });
    win.webContents.setAudioMuted(true);
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

    const finish = (r: SniffResult | null) => {
      if (done) return;
      done = true;
      clearTimeout(hardTimer);
      if (mp4Timer) clearTimeout(mp4Timer);
      if (pokeTimer) clearInterval(pokeTimer);
      try {
        ses.webRequest.onBeforeRequest(null);
        ses.webRequest.onHeadersReceived(null);
      } catch {
        /* ignore */
      }
      try {
        win.destroy();
      } catch {
        /* ignore */
      }
      void ses.clearStorageData().catch(() => {});
      resolve(r);
    };

    const found = (url: string, referer: string, kind: SniffResult['kind']) => {
      if (done) return;
      const hit = { url, referer: referer || pageUrl, kind };
      // HLS/DASH é o melhor sinal (é o episódio inteiro); mp4 espera um pouco por um m3u8
      if (kind === 'hls' || kind === 'dash') return finish(hit);
      if (!best) {
        best = hit;
        mp4Timer = setTimeout(() => finish(best), 2500);
      }
    };

    const hardTimer = setTimeout(() => finish(best), timeoutMs);

    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const kind = classify(details.url);
      if (kind && details.resourceType !== 'mainFrame') {
        found(details.url, details.referrer || '', kind);
        return callback({});
      }
      if (!handleAdblockBeforeRequest(details, callback)) callback({});
    });
    // Vídeos sem extensão no endereço: reconhece pelo tipo da resposta
    ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      if (details.resourceType !== 'mainFrame') {
        const h = details.responseHeaders || {};
        const ct = (h['content-type'] || h['Content-Type'] || [])[0] || '';
        const kind = classify(details.url, ct);
        if (kind && (ct || MEDIA_EXT.test(details.url))) found(details.url, details.referrer || '', kind);
      }
      callback({});
    });

    // Aperta play em todos os frames de tempos em tempos (players costumam carregar devagar)
    const poke = async () => {
      if (done || win.isDestroyed()) return;
      for (const frame of win.webContents.mainFrame.framesInSubtree) {
        try {
          const src = await frame.executeJavaScript(PLAY_SCRIPT, true);
          const kind = typeof src === 'string' ? classify(src) || 'mp4' : null;
          if (kind && typeof src === 'string' && !NOT_THE_VIDEO.test(src)) found(src, frame.url || pageUrl, kind);
        } catch {
          /* frame fechou ou bloqueou */
        }
      }
    };
    win.webContents.on('did-finish-load', () => {
      void poke();
      if (!pokeTimer) pokeTimer = setInterval(() => void poke(), 1500);
    });
    // Página que não terminou de carregar (anúncios pesados): começa a apertar play mesmo assim
    setTimeout(() => {
      if (!done && !pokeTimer) pokeTimer = setInterval(() => void poke(), 1500);
    }, 6000);

    win
      .loadURL(pageUrl, { userAgent: UA, httpReferrer: opts.referer || undefined })
      .catch(() => {
        /* erros de navegação (ex.: abortada por redirecionamento) não impedem a captura */
      });
  });
}
