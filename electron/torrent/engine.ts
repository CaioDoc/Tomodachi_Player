// electron/torrent/engine.ts
// Motor de torrent (roda num processo separado: utilityProcess do Electron).
// Usa o WebTorrent para baixar só o arquivo de vídeo escolhido, priorizando o trecho
// que está sendo assistido, e serve o arquivo por HTTP local com suporte a "Range".
//
// Comandos (HTTP em 127.0.0.1):
//   GET /add?magnet=…&fileIdx=…&name=…   → espera os metadados e devolve o arquivo escolhido
//   GET /status/<infoHash>                 → progresso, velocidade e peers
//   GET /stream/<infoHash>/<fileIdx>/<nome> → o vídeo (206 Partial Content)
//   GET /remove/<infoHash>

import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const parentPort: any = (process as any).parentPort;
const send = (msg: any) => {
  try {
    parentPort?.postMessage(msg);
  } catch {
    /* sem pai */
  }
};

let WebTorrent: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  WebTorrent = require('webtorrent');
} catch (err: any) {
  send({ type: 'unavailable', error: String(err?.message || err) });
}

const DIR = path.join(os.tmpdir(), 'tomodachi-torrents');
try {
  fs.rmSync(DIR, { recursive: true, force: true });
} catch {
  /* ignore */
}
try {
  fs.mkdirSync(DIR, { recursive: true });
} catch {
  /* ignore */
}

const VIDEO = /\.(mkv|mp4|m4v|webm|avi|mov|ts|m2ts|wmv|flv|mpg|mpeg)$/i;
const MIME: Record<string, string> = { '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo', '.mov': 'video/quicktime', '.ts': 'video/mp2t' };
const MAX_ACTIVE = 3;
const METADATA_TIMEOUT = 90_000;

const client = WebTorrent ? new WebTorrent({ maxConns: 80 }) : null;
client?.on('error', (err: any) => send({ type: 'log', error: String(err?.message || err) }));
const lastUsed = new Map<string, number>();
const selectedFile = new Map<string, number>();

function json(res: http.ServerResponse, status: number, body: any) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function pickFile(torrent: any, fileIdx: number | null, hint: string): number {
  const files: any[] = torrent.files || [];
  if (fileIdx != null && fileIdx >= 0 && fileIdx < files.length) return fileIdx;
  if (hint) {
    const h = hint.toLowerCase();
    const i = files.findIndex((f) => String(f.name).toLowerCase() === h);
    if (i >= 0) return i;
  }
  let best = -1;
  for (let i = 0; i < files.length; i++) {
    if (!VIDEO.test(files[i].name)) continue;
    if (best < 0 || files[i].length > files[best].length) best = i;
  }
  if (best >= 0) return best;
  // nenhum vídeo reconhecido: o maior arquivo
  return files.reduce((bi: number, f: any, i: number) => (bi < 0 || f.length > files[bi].length ? i : bi), -1);
}

function evictOld(keep: string) {
  const list = (client?.torrents || []).filter((t: any) => t.infoHash !== keep);
  if (list.length < MAX_ACTIVE) return;
  list.sort((a: any, b: any) => (lastUsed.get(a.infoHash) || 0) - (lastUsed.get(b.infoHash) || 0));
  for (const t of list.slice(0, list.length - MAX_ACTIVE + 1)) {
    try {
      t.destroy({ destroyStore: true });
    } catch {
      /* ignore */
    }
  }
}

function whenReady(torrent: any): Promise<void> {
  if (torrent.ready) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Nenhum peer respondeu a tempo (metadados do torrent)')), METADATA_TIMEOUT);
    torrent.once('ready', () => {
      clearTimeout(timer);
      resolve();
    });
    torrent.once('error', (err: any) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function infoHashOf(magnet: string): string {
  const m = /xt=urn:btih:([a-z0-9]+)/i.exec(magnet);
  return m ? m[1].toLowerCase() : '';
}

async function handleAdd(u: URL, res: http.ServerResponse) {
  if (!client) return json(res, 503, { error: 'Motor de torrent indisponível' });
  const magnet = u.searchParams.get('magnet') || '';
  if (!/^magnet:\?/i.test(magnet)) return json(res, 400, { error: 'Link magnet inválido' });
  const fileIdxRaw = u.searchParams.get('fileIdx');
  const fileIdx = fileIdxRaw != null && fileIdxRaw !== '' ? Number(fileIdxRaw) : null;
  const hint = u.searchParams.get('name') || '';
  const hash = infoHashOf(magnet);
  try {
    let torrent = hash ? client.get(hash) : null;
    if (!torrent) {
      evictOld(hash);
      torrent = client.add(magnet, { path: DIR });
    }
    await whenReady(torrent);
    lastUsed.set(torrent.infoHash, Date.now());
    const idx = pickFile(torrent, fileIdx, hint);
    if (idx < 0) return json(res, 404, { error: 'O torrent não tem arquivos de vídeo' });
    // Baixa só o arquivo escolhido
    try {
      torrent.deselect(0, torrent.pieces.length - 1, false);
    } catch {
      /* versões novas não selecionam tudo */
    }
    torrent.files.forEach((f: any, i: number) => (i === idx ? f.select() : f.deselect()));
    selectedFile.set(torrent.infoHash, idx);
    const file = torrent.files[idx];
    json(res, 200, {
      infoHash: torrent.infoHash,
      fileIdx: idx,
      name: file.name,
      length: file.length,
      path: `/stream/${torrent.infoHash}/${idx}/${encodeURIComponent(file.name)}`,
    });
  } catch (err: any) {
    json(res, 504, { error: String(err?.message || err) });
  }
}

function handleStream(parts: string[], req: http.IncomingMessage, res: http.ServerResponse) {
  const torrent = client?.get(parts[0]);
  const file = torrent?.files?.[Number(parts[1])];
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  lastUsed.set(torrent.infoHash, Date.now());
  const size = file.length;
  const type = MIME[path.extname(file.name).toLowerCase()] || 'application/octet-stream';
  const headers: Record<string, string | number> = { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
  const m = /bytes=(\d*)-(\d*)/.exec(String(req.headers.range || ''));
  let start = 0;
  let end = size - 1;
  if (m && (m[1] || m[2])) {
    if (m[1] === '') {
      start = Math.max(0, size - Number(m[2]));
    } else {
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), size - 1);
    }
    if (start >= size || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
      return;
    }
    res.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${size}` });
  } else {
    res.writeHead(200, { ...headers, 'Content-Length': size });
  }
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const stream = file.createReadStream({ start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => {
    try {
      stream.destroy();
    } catch {
      /* ignore */
    }
  });
  stream.pipe(res);
}

function handleStatus(hash: string, res: http.ServerResponse) {
  const torrent = client?.get(hash);
  if (!torrent) return json(res, 404, { error: 'not found' });
  const file = torrent.files?.[selectedFile.get(torrent.infoHash) ?? -1] || null;
  json(res, 200, {
    ready: !!torrent.ready,
    numPeers: torrent.numPeers || 0,
    downloadSpeed: torrent.downloadSpeed || 0,
    uploadSpeed: torrent.uploadSpeed || 0,
    progress: file?.progress ?? torrent.progress ?? 0,
    downloaded: file?.downloaded ?? torrent.downloaded ?? 0,
  });
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://127.0.0.1');
  const parts = u.pathname.split('/').filter(Boolean);
  try {
    if (parts[0] === 'add') return void handleAdd(u, res);
    if (parts[0] === 'stream' && parts.length >= 3) return handleStream(parts.slice(1), req, res);
    if (parts[0] === 'status' && parts[1]) return handleStatus(parts[1].toLowerCase(), res);
    if (parts[0] === 'remove' && parts[1]) {
      const t = client?.get(parts[1].toLowerCase());
      if (t) t.destroy({ destroyStore: true });
      return json(res, 200, { ok: true });
    }
    res.writeHead(404).end();
  } catch (err: any) {
    json(res, 500, { error: String(err?.message || err) });
  }
});

server.listen(0, '127.0.0.1', () => {
  const addr = server.address() as any;
  if (WebTorrent) send({ type: 'ready', port: addr.port });
  if (!parentPort) console.log(`[torrent] porta ${addr.port}`);
});

const shutdown = () => {
  try {
    client?.destroy();
  } catch {
    /* ignore */
  }
  try {
    fs.rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  process.exit(0);
};
parentPort?.on?.('message', (e: any) => {
  if (e?.data?.type === 'shutdown') shutdown();
});
process.on('SIGTERM', shutdown);
