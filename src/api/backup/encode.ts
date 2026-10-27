// src/api/backup/encode.ts
// Exporta a biblioteca do app como backup .tachibk (protobuf + gzip), compatível com
// Mihon/Tachiyomi (mangás) e Aniyomi (animes). Reimportável aqui mesmo.

import pako from 'pako';
import './longShim';
import { aniyomiRoot, mihonRoot } from './decode';
import { readLibrary } from '../../utils/libraryStore';
import { getProgressMap } from '../../utils/progress';

export type ExportSource = 'manga' | 'video';

export interface ExportStats {
  works: number;
  chapters: number;
  read: number;
  categories: number;
  history: number;
}

const isNumericId = (s: string) => /^-?\d{1,20}$/.test(s);

/** ID numérico estável (63 bits) para fontes que não vieram do Mihon (MangaDex, extensões do app…). */
function stableSourceId(key: string): string {
  // FNV-1a 64 bits
  let h = 0xcbf29ce484222325n;
  for (const ch of new TextEncoder().encode(key)) {
    h ^= BigInt(ch);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return (h & 0x7fffffffffffffffn).toString();
}

const num = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const str = (v: any) => (v == null ? '' : String(v));

/** Monta os dados (objeto puro) do backup a partir da biblioteca salva. */
export async function collectBackupData(source: ExportSource) {
  const lib = await readLibrary(source);
  const progress = getProgressMap(source);
  const entries: any[] = Array.isArray(lib.entries) ? lib.entries : [];

  // Categorias: as salvas + as que aparecem nas obras (ordem preservada)
  const catNames: string[] = [];
  const seenCat = new Set<string>();
  const addCat = (c: any) => {
    const name = str(c).trim();
    if (!name || seenCat.has(name.toLowerCase())) return;
    seenCat.add(name.toLowerCase());
    catNames.push(name);
  };
  (lib.categories || []).forEach(addCat);
  entries.forEach((e) => (Array.isArray(e?.categories) ? e.categories : []).forEach(addCat));
  // Mihon: categorias do usuário começam na ordem 1 (0 é a padrão)
  const catOrder = new Map(catNames.map((n, i) => [n.toLowerCase(), i + 1]));
  const categories = catNames.map((name, i) => ({ name, order: String(i + 1), flags: '0' }));

  const sources = new Map<string, string>(); // id -> nome
  const stats: ExportStats = { works: 0, chapters: 0, read: 0, categories: catNames.length, history: 0 };
  const isVideo = source === 'video';

  const works = entries
    .filter((e) => e && (e.url || e.title))
    .map((e) => {
      const rawSource = str(e.source).trim();
      const sourceName = str(e.sourceName).trim();
      const sourceId = isNumericId(rawSource) ? rawSource : stableSourceId(rawSource || sourceName || 'tomodachi-player');
      if (!sources.has(sourceId)) sources.set(sourceId, sourceName || rawSource || 'Tomodachi Player');

      const chapters = (Array.isArray(e.chapters) ? e.chapters : [])
        .filter((c: any) => c && c.url)
        .map((c: any) => {
          const p = progress[c.url] || {};
          const read = !!(c.read || c.seen || p.read);
          const bookmark = !!(c.bookmark || p.bookmark);
          stats.chapters++;
          if (read) stats.read++;
          const base = {
            url: str(c.url),
            name: str(c.name || c.title),
            bookmark,
            dateUpload: String(Math.max(0, Math.trunc(num(c.dateUpload)))),
            lastModifiedAt: String(Math.max(0, Math.trunc(num(c.lastModifiedAt || p.updatedAt)))),
          };
          return isVideo
            ? {
                ...base,
                seen: read,
                lastSecondSeen: String(Math.max(0, Math.trunc(num(p.lastSecondSeen ?? c.lastSecondSeen)))),
                episodeNumber: num(c.number ?? c.episodeNumber ?? c.chapterNumber),
              }
            : {
                ...base,
                read,
                lastPageRead: String(Math.max(0, Math.trunc(num(p.lastPageRead ?? c.lastPageRead)))),
                chapterNumber: num(c.number ?? c.chapterNumber),
              };
        });

      const history = (Array.isArray(e.history) ? e.history : [])
        .filter((h: any) => h && h.url)
        .map((h: any) => ({
          url: str(h.url),
          lastRead: String(Math.max(0, Math.trunc(num(h.lastRead)))),
          readDuration: String(Math.max(0, Math.trunc(num(h.readDuration)))),
        }));
      stats.history += history.length;

      const tracking = (Array.isArray(e.tracking) ? e.tracking : [])
        .filter((t: any) => t && num(t.syncId) > 0)
        .map((t: any) => ({
          syncId: Math.trunc(num(t.syncId)),
          title: str(t.title),
          mediaId: isNumericId(str(t.mediaId)) ? str(t.mediaId) : '0',
          lastChapterRead: num(t.lastChapterRead),
          status: Math.trunc(num(t.status)),
        }));

      const cats = (Array.isArray(e.categories) ? e.categories : [])
        .map((c: any) => catOrder.get(str(c).trim().toLowerCase()))
        .filter((o: any): o is number => typeof o === 'number')
        .map(String);

      stats.works++;
      const genres = Array.isArray(e.genres) ? e.genres : Array.isArray(e.genre) ? e.genre : [];
      const work: any = {
        source: sourceId,
        url: str(e.url),
        title: str(e.title),
        author: str(e.author),
        artist: str(e.artist),
        description: str(e.description),
        genre: genres.map(str).filter(Boolean),
        status: Math.trunc(num(e.status)),
        thumbnailUrl: str(e.cover || e.thumbnailUrl),
        dateAdded: String(Math.max(0, Math.trunc(num(e.dateAdded)))),
        categories: cats,
        tracking,
        favorite: e.favorite !== false,
        history,
      };
      if (isVideo) {
        work.episodes = chapters;
        if (e.background) work.backgroundUrl = str(e.background);
      } else {
        work.chapters = chapters;
      }
      return work;
    });

  const sourceList = Array.from(sources, ([sourceId, name]) => ({ sourceId, name }));
  const data: any = isVideo
    ? { backupAnime: works, backupAnimeCategories: categories, backupAnimeSources: sourceList }
    : { backupManga: works, backupCategories: categories, backupSources: sourceList };
  return { data, stats };
}

/** Gera os bytes do arquivo .tachibk (gzip). */
export async function buildBackupFile(source: ExportSource): Promise<{ bytes: Uint8Array; stats: ExportStats }> {
  const { data, stats } = await collectBackupData(source);
  const root = source === 'video' ? aniyomiRoot : mihonRoot;
  const Backup = root.lookupType('Backup');
  const raw = Backup.encode(Backup.fromObject(data)).finish();
  return { bytes: pako.gzip(raw), stats };
}

export function backupFileName(source: ExportSource, date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}`;
  return `tomodachi-player_${source === 'video' ? 'anime' : 'manga'}_${stamp}.tachibk`;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}

/** Pede ao usuário onde salvar e grava o arquivo. Retorna o caminho (ou null se cancelado). */
export async function saveBackupFile(bytes: Uint8Array, fileName: string): Promise<string | null> {
  const api = window.electronAPI;
  if (api?.saveFileDialog) {
    const res = await api.saveFileDialog({
      defaultName: fileName,
      dataBase64: toBase64(bytes),
      filters: [{ name: 'Backup Mihon/Aniyomi', extensions: ['tachibk'] }],
    });
    if (res?.canceled) return null;
    if (!res?.success) throw new Error(res?.error || 'save failed');
    return res.filePath || fileName;
  }
  // Fora do Electron: download pelo navegador
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return fileName;
}
