// src/utils/bookmarkStore.ts
// Favoritos do navegador integrado com pastas e subpastas.
// Armazenamento (compatível com versões anteriores):
//   browser_bookmarks         → links  (parentId = pasta; vazio = raiz/barra)
//   browser_bookmark_folders  → pastas (parentId = pasta-mãe)

import { useCallback, useEffect, useState } from 'react';
import type { WebBookmark, WebBookmarkFolder } from '../types';
import { getFaviconUrl, normalizeUrl } from './bookmarkParser';
import { t } from '../i18n';

const LINKS_KEY = 'browser_bookmarks';
const FOLDERS_KEY = 'browser_bookmark_folders';
const SYNC_EVENT = 'browser_bookmarks_updated';

export const DEFAULT_BOOKMARKS: WebBookmark[] = [
  { id: 'bm-duckduckgo', title: 'DuckDuckGo', url: 'https://duckduckgo.com', favicon: 'https://icons.duckduckgo.com/ip3/duckduckgo.com.ico' },
  { id: 'bm-mangadex', title: 'MangaDex', url: 'https://mangadex.org', favicon: 'https://icons.duckduckgo.com/ip3/mangadex.org.ico' },
  { id: 'bm-anilist', title: 'AniList', url: 'https://anilist.co', favicon: 'https://icons.duckduckgo.com/ip3/anilist.co.ico' },
  { id: 'bm-mal', title: 'MyAnimeList', url: 'https://myanimelist.net', favicon: 'https://icons.duckduckgo.com/ip3/myanimelist.net.ico' },
  { id: 'bm-nhentai', title: 'NHentai', url: 'https://nhentai.net', favicon: 'https://icons.duckduckgo.com/ip3/nhentai.net.ico' },
  { id: 'bm-youtube', title: 'YouTube', url: 'https://youtube.com', favicon: 'https://icons.duckduckgo.com/ip3/youtube.com.ico' },
  { id: 'bm-github', title: 'GitHub', url: 'https://github.com', favicon: 'https://icons.duckduckgo.com/ip3/github.com.ico' },
];

export interface BookmarkData {
  bookmarks: WebBookmark[];
  folders: WebBookmarkFolder[];
}

export type BookmarkNode = { kind: 'folder'; item: WebBookmarkFolder } | { kind: 'link'; item: WebBookmark };

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

function load(): BookmarkData {
  let bookmarks: WebBookmark[] = DEFAULT_BOOKMARKS;
  let folders: WebBookmarkFolder[] = [];
  try {
    const raw = localStorage.getItem(LINKS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) bookmarks = parsed.filter((b) => b && typeof b.url === 'string');
    }
  } catch {
    /* ignore */
  }
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) folders = parsed.filter((f) => f && typeof f.id === 'string');
    }
  } catch {
    /* ignore */
  }
  // Itens cuja pasta sumiu voltam para a raiz
  const ids = new Set(folders.map((f) => f.id));
  bookmarks = bookmarks.map((b) => (b.parentId && !ids.has(b.parentId) ? { ...b, parentId: undefined } : b));
  folders = folders.map((f) => (f.parentId && !ids.has(f.parentId) ? { ...f, parentId: undefined } : f));
  return { bookmarks, folders };
}

function persist(data: BookmarkData) {
  try {
    localStorage.setItem(LINKS_KEY, JSON.stringify(data.bookmarks));
    localStorage.setItem(FOLDERS_KEY, JSON.stringify(data.folders));
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch (e) {
    console.error('Erro ao salvar favoritos:', e);
  }
}

/* ───────────── Consultas (funções puras) ───────────── */

export function childrenOf(data: BookmarkData, parentId?: string): BookmarkNode[] {
  const nodes: Array<BookmarkNode & { idx: number }> = [];
  let idx = 0;
  for (const f of data.folders) if ((f.parentId || undefined) === parentId) nodes.push({ kind: 'folder', item: f, idx: idx++ });
  for (const b of data.bookmarks) if ((b.parentId || undefined) === parentId) nodes.push({ kind: 'link', item: b, idx: idx++ });
  // Itens sem posição (antigos) ficam no fim, na ordem em que foram salvos
  return nodes
    .sort((a, b) => (a.item.pos ?? Number.MAX_SAFE_INTEGER) - (b.item.pos ?? Number.MAX_SAFE_INTEGER) || a.idx - b.idx)
    .map(({ idx: _i, ...n }) => n as BookmarkNode);
}

export function folderPath(data: BookmarkData, folderId?: string): WebBookmarkFolder[] {
  const out: WebBookmarkFolder[] = [];
  const byId = new Map(data.folders.map((f) => [f.id, f]));
  let cur = folderId ? byId.get(folderId) : undefined;
  const guard = new Set<string>();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    out.unshift(cur);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return out;
}

/** Pasta + todas as subpastas */
export function folderDescendants(data: BookmarkData, folderId: string): Set<string> {
  const set = new Set([folderId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const f of data.folders) {
      if (f.parentId && set.has(f.parentId) && !set.has(f.id)) {
        set.add(f.id);
        changed = true;
      }
    }
  }
  return set;
}

export function countInFolder(data: BookmarkData, folderId: string): { links: number; folders: number } {
  const set = folderDescendants(data, folderId);
  return {
    links: data.bookmarks.filter((b) => b.parentId && set.has(b.parentId)).length,
    folders: set.size - 1,
  };
}

/** Lista de pastas com nível de indentação (para menus "Mover para…") */
export function folderOptions(data: BookmarkData, exclude?: Set<string>): Array<{ id?: string; title: string; depth: number }> {
  const out: Array<{ id?: string; title: string; depth: number }> = [{ id: undefined, title: t('Barra de favoritos (raiz)'), depth: 0 }];
  const walk = (parentId: string | undefined, depth: number) => {
    for (const n of childrenOf(data, parentId)) {
      if (n.kind !== 'folder' || exclude?.has(n.item.id)) continue;
      out.push({ id: n.item.id, title: n.item.title, depth });
      walk(n.item.id, depth + 1);
    }
  };
  walk(undefined, 1);
  return out;
}

const nextPos = (data: BookmarkData) => Math.max(0, ...data.folders.map((f) => f.pos ?? 0), ...data.bookmarks.map((b) => b.pos ?? 0)) + 1;

/* ───────────── Hook ───────────── */

export function useBookmarks() {
  const [data, setData] = useState<BookmarkData>(load);

  useEffect(() => {
    const sync = () => setData(load());
    window.addEventListener(SYNC_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(SYNC_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const commit = useCallback((next: BookmarkData) => {
    setData(next);
    persist(next);
  }, []);

  const update = useCallback(
    (fn: (d: BookmarkData) => BookmarkData) => {
      const next = fn(load());
      commit(next);
      return next;
    },
    [commit]
  );

  const addLink = useCallback(
    (title: string, url: string, parentId?: string, favicon?: string) =>
      update((d) => ({
        ...d,
        bookmarks: [
          ...d.bookmarks,
          { id: newId('bm'), title: title.trim() || url, url, dateAdded: Date.now(), favicon: favicon || getFaviconUrl(url), parentId, pos: nextPos(d) },
        ],
      })),
    [update]
  );

  const addFolder = useCallback(
    (title: string, parentId?: string): string => {
      const id = newId('fld');
      update((d) => ({ ...d, folders: [...d.folders, { id, title: title.trim() || t('Nova pasta'), parentId, dateAdded: Date.now(), pos: nextPos(d) }] }));
      return id;
    },
    [update]
  );

  const editLink = useCallback(
    (id: string, patch: Partial<Pick<WebBookmark, 'title' | 'url' | 'parentId'>>) =>
      update((d) => ({
        ...d,
        bookmarks: d.bookmarks.map((b) => {
          if (b.id !== id) return b;
          const moved = 'parentId' in patch && patch.parentId !== b.parentId;
          const next = { ...b, ...patch, ...(moved ? { pos: nextPos(d) } : {}) };
          if (patch.url && patch.url !== b.url) next.favicon = getFaviconUrl(patch.url);
          return next;
        }),
      })),
    [update]
  );

  const editFolder = useCallback(
    (id: string, patch: Partial<Pick<WebBookmarkFolder, 'title' | 'parentId'>>) =>
      update((d) => {
        // Nunca mover uma pasta para dentro dela mesma
        if (patch.parentId && folderDescendants(d, id).has(patch.parentId)) return d;
        return {
          ...d,
          folders: d.folders.map((f) => {
            if (f.id !== id) return f;
            const moved = 'parentId' in patch && patch.parentId !== f.parentId;
            return { ...f, ...patch, ...(moved ? { pos: nextPos(d) } : {}) };
          }),
        };
      }),
    [update]
  );

  const removeLink = useCallback((id: string) => update((d) => ({ ...d, bookmarks: d.bookmarks.filter((b) => b.id !== id) })), [update]);

  const removeFolder = useCallback(
    (id: string) =>
      update((d) => {
        const set = folderDescendants(d, id);
        return { folders: d.folders.filter((f) => !set.has(f.id)), bookmarks: d.bookmarks.filter((b) => !b.parentId || !set.has(b.parentId)) };
      }),
    [update]
  );

  const findByUrl = useCallback((url: string) => {
    const n = normalizeUrl(url);
    return data.bookmarks.find((b) => normalizeUrl(b.url) === n);
  }, [data]);

  return { data, commit, addLink, addFolder, editLink, editFolder, removeLink, removeFolder, findByUrl };
}
