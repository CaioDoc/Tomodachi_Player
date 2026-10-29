// src/api/mangaSearch.ts
// Abre um mangá (por título) no MangaDex: Mangás → Explorar → MangaDex → página da obra.

export const MANGADEX_OPEN_EVENT = 'tomodachi:mangadex-open';
const PENDING_KEY = 'tp_mangadex_pending';

export interface MangaDexOpenRequest {
  title: string;
  altTitles?: string[];
}

export function openMangaDexTitle(title: string, altTitles: string[] = []) {
  const detail: MangaDexOpenRequest = { title, altTitles };
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(detail));
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('tomodachi:navigate', { detail: { type: 'mangas', view: 'online' } }));
  window.setTimeout(() => window.dispatchEvent(new CustomEvent(MANGADEX_OPEN_EVENT, { detail })), 60);
}

export function takePendingMangaDexOpen(): MangaDexOpenRequest | null {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    sessionStorage.removeItem(PENDING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
