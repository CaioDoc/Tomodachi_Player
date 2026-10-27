import { protocol, app } from 'electron';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

export function getFfmpegPath(): string {
  const isWin = process.platform === 'win32';
  const exeName = isWin ? 'ffmpeg.exe' : 'ffmpeg';

  // 1. Variável de ambiente explícita
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  // 2. Caminhos em produção (instalado ou portable)
  const resourcesPath = process.resourcesPath || '';
  const appPath = typeof app?.getAppPath === 'function' ? app.getAppPath() : '';

  const candidates: string[] = [
    // extraResources (resources/bin/ffmpeg.exe)
    path.join(resourcesPath, 'bin', exeName),
    path.join(resourcesPath, exeName),

    // asar.unpacked
    path.join(resourcesPath, 'app.asar.unpacked', 'dist-electron', 'bin', exeName),
    path.join(resourcesPath, 'app.asar.unpacked', 'bin', exeName),
    path.join(resourcesPath, 'app.asar.unpacked', 'node_modules', 'ffmpeg-static', exeName),
    path.join(resourcesPath, 'app.asar.unpacked', exeName),

    // Desenvolvimento: dist-electron/bin/ffmpeg.exe
    path.join(__dirname, 'bin', exeName),
    path.join(__dirname, exeName),

    // Desenvolvimento: node_modules/ffmpeg-static
    path.join(__dirname, '..', 'node_modules', 'ffmpeg-static', exeName),
    path.join(appPath, 'node_modules', 'ffmpeg-static', exeName),
    path.join(process.cwd(), 'node_modules', 'ffmpeg-static', exeName),

    // ffmpeg-static export direto
    ...(typeof ffmpegStatic === 'string'
      ? [ffmpegStatic.replace('app.asar', 'app.asar.unpacked'), ffmpegStatic]
      : []),
  ];

  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return exeName;
}

// Containers que o Chromium NÃO decodifica nativamente (MKV, AVI, WMV, etc.)
const NON_NATIVE_CONTAINERS = new Set(['.mkv', '.avi', '.wmv', '.flv', '.rmvb', '.vob', '.ts', '.m2ts', '.mov']);

function shouldTranscodeVideo(input: string, forceTranscode: boolean): boolean {
  if (forceTranscode) return true;
  const ext = path.extname(input).toLowerCase();
  return NON_NATIVE_CONTAINERS.has(ext);
}

// Constrói argumentos do FFmpeg com suporte a H.264 8-bit (yuv420p), transcode rápido e seeking
function buildArgs(input: string, forceTranscode: boolean, startTime = 0, audioIndex = 0): string[] {
  const transcode = shouldTranscodeVideo(input, forceTranscode);
  const args = ['-hide_banner', '-loglevel', 'error'];

  if (startTime > 0) {
    args.push('-ss', String(startTime));
  }

  args.push(
    '-i',
    input,
    '-map',
    '0:v:0',
    '-map',
    `0:a:${Math.max(0, Math.floor(audioIndex) || 0)}?`, // faixa de áudio escolhida (opcional se for vídeo mudo)
    '-sn', // descarta legendas incompatíveis com stream HTML5
    '-max_muxing_queue_size',
    '4096',
    '-f',
    'mp4',
    '-movflags',
    'frag_keyframe+empty_moov+default_base_moof',
    '-fflags',
    'genpts'
  );

  if (transcode) {
    // libx264 forçando 8-bit YUV 4:2:0 para compatibilidade total com Chromium em animes 10-bit e HEVC
    args.push(
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '22',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-ac', '2'
    );
  } else {
    args.push('-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k');
  }

  args.push('pipe:1');
  return args;
}

function resolveMediaFilePath(requestUrl: string): string {
  try {
    const url = new URL(requestUrl);
    let p = url.pathname;
    if (url.host === 'stream') {
      p = url.pathname.slice(1);
    } else if (url.host && /^[A-Za-z]:?$/.test(url.host)) {
      p = (url.host.endsWith(':') ? url.host : url.host + ':') + url.pathname;
    } else if (url.host) {
      p = url.host + url.pathname;
    }
    p = decodeURIComponent(p);
    if (process.platform === 'win32') {
      if (/^\/[A-Za-z]:/.test(p)) {
        p = p.slice(1);
      }
    }
    return path.normalize(p);
  } catch {
    let p = decodeURIComponent(requestUrl.replace(/^media:\/\/(stream\/)?/, ''));
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(p)) {
      p = p.slice(1);
    }
    return path.normalize(p);
  }
}

export function registerMediaProtocol() {
  const ffmpegPath = getFfmpegPath();
  console.log('ffmpeg path:', ffmpegPath);

  protocol.handle('media', async (request) => {
    const url = new URL(request.url);
    const filePath = resolveMediaFilePath(request.url);
    const transcode = url.searchParams.get('tr') === '1';
    const rawTime = url.searchParams.get('ss') || url.searchParams.get('t') || '0';
    const startTime = Math.max(0, parseFloat(rawTime) || 0);
    const audioIndex = Math.max(0, parseInt(url.searchParams.get('a') || '0', 10) || 0);

    console.log(`[mediaProtocol] Request URL: ${request.url}`);
    console.log(`[mediaProtocol] Resolved file path: "${filePath}" (transcode: ${transcode}, startTime: ${startTime})`);

    try {
      await fsp.access(filePath);
    } catch (err) {
      console.error(`[mediaProtocol] File not found or inaccessible: "${filePath}"`, err);
      return new Response('File not found', { status: 404 });
    }

    const currentFfmpegPath = getFfmpegPath();
    const hasBinary = fs.existsSync(currentFfmpegPath) || currentFfmpegPath === 'ffmpeg' || currentFfmpegPath === 'ffmpeg.exe';
    if (!hasBinary) {
      console.error(`[mediaProtocol] FFmpeg binary not found: "${currentFfmpegPath}"`);
      return new Response('FFmpeg binary not found on this system', { status: 500 });
    }

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(currentFfmpegPath, buildArgs(filePath, transcode, startTime, audioIndex), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (err) {
      console.error('[mediaProtocol] FFmpeg spawn synchronous exception:', err);
      return new Response('Failed to start FFmpeg process', { status: 500 });
    }

    child.on('error', (err) => {
      console.error('[mediaProtocol] FFmpeg process error:', err);
    });

    let stderrBuffer = '';
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrBuffer.length < 2048) {
        stderrBuffer += chunk.toString();
      }
    });

    child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[mediaProtocol] FFmpeg exited with code ${code}: ${stderrBuffer.trim()}`);
      }
    });

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        child.stdout.on('data', (chunk: Buffer) => {
          controller.enqueue(new Uint8Array(chunk));
        });
        child.stdout.on('end', () => {
          try {
            controller.close();
          } catch {}
        });
        child.on('error', (err) => {
          try {
            controller.error(err);
          } catch {}
        });
      },
      cancel() {
        try {
          child.kill('SIGKILL'); // para a conversão se o usuário fechar o player
        } catch {}
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'video/mp4',
        'Cache-Control': 'no-store',
      },
    });
  });
}
