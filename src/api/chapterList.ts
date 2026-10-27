// src/api/chapterList.ts
// Busca a lista de capítulos/episódios de uma obra na fonte (APIs nativas ou raspador).
// Usado pela tela de detalhes e pela verificação de atualizações.

import { fetchKomgaSeriesBooks } from './komga';
import { MANGA_PREFIX, fetchMangaAndChapters, suwaChaptersToLibrary, suwaMangaId } from './suwayomi';
import { t } from '../i18n';

export interface FetchedChapter {
  url: string;
  name: string;
  number: number;
  read: boolean;
  bookmark: boolean;
  lastPageRead: number;
  lastSecondSeen: number;
  lastModifiedAt: number;
}

/**
 * @param targetUrl  URL absoluta (resolvida) da obra
 * @param sourceName nome da fonte/extensão
 * @param mangaUrl   URL original salva na biblioteca (pode ser relativa)
 * @returns lista de capítulos (vazia se nada for encontrado)
 */
export async function fetchChapterList(targetUrl: string, sourceName = '', mangaUrl = ''): Promise<FetchedChapter[]> {
  if (!targetUrl) return [];

  // Suwayomi: capítulos direto da extensão oficial
  const suwaUrl = targetUrl.startsWith(MANGA_PREFIX) ? targetUrl : mangaUrl.startsWith(MANGA_PREFIX) ? mangaUrl : '';
  if (suwaUrl) {
    const { chapters } = await fetchMangaAndChapters(suwaMangaId(suwaUrl));
    return suwaChaptersToLibrary(chapters);
  }
  const sName = (sourceName || '').toLowerCase();

  // 0. Atsumaru rápido direto via API do site
  const isAtsu = sName.includes('atsu') || targetUrl.includes('atsu.moe');
  if (isAtsu) {
    const match = targetUrl.match(/(?:manga|read)\/([a-zA-Z0-9_-]+)/) || (mangaUrl || targetUrl).match(/^[a-zA-Z0-9_-]+$/);
    const atsuId = match ? (match[1] || match[0]) : '';
    if (atsuId) {
      try {
        const atsuRes = await fetch(`https://atsu.moe/api/manga/allChapters?mangaId=${atsuId}`);
        if (atsuRes.ok) {
          const data = await atsuRes.json();
          if (Array.isArray(data.chapters) && data.chapters.length > 0) {
            const mapped: FetchedChapter[] = data.chapters.map((c: any) => ({
              url: `https://atsu.moe/read/${atsuId}/${c.id}`,
              name: c.title || `Capítulo ${c.number || ''}`,
              number: typeof c.number === 'number' ? c.number : parseFloat(c.number) || 1,
              read: false,
              bookmark: false,
              lastPageRead: 0,
              lastSecondSeen: 0,
              lastModifiedAt: c.createdAt || Date.now(),
            }));
            return mapped;
          }
        }
      } catch {}
    }
  }

  // Komga
  if (sName.includes('komga') || targetUrl.includes('/series/')) {
    const match = targetUrl.match(/\/series\/([a-zA-Z0-9_-]+)/);
    if (match) {
      try {
        const books = await fetchKomgaSeriesBooks(match[1]);
        if (Array.isArray(books) && books.length > 0) {
          const komgaChaps: FetchedChapter[] = books.map((b: any, idx: number) => ({
            url: `/books/${b.id}`,
            name: b.metadata?.title || b.name || t('Livro {n}', { n: idx + 1 }),
            number: b.metadata?.numberSort || idx + 1,
            read: b.readProgress?.completed || false,
            bookmark: false,
            lastPageRead: b.readProgress?.page || 0,
            lastSecondSeen: 0,
            lastModifiedAt: Date.now(),
          }));
          if (komgaChaps.length > 0) {
            return komgaChaps;
          }
        }
      } catch {}
    }
  }

  // MangaDex
  if (sName.includes('mangadex') || targetUrl.includes('mangadex.org')) {
    const match = targetUrl.match(/title\/([0-9a-fA-F-]{36})/);
    if (match) {
      try {
        const res = await fetch(`https://api.mangadex.org/manga/${match[1]}/feed?translatedLanguage[]=pt-br&translatedLanguage[]=en&order[chapter]=desc&limit=100`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.data) && data.data.length > 0) {
            const mdChaps: FetchedChapter[] = data.data.map((c: any) => ({
              url: `/chapter/${c.id}`,
              name: c.attributes?.title || `Capítulo ${c.attributes?.chapter || '1'}`,
              number: parseFloat(c.attributes?.chapter || '1') || 1,
              read: false,
              bookmark: false,
              lastPageRead: 0,
              lastSecondSeen: 0,
              lastModifiedAt: Date.now(),
            }));
            return mdChaps;
          }
        }
      } catch {}
    }
  }

  // 3. Raspador Geral de Capítulos (Electron IPC estática + dinâmica off-screen)
  if (window.electronAPI?.extractMangaChapters) {
    try {
      const res = await window.electronAPI.extractMangaChapters(targetUrl, sourceName);
      if (res.success && Array.isArray(res.chapters) && res.chapters.length > 0) {
        const mapped: FetchedChapter[] = res.chapters.map((ch: any, idx: number) => ({
          url: ch.url,
          name: ch.name || t('Capítulo {n}', { n: ch.number || idx + 1 }),
          number: ch.number || idx + 1,
          read: false,
          bookmark: false,
          lastPageRead: 0,
          lastSecondSeen: 0,
          lastModifiedAt: Date.now(),
        }));

        return mapped;
      }
    } catch (err: any) {
      console.warn('Erro no extrator de capítulos da fonte:', err);
    }
  }


  return [];
}
