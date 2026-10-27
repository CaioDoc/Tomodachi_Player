// src/api/openChapter.ts
// Abre um capítulo (leitor) ou episódio (player) a partir de uma obra da biblioteca.

import { loadChapterPages } from './chapterExtractor';
import { t } from '../i18n';

export interface OpenableChapter {
  url: string;
  name?: string;
  number?: number;
  read?: boolean;
  lastPageRead?: number;
}

export interface OpenableWork {
  url: string;
  title: string;
  sourceName?: string;
  source?: string;
  chapters?: OpenableChapter[];
}

type OpenTabFn = (type: any, title: string, data?: any) => void;

export const chapterDisplayName = (ch: OpenableChapter, kind: 'manga' | 'video' = 'manga') =>
  ch.name?.trim() || (kind === 'manga' ? t('Capítulo {n}', { n: ch.number ?? '' }) : t('Episódio {n}', { n: ch.number ?? '' })).trim();

/**
 * Carrega as páginas e abre o leitor com navegação entre capítulos.
 * Retorna uma mensagem de erro (ou null em caso de sucesso).
 */
export async function openMangaChapter(work: OpenableWork, chapter: OpenableChapter, onOpenTab?: OpenTabFn): Promise<string | null> {
  if (!onOpenTab) return t('Ação indisponível');
  const sourceName = work.sourceName || work.source || '';
  const title = `${work.title} - ${chapterDisplayName(chapter, 'manga')}`;
  try {
    const res = await loadChapterPages(chapter.url, work.url, sourceName);
    if (!res.success || !res.data || res.data.pages.length === 0) {
      return res.error || t('Não foi possível carregar as páginas deste capítulo.');
    }
    onOpenTab('manga-reader', title, {
      pages: res.data.pages,
      initialPageIndex: chapter.lastPageRead && !chapter.read ? Math.max(0, chapter.lastPageRead - 1) : 0,
      title,
      chapterUrl: chapter.url,
      chapterContext: {
        chapters: (work.chapters || [chapter]).map((c) => ({ url: c.url, name: c.name, number: c.number })),
        currentUrl: chapter.url,
        mangaUrl: work.url,
        mangaTitle: work.title,
        sourceName,
      },
    });
    return null;
  } catch (err: any) {
    return err?.message || t('Erro ao abrir o capítulo.');
  }
}

/** Abre um episódio no player (com a lista para o "próximo episódio"). */
export function openVideoEpisode(work: OpenableWork, episode: OpenableChapter, onOpenTab?: OpenTabFn): void {
  if (!onOpenTab) return;
  // Obras do Nuvio: os links são buscados pelos plugins na tela da obra
  if (String(episode.url || '').startsWith('nuvio:') || String((work as any).url || '').startsWith('nuvio:')) {
    onOpenTab('anime-detail', work.title, { anime: work, focusEpisode: episode.url });
    return;
  }
  const title = `${work.title} - ${chapterDisplayName(episode, 'video')}`;
  onOpenTab('video-player', title, {
    filePath: episode.url,
    title,
    item: { path: episode.url, name: title },
    episodeUrl: episode.url,
    work: { title: work.title, url: work.url, cover: (work as any).cover },
    episodeContext: {
      workTitle: work.title,
      episodes: (work.chapters || [episode]).map((c) => ({ url: c.url, name: c.name, number: c.number })),
    },
  });
}
