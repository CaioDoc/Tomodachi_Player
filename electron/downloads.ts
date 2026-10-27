// electron/downloads.ts
// Download de capítulos para leitura offline.
// Estrutura: <userData>/downloads/<obra>/<capítulo>/001.jpg ...  +  downloads/index.json

import { app, ipcMain, session, shell, type WebContents } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';

interface DownloadRecord {
  chapterUrl: string;
  workTitle: string;
  chapterName: string;
  dir: string;
  count: number;
  bytes: number;
  at: number;
}

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|avif|bmp)$/i;

const downloadsRoot = () => path.join(app.getPath('userData'), 'downloads');
const indexFile = () => path.join(downloadsRoot(), 'index.json');

const safeName = (s: string, fallback: string) => {
  const clean = String(s || '')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/, '')
    .trim()
    .slice(0, 80);
  return clean || fallback;
};

async function readIndex(): Promise<Record<string, DownloadRecord>> {
  try {
    const raw = await fsp.readFile(indexFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

let writeChain: Promise<void> = Promise.resolve();
function writeIndex(index: Record<string, DownloadRecord>): Promise<void> {
  // Serializa escritas para evitar corrupção com downloads paralelos
  writeChain = writeChain
    .catch(() => {})
    .then(async () => {
      await fsp.mkdir(downloadsRoot(), { recursive: true });
      const tmp = `${indexFile()}.tmp`;
      await fsp.writeFile(tmp, JSON.stringify(index), 'utf8');
      try {
        await fsp.rename(tmp, indexFile());
      } catch {
        await fsp.writeFile(indexFile(), JSON.stringify(index), 'utf8');
      }
    });
  return writeChain;
}

const extFromResponse = (url: string, contentType: string | null) => {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('png')) return '.png';
  if (ct.includes('webp')) return '.webp';
  if (ct.includes('gif')) return '.gif';
  if (ct.includes('avif')) return '.avif';
  if (ct.includes('jpeg') || ct.includes('jpg')) return '.jpg';
  const m = url.split('?')[0].match(/\.(jpe?g|png|webp|gif|avif)$/i);
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : '.jpg';
};

/** Converte media-file:///C:/x.jpg em caminho local */
const mediaFileToPath = (url: string) => {
  let p = decodeURIComponent(url.replace(/^media-file:\/\/\/?/, ''));
  if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(p)) p = p.slice(1);
  return path.normalize(p);
};

async function fetchPage(url: string): Promise<{ data: Buffer; ext: string }> {
  if (url.startsWith('data:')) {
    const m = url.match(/^data:([^;,]+)?(;base64)?,(.*)$/);
    if (!m) throw new Error('data URL inválida');
    const data = m[2] ? Buffer.from(m[3], 'base64') : Buffer.from(decodeURIComponent(m[3]));
    return { data, ext: extFromResponse('', m[1] || '') };
  }
  if (url.startsWith('media-file:')) {
    const p = mediaFileToPath(url);
    return { data: await fsp.readFile(p), ext: path.extname(p).toLowerCase() || '.jpg' };
  }
  let referer = '';
  try {
    const u = new URL(url);
    referer = `${u.protocol}//${u.host}/`;
  } catch {
    /* ignore */
  }
  const res = await session.defaultSession.fetch(url, { headers: referer ? { Referer: referer } : {} });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = Buffer.from(await res.arrayBuffer());
  if (data.length < 64) throw new Error('Imagem vazia');
  return { data, ext: extFromResponse(url, res.headers.get('content-type')) };
}

const active = new Map<string, { cancelled: boolean }>();

export function registerDownloadIpcHandlers() {
  ipcMain.handle(
    'downloads:chapter',
    async (event, args: { chapterUrl: string; workTitle: string; chapterName: string; pages: string[] }) => {
      const sender: WebContents = event.sender;
      const { chapterUrl, workTitle, chapterName, pages } = args || ({} as any);
      if (!chapterUrl || !Array.isArray(pages) || pages.length === 0) {
        return { success: false, error: 'Nenhuma página para baixar' };
      }
      if (active.has(chapterUrl)) return { success: false, error: 'Este capítulo já está sendo baixado' };

      const token = { cancelled: false };
      active.set(chapterUrl, token);
      const dir = path.join(downloadsRoot(), safeName(workTitle, 'Obra'), safeName(chapterName, 'Capítulo'));
      const send = (payload: any) => {
        try {
          if (!sender.isDestroyed()) sender.send('downloads:progress', { chapterUrl, ...payload });
        } catch {
          /* ignore */
        }
      };

      try {
        await fsp.mkdir(dir, { recursive: true });
        let done = 0;
        let bytes = 0;
        const width = String(pages.length).length < 3 ? 3 : String(pages.length).length;
        const queue = pages.map((url, i) => ({ url, i }));
        const failures: number[] = [];

        const worker = async () => {
          while (queue.length > 0 && !token.cancelled) {
            const job = queue.shift()!;
            let ok = false;
            for (let attempt = 0; attempt < 3 && !ok && !token.cancelled; attempt++) {
              try {
                const { data, ext } = await fetchPage(job.url);
                await fsp.writeFile(path.join(dir, `${String(job.i + 1).padStart(width, '0')}${ext}`), data);
                bytes += data.length;
                ok = true;
              } catch {
                await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
              }
            }
            if (!ok) failures.push(job.i + 1);
            done += 1;
            send({ done, total: pages.length });
          }
        };
        await Promise.all([worker(), worker(), worker()]);

        if (token.cancelled) {
          await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
          send({ cancelled: true });
          return { success: false, error: 'Download cancelado' };
        }
        if (failures.length > 0) {
          await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
          send({ error: true });
          return { success: false, error: `Falha ao baixar ${failures.length} página(s): ${failures.slice(0, 8).join(', ')}` };
        }

        const index = await readIndex();
        index[chapterUrl] = { chapterUrl, workTitle, chapterName, dir, count: pages.length, bytes, at: Date.now() };
        await writeIndex(index);
        send({ finished: true });
        return { success: true, dir, count: pages.length };
      } catch (err: any) {
        send({ error: true });
        return { success: false, error: err?.message || String(err) };
      } finally {
        active.delete(chapterUrl);
      }
    }
  );

  ipcMain.handle('downloads:cancel', async (_e, chapterUrl: string) => {
    const t = active.get(chapterUrl);
    if (t) t.cancelled = true;
    return { success: !!t };
  });

  // Páginas locais de um capítulo baixado (ou null)
  ipcMain.handle('downloads:get', async (_e, chapterUrl: string) => {
    try {
      const index = await readIndex();
      const rec = index[chapterUrl];
      if (!rec || !fs.existsSync(rec.dir)) return null;
      const files = (await fsp.readdir(rec.dir))
        .filter((f) => IMAGE_EXT.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .map((f) => path.join(rec.dir, f));
      if (files.length === 0) return null;
      return { ...rec, files };
    } catch {
      return null;
    }
  });

  ipcMain.handle('downloads:list', async () => {
    const index = await readIndex();
    // Remove do índice pastas apagadas manualmente
    let changed = false;
    for (const [k, rec] of Object.entries(index)) {
      if (!fs.existsSync(rec.dir)) {
        delete index[k];
        changed = true;
      }
    }
    if (changed) await writeIndex(index);
    return Object.values(index);
  });

  ipcMain.handle('downloads:delete', async (_e, chapterUrl: string) => {
    try {
      const index = await readIndex();
      const rec = index[chapterUrl];
      if (rec) {
        // Só apaga dentro da pasta de downloads
        const root = path.resolve(downloadsRoot());
        if (path.resolve(rec.dir).startsWith(root + path.sep)) {
          await fsp.rm(rec.dir, { recursive: true, force: true });
          // Remove a pasta da obra se ficou vazia
          const parent = path.dirname(rec.dir);
          try {
            if ((await fsp.readdir(parent)).length === 0) await fsp.rmdir(parent);
          } catch {
            /* ignore */
          }
        }
        delete index[chapterUrl];
        await writeIndex(index);
      }
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  ipcMain.handle('downloads:openFolder', async () => {
    await fsp.mkdir(downloadsRoot(), { recursive: true });
    const err = await shell.openPath(downloadsRoot());
    return { success: !err, error: err || undefined };
  });
}
