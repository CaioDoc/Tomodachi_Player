import http from 'node:http';
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import { getFfmpegPath } from './mediaProtocol';
import { ffmpegHeaderString } from './streamHeaders';

let server: http.Server | null = null;
let port = 0;

// containers que o Chromium NÃO abre sozinho
export const NEEDS_TRANSCODE = new Set(['.mkv', '.avi', '.wmv', '.flv', '.mov', '.rmvb', '.vob', '.ts', '.m2ts']);

export async function startVideoServer(): Promise<number> {
  if (server) return port;

  server = http.createServer(async (req, res) => {
    const u = new URL(req.url!, 'http://127.0.0.1');
    if (u.pathname !== '/stream') { res.writeHead(404).end(); return; }

    const file = u.searchParams.get('path');
    if (!file) { res.writeHead(400).end(); return; }

    const isHttp = /^https?:\/\//i.test(file);
    if (!isHttp) {
      try { await fsp.access(file); } catch { res.writeHead(404).end(); return; }
    }

    // Remux / Transcode em tempo real para H.264 + AAC garantindo compatibilidade total no Chromium
    const referer = u.searchParams.get('referer') || '';
    const args = [
      '-hide_banner', '-loglevel', 'error',
    ];

    if (isHttp) {
      // Cabeçalhos registrados pelo stream (plugins do Nuvio) têm prioridade
      args.push('-headers', ffmpegHeaderString(file, { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36', referer: referer || undefined }));
    }

    // Busca: começa a conversão a partir do segundo pedido (?ss=), como no protocolo media://
    const ss = Math.max(0, Math.floor(Number(u.searchParams.get('ss')) || 0));
    if (ss > 0) args.push('-ss', String(ss));

    args.push(
      '-i', file,
      '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac', '-b:a', '192k', '-ac', '2',
      '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
      '-f', 'mp4', 'pipe:1',
    );

    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Cache-Control': 'no-store' });
    const ff = spawn(getFfmpegPath(), args);
    ff.stdout.pipe(res);
    ff.stderr.on('data', (d) => console.error('[ffmpeg]', d.toString()));
    const kill = () => {
      try { ff.kill('SIGKILL'); } catch {}
    };
    req.on('close', kill);
    res.on('close', kill);
  });

  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  port = (server!.address() as any).port;
  return port;
}
