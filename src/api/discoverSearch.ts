// src/api/discoverSearch.ts
// Abre Animes & Vídeos → Descobrir já com uma busca (ex.: ao clicar numa tag da página de uma obra).

export type DiscoverKind = 'anilist' | 'series' | 'movie';
export const DISCOVER_SEARCH_EVENT = 'tomodachi:discover-search';
const PENDING_KEY = 'tp_discover_pending';

export function openDiscoverSearch(kind: DiscoverKind, query: string) {
  const detail = { kind, query };
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(detail));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('tomodachi:navigate', { detail: { type: 'videos', view: 'online' } }));
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(DISCOVER_SEARCH_EVENT, { detail })), 50);
}

/** Busca pendente (o Descobrir ainda não estava aberto quando a tag foi clicada) */
export function takePendingDiscoverSearch(): { kind: DiscoverKind; query: string } | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Mangás: abre a Biblioteca de mangás filtrando por uma tag */
export const LIBRARY_SEARCH_EVENT = 'tomodachi:library-search';
export function openLibrarySearch(source: 'manga' | 'video', query: string) {
  try {
    sessionStorage.setItem(`tp_library_pending_${source}`, query);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('tomodachi:navigate', { detail: { type: source === 'manga' ? 'mangas' : 'videos', view: 'library' } }));
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(LIBRARY_SEARCH_EVENT, { detail: { source, query } })), 50);
}
export function takePendingLibrarySearch(source: 'manga' | 'video'): string | null {
  try {
    const q = sessionStorage.getItem(`tp_library_pending_${source}`);
    sessionStorage.removeItem(`tp_library_pending_${source}`);
    return q;
  } catch {
    return null;
  }
}
