// src/api/backup/mapper.ts
import { decodeBackup, mihonRoot } from './decode';

export interface MangaEntry {
  source: string; 
  sourceName?: string;
  url: string; 
  title: string; 
  author: string; 
  description: string;
  genres: string[]; 
  status: number; 
  cover: string; 
  dateAdded: number;
  favorite: boolean; 
  background?: string;
  categories: string[];            // já resolvidas por nome
  chapters: ChapterEntry[];
  tracking: TrackingEntry[];
  history: HistoryEntry[];
}

export interface ChapterEntry {
  url: string; 
  name: string; 
  number: number; 
  read: boolean; 
  bookmark: boolean;
  lastPageRead: number; 
  lastSecondSeen: number; 
  lastModifiedAt: number;
}

export interface TrackingEntry { 
  syncId: number; 
  title: string; 
  mediaId: string; 
  lastChapterRead: number; 
  status: number; 
}

export interface HistoryEntry { 
  url: string; 
  lastRead: number; 
  readDuration: number; 
}

export interface NormalizedBackup {
  app: 'mihon' | 'aniyomi';
  half: 'manga' | 'anime' | 'both';
  detectedFields: number[];
  manga: MangaEntry[];
  anime: MangaEntry[];
  categories: { manga: string[]; anime: string[] };
  extensions: { pkgName: string; name: string; versionName: string }[];
  repos: string[];
  sourcePrefs: { sourceKey: string; prefs: { key: string; value: string } }[];
  stats: Record<string, number>;
}

export function decodePrefValue(typeStr: string | undefined, raw: any): string {
  if (!raw) return '';
  if (typeof raw === 'object' && !(raw instanceof Uint8Array) && !(typeof Buffer !== 'undefined' && Buffer.isBuffer(raw))) {
    if (raw.stringValue != null) return String(raw.stringValue);
    if (raw.boolValue != null) return String(raw.boolValue);
    if (raw.intValue != null) return String(raw.intValue);
    if (raw.longValue != null) return String(raw.longValue);
    if (raw.floatValue != null) return String(raw.floatValue);
    if (raw.stringSetValue != null) return Array.isArray(raw.stringSetValue) ? raw.stringSetValue.join(',') : String(raw.stringSetValue);
    if (raw.value != null) return decodePrefValue(raw.type || typeStr, raw.value);
  }

  let u8: Uint8Array;
  if (typeof raw === 'string') {
    try {
      if (typeof Buffer !== 'undefined') {
        u8 = Buffer.from(raw, 'base64');
      } else {
        const bin = atob(raw);
        u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      }
    } catch {
      return raw;
    }
  } else if (raw instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw))) {
    u8 = raw;
  } else if (Array.isArray(raw)) {
    u8 = new Uint8Array(raw);
  } else {
    return String(raw);
  }

  try {
    const simpleType = typeStr ? typeStr.split('.').pop() : '';
    if (simpleType && mihonRoot.lookup(simpleType)) {
      const Model = mihonRoot.lookupType(simpleType);
      const dec = Model.decode(u8) as any;
      const obj = Model.toObject(dec, { longs: String }) as any;
      if (Array.isArray(obj.value)) return obj.value.join(',');
      return String(obj.value ?? '');
    }
  } catch {
    // ignore
  }
  return '';
}

interface CategoryLookup {
  byOrder: Map<number, string>;
  byId: Map<number, string>;
  byIdx: Map<number, string>;
}

function buildCategoryLookup(categories: any[] = []): { lookup: CategoryLookup; names: string[] } {
  const byOrder = new Map<number, string>();
  const byId = new Map<number, string>();
  const byIdx = new Map<number, string>();
  const names: string[] = [];

  categories.forEach((c: any, idx: number) => {
    const name = (c && c.name) ? String(c.name).trim() : `Categoria ${idx + 1}`;
    names.push(name);
    byIdx.set(idx, name);
    if (c.order != null) {
      byOrder.set(Number(c.order), name);
    }
    if (c.id != null) {
      byId.set(Number(c.id), name);
    }
  });

  return {
    lookup: { byOrder, byId, byIdx },
    names,
  };
}

function resolveCategoryName(val: any, lookup: CategoryLookup): string {
  const num = Number(val);
  if (!isNaN(num)) {
    // 1. Mihon/Tachiyomi oficial associa categorias por order
    if (lookup.byOrder.has(num)) return lookup.byOrder.get(num)!;
    // 2. Se não encontrou por order, tenta por id
    if (lookup.byId.has(num)) return lookup.byId.get(num)!;
    // 3. Se não encontrou por id, tenta por índice original
    if (lookup.byIdx.has(num)) return lookup.byIdx.get(num)!;
  }
  return String(val ?? '');
}

import { resolveSourceBaseUrl } from '../extensionRegistry';
import { t } from '../../i18n';

function resolveCoverUrl(rawCustom?: string, rawThumbnail?: string, mangaUrl?: string, sourceName?: string): string {
  const sanitize = (val?: string): string => {
    if (!val) return '';
    let u = val.trim();
    // Protocol-relative (//uploads.mangadex.org/...)
    if (u.startsWith('//')) return `https:${u}`;
    // Ignora caminhos locais internos do Android (ex: /data/user/0/eu.kanade.tachiyomi/cache/cover/...)
    if (
      u.startsWith('/data/') ||
      u.startsWith('content://') ||
      u.startsWith('file:///data/') ||
      u.startsWith('file:///storage/') ||
      u.startsWith('/storage/')
    ) {
      return '';
    }
    return u;
  };

  const custom = sanitize(rawCustom);
  const thumb = sanitize(rawThumbnail);
  const target = custom || thumb;

  if (!target) return '';

  if (target.startsWith('http://') || target.startsWith('https://')) {
    return target;
  }

  // Se thumbnail for caminho relativo e mangaUrl for uma URL completa
  if (mangaUrl && (mangaUrl.startsWith('http://') || mangaUrl.startsWith('https://'))) {
    try {
      return new URL(target, mangaUrl).href;
    } catch {}
  }

  // Se a fonte for MangaDex
  const s = (sourceName || '').toLowerCase();
  if (s.includes('mangadex') || mangaUrl?.includes('mangadex.org')) {
    const clean = target.replace(/^\/+/, '');
    return `https://uploads.mangadex.org/${clean}`;
  }

  // Se a fonte tiver domínio conhecido
  const domain = resolveSourceBaseUrl(sourceName, mangaUrl);
  if (domain) {
    const clean = target.replace(/^\/+/, '');
    return `https://${domain}/${clean}`;
  }

  return target;
}

export function normalize(bytes: Uint8Array): NormalizedBackup {
  const { app, data, detectedFields } = decodeBackup(bytes);

  const mangaCats = buildCategoryLookup(data.backupCategories ?? []);
  const animeCats = buildCategoryLookup(data.backupAnimeCategories ?? []);

  const sourceNameMap = new Map<string, string>();
  (data.backupSources ?? []).forEach((s: any) => {
    if (s.sourceId != null && s.name) sourceNameMap.set(String(s.sourceId), String(s.name));
  });
  (data.backupAnimeSources ?? []).forEach((s: any) => {
    if (s.sourceId != null && s.name) sourceNameMap.set(String(s.sourceId), String(s.name));
  });

  const mapEntries = (list: any[], catLookup: CategoryLookup): MangaEntry[] =>
    (list ?? []).map((m: any) => ({
      source: String(m.source ?? ''), 
      sourceName: sourceNameMap.get(String(m.source ?? '')) || '',
      url: m.url ?? '', 
      title: (m.title ?? t('Sem título')).trim(),
      author: (m.author || m.artist || '').trim(), 
      description: (m.description ?? '').trim(),
      genres: Array.isArray(m.genre) ? m.genre.map((g: any) => String(g).trim()).filter(Boolean) : [], 
      status: Number(m.status ?? 0),
      cover: resolveCoverUrl(m.customThumbnailUrl, m.thumbnailUrl, m.url, sourceNameMap.get(String(m.source ?? ''))), 
      background: m.backgroundUrl ?? undefined,
      dateAdded: Number(m.dateAdded ?? 0), 
      favorite: !!m.favorite,
      categories: (m.categories ?? []).map((i: any) => resolveCategoryName(i, catLookup)).filter(Boolean),
      chapters: (m.chapters ?? m.episodes ?? []).map((c: any) => ({
        url: c.url ?? '', 
        name: (c.name ?? '').trim(), 
        number: Number(c.chapterNumber ?? c.episodeNumber ?? 0),
        read: !!c.read || !!c.seen, 
        bookmark: !!c.bookmark,
        lastPageRead: Number(c.lastPageRead ?? 0),
        lastSecondSeen: Number(c.lastSecondSeen ?? 0),
        lastModifiedAt: Number(c.lastModifiedAt ?? 0),
      })),
      tracking: (m.tracking ?? []).map((t: any) => ({
        syncId: Number(t.syncId ?? 0), 
        title: (t.title ?? '').trim(),
        mediaId: t.mediaId || (t.mediaIdInt ? String(t.mediaIdInt) : ''),
        lastChapterRead: Number(t.lastChapterRead ?? 0), 
        status: Number(t.status ?? 0),
      })),
      history: [...(m.history ?? []), ...(m.brokenHistory ?? [])].map((h: any) => ({
        url: h.url ?? '', 
        lastRead: Number(h.lastRead ?? 0), 
        readDuration: Number(h.readDuration ?? 0),
      })),
    }));

  const manga = mapEntries(data.backupManga ?? [], mangaCats.lookup);
  const anime = mapEntries(data.backupAnime ?? [], animeCats.lookup);

  const extensions = (data.backupExtensions ?? []).map((e: any) => ({
    pkgName: e.pkgName ?? '', 
    name: e.name ?? '', 
    versionName: e.versionName ?? '',
  }));
  const extStoreUrls = (data.backupExtensionStores ?? []).map((s: any) => s.indexUrl || s.name);
  const repos = [...extStoreUrls, ...(data.backupExtensionRepo ?? []), ...(data.backupMangaExtensionRepo ?? []), ...(data.backupAnimeExtensionRepo ?? [])].filter(Boolean);

  const sourcePrefs = (data.backupSourcePreferences ?? []).map((s: any) => ({
    sourceKey: s.sourceKey ?? '',
    prefs: (s.prefs ?? []).map((p: any) => {
      const v = p.value ?? {};
      const val = decodePrefValue(v.type, v.value ?? v);
      return { key: p.key ?? '', value: String(val) };
    }),
  }));

  // estatísticas para o resumo da UI
  const allChapters = [...manga, ...anime].flatMap((m) => m.chapters);
  const stats = {
    libraryItems: manga.length + anime.length,
    chapters: allChapters.length,
    readEntries: allChapters.filter((c) => c.read).length,
    bookmarks: allChapters.filter((c) => c.bookmark).length,
    tracking: [...manga, ...anime].reduce((n, m) => n + m.tracking.length, 0),
    history: [...manga, ...anime].reduce((n, m) => n + m.history.length, 0),
    categories: mangaCats.names.length + animeCats.names.length,
    extensions: extensions.length,
    sourcePrefs: sourcePrefs.length,
  };

  return {
    app,
    detectedFields,
    half: manga.length && anime.length ? 'both' : anime.length ? 'anime' : 'manga',
    manga, 
    anime,
    categories: { manga: mangaCats.names, anime: animeCats.names },
    extensions, 
    repos, 
    sourcePrefs, 
    stats,
  };
}

