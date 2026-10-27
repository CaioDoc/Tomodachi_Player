// src/api/updateChecker.ts
// Verifica capítulos/episódios novos para as obras da biblioteca.

import { fetchChapterList } from './chapterList';
import { resolveWorkUrl, getInstalledExtensions } from './extensionRegistry';
import { isLocalChapterPath } from './chapterExtractor';
import { readLibrary, updateLibrary, type LibrarySource } from '../utils/libraryStore';
import { nuvioMeta, nuvioChapters, parseNuvioUrl } from './nuvio';
import { addUpdates, findNewChapters, setLastCheck, type UpdateEntry } from '../utils/updates';

export interface UpdateCheckProgress {
  done: number;
  total: number;
  current?: string;
  found: number;
  failed: number;
}

export interface UpdateCheckOptions {
  /** Filtra por categoria (undefined = todas) */
  category?: string;
  onProgress?: (p: UpdateCheckProgress) => void;
  signal?: { cancelled: boolean };
  concurrency?: number;
}

const isCheckable = (item: any): boolean => {
  if (!item?.url) return false;
  const src = String(item.sourceName || item.source || '').toLowerCase();
  if (src.includes('local') || item.source === '0') return false;
  if (src.includes('nhentai')) return false; // galerias de capítulo único
  if (isLocalChapterPath(item.url)) return false;
  return true;
};

export async function checkLibraryUpdates(source: LibrarySource, opts: UpdateCheckOptions = {}): Promise<UpdateCheckProgress> {
  const lib = await readLibrary(source);
  const extType = source === 'video' ? 'anime' : 'manga';
  const exts = getInstalledExtensions(extType);

  const candidates = (lib.entries || []).filter((item: any) => {
    if (!isCheckable(item)) return false;
    if (opts.category && !(item.categories || []).includes(opts.category)) return false;
    return true;
  });

  const progress: UpdateCheckProgress = { done: 0, total: candidates.length, found: 0, failed: 0 };
  opts.onProgress?.({ ...progress });

  const newByWork = new Map<string, any[]>();
  const entries: UpdateEntry[] = [];
  const queue = [...candidates];
  const workers = Math.max(1, Math.min(opts.concurrency || 3, 4));

  const worker = async () => {
    while (queue.length > 0 && !opts.signal?.cancelled) {
      const item: any = queue.shift();
      if (!item) break;
      progress.current = item.title;
      opts.onProgress?.({ ...progress });
      try {
        const sourceName = item.sourceName || item.source || '';
        const nv = String(item.url).startsWith('nuvio:') ? parseNuvioUrl(item.url) : null;
        if (nv) {
          // Nuvio: episódios novos vêm do catálogo (Cinemeta)
          if (nv.type === 'series') {
            const meta = await nuvioMeta('series', nv.imdbId, item.nuvio?.addonUrl);
            const released = (c: any) => !c.dateUpload || c.dateUpload <= Date.now();
            const fresh = nuvioChapters(meta).filter(released);
            const novos = findNewChapters(fresh, item.chapters || []);
            if (novos.length > 0) {
              newByWork.set(item.url, novos);
              const now = Date.now();
              for (const ch of novos) {
                entries.push({ workUrl: item.url, workTitle: item.title, cover: item.cover, sourceName, chapter: { url: ch.url, name: ch.name, number: ch.number }, foundAt: now });
              }
              progress.found += novos.length;
            }
          }
          progress.done += 1;
          opts.onProgress?.({ ...progress });
          continue;
        }
        const ext = exts.find(
          (e) => e.name.toLowerCase() === String(sourceName).toLowerCase() || e.sourceName.toLowerCase() === String(sourceName).toLowerCase()
        );
        const target = resolveWorkUrl(item.url, sourceName, ext?.baseUrl);
        if (/^https?:\/\//i.test(target) || target.startsWith('suwayomi:')) {
          const fresh = await fetchChapterList(target, sourceName, item.url);
          const novos = findNewChapters(fresh, item.chapters || []);
          if (novos.length > 0) {
            newByWork.set(item.url, novos);
            const now = Date.now();
            for (const ch of novos) {
              entries.push({
                workUrl: item.url,
                workTitle: item.title,
                cover: item.cover,
                sourceName,
                chapter: { url: ch.url, name: ch.name, number: ch.number },
                foundAt: now,
              });
            }
            progress.found += novos.length;
          }
        }
      } catch {
        progress.failed += 1;
      }
      progress.done += 1;
      opts.onProgress?.({ ...progress });
    }
  };

  await Promise.all(Array.from({ length: workers }, worker));

  if (newByWork.size > 0) {
    await updateLibrary(
      source,
      (all) =>
        all.map((item: any) => {
          const novos = newByWork.get(item?.url);
          if (!novos) return item;
          const chapters = [...(item.chapters || []), ...novos];
          return { ...item, chapters, totalChapters: chapters.length };
        }),
      { notify: true }
    );
    addUpdates(source, entries);
  }
  if (!opts.signal?.cancelled) setLastCheck(source);
  progress.current = undefined;
  return progress;
}
