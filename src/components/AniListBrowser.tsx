// src/components/AniListBrowser.tsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Sparkles,
  Flame,
  Award,
  Film,
  Heart,
  Star,
  Loader2,
  Calendar,
  Layers,
  X,
  Play,
  Info,
  Globe,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Circle,
  Tag,
  Tv,
  ListOrdered,
  RefreshCw,
  Check,
  AlertCircle
} from 'lucide-react';
import type { TabType } from '../types';
import type { LibraryItem } from './MihonLibrary';
import { buildAnimeWatchWebUrl } from '../api/extensionRegistry';
import { FavoriteTagModal } from './FavoriteTagModal';
import { anilistTagNames, parseAniListQuery } from '../api/anilistTags';
import { useBulkSelection, BulkFavoriteBar, heartButtonClass, heartSelectTitle } from './BulkFavorite';
import { openWatchSources } from '../api/watchSources';
import { t, tn } from '../i18n';

interface AniListMedia {
  id: number;
  title: {
    romaji: string;
    english: string | null;
    native: string | null;
  };
  coverImage: {
    extraLarge: string;
    large: string;
    medium: string;
    color: string | null;
  };
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  status: string | null;
  genres: string[];
  averageScore: number | null;
  format: string | null;
  seasonYear: number | null;
  startDate: {
    year: number | null;
  };
  trailer?: {
    id: string | null;
    site: string | null;
    thumbnail: string | null;
  } | null;
  streamingEpisodes?: Array<{
    title: string | null;
    thumbnail: string | null;
    url: string | null;
    site: string | null;
  }> | null;
}

interface PageInfo {
  total: number;
  hasNextPage: boolean;
  currentPage: number;
  lastPage: number;
}

const GRAPHQL_QUERY = `
query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort], $format: MediaFormat, $genres: [String], $tags: [String]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
      total
      currentPage
      lastPage
    }
    media(type: ANIME, search: $search, sort: $sort, format: $format, genre_in: $genres, tag_in: $tags, isAdult: false) {
      id
      title {
        romaji
        english
        native
      }
      coverImage {
        extraLarge
        large
        medium
        color
      }
      bannerImage
      description(asHtml: false)
      episodes
      status
      genres
      averageScore
      format
      seasonYear
      startDate {
        year
      }
      trailer {
        id
        site
        thumbnail
      }
      streamingEpisodes {
        title
        thumbnail
        url
        site
      }
    }
  }
}
`;

type BrowserCategory = 'trending' | 'popular' | 'top' | 'movie';

const GENRES = [
  { label: t('Todos os Gêneros'), value: '' },
  { label: t('Ação'), value: 'Action' },
  { label: t('Aventura'), value: 'Adventure' },
  { label: t('Comédia'), value: 'Comedy' },
  { label: 'Drama', value: 'Drama' },
  { label: t('Fantasia'), value: 'Fantasy' },
  { label: t('Ficção Científica'), value: 'Sci-Fi' },
  { label: t('Mistério'), value: 'Mystery' },
  { label: 'Romance', value: 'Romance' },
  { label: t('Sobrenatural'), value: 'Supernatural' },
  { label: t('Suspense'), value: 'Thriller' },
  { label: 'Slice of Life', value: 'Slice of Life' },
  { label: t('Esportes'), value: 'Sports' },
  { label: 'Mecha', value: 'Mecha' },
  { label: t('Terror'), value: 'Horror' },
];

interface AniListBrowserProps {
  onOpenTab?: (type: TabType | any, title: string, data?: any) => void;
  /** Busca controlada de fora (barra única do Descobrir); esconde a busca própria */
  externalQuery?: string;
  /** Onde colocar os botões Atualizar capas / Webview (barra do Descobrir) */
  actionsTarget?: HTMLElement | null;
}

export const AniListBrowser: React.FC<AniListBrowserProps> = ({ onOpenTab, externalQuery, actionsTarget }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const embedded = externalQuery !== undefined;
  const [animes, setAnimes] = useState<AniListMedia[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');
  const [category, setCategory] = useState<BrowserCategory>('trending');
  const [selectedGenre, setSelectedGenre] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [pageInfo, setPageInfo] = useState<PageInfo>({
    total: 0,
    hasNextPage: false,
    currentPage: 1,
    lastPage: 1,
  });

  const [selectedAnime, setSelectedAnime] = useState<AniListMedia | null>(null);
  const [episodeSearch, setEpisodeSearch] = useState<string>('');

  // Favorites library cache
  const [favoriteMap, setFavoriteMap] = useState<Map<string, LibraryItem>>(new Map());

  // Favorite modal state
  const [favoriteModalItem, setFavoriteModalItem] = useState<LibraryItem | null>(null);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);

  // Cover synchronization state
  const [isRefreshingCovers, setIsRefreshingCovers] = useState(false);
  const [coverStatusMessage, setCoverStatusMessage] = useState<string | null>(null);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number } | null>(null);

  // Carrega lista de favoritos da biblioteca de vídeos
  const loadFavorites = useCallback(async () => {
    let list: LibraryItem[] = [];
    if (window.electronAPI?.loadLibrary) {
      try {
        const res = await window.electronAPI.loadLibrary('video');
        if (res.success && res.data?.entries) {
          list = res.data.entries;
        }
      } catch {}
    }
    if (list.length === 0) {
      try {
        const raw = localStorage.getItem('video_library');
        if (raw) list = JSON.parse(raw);
      } catch {}
    }

    const map = new Map<string, LibraryItem>();
    for (const item of list) {
      if (item.url) map.set(item.url.toLowerCase().trim(), item);
      if (item.title) map.set(item.title.toLowerCase().trim(), item);
    }
    setFavoriteMap(map);
  }, []);

  useEffect(() => {
    loadFavorites();
    const handleUpdate = () => loadFavorites();
    window.addEventListener('backup:applied', handleUpdate);
    window.addEventListener('video:library-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('backup:applied', handleUpdate);
      window.removeEventListener('video:library-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [loadFavorites]);

  const getAnimeFavorite = useCallback(
    (media: AniListMedia): LibraryItem | undefined => {
      const url = `https://anilist.co/anime/${media.id}`.toLowerCase().trim();
      const titleRomaji = media.title.romaji?.toLowerCase().trim();
      const titleEng = media.title.english?.toLowerCase().trim();
      return (
        favoriteMap.get(url) ||
        (titleEng ? favoriteMap.get(titleEng) : undefined) ||
        (titleRomaji ? favoriteMap.get(titleRomaji) : undefined)
      );
    },
    [favoriteMap]
  );

  // Busca vinda da barra do Descobrir
  useEffect(() => {
    if (externalQuery !== undefined) setSearchQuery(externalQuery);
  }, [externalQuery]);

  // Debounce na busca de animes
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
      setPage(1);
    }, 450);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Busca inteligente: gêneros e tags do AniList viram filtros, o resto é texto
  const [tagNames, setTagNames] = useState<string[]>([]);
  useEffect(() => {
    void anilistTagNames().then(setTagNames);
  }, []);
  const parsedKey = useMemo(() => JSON.stringify(parseAniListQuery(debouncedSearch, tagNames)), [debouncedSearch, tagNames]);
  const parsedQuery = useMemo(() => JSON.parse(parsedKey) as ReturnType<typeof parseAniListQuery>, [parsedKey]);

  const fetchAnimes = useCallback(async () => {
    setLoading(true);

    let sort = ['TRENDING_DESC'];
    let format: string | undefined = undefined;
    const text = parsedQuery.text;
    const genres = Array.from(new Set([...parsedQuery.genres, ...(selectedGenre ? [selectedGenre] : [])]));

    if (text) {
      sort = ['SEARCH_MATCH'];
    } else {
      switch (category) {
        case 'trending':
          sort = ['TRENDING_DESC'];
          break;
        case 'popular':
          sort = ['POPULARITY_DESC'];
          break;
        case 'top':
          sort = ['SCORE_DESC'];
          break;
        case 'movie':
          sort = ['POPULARITY_DESC'];
          format = 'MOVIE';
          break;
      }
    }

    setLoadError(null);
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: GRAPHQL_QUERY,
          variables: {
            page,
            perPage: 24,
            search: text || undefined,
            sort,
            format,
            genres: genres.length ? genres : undefined,
            tags: parsedQuery.tags.length ? parsedQuery.tags : undefined,
          },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        const list = json.data?.Page?.media || [];
        const pInfo = json.data?.Page?.pageInfo || {
          total: list.length,
          hasNextPage: false,
          currentPage: page,
          lastPage: 1,
        };
        setAnimes(list);
        setPageInfo(pInfo);
      } else {
        setAnimes([]);
        setLoadError(res.status === 429 ? t('Muitas requisições ao AniList. Aguarde alguns segundos e tente novamente.') : t('O AniList respondeu com erro ({status}).', { status: res.status }));
      }
    } catch (err) {
      console.error('Erro ao consultar AniList:', err);
      setAnimes([]);
      setLoadError(t('Não foi possível conectar ao AniList. Verifique sua conexão com a internet.'));
    } finally {
      setLoading(false);
    }
  }, [parsedQuery, category, selectedGenre, page]);

  useEffect(() => {
    fetchAnimes();
  }, [fetchAnimes]);

  const handleRefreshCovers = useCallback(async () => {
    if (isRefreshingCovers || loading) return;
    setIsRefreshingCovers(true);
    setCoverStatusMessage(null);

    try {
      await fetchAnimes();

      if (animes.length > 0 && window.electronAPI?.resolveCover) {
        setRefreshProgress({ current: 0, total: animes.length });
        let resolvedCount = 0;
        const updated = [...animes];

        for (let i = 0; i < updated.length; i += 6) {
          const chunk = updated.slice(i, i + 6);
          await Promise.all(
            chunk.map(async (v, cIdx) => {
              const globalIdx = i + cIdx;
              const cover = v.coverImage?.extraLarge || v.coverImage?.large;
              if (cover) {
                try {
                  const res = await window.electronAPI?.resolveCover(cover, 'AniList');
                  if (res?.success && res.url) {
                    updated[globalIdx] = {
                      ...updated[globalIdx],
                      coverImage: {
                        ...updated[globalIdx].coverImage,
                        extraLarge: res.url,
                        large: res.url,
                      },
                    };
                    resolvedCount++;
                  }
                } catch {}
              }
              setRefreshProgress({ current: Math.min(i + cIdx + 1, animes.length), total: animes.length });
            })
          );
        }
        setAnimes(updated);
        setCoverStatusMessage(tn(resolvedCount > 0 ? resolvedCount : animes.length, '{n} capa sincronizada com sucesso!', '{n} capas sincronizadas com sucesso!'));
      } else {
        setCoverStatusMessage(t('Catálogo AniList atualizado com sucesso!'));
      }
    } catch (err) {
      console.warn('Erro ao atualizar capas no AniList:', err);
      setCoverStatusMessage(t('Erro ao atualizar algumas capas.'));
    } finally {
      setIsRefreshingCovers(false);
      setTimeout(() => {
        setCoverStatusMessage(null);
        setRefreshProgress(null);
      }, 4000);
    }
  }, [isRefreshingCovers, loading, fetchAnimes, animes]);

  const convertMediaToLibraryItem = (media: AniListMedia): LibraryItem => {
    const existing = getAnimeFavorite(media);
    const displayTitle = media.title.english || media.title.romaji || 'Anime';
    const totalEps = media.episodes || media.streamingEpisodes?.length || 12;

    const defaultChapters = Array.from({ length: totalEps }, (_, i) => {
      const streamEp = media.streamingEpisodes?.[i];
      return {
        url: streamEp?.url || `https://anilist.co/anime/${media.id}#ep${i + 1}`,
        name: streamEp?.title || t('Episódio {n}', { n: i + 1 }),
        number: i + 1,
        read: false,
        bookmark: false,
        lastPageRead: 0,
        lastSecondSeen: 0,
        lastModifiedAt: Date.now(),
      };
    });

    return {
      source: existing?.source || 'anilist',
      sourceName: existing?.sourceName || 'AniList',
      url: existing?.url || `https://anilist.co/anime/${media.id}`,
      title: existing?.title || displayTitle,
      author: existing?.author || 'AniList Community',
      description: existing?.description || media.description?.replace(/<br\s*\/?>/gi, '\n') || '',
      genres: existing?.genres || media.genres || [],
      status: existing?.status ?? (media.status === 'FINISHED' ? 2 : 1),
      cover: existing?.cover || media.coverImage?.extraLarge || media.coverImage?.large || "",
      background: existing?.background || media.bannerImage || undefined,
      dateAdded: existing?.dateAdded || Date.now(),
      favorite: existing?.favorite ?? true,
      categories: existing?.categories || ['Favoritos'],
      chapters: existing?.chapters?.length ? existing.chapters : defaultChapters,
      totalChapters: totalEps,
      readChapters: existing?.readChapters || 0,
    };
  };

  /** Abre a página da obra (tela inteira, igual à da Biblioteca) */
  const openTitle = (media: AniListMedia) => {
    const item = convertMediaToLibraryItem(media);
    onOpenTab?.('anime-detail', item.title, {
      anime: {
        ...item,
        altTitles: [media.title.romaji, media.title.english || '', media.title.native || ''].filter(Boolean),
        year: media.seasonYear || media.startDate?.year || undefined,
        format: media.format || undefined,
        score: media.averageScore || undefined,
        favorite: getAnimeFavorite(media)?.favorite ?? false,
      },
    });
  };

  const bulk = useBulkSelection<LibraryItem>();
  const [bulkOpen, setBulkOpen] = useState(false);

  /** Coração: obra já favoritada abre as tags; as outras são marcadas para favoritar em lote */
  const handleOpenFavorite = (media: AniListMedia, e: React.MouseEvent) => {
    e.stopPropagation();
    const item = convertMediaToLibraryItem(media);
    if (getAnimeFavorite(media)?.favorite) {
      setFavoriteModalItem(item);
      setIsFavoriteModalOpen(true);
      return;
    }
    bulk.toggle(`al:${media.id}`, item);
  };

  const handleOpenWebview = (media: AniListMedia) => {
    const title = media.title.english || media.title.romaji;
    const url = `https://anilist.co/anime/${media.id}`;
    onOpenTab?.('webview', title, {
      url,
      initialUrl: url,
    });
  };

  const handleWatchInWebview = (animeTitle: string, epNum: number = 1) => {
    const fullTitle = `${animeTitle}${epNum > 1 ? ` - Ep. ${epNum}` : ''}`;
    const url = buildAnimeWatchWebUrl(animeTitle, epNum, 'AniList');
    onOpenTab?.('webview', t('Assistir: {title}', { title: fullTitle }), {
      url,
      initialUrl: url,
    });
  };

  const handleWatchEpisode = (
    media: AniListMedia,
    epNum: number,
    epTitle?: string,
    epUrl?: string
  ) => {
    const animeTitle = media.title.english || media.title.romaji;
    void epTitle;
    // O AniList não tem vídeo: abre o painel de Fontes (extensões e plugins do Nuvio)
    const libItem = convertMediaToLibraryItem(media);
    const chapter = libItem.chapters?.find((c: any) => c.number === epNum);
    openWatchSources({
      title: animeTitle,
      altTitles: [media.title.romaji, media.title.english || '', media.title.native || ''].filter(Boolean),
      year: media.seasonYear || media.startDate?.year || undefined,
      kind: media.format === 'MOVIE' ? 'movie' : 'series',
      episode: epNum,
      cover: media.coverImage?.extraLarge || media.coverImage?.large,
      episodeUrl: epUrl || chapter?.url || `https://anilist.co/anime/${media.id}#ep${epNum}`,
    });
  };

  // Alterna status de assistido do episódio diretamente no modal
  const handleToggleWatched = (media: AniListMedia, epIndex: number) => {
    const item = convertMediaToLibraryItem(media);
    const updatedChapters = [...(item.chapters || [])];
    if (updatedChapters[epIndex]) {
      const isWatched = !updatedChapters[epIndex].read;
      updatedChapters[epIndex] = {
        ...updatedChapters[epIndex],
        read: isWatched,
        lastModifiedAt: Date.now(),
      };
    }
    const readCount = updatedChapters.filter((c) => c.read).length;
    const updatedItem: LibraryItem = {
      ...item,
      chapters: updatedChapters,
      readChapters: readCount,
    };

    try {
      const raw = localStorage.getItem('video_library');
      let list: LibraryItem[] = raw ? JSON.parse(raw) : [];
      const idx = list.findIndex(
        (it) =>
          it.url === updatedItem.url ||
          it.title.toLowerCase() === updatedItem.title.toLowerCase()
      );
      if (idx >= 0) {
        list[idx] = updatedItem;
      } else {
        list.unshift(updatedItem);
      }
      localStorage.setItem('video_library', JSON.stringify(list));
      if (window.electronAPI?.saveLibrary) {
        window.electronAPI.saveLibrary('video', {
          app: 'Tomodachi Player',
          source: 'video',
          updatedAt: Date.now(),
          entries: list,
        });
      }
      window.dispatchEvent(new CustomEvent('video:library-updated', { detail: updatedItem }));
      loadFavorites();
    } catch (err) {
      console.error('Erro ao alternar status de assistido:', err);
    }
  };

  const actionButtons = (
    <>
          {/* Botão Atualizar Capas */}
          <button
            type="button"
            disabled={isRefreshingCovers || loading}
            onClick={handleRefreshCovers}
            className={`h-9 px-3 rounded-lg border text-[12px] font-medium flex items-center gap-1.5 transition-all shrink-0 cursor-pointer ${
              isRefreshingCovers
                ? 'bg-accent/[0.13] border-accent/[0.4] text-accent'
                : 'bg-subtle hover:bg-elevated border-line text-fg-2 hover:text-white'
            }`}
            title={t('Atualizar e sincronizar todas as capas do AniList para exibição offline rápida')}
          >
            <RefreshCw size={13} className={isRefreshingCovers ? 'animate-spin text-accent' : ''} />
            <span className="hidden sm:inline">
              {isRefreshingCovers && refreshProgress
                ? t('Capas ({current}/{total})', { current: refreshProgress.current, total: refreshProgress.total })
                : t('Atualizar Capas')}
            </span>
          </button>

          {/* Botão Webview no cabeçalho */}
          <button
            type="button"
            onClick={() => {
              const url = debouncedSearch
                ? buildAnimeWatchWebUrl(debouncedSearch, 1)
                : 'https://anilist.co';
              onOpenTab?.('webview', 'Webview AniList', { url, initialUrl: url });
            }}
            className="h-9 px-3 rounded-lg bg-subtle hover:bg-elevated border border-line text-fg-2 hover:text-fg text-[12px] font-medium flex items-center gap-1.5 transition-colors shrink-0 cursor-pointer"
            title={t('Abrir navegador Webview integrado')}
          >
            <Globe size={13} className="text-accent" />
            <span className="hidden sm:inline">Webview</span>
          </button>
    </>
  );

  const goPage = (n: number) => {
    setPage(Math.max(1, n));
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const showPager = !loadError && animes.length > 0;

  return (
    <div className="flex flex-col h-full bg-canvas text-fg-2 select-none overflow-hidden">
      {embedded && actionsTarget && createPortal(actionButtons, actionsTarget)}
      {/* Header Bar */}
      {!embedded && (
      <div className="p-3 sm:p-4 border-b border-line bg-surface flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
        {/* Search Bar & Quick Pagination */}
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {externalQuery === undefined ? (
            <div className="relative flex-1 min-w-[220px] max-w-xl">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('Buscar anime por título...')}
                className="w-full bg-canvas border border-line rounded-md pl-9 pr-3 py-1.5 text-xs text-fg placeholder-fg-muted outline-none focus:border-accent transition-colors"
              />
            </div>
          ) : (
            <span className="flex-1 text-[12px] text-fg-muted truncate">{debouncedSearch ? t('Resultados para “{q}”', { q: debouncedSearch }) : t('Animes no AniList')}</span>
          )}

          {/* Top Pagination Controls */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-md bg-subtle hover:bg-elevated border border-line text-fg-2 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={t('Página Anterior')}
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-xs font-mono text-fg-muted px-1.5 whitespace-nowrap">
              {page} / {pageInfo.lastPage || 1}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={!pageInfo.hasNextPage || loading}
              className="p-1.5 rounded-md bg-subtle hover:bg-elevated border border-line text-fg-2 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title={t('Próxima Página')}
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {!embedded && actionButtons}
        </div>
      </div>
      )}

      {/* Category Pills & Genre Bar */}
      <div className="px-4 py-2 bg-surface border-b border-line-subtle flex items-center justify-between gap-3 overflow-x-auto no-scrollbar shrink-0">
        {/* Status de Sincronização de Capas */}
        {isRefreshingCovers && refreshProgress && (
          <div className="text-xs text-accent font-mono flex items-center gap-1.5 bg-accent/[0.08] border border-accent/[0.2] px-2.5 py-0.5 rounded-full shrink-0">
            <Loader2 size={12} className="animate-spin" />
            <span>{t('Sincronizando capas: {current} de {total}', { current: refreshProgress.current, total: refreshProgress.total })}</span>
          </div>
        )}

        {coverStatusMessage && !isRefreshingCovers && (
          <div className="text-xs text-emerald-400 font-mono flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full shrink-0">
            <Check size={12} />
            <span>{coverStatusMessage}</span>
          </div>
        )}

        {!parsedQuery.text && (
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                setCategory('trending');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
                category === 'trending'
                  ? 'bg-subtle text-fg border-line shadow-xs'
                  : 'bg-transparent text-fg-muted border-transparent hover:text-fg hover:bg-subtle/40'
              }`}
            >
              <Flame size={13} className="text-danger-fg" />
              <span>{t('Em Alta')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('popular');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
                category === 'popular'
                  ? 'bg-subtle text-fg border-line shadow-xs'
                  : 'bg-transparent text-fg-muted border-transparent hover:text-fg hover:bg-subtle/40'
              }`}
            >
              <Sparkles size={13} className="text-amber-400" />
              <span>{t('Mais Populares')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('top');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
                category === 'top'
                  ? 'bg-subtle text-fg border-line shadow-xs'
                  : 'bg-transparent text-fg-muted border-transparent hover:text-fg hover:bg-subtle/40'
              }`}
            >
              <Award size={13} className="text-success-fg" />
              <span>{t('Mais Bem Avaliados')}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setCategory('movie');
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer border ${
                category === 'movie'
                  ? 'bg-subtle text-fg border-line shadow-xs'
                  : 'bg-transparent text-fg-muted border-transparent hover:text-fg hover:bg-subtle/40'
              }`}
            >
              <Film size={13} className="text-[#a371f7]" />
              <span>{t('Filmes de anime')}</span>
            </button>
          </div>
        )}

        {/* Genre Selector */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar ml-auto">
          <span className="text-[11px] text-fg-muted shrink-0 mr-1 flex items-center gap-1">
            <Tag size={12} className="text-accent" /> {t('Gênero:')}
          </span>
          {GENRES.map((g) => {
            const active = selectedGenre === g.value;
            return (
              <button
                key={g.value}
                type="button"
                onClick={() => {
                  setSelectedGenre(g.value);
                  setPage(1);
                }}
                className={`px-2 py-1 rounded text-[11px] font-medium whitespace-nowrap transition-colors border cursor-pointer ${
                  active
                    ? 'bg-accent border-accent-hover text-accent-fg shadow-xs'
                    : 'bg-subtle border-line text-fg-muted hover:text-fg hover:bg-elevated'
                }`}
              >
                {g.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Content */}
      <div ref={scrollRef} className="flex-1 p-4 sm:p-6 overflow-y-auto flex flex-col justify-between">
        <div>
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-fg-muted gap-3">
              <Loader2 size={28} className="animate-spin text-accent" />
              <span className="text-xs">{t('Carregando catálogo do AniList...')}</span>
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
              <AlertCircle size={28} className="text-danger-fg" />
              <p className="text-[13px] text-fg-2 max-w-sm">{loadError}</p>
              <button
                type="button"
                onClick={() => fetchAnimes()}
                className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw size={13} /> {t('Tentar novamente')}
              </button>
            </div>
          ) : animes.length === 0 ? (
            <div className="text-center py-20 text-fg-muted text-xs">
              {t('Nenhum anime encontrado para sua busca. Tente outro termo ou categoria.')}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4">
              {animes.map((anime) => {
                const displayTitle = anime.title.english || anime.title.romaji || t('Sem título');
                const cover = anime.coverImage?.extraLarge || anime.coverImage?.large || "";
                const score = anime.averageScore ? `${anime.averageScore}%` : null;
                const favItem = getAnimeFavorite(anime);
                const isFavorited = !!favItem?.favorite;
                const mainTag = favItem?.categories?.[0];
                const isMarked = !isFavorited && bulk.has(`al:${anime.id}`);

                return (
                  <div
                    key={anime.id}
                    onClick={() => openTitle(anime)}
                    className={`group flex flex-col bg-surface hover:bg-subtle border rounded-md overflow-hidden cursor-pointer transition-all shadow-xs relative ${isMarked ? 'border-accent ring-2 ring-accent/50' : 'border-line hover:border-accent'}`}
                  >
                    {/* Poster */}
                    <div className="w-full aspect-[2/3] bg-canvas relative overflow-hidden flex items-center justify-center">
                      {cover ? (
                        <img
                          src={cover}
                          alt={displayTitle}
                          loading="lazy"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.dataset.retried && window.electronAPI?.resolveCover && cover) {
                              img.dataset.retried = 'true';
                              window.electronAPI.resolveCover(cover, 'AniList').then((res) => {
                                if (res?.success && res.url) {
                                  img.src = res.url;
                                  img.style.display = 'block';
                                  return;
                                }
                                img.style.display = 'none';
                              }).catch(() => {
                                img.style.display = 'none';
                              });
                              return;
                            }
                            img.style.display = 'none';
                          }}
                        />
                      ) : (
                        <Film size={28} className="text-fg-muted" />
                      )}

                      {/* Nota do Anime */}
                      {score && (
                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/75 text-emerald-400 shadow-sm backdrop-blur-xs flex items-center gap-0.5 z-10">
                          <Star size={10} className="fill-emerald-400 text-emerald-400" />
                          <span>{score}</span>
                        </div>
                      )}

                      {/* Botão de Favoritar com indicador de tag */}
                      <button
                        type="button"
                        onClick={(e) => handleOpenFavorite(anime, e)}
                        className={`absolute top-1.5 left-1.5 p-1.5 rounded-full transition-all shadow-md z-10 cursor-pointer ${heartButtonClass(isFavorited, isMarked)}`}
                        aria-pressed={isFavorited ? undefined : isMarked}
                        title={
                          isFavorited
                            ? t('Favoritado em: {tags}', { tags: favItem?.categories?.join(', ') || '' })
                            : heartSelectTitle(isMarked)
                        }
                      >
                        <Heart size={12} fill={isFavorited || isMarked ? 'currentColor' : 'none'} />
                      </button>

                      {/* Botão de Webview no card */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleWatchInWebview(displayTitle, 1);
                        }}
                        className="absolute bottom-1.5 right-1.5 p-1.5 rounded-full bg-black/70 hover:bg-accent text-fg-muted hover:text-black transition-all shadow-md z-10 opacity-0 group-hover:opacity-100"
                        title={t('Assistir na Webview')}
                      >
                        <Globe size={12} />
                      </button>

                      {/* Tag Badge se já for favoritado */}
                      {isFavorited && mainTag && (
                        <div className="absolute bottom-1.5 left-1.5 max-w-[70%] truncate px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[9px] font-semibold text-rose-300 border border-rose-500/40 z-10">
                          {mainTag}
                        </div>
                      )}
                    </div>

                    {/* Detalhes do Card */}
                    <div className="p-2 flex flex-col justify-between flex-1 gap-1">
                      <h4
                        className="text-xs font-medium text-fg line-clamp-2 leading-tight group-hover:text-accent transition-colors"
                        title={displayTitle}
                      >
                        {displayTitle}
                      </h4>

                      <div className="flex items-center justify-between text-[10px] text-fg-muted mt-auto pt-1 border-t border-line-subtle">
                        <span>{anime.episodes ? t('{n} eps', { n: anime.episodes }) : t('Em exibição')}</span>
                        <span className="font-mono text-cyan-400 uppercase text-[9px]">
                          {anime.format || 'TV'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

      {/* Paginação no rodapé (some quando não há resultados ou deu erro) */}
      {showPager && (
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 h-12 border-t border-line bg-surface shrink-0 text-xs text-fg-muted">
          <span className="truncate">
            {pageInfo.lastPage > 1
              ? t('Total: {total} animes encontrados • Página {page} de {last}', { total: pageInfo.total, page, last: pageInfo.lastPage })
              : tn(animes.length, '{n} anime', '{n} animes')}
          </span>
          {pageInfo.lastPage > 1 && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => goPage(page - 1)}
                disabled={page <= 1 || loading}
                className="flex items-center gap-1 h-8 px-3 bg-subtle hover:bg-elevated text-fg rounded-md border border-line disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft size={14} /> {t('Anterior')}
              </button>
              <span className="font-mono text-xs text-fg px-1 tabular-nums">
                {page} / {pageInfo.lastPage}
              </span>
              <button
                type="button"
                onClick={() => goPage(page + 1)}
                disabled={!pageInfo.hasNextPage || page >= pageInfo.lastPage || loading}
                className="flex items-center gap-1 h-8 px-3 bg-subtle hover:bg-elevated text-fg rounded-md border border-line disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                {t('Próxima')} <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modal de Detalhes do Anime com Lista de Episódios e Play Direto */}
      {/* Favorite Modal com suporte completo a vídeos e tags personalizadas */}
      <FavoriteTagModal
        isOpen={isFavoriteModalOpen}
        onClose={() => setIsFavoriteModalOpen(false)}
        manga={favoriteModalItem}
        source="video"
        onSaved={() => {
          loadFavorites();
        }}
      />
      <FavoriteTagModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        manga={null}
        bulk={bulk.items}
        source="video"
        onBulkSaved={() => {
          bulk.clear();
          loadFavorites();
        }}
      />
      <BulkFavoriteBar count={bulk.count} onFavorite={() => setBulkOpen(true)} onClear={bulk.clear} />
    </div>
  );
};
