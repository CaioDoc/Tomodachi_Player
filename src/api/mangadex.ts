import axios from 'axios';
import { t, lang } from '../i18n';

const BASE_URL = 'https://api.mangadex.org';

/** Sinopses do MangaDex vêm em Markdown: mostra só o texto (links viram o nome, sem **, ---, etc.) */
export function plainDescription(md: string): string {
  return md
    .replace(/\[([^\]]+)\]\((?:https?:\/\/|\/)[^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*|__([^_]+)__/g, '$1$2')
    .replace(/(^|\s)[*_]([^*_\n]+)[*_](?=\s|$)/g, '$1$2')
    .replace(/^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/gm, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export interface MangaDexManga {
  id: string;
  title: string;
  description: string;
  coverFileName?: string;
  year?: number;
  status?: string;
  tags?: string[];
}

export interface MangaDexChapter {
  id: string;
  chapter: string;
  title: string;
  translatedLanguage: string;
  volume?: string;
  pages: number;
}

export async function getMangaList(page: number = 1, limit: number = 24, query: string = ''): Promise<{ list: MangaDexManga[]; total: number; totalPages: number }> {
  try {
    const offset = Math.max(0, (page - 1) * limit);
    const params: Record<string, any> = {
      limit,
      offset,
      'includes[]': ['cover_art'],
      'contentRating[]': ['safe', 'suggestive', 'erotica'],
      'order[relevance]': 'desc'
    };
    if (query.trim()) {
      params.title = query.trim();
    }

    const res = await axios.get(`${BASE_URL}/manga`, { params });
    const rawList = res.data.data || [];
    const total = res.data.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    const list: MangaDexManga[] = rawList.map((item: any) => {
      const titles = item.attributes?.title || {};
      const title = titles.en || Object.values(titles)[0] || t('Sem título');
      const descs = item.attributes?.description || {};
      const prefer = lang === 'pt-BR' ? ['pt-br', 'pt'] : lang === 'es' ? ['es-la', 'es'] : [];
      const localDesc = prefer.map((k) => descs[k]).find(Boolean);
      const description = plainDescription(String(localDesc || descs.en || Object.values(descs)[0] || ''));

      const coverRel = (item.relationships || []).find((r: any) => r.type === 'cover_art');
      const coverFileName = coverRel?.attributes?.fileName;

      return {
        id: item.id,
        title,
        description,
        coverFileName,
        year: item.attributes?.year,
        status: item.attributes?.status,
        tags: (item.attributes?.tags || []).map((t: any) => t.attributes?.name?.en).filter(Boolean)
      };
    });

    return { list, total, totalPages };
  } catch (err: any) {
    throw new Error(t('Falha ao buscar mangás no MangaDex: {error}', { error: err.message }));
  }
}

// Backward compatibility alias
export const searchMangaDex = (query: string = '', offset: number = 0, limit: number = 24) => {
  const page = Math.floor(offset / limit) + 1;
  return getMangaList(page, limit, query);
};

export function getMangaDexCoverUrl(mangaId: string, fileName?: string): string {
  if (!fileName) return '';
  return `https://uploads.mangadex.org/covers/${mangaId}/${fileName}.256.jpg`;
}

export async function getMangaChapters(mangaId: string, limit = 50): Promise<MangaDexChapter[]> {
  try {
    const res = await axios.get(`${BASE_URL}/manga/${mangaId}/feed`, {
      params: {
        limit,
        'order[chapter]': 'asc',
        'translatedLanguage[]': ['pt-br', 'en']
      }
    });

    return (res.data.data || []).map((item: any) => ({
      id: item.id,
      chapter: item.attributes?.chapter || '?',
      title: item.attributes?.title || t('Capítulo {n}', { n: item.attributes?.chapter || '' }).trim(),
      translatedLanguage: item.attributes?.translatedLanguage || 'en',
      volume: item.attributes?.volume,
      pages: item.attributes?.pages || 0
    }));
  } catch (err: any) {
    throw new Error(t('Falha ao carregar capítulos: {error}', { error: err.message }));
  }
}

export async function getChapterPages(chapterId: string): Promise<string[]> {
  try {
    const res = await axios.get(`${BASE_URL}/at-home/server/${chapterId}`);
    const baseUrl = res.data.baseUrl;
    const hash = res.data.chapter.hash;
    const data = res.data.chapter.data || [];

    return data.map((filename: string) => `${baseUrl}/data/${hash}/${filename}`);
  } catch (err: any) {
    throw new Error(t('Falha ao carregar páginas do capítulo: {error}', { error: err.message }));
  }
}
