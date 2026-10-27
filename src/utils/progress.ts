// src/utils/progress.ts
// Progresso de leitura/visualização compartilhado entre biblioteca, detalhes e leitores.
// Formato salvo em localStorage (mantido compatível com versões anteriores):
//   manga_progress / video_progress = { [chapterUrl]: { read, bookmark, lastPageRead, lastSecondSeen, updatedAt } }

export type ProgressSource = 'manga' | 'video';

export interface ChapterProgress {
  read?: boolean;
  bookmark?: boolean;
  /** Página lida (1-based) */
  lastPageRead?: number;
  lastSecondSeen?: number;
  updatedAt?: number;
}

export const PROGRESS_EVENT = 'tomodachi:progress-updated';

// Avisado sempre que capítulos/episódios são marcados como lidos (usado pela sincronização com o AniList)
type ReadHook = (source: ProgressSource, urls: string[]) => void;
let readHook: ReadHook | null = null;
export function onChaptersRead(fn: ReadHook | null): void {
  readHook = fn;
}

const key = (source: ProgressSource) => `${source}_progress`;

export function getProgressMap(source: ProgressSource): Record<string, ChapterProgress> {
  try {
    const raw = localStorage.getItem(key(source));
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function getChapterProgress(source: ProgressSource, url: string): ChapterProgress | undefined {
  if (!url) return undefined;
  return getProgressMap(source)[url];
}

/**
 * Atualiza o progresso de um ou mais capítulos e notifica a interface.
 */
export function updateChapterProgress(
  source: ProgressSource,
  updates: Record<string, Partial<ChapterProgress>>,
  opts: { silent?: boolean } = {}
): void {
  const urls = Object.keys(updates).filter(Boolean);
  if (urls.length === 0) return;
  try {
    const map = getProgressMap(source);
    const now = Date.now();
    for (const url of urls) {
      map[url] = { ...(map[url] || {}), ...updates[url], updatedAt: now };
    }
    localStorage.setItem(key(source), JSON.stringify(map));
  } catch {
    /* cota cheia: ignora */
  }
  if (readHook) {
    const read = urls.filter((u) => updates[u]?.read === true);
    if (read.length > 0) {
      try {
        readHook(source, read);
      } catch {
        /* ignore */
      }
    }
  }
  if (!opts.silent) {
    try {
      window.dispatchEvent(new CustomEvent(PROGRESS_EVENT, { detail: { source, urls } }));
    } catch {
      /* ignore */
    }
  }
}

/** Aplica o progresso salvo sobre uma lista de capítulos */
export function mergeChapterProgress<T extends { url: string; read?: boolean; bookmark?: boolean; lastPageRead?: number; lastSecondSeen?: number }>(
  chapters: T[],
  source: ProgressSource
): T[] {
  const map = getProgressMap(source);
  return chapters.map((ch) => {
    const p = map[ch.url];
    if (!p) return ch;
    return {
      ...ch,
      read: p.read ?? ch.read,
      bookmark: p.bookmark ?? ch.bookmark,
      lastPageRead: p.lastPageRead ?? ch.lastPageRead,
      lastSecondSeen: p.lastSecondSeen ?? ch.lastSecondSeen,
    };
  });
}

/**
 * Preserva o estado lido/marcado de capítulos já conhecidos quando a lista é
 * atualizada a partir da fonte (evita "desmarcar" tudo ao recarregar).
 */
export function preserveChapterState<T extends { url: string; read?: boolean; bookmark?: boolean; lastPageRead?: number }>(
  fresh: T[],
  previous: T[]
): T[] {
  const prevMap = new Map(previous.map((c) => [c.url, c]));
  return fresh.map((c) => {
    const old = prevMap.get(c.url);
    if (!old) return c;
    return {
      ...c,
      read: c.read || old.read,
      bookmark: c.bookmark || old.bookmark,
      lastPageRead: c.lastPageRead || old.lastPageRead,
    };
  });
}

/* ───────────── Posição de reprodução de vídeos (retomar de onde parou) ───────────── */

const VIDEO_POS_KEY = 'tp_video_positions';

export function getVideoPosition(path: string): number {
  if (!path) return 0;
  try {
    const map = JSON.parse(localStorage.getItem(VIDEO_POS_KEY) || '{}');
    const v = map?.[path]?.t;
    return typeof v === 'number' && isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/** Posição salva + duração (para barras de progresso dos episódios). */
export function getVideoPositionInfo(path: string): { t: number; d: number } | null {
  if (!path) return null;
  try {
    const v = JSON.parse(localStorage.getItem(VIDEO_POS_KEY) || '{}')?.[path];
    return v && typeof v.t === 'number' ? { t: v.t, d: typeof v.d === 'number' ? v.d : 0 } : null;
  } catch {
    return null;
  }
}

export function saveVideoPosition(path: string, seconds: number, duration: number): void {
  if (!path || !isFinite(seconds)) return;
  try {
    const map = JSON.parse(localStorage.getItem(VIDEO_POS_KEY) || '{}') || {};
    // Perto do fim: considera concluído e limpa a posição
    if (duration > 0 && seconds > duration - 20) {
      delete map[path];
    } else if (seconds > 5) {
      map[path] = { t: Math.floor(seconds), d: Math.floor(duration || 0), at: Date.now() };
    }
    // Mantém no máximo 300 entradas (as mais recentes)
    const entries = Object.entries(map) as Array<[string, { at?: number }]>;
    if (entries.length > 300) {
      entries.sort((a, b) => (b[1]?.at || 0) - (a[1]?.at || 0));
      const trimmed = Object.fromEntries(entries.slice(0, 300));
      localStorage.setItem(VIDEO_POS_KEY, JSON.stringify(trimmed));
      return;
    }
    localStorage.setItem(VIDEO_POS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}
