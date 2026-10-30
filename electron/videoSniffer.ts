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
    // Todos os <video> com endereço de verdade, com duração e tamanho na tela (o episódio é o maior/mais longo)
    return [...document.querySelectorAll('video')]
      .map((v) => ({ src: v.currentSrc || v.src, dur: isFinite(v.duration) ? v.duration : 0, area: v.clientWidth * v.clientHeight }))
      .filter((x) => /^https?:/i.test(x.src || ''));
  } catch { return []; }
})()`;

// Até 2 buscas ao mesmo tempo (ex.: o episódio atual e o próximo, pré-carregado), cada uma numa
// sessão só dela, em memória e separada do navegador do app.
const SLOTS = ['tp-video-sniffer-0', 'tp-video-sniffer-1'];
const busy = new Set<string>();
const waiting: Array<() => void> = [];

async function takeSlot(): Promise<string> {
  for (;;) {
    const free = SLOTS.find((x) => !busy.has(x));
    if (free) {
      busy.add(free);
      return free;
    }
    await new Promise<void>((r) => waiting.push(r));
  }
}
function releaseSlot(slot: string) {
  busy.delete(slot);
  waiting.shift()?.();
}

export interface SniffOptions {
  /** Endereços que já falharam no player (procura outro vídeo na página) */
  exclude?: string[];
  timeoutMs?: number;
  referer?: string;
  /** Cancela a busca (ex.: outra forma já achou o vídeo) */
  signal?: { cancelled: boolean };
}

export async function sniffMedia(pageUrl: string, opts: SniffOptions = {}): Promise<SniffResult | null> {
  const slot = await takeSlot();
  try {
    if (opts.signal?.cancelled) return null;
    return await sniffOnce(pageUrl, slot, opts);
  } finally {
    releaseSlot(slot);
  }
}

// Imagens e fontes não ajudam a achar o vídeo: não baixa (página carrega bem mais rápido)
const SKIP_TYPES = new Set(['image', 'font', 'imageset', 'cspReport', 'ping']);

function sniffOnce(pageUrl: string, slot: string, opts: SniffOptions): Promise<SniffResult | null> {
  const timeoutMs = opts.timeoutMs ?? 22000;
  return new Promise((resolve) => {
    const ses: Session = session.fromPartition(slot);
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

    // Vídeos achados; o escolhido é o episódio: HLS/DASH na hora; entre mp4, o maior/mais longo
    // (prévias de outras obras, trailers e anúncios costumam ser curtos/pequenos)
    const cands = new Map<string, SniffResult & { weight: number; order: number }>();
    const stripQ = (u: string) => u.split(/[?#]/)[0];
    const excluded = new Set((opts.exclude || []).map(stripQ));
    const LOOKS_PREVIEW = /preview|thumb|trailer|teaser|sample|promo|sprite|\/ads?[/_-]|banner|intro\b/i;
    const pickBest = (): SniffResult | null => {
      const list = [...cands.values()].sort((a, b) => {
        const pa = LOOKS_PREVIEW.test(a.url) ? 1 : 0;
        const pb = LOOKS_PREVIEW.test(b.url) ? 1 : 0;
        return pa - pb || b.weight - a.weight || a.order - b.order;
      });
      const top = list[0];
      return top ? { url: top.url, referer: top.referer, kind: top.kind } : best;
    };
    /** big: tamanho de episódio com certeza (arquivo > 20 MB ou vídeo > 3 min) */
    const found = (url: string, referer: string, kind: SniffResult['kind'], weight = 0, big = false) => {
      if (done || excluded.has(stripQ(url))) return;
      const hit = { url, referer: referer || pageUrl, kind };
      // HLS/DASH é o melhor sinal (é o episódio inteiro, em partes)
      if ((kind === 'hls' || kind === 'dash') && !LOOKS_PREVIEW.test(url)) return finish(hit);
      const prev = cands.get(url);
      cands.set(url, { ...hit, weight: Math.max(weight, prev?.weight || 0), order: prev?.order ?? cands.size });
      if (!best) best = hit;
      // Vídeo claramente do tamanho de um episódio (> 20 MB, ou > 3 min de duração): toca já
      if (big && !LOOKS_PREVIEW.test(url)) return finish(pickBest());
      // Senão espera um pouco por outros vídeos (um m3u8, ou o mp4 grande do episódio) antes de escolher
      if (!mp4Timer) mp4Timer = setTimeout(() => finish(pickBest()), 2500);
    };

    const hardTimer = setTimeout(() => finish(pickBest()), timeoutMs);
    const cancelPoll = setInterval(() => {
      if (opts.signal?.cancelled) finish(null);
      if (done) clearInterval(cancelPoll);
    }, 250);

    ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      const kind = classify(details.url);
      if (kind && details.resourceType !== 'mainFrame') {
        found(details.url, details.referrer || '', kind);
        return callback({});
      }
      if (SKIP_TYPES.has(details.resourceType)) return callback({ cancel: true });
      if (!handleAdblockBeforeRequest(details, callback)) callback({});
    });
    // Vídeos sem extensão no endereço: reconhece pelo tipo da resposta
    ses.webRequest.onHeadersReceived({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
      if (details.resourceType !== 'mainFrame') {
        const h = details.responseHeaders || {};
        const ct = (h['content-type'] || h['Content-Type'] || [])[0] || '';
        const kind = classify(details.url, ct);
        // Tamanho do arquivo (Content-Length, ou o total do Content-Range): o episódio é o arquivo grande
        const len = Number((h['content-length'] || h['Content-Length'] || [])[0] || 0);
        const total = Number((((h['content-range'] || h['Content-Range'] || [])[0] || '').split('/')[1]) || 0);
        const bytes = Math.max(len, total);
        if (kind && (ct || MEDIA_EXT.test(details.url))) found(details.url, details.referrer || '', kind, bytes, bytes >= 20e6);
      }
      callback({});
    });

    // Aperta play em todos os frames de tempos em tempos (players costumam carregar devagar)
    const poke = async () => {
      if (done || win.isDestroyed()) return;
      for (const frame of win.webContents.mainFrame.framesInSubtree) {
        try {
          const list = await frame.executeJavaScript(PLAY_SCRIPT, true);
          for (const v of Array.isArray(list) ? list : []) {
            const src = String(v?.src || '');
            if (!src || NOT_THE_VIDEO.test(src)) continue;
            // Peso pela duração (um episódio de 20 min "pesa" mais que qualquer prévia)
            const dur = Number(v?.dur || 0);
            found(src, frame.url || pageUrl, classify(src) || 'mp4', dur * 1e6 + Number(v?.area || 0), dur >= 180);
          }
        } catch {
          /* frame fechou ou bloqueou */
        }
      }
    };
    // Começa a apertar play assim que a página monta (sem esperar anúncios e imagens) e repete
    const startPoking = () => {
      void poke();
      if (!pokeTimer) pokeTimer = setInterval(() => void poke(), 1200);
    };
    win.webContents.on('dom-ready', startPoking);
    win.webContents.on('did-finish-load', () => void poke());
    setTimeout(() => {
      if (!done && !pokeTimer) startPoking();
    }, 4000);

    win
      .loadURL(pageUrl, { userAgent: UA, httpReferrer: opts.referer || undefined })
      .catch(() => {
        /* erros de navegação (ex.: abortada por redirecionamento) não impedem a captura */
      });
  });
}
