// electron/fileResponse.ts
// Resposta HTTP para arquivos locais (protocolo media-file://) com suporte a "Range".
// O Chromium precisa de respostas 206 para pular para qualquer ponto de um vídeo.

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { Readable } from 'node:stream';

const SMALL_FILE = 25 * 1024 * 1024;

export async function fileResponse(filePath: string, rangeHeader: string | null, mimeFor: (p: string) => string): Promise<Response> {
  let size = 0;
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return new Response('Not found', { status: 404 });
    size = stat.size;
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const type = mimeFor(filePath);
  const baseHeaders: Record<string, string> = {
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': type.startsWith('image/') ? 'public, max-age=86400' : 'no-store',
  };

  const m = rangeHeader ? /^bytes=(\d*)-(\d*)/i.exec(rangeHeader.trim()) : null;
  if (m && size > 0 && (m[1] !== '' || m[2] !== '')) {
    let start: number;
    let end: number;
    if (m[1] === '') {
      // "bytes=-N": últimos N bytes
      const n = Math.min(size, Number(m[2]));
      start = size - n;
      end = size - 1;
    } else {
      start = Number(m[1]);
      end = m[2] !== '' ? Math.min(Number(m[2]), size - 1) : size - 1;
    }
    if (!Number.isFinite(start) || start >= size || start > end) {
      return new Response(null, { status: 416, headers: { ...baseHeaders, 'Content-Range': `bytes */${size}` } });
    }
    try {
      const body = Readable.toWeb(fs.createReadStream(filePath, { start, end })) as unknown as ReadableStream;
      return new Response(body, {
        status: 206,
        headers: { ...baseHeaders, 'Content-Length': String(end - start + 1), 'Content-Range': `bytes ${start}-${end}/${size}` },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  try {
    if (size < SMALL_FILE) {
      const buffer = await fsp.readFile(filePath);
      return new Response(buffer, { status: 200, headers: { ...baseHeaders, 'Content-Length': String(buffer.length) } });
    }
    const body = Readable.toWeb(fs.createReadStream(filePath)) as unknown as ReadableStream;
    return new Response(body, { status: 200, headers: { ...baseHeaders, 'Content-Length': String(size) } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
