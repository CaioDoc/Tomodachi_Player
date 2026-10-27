// src/utils/downloads.ts
// Downloads de capítulos para leitura offline (lado da interface).

import { useEffect, useState } from 'react';
import { fetchChapterPages } from '../api/chapterExtractor';
import { t } from '../i18n';

export const DOWNLOADS_EVENT = 'tomodachi:downloads-changed';

export interface DownloadProgress {
  done: number;
  total: number;
}

export const downloadsAvailable = () => typeof window !== 'undefined' && !!window.electronAPI?.downloadChapter;

const notify = () => {
  try {
    window.dispatchEvent(new CustomEvent(DOWNLOADS_EVENT));
  } catch {
    /* ignore */
  }
};

/** Busca as páginas do capítulo e baixa para o disco. Retorna mensagem de erro ou null. */
export async function downloadChapter(
  work: { title: string; url: string; sourceName?: string },
  chapter: { url: string; name?: string; number?: number }
): Promise<string | null> {
  if (!window.electronAPI?.downloadChapter) return t('Downloads indisponíveis');
  try {
    const res = await fetchChapterPages(chapter.url, work.url, work.sourceName || '');
    if (!res.success || !res.data || res.data.pages.length === 0) return res.error || t('Não foi possível obter as páginas');
    const result = await window.electronAPI.downloadChapter({
      chapterUrl: chapter.url,
      workTitle: work.title,
      chapterName: chapter.name?.trim() || `Capítulo ${chapter.number ?? ''}`.trim(),
      pages: res.data.pages.map((p) => p.url),
    });
    notify();
    return result.success ? null : result.error || t('Falha no download');
  } catch (err: any) {
    notify();
    return err?.message || t('Falha no download');
  }
}

export async function deleteDownloadedChapter(chapterUrl: string): Promise<void> {
  await window.electronAPI?.deleteDownload?.(chapterUrl);
  notify();
}

/** Estado dos downloads: capítulos baixados e progresso dos que estão em andamento. */
export function useDownloads() {
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, DownloadProgress>>({});

  useEffect(() => {
    if (!downloadsAvailable()) return;
    let alive = true;
    const refresh = () =>
      window.electronAPI
        ?.listDownloads?.()
        .then((list) => {
          if (alive) setDownloaded(new Set((list || []).map((d) => d.chapterUrl)));
        })
        .catch(() => {});
    refresh();
    window.addEventListener(DOWNLOADS_EVENT, refresh);
    const unsub = window.electronAPI?.onDownloadProgress?.((p) => {
      setProgress((prev) => {
        const next = { ...prev };
        if (p.finished || p.error || p.cancelled) delete next[p.chapterUrl];
        else if (typeof p.done === 'number' && typeof p.total === 'number') next[p.chapterUrl] = { done: p.done, total: p.total };
        return next;
      });
      if (p.finished) refresh();
    });
    return () => {
      alive = false;
      window.removeEventListener(DOWNLOADS_EVENT, refresh);
      if (typeof unsub === 'function') unsub();
    };
  }, []);

  return { downloaded, progress };
}
