// electron/mediaProbe.ts
// Lê informações de um arquivo de vídeo (duração, faixas de áudio e legendas embutidas)
// usando o próprio FFmpeg do app, e extrai legendas embutidas (MKV) como texto.

import { ipcMain } from 'electron';
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import { getFfmpegPath } from './mediaProtocol';
import { ffmpegHeaderString } from './streamHeaders';

export interface MediaTrack {
  /** Índice dentro do tipo (0:a:N / 0:s:N) */
  index: number;
  lang?: string;
  title?: string;
  codec: string;
  isDefault: boolean;
  /** Somente legendas: texto (pode ser extraída) ou imagem (PGS/VobSub, não suportada) */
  isText?: boolean;
}

export interface MediaProbe {
  duration: number;
  /** Primeira faixa de vídeo (codec e formato de pixel, ex.: h264 + yuv420p) */
  video?: { codec: string; pixFmt?: string };
  audio: MediaTrack[];
  subtitles: MediaTrack[];
}

const TEXT_SUB_CODECS = new Set(['ass', 'ssa', 'subrip', 'srt', 'webvtt', 'mov_text', 'text', 'microdvd', 'subviewer', 'subviewer1', 'sami', 'realtext', 'stl', 'mpl2', 'jacosub', 'vplayer', 'pjs']);

/** Interpreta a saída de `ffmpeg -i arquivo` (stderr). Exportada para testes. */
export function parseFfmpegInfo(text: string): MediaProbe {
  const out: MediaProbe = { duration: 0, audio: [], subtitles: [] };
  const dur = text.match(/Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/);
  if (dur) out.duration = Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]);

  // Considera apenas o primeiro arquivo de entrada (#0)
  const lines = text.split(/\r?\n/);
  let current: MediaTrack | null = null;
  let currentIndent = 0;
  for (const line of lines) {
    const m = line.match(/^(\s*)Stream #0:\d+(?:\[[^\]]*\])?(?:\(([^)]*)\))?(?:\[[^\]]*\])?:\s*(Audio|Subtitle|Video|Data|Attachment):\s*([^\s,]+)(.*)$/);
    if (m) {
      current = null;
      const kind = m[3];
      const codec = m[4].toLowerCase();
      const rest = m[5] || '';
      const lang = m[2] && m[2] !== 'und' ? m[2] : undefined;
      if (kind === 'Video' && !out.video && !/attached pic/.test(rest)) {
        const pix = rest.match(/,\s*([a-z0-9_]+)(?:\(|,|\s)/i);
        out.video = { codec, pixFmt: pix ? pix[1].toLowerCase() : undefined };
      } else if (kind === 'Audio') {
        current = { index: out.audio.length, lang, codec, isDefault: /\(default\)/.test(rest) };
        out.audio.push(current);
      } else if (kind === 'Subtitle') {
        current = { index: out.subtitles.length, lang, codec, isDefault: /\(default\)/.test(rest), isText: TEXT_SUB_CODECS.has(codec) };
        out.subtitles.push(current);
      }
      currentIndent = m[1].length;
      continue;
    }
    if (!current) continue;
    // Metadados da faixa atual (linhas mais indentadas que o "Stream")
    const indent = (line.match(/^\s*/) || [''])[0].length;
    if (indent <= currentIndent) {
      current = null;
      continue;
    }
    const t = line.match(/^\s*title\s*:\s*(.+)$/i);
    if (t && !current.title) current.title = t[1].trim();
  }
  return out;
}

function runFfmpeg(args: string[], opts: { timeoutMs: number; maxBytes?: number; wantStdout?: boolean }): Promise<{ code: number | null; stdout: Buffer; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(getFfmpegPath(), args, { windowsHide: true, stdio: ['ignore', opts.wantStdout ? 'pipe' : 'ignore', 'pipe'] });
    } catch (err: any) {
      resolve({ code: -1, stdout: Buffer.alloc(0), stderr: String(err?.message || err), timedOut: false });
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        /* ignore */
      }
    }, opts.timeoutMs);
    child.stdout?.on('data', (c: Buffer) => {
      size += c.length;
      if (opts.maxBytes && size > opts.maxBytes) {
        try {
          child.kill('SIGKILL');
        } catch {
          /* ignore */
        }
        return;
      }
      chunks.push(c);
    });
    child.stderr?.on('data', (c: Buffer) => {
      if (stderr.length < 200_000) stderr += c.toString();
    });
    child.on('error', (err) => {
      stderr += String(err?.message || err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout: Buffer.concat(chunks), stderr, timedOut });
    });
  });
}

const probeCache = new Map<string, { mtime: number; data: MediaProbe }>();

export async function probeMedia(filePath: string): Promise<MediaProbe | null> {
  let mtime = 0;
  try {
    mtime = (await fsp.stat(filePath)).mtimeMs;
  } catch {
    return null;
  }
  const cached = probeCache.get(filePath);
  if (cached && cached.mtime === mtime) return cached.data;
  const res = await runFfmpeg(['-hide_banner', '-i', filePath], { timeoutMs: 20000 });
  if (!/Duration:|Stream #0/.test(res.stderr)) return null;
  const data = parseFfmpegInfo(res.stderr);
  probeCache.set(filePath, { mtime, data });
  if (probeCache.size > 50) probeCache.delete(probeCache.keys().next().value as string);
  return data;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const isRemote = (p: string) => /^https?:\/\//i.test(p);
const remoteHeaders = (url: string, referer?: string) => ffmpegHeaderString(url, { userAgent: UA, referer });

const remoteDurationCache = new Map<string, number>();

/** Duração de um vídeo remoto (HLS/MP4) — usada para permitir a busca nos streams convertidos. */
export async function probeRemoteDuration(url: string, referer?: string): Promise<number> {
  const key = `${url}|${referer || ''}`;
  const cached = remoteDurationCache.get(key);
  if (cached) return cached;
  const res = await runFfmpeg(['-hide_banner', '-headers', remoteHeaders(url, referer), '-i', url], { timeoutMs: 25000 });
  const info = parseFfmpegInfo(res.stderr);
  if (info.duration > 0) {
    remoteDurationCache.set(key, info.duration);
    if (remoteDurationCache.size > 30) remoteDurationCache.delete(remoteDurationCache.keys().next().value as string);
  }
  return info.duration;
}

/** Miniatura (JPEG) de um instante do vídeo, para a prévia ao passar o mouse na barra. */
export async function videoThumbnail(input: string, time: number, opts: { referer?: string; width?: number } = {}): Promise<Buffer | null> {
  const width = Math.max(80, Math.min(480, Math.floor(opts.width || 240)));
  const args = ['-hide_banner', '-loglevel', 'error'];
  if (isRemote(input)) args.push('-headers', remoteHeaders(input, opts.referer));
  args.push(
    '-ss', String(Math.max(0, time)),
    '-i', input,
    '-map', '0:v:0',
    '-frames:v', '1',
    '-vf', `scale=${width}:-2`,
    '-q:v', '5',
    '-f', 'image2',
    '-c:v', 'mjpeg',
    'pipe:1'
  );
  const res = await runFfmpeg(args, { timeoutMs: isRemote(input) ? 15000 : 8000, maxBytes: 2_000_000, wantStdout: true });
  return res.stdout.length > 100 ? res.stdout : null;
}

export function registerMediaProbeIpc() {
  ipcMain.handle('media:probeRemoteDuration', async (_e, args: { url: string; referer?: string }) => {
    if (!args?.url || !isRemote(args.url)) return { success: false, error: 'URL inválida' };
    try {
      const duration = await probeRemoteDuration(args.url, args.referer);
      return duration > 0 ? { success: true, duration } : { success: false, error: 'Duração desconhecida' };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('media:thumbnail', async (_e, args: { input: string; time: number; referer?: string; width?: number }) => {
    if (!args?.input || !Number.isFinite(args.time)) return { success: false };
    try {
      if (!isRemote(args.input)) await fsp.access(args.input);
      const buf = await videoThumbnail(args.input, args.time, { referer: args.referer, width: args.width });
      return buf ? { success: true, dataUrl: `data:image/jpeg;base64,${buf.toString('base64')}` } : { success: false };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('media:probe', async (_e, filePath: string) => {
    if (!filePath || /^[a-z]+:\/\//i.test(filePath)) return { success: false, error: 'Somente arquivos locais' };
    try {
      const data = await probeMedia(filePath);
      return data ? { success: true, data } : { success: false, error: 'Não foi possível ler o arquivo' };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // Extrai uma legenda embutida como texto (.ass ou .srt)
  ipcMain.handle('media:extractSubtitle', async (_e, args: { filePath: string; index: number }) => {
    const { filePath, index } = args || ({} as any);
    if (!filePath || !Number.isInteger(index) || index < 0) return { success: false, error: 'Parâmetros inválidos' };
    const info = await probeMedia(filePath).catch(() => null);
    const track = info?.subtitles[index];
    if (!track) return { success: false, error: 'Faixa de legenda não encontrada' };
    if (!track.isText) return { success: false, error: 'Esta legenda é baseada em imagens (PGS/VobSub) e não pode ser exibida' };
    const asAss = track.codec === 'ass' || track.codec === 'ssa';
    const format = asAss ? 'ass' : 'srt';
    const res = await runFfmpeg(['-hide_banner', '-loglevel', 'error', '-i', filePath, '-map', `0:s:${index}`, '-f', format, 'pipe:1'], {
      timeoutMs: 180000,
      maxBytes: 30 * 1024 * 1024,
      wantStdout: true,
    });
    if (res.timedOut) return { success: false, error: 'A extração da legenda demorou demais' };
    if (res.stdout.length === 0) return { success: false, error: res.stderr.trim().split('\n').pop() || 'Falha ao extrair a legenda' };
    return { success: true, text: res.stdout.toString('utf8'), format };
  });
}
