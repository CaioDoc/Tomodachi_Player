// src/utils/updates.ts
// Registro de capítulos/episódios novos encontrados pela verificação de atualizações.

export type UpdatesSource = 'manga' | 'video';

export interface UpdateEntry {
  workUrl: string;
  workTitle: string;
  cover?: string;
  sourceName?: string;
  chapter: { url: string; name: string; number: number };
  foundAt: number;
}

export const UPDATES_EVENT = 'tomodachi:updates-changed';
const KEY = (s: UpdatesSource) => `tp_updates_${s}`;
const LAST_CHECK_KEY = (s: UpdatesSource) => `tp_updates_last_check_${s}`;
const SEEN_KEY = (s: UpdatesSource) => `tp_updates_seen_${s}`;
const MAX_ENTRIES = 400;

export function getUpdates(source: UpdatesSource): UpdateEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY(source)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addUpdates(source: UpdatesSource, entries: UpdateEntry[]): void {
  if (entries.length === 0) return;
  const current = getUpdates(source);
  const known = new Set(current.map((e) => e.chapter.url));
  const merged = [...entries.filter((e) => !known.has(e.chapter.url)), ...current]
    .sort((a, b) => b.foundAt - a.foundAt)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY(source), JSON.stringify(merged));
  } catch {
    /* ignore */
  }
  notify(source);
}

export function removeUpdate(source: UpdatesSource, chapterUrl: string): void {
  const next = getUpdates(source).filter((e) => e.chapter.url !== chapterUrl);
  try {
    localStorage.setItem(KEY(source), JSON.stringify(next));
  } catch {
    /* ignore */
  }
  notify(source);
}

export function clearUpdates(source: UpdatesSource): void {
  try {
    localStorage.removeItem(KEY(source));
  } catch {
    /* ignore */
  }
  notify(source);
}

export function getLastCheck(source: UpdatesSource): number {
  return Number(localStorage.getItem(LAST_CHECK_KEY(source)) || 0) || 0;
}

export function setLastCheck(source: UpdatesSource, t = Date.now()): void {
  try {
    localStorage.setItem(LAST_CHECK_KEY(source), String(t));
  } catch {
    /* ignore */
  }
}

/** Quantidade de novidades ainda não vistas (para o selo da barra lateral). */
export function getUnseenCount(source: UpdatesSource): number {
  const seen = Number(localStorage.getItem(SEEN_KEY(source)) || 0) || 0;
  return getUpdates(source).filter((e) => e.foundAt > seen).length;
}

export function markUpdatesSeen(source: UpdatesSource): void {
  try {
    localStorage.setItem(SEEN_KEY(source), String(Date.now()));
  } catch {
    /* ignore */
  }
  notify(source);
}

function notify(source: UpdatesSource) {
  try {
    window.dispatchEvent(new CustomEvent(UPDATES_EVENT, { detail: { source } }));
  } catch {
    /* ignore */
  }
}

/** Normaliza URLs para comparar capítulos vindos de fontes diferentes (absoluta x relativa). */
export function normalizeChapterUrl(url: string): string {
  return (url || '')
    .trim()
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

/**
 * Determina quais capítulos de `fresh` são realmente novos em relação a `known`.
 * Conservador: só considera novo se a URL não existir E (o número for maior que
 * o maior número conhecido, ou se não houver números para comparar).
 */
export function findNewChapters<T extends { url: string; number?: number }>(fresh: T[], known: { url: string; number?: number }[]): T[] {
  if (known.length === 0) return [];
  const knownUrls = new Set(known.map((c) => normalizeChapterUrl(c.url)));
  const knownNums = known.map((c) => Number(c.number)).filter((n) => isFinite(n) && n > 0);
  const maxKnown = knownNums.length ? Math.max(...knownNums) : null;
  // Se nenhuma URL coincide, a fonte usa outro formato de endereço e a comparação
  // não é confiável — melhor não acusar nada do que duplicar capítulos.
  const overlap = fresh.some((c) => knownUrls.has(normalizeChapterUrl(c.url)));
  if (!overlap) return [];
  return fresh.filter((c) => {
    if (knownUrls.has(normalizeChapterUrl(c.url))) return false;
    const n = Number(c.number);
    if (maxKnown === null || !isFinite(n) || n <= 0) return maxKnown === null;
    return n > maxKnown;
  });
}
