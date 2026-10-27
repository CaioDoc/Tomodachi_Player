// src/api/chapterExtractor.ts
import { getChapterPages } from './mangadex';
import { buildChapterWebUrl } from './extensionRegistry';
import { fetchKomgaBookPages } from './komga';
import type { MangaPage } from '../components/MangaReader';
import { CHAPTER_PREFIX, fetchChapterPageUrls, suwaChapterId } from './suwayomi';
import { t } from '../i18n';

export interface ExtractedChapter {
  pages: MangaPage[];
  title?: string;
}

export async function fetchChapterPages(
  chapterUrl: string,
  mangaUrl: string = '',
  sourceName: string = ''
): Promise<{ success: boolean; data?: ExtractedChapter; error?: string }> {
  if (!chapterUrl) {
    return { success: false, error: t('URL do capítulo não informada') };
  }

  // Suwayomi (extensões reais do Mihon)
  if (chapterUrl.startsWith(CHAPTER_PREFIX)) {
    try {
      const urls = await fetchChapterPageUrls(suwaChapterId(chapterUrl));
      if (urls.length === 0) return { success: false, error: t('O Suwayomi não retornou páginas para este capítulo') };
      return { success: true, data: { pages: urls.map((u, i) => ({ index: i, url: u, name: t('Página {n}', { n: i + 1 }) })) } };
    } catch (err: any) {
      return { success: false, error: `Suwayomi: ${err?.message || err}` };
    }
  }

  // 0. Komga via API nativa
  const isKomga =
    sourceName.toLowerCase().includes('komga') ||
    chapterUrl.includes('/books/') ||
    mangaUrl.includes('/series/');

  if (isKomga) {
    const bookMatch = chapterUrl.match(/\/books\/([a-zA-Z0-9_-]+)/);
    const bookId = bookMatch ? bookMatch[1] : chapterUrl.replace(/^\/books\//, '').replace(/^\//, '');
    if (bookId) {
      try {
        const komgaRes = await fetchKomgaBookPages(bookId);
        if (komgaRes.success && komgaRes.data && komgaRes.data.pages.length > 0) {
          return {
            success: true,
            data: komgaRes.data,
          };
        }
      } catch (err: any) {
        console.warn('Falha ao buscar páginas do Komga:', err);
      }
    }
  }

  // 1. MangaDex via API nativa At-Home
  const isMangaDex =
    sourceName.toLowerCase().includes('mangadex') ||
    mangaUrl.includes('mangadex.org') ||
    chapterUrl.includes('mangadex.org') ||
    /^[0-9a-fA-F-]{36}$/.test(chapterUrl.replace(/^\/chapter\//, '').replace(/^\//, ''));

  if (isMangaDex) {
    const uuidMatch = chapterUrl.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    const uuid = uuidMatch ? uuidMatch[0] : chapterUrl.replace(/^\/chapter\//, '').replace(/^\//, '');

    if (/^[0-9a-fA-F-]{36}$/.test(uuid)) {
      try {
        const pageUrls = await getChapterPages(uuid);
        if (pageUrls && pageUrls.length > 0) {
          const pages: MangaPage[] = pageUrls.map((u, i) => ({
            index: i,
            url: u,
            name: t('Página {n}', { n: i + 1 }),
          }));
          return { success: true, data: { pages } };
        }
      } catch (err: any) {
        console.warn('Falha na API At-Home do MangaDex, tentando fallback:', err);
      }
    }
  }

  // 2. NHentai via API nativa oficial
  const isNHentai =
    sourceName.toLowerCase().includes('nhentai') ||
    chapterUrl.includes('nhentai.net') ||
    mangaUrl.includes('nhentai.net') ||
    /^\/g\/\d+/.test(chapterUrl) ||
    /^\/g\/\d+/.test(mangaUrl);

  if (isNHentai && typeof window !== 'undefined' && window.electronAPI?.nhentaiApi) {
    const gidMatch = (chapterUrl + ' ' + mangaUrl).match(/\/g\/(\d+)/) || (chapterUrl + ' ' + mangaUrl).match(/\b(\d{5,7})\b/);
    if (gidMatch) {
      const gid = gidMatch[1];
      try {
        const res = await window.electronAPI.nhentaiApi({ endpoint: `/galleries/${gid}` });
        if (res.success && res.data) {
          const gallery = res.data;
          const mediaId = gallery.media_id;
          const pageList = gallery.images?.pages || [];
          const extMap: Record<string, string> = { j: 'jpg', p: 'png', w: 'webp', g: 'gif' };
          const pages: MangaPage[] = pageList.map((p: any, i: number) => {
            const ext = extMap[p.t] || 'jpg';
            return {
              index: i,
              url: `https://i.nhentai.net/galleries/${mediaId}/${i + 1}.${ext}`,
              name: t('Página {n}', { n: i + 1 }),
            };
          });
          if (pages.length > 0) {
            return {
              success: true,
              data: {
                pages,
                title: gallery.title?.pretty || gallery.title?.english || gallery.title?.japanese,
              },
            };
          }
        }
      } catch (err) {
        console.warn('Falha na API NHentai, tentando fallback:', err);
      }
    }
  }

  // 2.5. Atsumaru via API oficial
  const isAtsu =
    sourceName.toLowerCase().includes('atsu') ||
    chapterUrl.includes('atsu.moe') ||
    mangaUrl.includes('atsu.moe');

  if (isAtsu) {
    let mId = '';
    let cId = '';

    const mMatch = (mangaUrl + ' ' + chapterUrl).match(/(?:manga|read)\/([a-zA-Z0-9_-]+)/);
    if (mMatch) {
      mId = mMatch[1];
    } else if (mangaUrl && !mangaUrl.includes('/') && !mangaUrl.includes(':')) {
      mId = mangaUrl.trim();
    }

    const cMatch = chapterUrl.match(/(?:manga|read)\/[^/]+\/([a-zA-Z0-9_-]+)/) || chapterUrl.match(/\/([a-zA-Z0-9_-]+)$/);
    if (cMatch) {
      cId = cMatch[1];
    } else if (!chapterUrl.includes('/') && !chapterUrl.includes(':')) {
      cId = chapterUrl.trim();
    }

    if (mId && cId) {
      try {
        const atsuRes = await fetch(`https://atsu.moe/api/read/chapter?mangaId=${mId}&chapterId=${cId}`);
        if (atsuRes.ok) {
          const atsuData = await atsuRes.json();
          const readCh = atsuData.readChapter;
          if (readCh?.pages && Array.isArray(readCh.pages) && readCh.pages.length > 0) {
            const pages: MangaPage[] = readCh.pages.map((p: any, i: number) => ({
              index: i,
              url: p.image?.startsWith('http') ? p.image : `https://cdn.atsu.moe${p.image?.startsWith('/') ? '' : '/'}${p.image}`,
              name: t('Página {n}', { n: i + 1 }),
              width: p.width,
              height: p.height,
            }));
            return {
              success: true,
              data: {
                pages,
                title: readCh.title || t('Capítulo'),
              },
            };
          }
        }
      } catch (err) {
        console.warn('Falha na API nativa Atsumaru, tentando fallback:', err);
      }
    }
  }

  // 3. Imagem direta (Luscious ou links de arquivos)
  if (/\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(chapterUrl)) {
    const directUrl = chapterUrl.startsWith('http')
      ? chapterUrl
      : chapterUrl.startsWith('//')
      ? `https:${chapterUrl}`
      : `https://ah-img.luscious.net/${chapterUrl.replace(/^\/+/, '')}`;

    return {
      success: true,
      data: {
        pages: [{ index: 0, url: directUrl, name: t('Página 1') }],
      },
    };
  }

  // 4. Extração via Electron IPC (raspagem estática + raspador dinâmico off-screen em background)
  if (typeof window !== 'undefined' && window.electronAPI?.extractChapterPages) {
    try {
      const canonicalUrl = buildChapterWebUrl(chapterUrl, mangaUrl, sourceName) || chapterUrl;
      const res = await window.electronAPI.extractChapterPages(canonicalUrl, mangaUrl, sourceName);
      if (res.success && res.pages && res.pages.length > 0) {
        const pages: MangaPage[] = res.pages.map((u, i) => ({
          index: i,
          url: u,
          name: t('Página {n}', { n: i + 1 }),
        }));
        return { success: true, data: { pages, title: res.title } };
      }
      return { success: false, error: res.error || t('Nenhuma página encontrada para este capítulo') };
    } catch (e: any) {
      return { success: false, error: e.message || t('Erro ao extrair páginas') };
    }
  }

  return { success: false, error: t('Extração não disponível neste ambiente') };
}

/** Verifica se a URL do capítulo é um caminho no disco local */
export function isLocalChapterPath(url: string): boolean {
  if (!url) return false;
  return /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('file://') || url.startsWith('\\\\') || (url.startsWith('/') && !url.startsWith('//') && /[\\/][^\\/]+[\\/]/.test(url) && !/^\/(chapter|books|g|read|manga|title)\//i.test(url));
}

/** Lê as imagens de uma pasta local como páginas do leitor (ordenação natural) */
export async function loadLocalChapterPages(dirPath: string): Promise<{ success: boolean; data?: ExtractedChapter; error?: string }> {
  if (!window.electronAPI?.readDirectory) return { success: false, error: t('Leitura local indisponível') };
  try {
    const clean = dirPath.replace(/^file:\/\/\/?/i, '');
    const res = await window.electronAPI.readDirectory(clean);
    if (!res.success) return { success: false, error: res.error || t('Não foi possível abrir a pasta') };
    const imgs = (res.items || []).filter((i) => i.isImage);
    if (imgs.length === 0) return { success: false, error: t('Nenhuma imagem encontrada nesta pasta') };
    imgs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    const toUrl = window.api?.toMediaUrl || window.electronAPI.toMediaUrl;
    return {
      success: true,
      data: {
        pages: imgs.map((img, idx) => ({ index: idx, url: toUrl ? toUrl(img.path) : img.path, name: img.name })),
      },
    };
  } catch (e: any) {
    return { success: false, error: e?.message || t('Erro ao ler a pasta') };
  }
}

/** Carrega as páginas de um capítulo, seja local ou online */
export async function loadChapterPages(
  chapterUrl: string,
  mangaUrl = '',
  sourceName = ''
): Promise<{ success: boolean; data?: ExtractedChapter; error?: string }> {
  // Capítulo baixado: lê do disco (funciona sem internet)
  try {
    const dl = await window.electronAPI?.getDownload?.(chapterUrl);
    if (dl && Array.isArray(dl.files) && dl.files.length > 0) {
      const toUrl = window.api?.toMediaUrl || window.electronAPI?.toMediaUrl;
      return {
        success: true,
        data: { pages: dl.files.map((f, i) => ({ index: i, url: toUrl ? toUrl(f) : f, name: t('Página {n}', { n: i + 1 }) })) },
      };
    }
  } catch {
    /* segue para a fonte online */
  }
  if (isLocalChapterPath(chapterUrl)) {
    const local = await loadLocalChapterPages(chapterUrl);
    if (local.success) return local;
  }
  return fetchChapterPages(chapterUrl, mangaUrl, sourceName);
}
