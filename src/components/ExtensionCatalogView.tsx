// src/components/ExtensionCatalogView.tsx
import { searchSite } from '../api/siteSearch';
import { relevance, MIN_RELEVANCE } from '../utils/relevance';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Compass,
  Search,
  BookOpen,
  Film,
  Globe,
  Loader2,
  Heart,
  Sparkles,
  ExternalLink,
  Layers,
  Tag,
  Star,
  Play,
  X,
  CheckCircle2,
  Circle,
  ListOrdered,
  RefreshCw,
  Check
} from 'lucide-react';
import type { TabType } from '../types';
import type { RepoExtension } from '../api/repositories';
import type { InstalledExtension } from '../api/extensionRegistry';
import type { LibraryItem } from './MihonLibrary';
import { getMangaList, getMangaDexCoverUrl, type MangaDexManga } from '../api/mangadex';
import { FavoriteTagModal } from './FavoriteTagModal';
import { useBulkSelection, BulkFavoriteBar, heartButtonClass, heartSelectTitle } from './BulkFavorite';
import { openWatchSources } from '../api/watchSources';
import { t } from '../i18n';

interface ExtensionCatalogViewProps {
  extension: InstalledExtension | RepoExtension | any;
  mediaType?: 'manga' | 'video';
  onOpenTab?: (type: TabType | any, title: string, data?: any) => void;
  /** Busca controlada de fora (barra única do Descobrir); esconde a busca própria */
  externalQuery?: string;
}

interface OnlineAnimeMedia {
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
  };
  bannerImage: string | null;
  description: string | null;
  episodes: number | null;
  status: string | null;
  genres: string[];
  averageScore: number | null;
  format: string | null;
  startDate?: {
    year: number | null;
  };
  streamingEpisodes?: Array<{
    title: string | null;
    thumbnail: string | null;
    url: string | null;
    site: string | null;
  }> | null;
  url?: string;
}

interface VideoProfile {
  sort: string[];
  genre?: string;
  format?: string;
  pageOffset: number;
  label: string;
}

function getVideoProfile(extName: string, extLang: string = 'pt-BR'): VideoProfile {
  const norm = extName.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (norm.includes('betteranime')) {
    return {
      sort: ['POPULARITY_DESC', 'TRENDING_DESC'],
      genre: 'Action',
      format: undefined,
      pageOffset: 1,
      label: t('Shonen & Ação (Dublado/Legendado)'),
    };
  }

  if (norm.includes('animefire')) {
    return {
      sort: ['TRENDING_DESC'],
      genre: 'Fantasy',
      format: undefined,
      pageOffset: 1,
      label: t('Fantasia & Lançamentos da Temporada'),
    };
  }

  if (norm.includes('hianime')) {
    return {
      sort: ['SCORE_DESC'],
      genre: undefined,
      format: 'TV',
      pageOffset: 1,
      label: t('Séries Mais Bem Avaliadas (Score Top)'),
    };
  }

  if (norm.includes('gogoanime')) {
    return {
      sort: ['FAVOURITES_DESC'],
      genre: undefined,
      format: undefined,
      pageOffset: 1,
      label: t('Grandes Clássicos & Favoritos Históricos'),
    };
  }

  // Mapeamento dinâmico e diversificado para extensões instaladas ou de repositórios
  let hash = 0;
  for (let i = 0; i < norm.length; i++) {
    hash = (hash << 5) - hash + norm.charCodeAt(i);
    hash |= 0;
  }
  const absHash = Math.abs(hash);
  const GENRES_POOL = [
    'Adventure',
    'Sci-Fi',
    'Supernatural',
    'Comedy',
    'Mystery',
    'Drama',
    'Slice of Life',
    'Sports',
    'Psychological',
    'Romance',
  ];
  const SORTS_POOL = [
    ['TRENDING_DESC'],
    ['POPULARITY_DESC'],
    ['SCORE_DESC'],
    ['FAVOURITES_DESC'],
  ];

  const pickedGenre = GENRES_POOL[absHash % GENRES_POOL.length];
  const pickedSort = SORTS_POOL[(absHash >> 2) % SORTS_POOL.length];
  const pageOffset = (absHash % 3) + 1;

  return {
    sort: pickedSort,
    genre: pickedGenre,
    format: undefined,
    pageOffset,
    label: `${pickedGenre} - ${extName}`,
  };
}

export const ExtensionCatalogView: React.FC<ExtensionCatalogViewProps> = ({
  extension,
  mediaType = 'manga',
  onOpenTab,
  externalQuery,
}) => {
  const isVideo = mediaType === 'video';
  const libraryKey = isVideo ? 'video' : 'manga';

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [libraryMangas, setLibraryMangas] = useState<LibraryItem[]>([]);
  const [onlineMangas, setOnlineMangas] = useState<MangaDexManga[]>([]);
  const [onlineVideos, setOnlineVideos] = useState<OnlineAnimeMedia[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<OnlineAnimeMedia | null>(null);
  const [videoEpisodeSearch, setVideoEpisodeSearch] = useState('');

  // Favorite modal state
  const [favoriteManga, setFavoriteManga] = useState<LibraryItem | null>(null);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);

  const extName = extension?.name || extension?.sourceName || t('Extensão');
  const extLang = extension?.lang || 'all';
  const rawDomain = extension?.baseUrl || '';
  const extDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const targetWebUrl = rawDomain.startsWith('http') ? rawDomain : `https://${extDomain || 'google.com'}`;
  const isMangaDex = !isVideo && extName.toLowerCase().includes('mangadex');
  const isAtsumaru = !isVideo && (extName.toLowerCase().includes('atsu') || extDomain.includes('atsu'));

  const [isRefreshingCovers, setIsRefreshingCovers] = useState(false);
  const [refreshProgress, setRefreshProgress] = useState<{ current: number; total: number } | null>(null);
  const [coverStatusMessage, setCoverStatusMessage] = useState<string | null>(null);
  const [onlineAtsuMangas, setOnlineAtsuMangas] = useState<any[]>([]);

  // Perfil específico de catálogo e paginação para extensões de vídeo
  const videoProfile = useMemo(() => getVideoProfile(extName, extLang), [extName, extLang]);
  const [catalogPage, setCatalogPage] = useState<number>(1);
  const [refreshNonce, setRefreshNonce] = useState<number>(0);

  // Reseta a página do catálogo quando trocar de extensão
  useEffect(() => {
    setCatalogPage(1);
  }, [extName]);

  useEffect(() => {
    if (externalQuery !== undefined) setQuery(externalQuery);
  }, [externalQuery]);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 400);
    return () => clearTimeout(timer);
  }, [query]);

  // Carrega obras da biblioteca pertencentes a esta extensão
  const loadLibraryData = useCallback(async () => {
    let allItems: LibraryItem[] = [];

    if (window.electronAPI?.loadLibrary) {
      try {
        const res = await window.electronAPI.loadLibrary(libraryKey);
        if (res.success && res.data?.entries) {
          allItems = res.data.entries;
        }
      } catch {}
    }

    if (allItems.length === 0) {
      try {
        const raw = localStorage.getItem(`${libraryKey}_library`);
        if (raw) allItems = JSON.parse(raw);
      } catch {}
    }

    const normName = extName.toLowerCase().trim();
    const normDomain = extDomain.toLowerCase().trim();

    const matched = allItems.filter((m) => {
      const s = (m.sourceName || m.source || '').toLowerCase().trim();
      const u = (m.url || '').toLowerCase().trim();
      return (
        s === normName ||
        s.includes(normName) ||
        normName.includes(s) ||
        (normDomain && (u.includes(normDomain) || s.includes(normDomain)))
      );
    });

    setLibraryMangas(matched);
  }, [extName, extDomain, libraryKey]);

  useEffect(() => {
    loadLibraryData();
    const handleUpdate = () => loadLibraryData();

    window.addEventListener('backup:applied', handleUpdate);
    window.addEventListener('manga:library-updated', handleUpdate);
    window.addEventListener('video:library-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener('backup:applied', handleUpdate);
      window.removeEventListener('manga:library-updated', handleUpdate);
      window.removeEventListener('video:library-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, [loadLibraryData]);

  // Helper para atualizar e sincronizar capas da biblioteca local
  const syncLibraryCovers = useCallback(async () => {
    if (libraryMangas.length === 0) return 0;
    setRefreshProgress({ current: 0, total: libraryMangas.length });

    let fullLibrary: LibraryItem[] = [];
    if (window.electronAPI?.loadLibrary) {
      try {
        const res = await window.electronAPI.loadLibrary(libraryKey);
        if (res.success && res.data?.entries) fullLibrary = res.data.entries;
      } catch {}
    }
    if (fullLibrary.length === 0) {
      try {
        const raw = localStorage.getItem(`${libraryKey}_library`);
        if (raw) fullLibrary = JSON.parse(raw);
      } catch {}
    }

    const updatedMap = new Map<string, string>();
    const items = [...libraryMangas];
    let processed = 0;
    const CHUNK_SIZE = 5;

    for (let i = 0; i < items.length; i += CHUNK_SIZE) {
      const chunk = items.slice(i, i + CHUNK_SIZE);
      await Promise.all(
        chunk.map(async (m) => {
          let currentCover = m.cover || '';

          // Se capa for vazia ou LAN, tenta buscar do Atsumaru
          if ((!currentCover || currentCover.includes('127.0.0.1')) && isAtsumaru && m.url) {
            try {
              const cleanId = m.url.replace(/.*\/manga\//, '').replace(/.*\/read\//, '').replace(/^\/+/, '');
              const pageRes = await fetch(`https://atsu.moe/api/manga/page?id=${cleanId}`);
              if (pageRes.ok) {
                const pData = await pageRes.json();
                const poster = pData.mangaPage?.poster;
                if (poster) {
                  currentCover = poster.startsWith('http') ? poster : `https://atsu.moe${poster.startsWith('/') ? '' : '/'}${poster}`;
                }
              }
            } catch {}
          }

          if (currentCover && window.electronAPI?.resolveCover) {
            try {
              const res = await window.electronAPI.resolveCover(currentCover, m.sourceName || extName);
              if (res?.success && res.url) {
                updatedMap.set(m.url, res.url);
              } else if (currentCover.startsWith('http') || currentCover.startsWith('media-file:')) {
                updatedMap.set(m.url, currentCover);
              }
            } catch {
              if (currentCover) updatedMap.set(m.url, currentCover);
            }
          } else if (currentCover) {
            updatedMap.set(m.url, currentCover);
          }
          processed++;
          setRefreshProgress({ current: processed, total: items.length });
        })
      );

      // Atualiza o estado visual das capas gradualmente
      setLibraryMangas((prev) =>
        prev.map((it) => {
          const newCover = updatedMap.get(it.url);
          return newCover ? { ...it, cover: newCover } : it;
        })
      );
    }

    // Salva na biblioteca completa
    if (updatedMap.size > 0 && fullLibrary.length > 0) {
      const mergedFull = fullLibrary.map((item) => {
        const newCover = updatedMap.get(item.url);
        return newCover ? { ...item, cover: newCover } : item;
      });

      try {
        localStorage.setItem(`${libraryKey}_library`, JSON.stringify(mergedFull));
        if (window.electronAPI?.saveLibrary) {
          await window.electronAPI.saveLibrary(libraryKey, mergedFull);
        }
        window.dispatchEvent(new CustomEvent(`${libraryKey}:library-updated`));
      } catch (err) {
        console.warn('Erro ao salvar biblioteca atualizada:', err);
      }
    }

    return updatedMap.size;
  }, [libraryMangas, libraryKey, isAtsumaru, extName]);

  // Atualizar / Buscar capas de todas as obras desta extensão
  const handleRefreshCovers = useCallback(async () => {
    if (isRefreshingCovers) return;
    setIsRefreshingCovers(true);
    setCoverStatusMessage(null);

    try {
      if (isVideo) {
        // Incrementa página do catálogo para rodízio e novidades
        const nextPage = (catalogPage % 5) + 1;
        setCatalogPage(nextPage);
        setRefreshNonce((n) => n + 1);

        // Se há vídeos do catálogo online exibidos, resolve/sincroniza ativamente suas capas
        let resolvedCount = 0;
        if (onlineVideos.length > 0 && window.electronAPI?.resolveCover) {
          setRefreshProgress({ current: 0, total: onlineVideos.length });
          const updatedVideos = [...onlineVideos];

          for (let i = 0; i < updatedVideos.length; i += 6) {
            const chunk = updatedVideos.slice(i, i + 6);
            await Promise.all(
              chunk.map(async (v, cIdx) => {
                const globalIdx = i + cIdx;
                const cover = v.coverImage?.extraLarge || v.coverImage?.large;
                if (cover) {
                  try {
                    const res = await window.electronAPI?.resolveCover(cover, extName);
                    if (res?.success && res.url) {
                      updatedVideos[globalIdx] = {
                        ...updatedVideos[globalIdx],
                        coverImage: {
                          ...updatedVideos[globalIdx].coverImage,
                          extraLarge: res.url,
                          large: res.url,
                        },
                      };
                      resolvedCount++;
                    }
                  } catch {}
                }
                setRefreshProgress({ current: Math.min(i + cIdx + 1, onlineVideos.length), total: onlineVideos.length });
              })
            );
          }
          setOnlineVideos(updatedVideos);
        }

        // Também sincroniza as capas salvas na biblioteca local para esta extensão
        let libCount = 0;
        if (libraryMangas.length > 0) {
          libCount = await syncLibraryCovers();
        }

        const totalResolved = resolvedCount + libCount;
        setCoverStatusMessage(
          totalResolved > 0
            ? t('{n} capas de {source} sincronizadas com sucesso!', { n: totalResolved, source: extName })
            : t('Catálogo e capas de {source} atualizados!', { source: extName })
        );
      } else {
        // Se for mangá:
        if (isMangaDex) {
          setRefreshNonce((n) => n + 1);
        }
        let libCount = 0;
        if (libraryMangas.length > 0) {
          libCount = await syncLibraryCovers();
          setCoverStatusMessage(t('{n} de {total} capas sincronizadas com sucesso!', { n: libCount, total: libraryMangas.length }));
        } else {
          setCoverStatusMessage(t('Catálogo de {source} atualizado com sucesso!', { source: extName }));
        }
      }
    } catch (err) {
      console.warn('Erro ao atualizar capas:', err);
      setCoverStatusMessage(t('Erro ao atualizar capas.'));
    } finally {
      setIsRefreshingCovers(false);
      setTimeout(() => {
        setCoverStatusMessage(null);
        setRefreshProgress(null);
      }, 4000);
    }
  }, [
    isRefreshingCovers,
    isVideo,
    catalogPage,
    onlineVideos,
    extName,
    libraryMangas.length,
    syncLibraryCovers,
    isMangaDex,
  ]);

  // Auto-resolução silenciosa em background de capas remotas
  useEffect(() => {
    if (libraryMangas.length === 0) return;
    const needsResolving = libraryMangas.filter(
      (m) => m.cover && /^https?:\/\//i.test(m.cover)
    );
    if (needsResolving.length === 0) return;

    let cancelled = false;
    (async () => {
      for (let i = 0; i < needsResolving.length; i += 6) {
        if (cancelled) break;
        const chunk = needsResolving.slice(i, i + 6);
        await Promise.all(
          chunk.map(async (m) => {
            if (!window.electronAPI?.resolveCover) return;
            try {
              const res = await window.electronAPI.resolveCover(m.cover!, m.sourceName || extName);
              if (res?.success && res.url && !cancelled) {
                setLibraryMangas((prev) =>
                  prev.map((it) => (it.url === m.url ? { ...it, cover: res.url! } : it))
                );
              }
            } catch {}
          })
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [libraryMangas.length]);

  // Se for MangaDex, busca catálogo online via API direta
  useEffect(() => {
    if (isMangaDex) {
      setLoading(true);
      getMangaList(1, 24, debouncedQuery)
        .then((res) => setOnlineMangas(res.list))
        .catch(() => setOnlineMangas([]))
        .finally(() => setLoading(false));
    }
  }, [isMangaDex, debouncedQuery]);

  // Se for Atsumaru, busca catálogo online via API Typesense
  useEffect(() => {
    if (isAtsumaru) {
      if (!debouncedQuery) {
        setOnlineAtsuMangas([]);
        return;
      }

      setLoading(true);
      fetch(
        `https://atsu.moe/api/search/manga?q=${encodeURIComponent(debouncedQuery)}&query_by=title,englishTitle,otherNames`
      )
        .then((res) => res.json())
        .then((json) => {
          if (json?.hits && Array.isArray(json.hits)) {
            const list = json.hits.map((h: any) => h.document).filter(Boolean);
            setOnlineAtsuMangas(list);
          } else {
            setOnlineAtsuMangas([]);
          }
        })
        .catch(() => setOnlineAtsuMangas([]))
        .finally(() => setLoading(false));
    }
  }, [isAtsumaru, debouncedQuery]);

  // Se for extensão de vídeo, busca catálogo online nativo específico da extensão (populares/gênero ou termo de busca)
  useEffect(() => {
    if (isVideo) {
      setLoading(true);
      const isSearch = !debouncedQuery;
      const targetPage = isSearch ? 1 : catalogPage;

      // 1. Se a extensão possui site/domínio específico (ex: jav.guru, betteranime, animefire, etc.),
      // faz o scraping real diretamente da fonte da extensão, garantindo capas e títulos 100% autênticos
      if (window.electronAPI?.scrapeExtensionCatalog && rawDomain && !rawDomain.includes('anilist.co')) {
        let isCancelled = false;
        // Com texto na busca: usa a busca do próprio site (formulário do site + leitura dos cards)
        const q = String(debouncedQuery || '').trim();
        const job: Promise<{ success: boolean; items: any[] }> =
          q
            ? searchSite(rawDomain || targetWebUrl, q, (cand) => relevance(cand, q) / 100)
                .then((items) => ({
                  success: true,
                  items: items
                    .filter((it) => relevance(it.title, q) >= MIN_RELEVANCE)
                    .sort((x, y) => relevance(y.title, q) - relevance(x.title, q))
                    .map((it) => ({ title: it.title, url: it.url, cover: it.cover || '' })),
                }))
                .catch(() => ({ success: false, items: [] }))
            : window.electronAPI.scrapeExtensionCatalog({
                baseUrl: rawDomain || targetWebUrl,
                query: debouncedQuery,
                page: targetPage,
                sourceName: extName,
              });
        job
          .then((res) => {
            if (isCancelled) return;
            if (res?.success && Array.isArray(res.items) && res.items.length > 0) {
              const mapped: OnlineAnimeMedia[] = res.items.map((it: any, idx: number) => ({
                id: (targetPage - 1) * 50 + idx + 1,
                title: {
                  romaji: it.title,
                  english: it.title,
                  native: null,
                },
                coverImage: {
                  extraLarge: it.cover,
                  large: it.cover,
                  medium: it.cover,
                },
                bannerImage: it.cover,
                description: it.description || '',
                episodes: 1,
                status: 'COMPLETED',
                genres: [extName],
                averageScore: null,
                format: t('VÍDEO'),
                streamingEpisodes: [
                  {
                    title: it.title,
                    thumbnail: it.cover,
                    url: it.url,
                    site: extName,
                  },
                ],
                url: it.url,
              }));
              setOnlineVideos(mapped);
            } else {
              setOnlineVideos([]);
            }
          })
          .catch((err) => {
            console.warn('Erro ao raspar catálogo da extensão:', err);
            if (!isCancelled) setOnlineVideos([]);
          })
          .finally(() => {
            if (!isCancelled) setLoading(false);
          });

        return () => {
          isCancelled = true;
        };
      }

      // 2. Se for uma extensão genérica sem domínio próprio ou AniList, usa AniList GraphQL
      const graphqlQuery = `
        query ($page: Int, $perPage: Int, $search: String, $sort: [MediaSort], $format: MediaFormat, $genre: String) {
          Page(page: $page, perPage: $perPage) {
            media(type: ANIME, search: $search, sort: $sort, format: $format, genre: $genre) {
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
              }
              bannerImage
              description(asHtml: false)
              episodes
              status
              genres
              averageScore
              format
              startDate {
                year
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

      fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          query: graphqlQuery,
          variables: {
            page: targetPage,
            perPage: 24,
            search: isSearch ? debouncedQuery : undefined,
            sort: isSearch ? ['SEARCH_MATCH'] : videoProfile.sort,
            format: isSearch ? undefined : videoProfile.format,
            genre: isSearch ? undefined : videoProfile.genre,
          },
        }),
      })
        .then((res) => res.json())
        .then((json) => {
          setOnlineVideos(json.data?.Page?.media || []);
        })
        .catch(() => setOnlineVideos([]))
        .finally(() => setLoading(false));
    }
  }, [isVideo, debouncedQuery, extName, extLang, catalogPage, refreshNonce, videoProfile, rawDomain, targetWebUrl]);

  // Filtragem das obras da biblioteca
  const filteredLibrary = useMemo(() => {
    if (!query.trim()) return libraryMangas;
    const q = query.toLowerCase().trim();
    return libraryMangas.filter(
      (m) =>
        m.title.toLowerCase().includes(q) ||
        (m.author && m.author.toLowerCase().includes(q)) ||
        (m.genres && m.genres.some((g) => g.toLowerCase().includes(q)))
    );
  }, [libraryMangas, query]);

  const handleOpenManga = (manga: LibraryItem) => {
    if (isVideo) {
      const epTitle = `${manga.title} - ${manga.chapters?.[0]?.name || t('Episódio {n}', { n: 1 })}`;
      const epUrl = manga.chapters?.[0]?.url || manga.url;
      onOpenTab?.('video-player', epTitle, {
        filePath: epUrl,
        title: epTitle,
        item: { path: epUrl, name: epTitle },
        video: { path: epUrl, name: epTitle },
      });
      return;
    }
    onOpenTab?.('manga-detail', manga.title, {
      manga,
      initialExtension: extName,
    });
  };

  const handleOpenMangaDex = (mdManga: MangaDexManga) => {
    const coverUrl = getMangaDexCoverUrl(mdManga.id, mdManga.coverFileName);
    const item: LibraryItem = {
      title: mdManga.title,
      url: `https://mangadex.org/title/${mdManga.id}`,
      source: 'mangadex',
      sourceName: 'MangaDex',
      cover: coverUrl,
      author: '',
      description: mdManga.description || '',
      genres: mdManga.tags || [],
      status: mdManga.status === 'completed' ? 2 : 1,
      dateAdded: Date.now(),
      favorite: false,
      categories: ['Favoritos'],
      chapters: [],
    };

    onOpenTab?.('manga-detail', mdManga.title, {
      manga: item,
      initialExtension: 'MangaDex',
    });
  };

  const convertVideoToLibraryItem = (media: OnlineAnimeMedia): LibraryItem => {
    const displayTitle = media.title.english || media.title.romaji || 'Vídeo';
    const totalEps = media.episodes || media.streamingEpisodes?.length || 1;
    const itemTargetUrl = media.url || `https://anilist.co/anime/${media.id}`;

    const defaultChapters = Array.from({ length: totalEps }, (_, i) => {
      const streamEp = media.streamingEpisodes?.[i];
      return {
        url: streamEp?.url || itemTargetUrl,
        name: streamEp?.title || `Episódio ${i + 1}`,
        number: i + 1,
        read: false,
        bookmark: false,
        lastPageRead: 0,
        lastSecondSeen: 0,
        lastModifiedAt: Date.now(),
      };
    });

    return {
      source: extension?.pkg || extension?.name || 'video_extension',
      sourceName: extName,
      url: itemTargetUrl,
      title: displayTitle,
      author: extName,
      description: media.description?.replace(/<br\s*\/?>/gi, '\n') || '',
      genres: media.genres || [],
      status: media.status === 'FINISHED' ? 2 : 1,
      cover: media.coverImage.extraLarge || media.coverImage.large,
      background: media.bannerImage || undefined,
      dateAdded: Date.now(),
      favorite: true,
      categories: ['Favoritos'],
      chapters: defaultChapters,
      totalChapters: totalEps,
      readChapters: 0,
    };
  };

  /** Abre a página da obra (tela inteira, igual à da Biblioteca) */
  const openVideoTitle = (media: OnlineAnimeMedia) => {
    const item = convertVideoToLibraryItem(media);
    const fromSite = !!media.url && !/anilist\.co/i.test(media.url);
    const existing = isVideoInLibrary(media);
    onOpenTab?.('anime-detail', item.title, {
      anime: {
        ...(existing || item),
        // Episódios reais do site são carregados na própria página
        chapters: existing?.chapters?.length ? existing.chapters : fromSite ? [] : item.chapters,
        altTitles: [media.title.romaji, media.title.english || ''].filter(Boolean),
        year: media.startDate?.year || undefined,
        format: media.format || undefined,
        favorite: existing?.favorite ?? false,
      },
    });
  };

  const handleOpenWebview = () => {
    onOpenTab?.('webview', extName, {
      url: targetWebUrl,
      initialUrl: targetWebUrl,
    });
  };

  const bulk = useBulkSelection<LibraryItem>();
  const [bulkOpen, setBulkOpen] = useState(false);
  const isFavoritedInLibrary = (itemObj: LibraryItem) => libraryMangas.some((m) => m.url === itemObj.url && m.favorite);

  /** Coração: obra já favoritada abre as tags; as outras são marcadas para favoritar em lote */
  const handleOpenFavoriteModal = (itemObj: LibraryItem, e: React.MouseEvent, favorited = isFavoritedInLibrary(itemObj)) => {
    e.stopPropagation();
    if (favorited) {
      setFavoriteManga(itemObj);
      setIsFavoriteModalOpen(true);
      return;
    }
    bulk.toggle(itemObj.url, itemObj);
  };

  const handleWatchVideoEpisode = (
    media: OnlineAnimeMedia,
    epNum: number,
    epTitle?: string,
    epUrl?: string
  ) => {
    const title = media.title.english || media.title.romaji;
    void epTitle;
    // Painel de Fontes: esta extensão primeiro (com o link da obra) + outras extensões e plugins
    openWatchSources({
      title,
      altTitles: [media.title.romaji, media.title.english || ''].filter(Boolean),
      kind: 'series',
      episode: epNum,
      cover: media.coverImage?.extraLarge || media.coverImage?.large,
      episodeUrl: epUrl,
      preferred: { extName, url: media.url && !/anilist\.co/i.test(media.url) ? media.url : undefined },
      tab: 'extensions',
    });
  };

  // Verifica se vídeo já está favoritado na biblioteca
  const isVideoInLibrary = (media: OnlineAnimeMedia): LibraryItem | undefined => {
    const targetUrl = (media.url || `https://anilist.co/anime/${media.id}`).toLowerCase();
    const romaji = media.title.romaji?.toLowerCase().trim();
    const eng = media.title.english?.toLowerCase().trim();
    return libraryMangas.find(
      (m) =>
        (m.url && m.url.toLowerCase() === targetUrl) ||
        (eng && m.title.toLowerCase().trim() === eng) ||
        (romaji && m.title.toLowerCase().trim() === romaji)
    );
  };

  return (
    <div className="flex flex-col h-full bg-canvas text-fg-2 select-none overflow-y-auto">
      {/* Header Bar */}
      <div className="p-3 sm:p-4 border-b border-line bg-surface flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-subtle border border-line flex items-center justify-center text-accent shrink-0 font-bold">
            {isVideo ? <Film size={20} /> : <Compass size={20} />}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-fg truncate">
                {t('Catálogo: {source}', { source: extName })}
              </h2>
              <span className="text-[10px] px-2 py-0.5 rounded bg-elevated text-fg-muted font-mono uppercase shrink-0">
                {extLang}
              </span>
            </div>
            {extDomain && (
              <p className="text-xs text-cyan-400 font-mono flex items-center gap-1 mt-0.5 truncate">
                <Globe size={11} className="text-fg-muted shrink-0" />
                <span className="truncate">{extDomain}</span>
              </p>
            )}
          </div>
        </div>

        {/* Search Input & Action Buttons */}
        <div className="flex items-center gap-2 flex-1 sm:max-w-xl">
          {externalQuery === undefined ? (
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Buscar obras em {source}...', { source: extName })}
                className="w-full bg-canvas border border-line rounded-md pl-9 pr-3 py-1.5 text-xs text-fg placeholder-fg-muted outline-none focus:border-accent transition-colors"
              />
            </div>
          ) : (
            <span className="flex-1" />
          )}

          {/* Botão Atualizar Capas - Sempre visível */}
          <button
            type="button"
            disabled={isRefreshingCovers}
            onClick={handleRefreshCovers}
            className={`px-3 py-1.5 rounded-md border text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 shadow-xs cursor-pointer ${
              isRefreshingCovers
                ? 'bg-accent/[0.13] border-accent/[0.4] text-accent'
                : 'bg-subtle hover:bg-elevated border-line text-fg-2 hover:text-white'
            }`}
            title={t('Atualizar capas e recarregar catálogo desta extensão para exibição offline rápida')}
          >
            <RefreshCw size={13} className={isRefreshingCovers ? 'animate-spin text-accent' : ''} />
            <span className="hidden sm:inline">
              {isRefreshingCovers && refreshProgress
                ? t('Capas ({current}/{total})', { current: refreshProgress.current, total: refreshProgress.total })
                : t('Atualizar capas')}
            </span>
          </button>

          {/* Vídeos tocam sempre no player do app: o site da fonte só aparece para mangás */}
          {!isVideo && (
            <button
              type="button"
              onClick={handleOpenWebview}
              className="px-3 py-1.5 rounded-md bg-subtle hover:bg-elevated border border-line text-accent hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors shrink-0 shadow-xs cursor-pointer"
              title={t('Abrir website oficial na Webview interna')}
            >
              <Globe size={13} />
              <span className="hidden sm:inline">Webview</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 sm:p-6 max-w-7xl w-full mx-auto space-y-6 flex-1">
        {/* Seção 1: Obras da biblioteca nesta extensão */}
        {filteredLibrary.length > 0 && (
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                  {isVideo ? (
                    <Film size={16} className="text-accent" />
                  ) : (
                    <BookOpen size={16} className="text-accent" />
                  )}
                  <span>
                    {t('Obras em minha biblioteca ({n})', { n: filteredLibrary.length })}
                  </span>
                </h3>

                <button
                  type="button"
                  disabled={isRefreshingCovers}
                  onClick={handleRefreshCovers}
                  className="p-1 rounded text-fg-muted hover:text-accent hover:bg-subtle transition-colors cursor-pointer"
                  title={t('Atualizar capas desta extensão')}
                >
                  <RefreshCw size={13} className={isRefreshingCovers ? 'animate-spin text-accent' : ''} />
                </button>
              </div>

              {/* Status e progresso de atualização */}
              {isRefreshingCovers && refreshProgress && (
                <div className="text-xs text-accent font-mono flex items-center gap-1.5 bg-accent/[0.08] border border-accent/[0.2] px-2.5 py-0.5 rounded-full">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Sincronizando capas: {refreshProgress.current} de {refreshProgress.total}</span>
                </div>
              )}

              {coverStatusMessage && !isRefreshingCovers && (
                <div className="text-xs text-emerald-400 font-mono flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full">
                  <Check size={12} />
                  <span>{coverStatusMessage}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filteredLibrary.map((m, idx) => (
                <div
                  key={`${m.url}-${idx}`}
                  onClick={() => handleOpenManga(m)}
                  className="group bg-surface hover:bg-subtle border border-line hover:border-accent rounded-md overflow-hidden cursor-pointer transition-all shadow-xs flex flex-col justify-between relative"
                >
                  <div className="w-full aspect-[2/3] bg-canvas relative overflow-hidden flex items-center justify-center">
                    {m.cover ? (
                      <img
                        src={m.cover}
                        alt={m.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (!img.dataset.retried && window.electronAPI?.resolveCover && m.cover) {
                            img.dataset.retried = 'true';
                            window.electronAPI.resolveCover(m.cover, m.sourceName || extName).then((res) => {
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
                    ) : isVideo ? (
                      <Film size={24} className="text-fg-muted" />
                    ) : (
                      <BookOpen size={24} className="text-fg-muted" />
                    )}

                    {/* Quick Favorite Action */}
                    <button
                      type="button"
                      onClick={(e) => handleOpenFavoriteModal(m, e, !!m.favorite)}
                      className={`absolute top-1.5 right-1.5 p-1.5 rounded-full transition-all shadow-md z-10 cursor-pointer ${heartButtonClass(!!m.favorite, bulk.has(m.url))}`}
                      title={m.favorite ? t('Gerenciar tags / Favorito') : heartSelectTitle(bulk.has(m.url))}
                    >
                      <Heart size={13} fill={m.favorite || bulk.has(m.url) ? 'currentColor' : 'none'} />
                    </button>
                  </div>

                  <div className="p-2">
                    <h4 className="text-xs font-medium text-fg line-clamp-2 leading-tight group-hover:text-accent transition-colors">
                      {m.title}
                    </h4>
                    <div className="flex items-center justify-between mt-1 text-[10px] text-fg-muted">
                      <span>
                        {isVideo ? t('{n} eps', { n: m.chapters?.length || 0 }) : t('{n} caps', { n: m.chapters?.length || 0 })}
                      </span>
                      {m.categories && m.categories.length > 0 && (
                        <span className="text-cyan-400 font-mono truncate max-w-[80px]">
                          {m.categories[0]}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Seção 2 (Vídeos): Catálogo e Busca Nativa de Animes */}
        {isVideo && (
          <div>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                    <Sparkles size={16} className="text-accent" />
                    <span>
                      {debouncedQuery
                        ? t('Resultados da busca online para "{query}"', { query: debouncedQuery })
                        : t('Catálogo online: {label} (pág. {page})', { label: videoProfile.label, page: catalogPage })}
                    </span>
                  </h3>

                  <button
                    type="button"
                    disabled={isRefreshingCovers || loading}
                    onClick={handleRefreshCovers}
                    className="p-1 rounded text-fg-muted hover:text-accent hover:bg-subtle transition-colors cursor-pointer"
                    title={t('Atualizar capas e alternar para a próxima página do catálogo')}
                  >
                    <RefreshCw size={13} className={isRefreshingCovers ? 'animate-spin text-accent' : ''} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {isRefreshingCovers && refreshProgress && (
                    <div className="text-xs text-accent font-mono flex items-center gap-1.5 bg-accent/[0.08] border border-accent/[0.2] px-2.5 py-0.5 rounded-full">
                      <Loader2 size={12} className="animate-spin" />
                      <span>Sincronizando capas: {refreshProgress.current} de {refreshProgress.total}</span>
                    </div>
                  )}

                  {coverStatusMessage && !isRefreshingCovers && (
                    <div className="text-xs text-emerald-400 font-mono flex items-center gap-1 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full">
                      <Check size={12} />
                      <span>{coverStatusMessage}</span>
                    </div>
                  )}

                  {loading && <Loader2 size={16} className="animate-spin text-accent" />}
                </div>
              </div>

              {loading && onlineVideos.length === 0 ? (
                <div className="flex items-center justify-center py-16 text-xs text-fg-muted gap-2">
                  <Loader2 size={24} className="animate-spin text-accent" />
                  <span>{t('Carregando catálogo de {source}...', { source: extName })}</span>
                </div>
              ) : onlineVideos.length === 0 ? (
                <div className="text-center py-12 text-fg-muted text-xs">
                  {t('Nenhum título encontrado para "{query}". Tente outro termo de busca ou abra o site oficial na Webview.', { query })}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {onlineVideos.map((media) => {
                    const displayTitle = media.title.english || media.title.romaji || 'Anime';
                    const cover = media.coverImage.extraLarge || media.coverImage.large;
                    const score = media.averageScore ? `${media.averageScore}%` : null;
                    const favItem = isVideoInLibrary(media);
                    const isFavorited = !!favItem?.favorite;
                    const itemObj = convertVideoToLibraryItem(media);

                    return (
                      <div
                        key={media.id}
                        onClick={() => openVideoTitle(media)}
                        className="group bg-surface hover:bg-subtle border border-line hover:border-accent rounded-md overflow-hidden cursor-pointer transition-all shadow-xs flex flex-col justify-between relative"
                      >
                        <div className="w-full aspect-[2/3] bg-canvas relative overflow-hidden flex items-center justify-center">
                          {cover ? (
                            <img
                              src={cover}
                              alt={displayTitle}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                              onError={(e) => {
                                const img = e.currentTarget;
                                if (!img.dataset.retried && window.electronAPI?.resolveCover && cover) {
                                  img.dataset.retried = 'true';
                                  window.electronAPI.resolveCover(cover, extName).then((res) => {
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
                            <Film size={24} className="text-fg-muted" />
                          )}

                          {/* Nota */}
                          {score && (
                            <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-black/75 text-emerald-400 shadow-sm backdrop-blur-xs flex items-center gap-0.5 z-10">
                              <Star size={10} className="fill-emerald-400 text-emerald-400" />
                              <span>{score}</span>
                            </div>
                          )}

                          {/* Botão de Favoritar */}
                          <button
                            type="button"
                            onClick={(e) => handleOpenFavoriteModal(itemObj, e, isFavorited)}
                            className={`absolute top-1.5 left-1.5 p-1.5 rounded-full transition-all shadow-md z-10 cursor-pointer ${heartButtonClass(isFavorited, bulk.has(itemObj.url))}`}
                            title={
                              isFavorited
                                ? t('Favoritado em: {tags}', { tags: favItem?.categories?.join(', ') || '' })
                                : heartSelectTitle(bulk.has(itemObj.url))
                            }
                          >
                            <Heart size={13} fill={isFavorited || bulk.has(itemObj.url) ? 'currentColor' : 'none'} />
                          </button>

                          {/* Botão rápido de Play no card */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleWatchVideoEpisode(media, 1, undefined, media.url);
                            }}
                            className="absolute bottom-1.5 right-1.5 p-1.5 rounded-full bg-black/70 hover:bg-success text-fg-muted hover:text-white transition-all shadow-md z-10 opacity-0 group-hover:opacity-100"
                            title={t('Assistir no Tomodachi Player')}
                          >
                            <Play size={12} className="fill-current" />
                          </button>

                          {/* Tag Badge */}
                          {isFavorited && favItem?.categories?.[0] && (
                            <div className="absolute bottom-1.5 left-1.5 max-w-[70%] truncate px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[9px] font-semibold text-rose-300 border border-rose-500/40 z-10">
                              {favItem.categories[0]}
                            </div>
                          )}
                        </div>

                        <div className="p-2">
                          <h4 className="text-xs font-medium text-fg line-clamp-2 leading-tight group-hover:text-accent transition-colors">
                            {displayTitle}
                          </h4>
                          <div className="flex items-center justify-between mt-1 text-[10px] text-fg-muted">
                            <span>{media.episodes ? t('{n} eps', { n: media.episodes }) : t('Em exibição')}</span>
                            <span className="font-mono text-cyan-400 uppercase text-[9px]">
                              {media.format || 'TV'}
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
        )}

        {/* Seção 2 (Mangás): Catálogo online nativo (para MangaDex) */}
        {!isVideo && isMangaDex && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Sparkles size={16} className="text-amber-400" />
                <span>{t('Catálogo online MangaDex')}</span>
              </h3>
              {loading && <Loader2 size={16} className="animate-spin text-accent" />}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {onlineMangas.map((m) => {
                const coverUrl = getMangaDexCoverUrl(m.id, m.coverFileName);

                const itemObj: LibraryItem = {
                  title: m.title,
                  url: `https://mangadex.org/title/${m.id}`,
                  source: 'mangadex',
                  sourceName: 'MangaDex',
                  cover: coverUrl,
                  author: '',
                  description: m.description || '',
                  genres: m.tags || [],
                  status: m.status === 'completed' ? 2 : 1,
                  dateAdded: Date.now(),
                  favorite: false,
                  categories: ['Favoritos'],
                  chapters: [],
                };

                return (
                  <div
                    key={m.id}
                    onClick={() => handleOpenMangaDex(m)}
                    className="group bg-surface hover:bg-subtle border border-line hover:border-[#ff6740] rounded-md overflow-hidden cursor-pointer transition-all shadow-xs flex flex-col justify-between relative"
                  >
                    <div className="w-full aspect-[2/3] bg-canvas relative overflow-hidden flex items-center justify-center">
                      {coverUrl ? (
                        <img
                          src={coverUrl}
                          alt={m.title}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                          onError={(e) => {
                            const img = e.currentTarget;
                            if (!img.dataset.retried && window.electronAPI?.resolveCover && coverUrl) {
                              img.dataset.retried = 'true';
                              window.electronAPI.resolveCover(coverUrl, 'MangaDex').then((res) => {
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
                        <BookOpen size={24} className="text-[#ff6740]/60" />
                      )}

                      <button
                        type="button"
                        onClick={(e) => handleOpenFavoriteModal(itemObj, e)}
                        className={`absolute top-1.5 right-1.5 p-1.5 rounded-full transition-all shadow-md z-10 cursor-pointer ${heartButtonClass(isFavoritedInLibrary(itemObj), bulk.has(itemObj.url))}`}
                        title={isFavoritedInLibrary(itemObj) ? t('Gerenciar tags / Favorito') : heartSelectTitle(bulk.has(itemObj.url))}
                      >
                        <Heart size={13} fill={isFavoritedInLibrary(itemObj) || bulk.has(itemObj.url) ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                    <div className="p-2">
                      <h4 className="text-xs font-medium text-fg line-clamp-2 leading-tight group-hover:text-[#ff6740] transition-colors">
                        {m.title}
                      </h4>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Seção 2.1 (Mangás - Atsumaru): Busca online de títulos em Atsumaru */}
        {!isVideo && isAtsumaru && debouncedQuery && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-fg flex items-center gap-2">
                <Sparkles size={16} className="text-cyan-400" />
                <span>{t('Resultados online em {source} para "{query}"', { source: extName, query: debouncedQuery })}</span>
              </h3>
              {loading && <Loader2 size={16} className="animate-spin text-accent" />}
            </div>

            {loading && onlineAtsuMangas.length === 0 ? (
              <div className="flex items-center justify-center py-16 text-xs text-fg-muted gap-2">
                <Loader2 size={24} className="animate-spin text-accent" />
                <span>{t('Buscando obras em {source}...', { source: extName })}</span>
              </div>
            ) : onlineAtsuMangas.length === 0 ? (
              <div className="text-center py-12 text-fg-muted text-xs">
                {t('Nenhuma obra encontrada para "{query}". Tente outro termo de busca ou abra a Webview.', { query })}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                {onlineAtsuMangas.map((doc) => {
                  const posterUrl = doc.poster
                    ? (doc.poster.startsWith('http') ? doc.poster : `https://atsu.moe${doc.poster.startsWith('/') ? '' : '/'}${doc.poster}`)
                    : '';
                  const itemObj: LibraryItem = {
                    title: doc.title,
                    url: doc.id,
                    source: 'atsumaru',
                    sourceName: extName,
                    cover: posterUrl,
                    author: doc.authors?.[0] || '',
                    description: doc.synopsis || '',
                    genres: doc.tags || [],
                    status: doc.status === 'Completed' ? 2 : 1,
                    dateAdded: Date.now(),
                    favorite: false,
                    categories: ['Favoritos'],
                    chapters: [],
                  };

                  return (
                    <div
                      key={doc.id}
                      onClick={() => handleOpenManga(itemObj)}
                      className="group bg-surface hover:bg-subtle border border-line hover:border-cyan-500 rounded-md overflow-hidden cursor-pointer transition-all shadow-xs flex flex-col justify-between relative"
                    >
                      <div className="w-full aspect-[2/3] bg-canvas relative overflow-hidden flex items-center justify-center">
                        {posterUrl ? (
                          <img
                            src={posterUrl}
                            alt={doc.title}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                            onError={(e) => {
                              const img = e.currentTarget;
                              if (!img.dataset.retried && window.electronAPI?.resolveCover && posterUrl) {
                                img.dataset.retried = 'true';
                                window.electronAPI.resolveCover(posterUrl, extName).then((res) => {
                                  if (res?.success && res.url) {
                                    img.src = res.url;
                                    img.style.display = 'block';
                                    return;
                                  }
                                  img.style.display = 'none';
                                });
                              } else {
                                img.style.display = 'none';
                              }
                            }}
                          />
                        ) : (
                          <BookOpen size={24} className="text-cyan-500/60" />
                        )}

                        <button
                          type="button"
                          onClick={(e) => handleOpenFavoriteModal(itemObj, e)}
                          className={`absolute top-1.5 right-1.5 p-1.5 rounded-full transition-all shadow-md z-10 cursor-pointer ${heartButtonClass(isFavoritedInLibrary(itemObj), bulk.has(itemObj.url))}`}
                          title={isFavoritedInLibrary(itemObj) ? t('Gerenciar tags / Favorito') : heartSelectTitle(bulk.has(itemObj.url))}
                        >
                          <Heart size={13} fill={isFavoritedInLibrary(itemObj) || bulk.has(itemObj.url) ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                      <div className="p-2">
                        <h4 className="text-xs font-medium text-fg line-clamp-2 leading-tight group-hover:text-cyan-400 transition-colors">
                          {doc.title}
                        </h4>
                        <div className="flex items-center justify-between mt-1 text-[10px] text-fg-muted">
                          <span>{doc.chapterCount ? t('{n} caps', { n: doc.chapterCount }) : (doc.status || t('Mangá'))}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Seção 3: Para extensões de mangá fora da MangaDex sem obras locais */}
        {!isVideo && !isMangaDex && !(isAtsumaru && debouncedQuery) && filteredLibrary.length === 0 && (
          <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center bg-surface/70 border border-line rounded-2xl shadow-xl max-w-2xl mx-auto my-8 animate-in fade-in">
            <div className="w-16 h-16 rounded-2xl bg-cyan-950/60 border border-cyan-800/80 flex items-center justify-center text-cyan-400 mb-4 shadow-inner">
              <Globe size={32} />
            </div>
            <h3 className="text-lg font-bold text-fg mb-2">
              {t('Catálogo web de {source}', { source: extName })}
            </h3>
            <p className="text-xs text-fg-muted max-w-md leading-relaxed mb-6">
              {t('Nenhuma obra foi indexada localmente para {source} ainda. Você pode navegar pelo catálogo completo e ler todas as obras diretamente através do site oficial em nossa Webview interna com modo leitor integrado.', { source: extName })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={handleOpenWebview}
                className="px-5 py-2.5 rounded-lg bg-success hover:bg-success-hover text-white text-xs font-bold flex items-center gap-2 transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer"
              >
                <Globe size={16} />
                <span>{t('Visualizar na Webview')}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de Detalhes do Anime na Extensão de Vídeo */}
      {/* Favorite & Tag Management Modal */}
      <FavoriteTagModal
        isOpen={isFavoriteModalOpen}
        onClose={() => setIsFavoriteModalOpen(false)}
        manga={favoriteManga}
        source={isVideo ? 'video' : 'manga'}
        onSaved={() => {
          loadLibraryData();
        }}
      />
      <FavoriteTagModal
        isOpen={bulkOpen}
        onClose={() => setBulkOpen(false)}
        manga={null}
        bulk={bulk.items}
        source={isVideo ? 'video' : 'manga'}
        onBulkSaved={() => {
          bulk.clear();
          loadLibraryData();
        }}
      />
      <BulkFavoriteBar count={bulk.count} onFavorite={() => setBulkOpen(true)} onClear={bulk.clear} />
    </div>
  );
};
