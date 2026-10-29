import React, { useState, useEffect, useMemo } from 'react';
import { 
  Search, 
  BookOpen, 
  Loader2, 
  AlertCircle, 
  ChevronLeft, 
  ChevronRight, 
  ListOrdered,
  ArrowLeft
} from 'lucide-react';
import { 
  getMangaList, 
  getMangaDexCoverUrl, 
  getMangaChapters, 
  getChapterPages, 
  type MangaDexManga, 
  type MangaDexChapter 
} from '../api/mangadex';
import { MangaReader } from './MangaReader';
import type { SubTab } from '../types';
import { t, tn } from '../i18n';
import { MANGADEX_OPEN_EVENT, takePendingMangaDexOpen, type MangaDexOpenRequest } from '../api/mangaSearch';
import { norm } from '../utils/smartSearch';
import { MaybeYouLike, WorkTags, useRecommendations, type RecRequest } from './MaybeYouLike';
import { openLibrarySearch } from '../api/discoverSearch';

interface MangaDexProps {
  activeSubTab?: string;
  subTabs?: SubTab[];
  onOpenSubTab: (subTab: SubTab) => void;
}

export const MangaDex: React.FC<MangaDexProps> = ({
  activeSubTab = 'catalog',
  subTabs = [],
  onOpenSubTab
}) => {
  const [query, setQuery] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [mangas, setMangas] = useState<MangaDexManga[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Active subtab data
  const currentSubTab = subTabs.find((s) => s.id === activeSubTab) || {
    id: 'catalog',
    title: t('Catálogo'),
    type: 'catalog'
  };

  // Chapter list for details view
  const [chapters, setChapters] = useState<MangaDexChapter[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);

  // Reader pages for reader view
  const [readerPages, setReaderPages] = useState<{ index: number; url: string; name: string }[]>([]);
  const [loadingPages, setLoadingPages] = useState(false);

  const fetchCatalog = async (q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMangaList(p, 24, q);
      setMangas(data.list);
      setTotalPages(data.totalPages);
      setTotalCount(data.total);
    } catch (err: any) {
      setError(err.message || t('Falha ao buscar mangás no MangaDex'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentSubTab.type === 'catalog') {
      fetchCatalog(query, page);
    }
  }, [query, page, currentSubTab.type]);

  // Load chapters when opening detail sub-tab
  useEffect(() => {
    if (currentSubTab.type === 'detail' && currentSubTab.data?.mangaId) {
      setLoadingChapters(true);
      getMangaChapters(currentSubTab.data.mangaId)
        .then((list) => setChapters(list))
        .catch(() => setChapters([]))
        .finally(() => setLoadingChapters(false));
    }
  }, [currentSubTab.id, currentSubTab.type]);

  // "Talvez você goste" na página da obra (AniList, pelo título)
  const detailTitle: string = currentSubTab.type === 'detail' ? currentSubTab.data?.manga?.title || '' : '';
  const recReq = useMemo<RecRequest | null>(() => (detailTitle ? { kind: 'anilist', type: 'MANGA', title: detailTitle } : null), [detailTitle]);
  const recs = useRecommendations(recReq);

  // Load pages when opening reader sub-tab
  useEffect(() => {
    if (currentSubTab.type === 'reader' && currentSubTab.data?.chapterId) {
      setLoadingPages(true);
      getChapterPages(currentSubTab.data.chapterId)
        .then((urls) => {
          setReaderPages(urls.map((u, i) => ({ index: i, url: u, name: t('Página {n}', { n: i + 1 }) })));
        })
        .catch(() => setReaderPages([]))
        .finally(() => setLoadingPages(false));
    }
  }, [currentSubTab.id, currentSubTab.type]);

  // Pedido para abrir uma obra pelo título (recomendações): busca e abre a melhor correspondência
  useEffect(() => {
    const openByTitle = async (req: MangaDexOpenRequest | null) => {
      if (!req?.title) return;
      setSearchInput(req.title);
      setPage(1);
      setQuery(req.title);
      try {
        const wanted = [req.title, ...(req.altTitles || [])].map(norm);
        for (const q of [req.title, ...(req.altTitles || [])]) {
          const data = await getMangaList(1, 10, q);
          const best = data.list.find((m) => wanted.includes(norm(m.title))) || (q === req.title ? undefined : data.list[0]);
          if (best) {
            handleOpenManga(best);
            return;
          }
        }
      } catch {
        /* fica na busca */
      }
    };
    void openByTitle(takePendingMangaDexOpen());
    const on = (e: Event) => {
      takePendingMangaDexOpen();
      void openByTitle((e as CustomEvent).detail);
    };
    window.addEventListener(MANGADEX_OPEN_EVENT, on);
    return () => window.removeEventListener(MANGADEX_OPEN_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(searchInput);
  };

  const handleOpenManga = (manga: MangaDexManga) => {
    onOpenSubTab({
      id: `manga-${manga.id}`,
      title: manga.title,
      type: 'detail',
      data: { mangaId: manga.id, manga }
    });
  };

  const handleReadChapter = (chapter: MangaDexChapter, mangaTitle: string) => {
    onOpenSubTab({
      id: `reader-${chapter.id}`,
      title: t('Cap. {chapter} - {title}', { chapter: chapter.chapter, title: mangaTitle }),
      type: 'reader',
      data: { chapterId: chapter.id, chapter, mangaTitle }
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-fg-2 select-none overflow-hidden">
      {/* 1. Catalog Sub-Tab */}
      {currentSubTab.type === 'catalog' && (
        <div className="flex flex-col h-full w-full overflow-hidden">
          {/* Search bar & Pagination */}
          <div className="p-2.5 bg-surface border-b border-line flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-fg text-sm flex items-center gap-1.5">
                <span className="text-[#ff6740] font-black tracking-tighter">MD</span> MangaDex
              </span>
              <span className="text-[10px] bg-subtle text-fg-muted px-1.5 py-0.5 rounded border border-line">
                API v5
              </span>
            </div>

            <form onSubmit={handleSearchSubmit} className="flex-1 max-w-md relative">
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={t('Buscar títulos no MangaDex...')}
                className="w-full bg-canvas border border-line focus:border-accent rounded-md pl-8 pr-3 py-1 text-xs text-fg outline-none"
              />
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
            </form>

            {/* Top Pagination Controls */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
                className="p-1 bg-subtle hover:bg-elevated text-white rounded border border-line disabled:opacity-40 transition-colors"
                title={t('Página anterior')}
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-xs font-mono text-fg-muted whitespace-nowrap">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
                className="p-1 bg-subtle hover:bg-elevated text-white rounded border border-line disabled:opacity-40 transition-colors"
                title={t('Próxima página')}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Catalog grid */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
            <div>
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 text-fg-muted gap-2">
                  <Loader2 size={32} className="animate-spin text-accent" />
                  <span className="text-xs">{t('Carregando mangás do MangaDex (página {page})...', { page })}</span>
                </div>
              ) : error ? (
                <div className="p-4 bg-red-950/20 border border-red-900/60 rounded-md text-red-300 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0" />
                  <span className="flex-1">{/network/i.test(error) ? t('Sem conexão com o MangaDex. Verifique a internet e tente de novo.') : error}</span>
                  <button
                    type="button"
                    onClick={() => fetchCatalog(query, page)}
                    className="h-7 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-[11.5px] font-medium cursor-pointer shrink-0"
                  >
                    {t('Tentar de novo')}
                  </button>
                </div>
              ) : mangas.length === 0 ? (
                <div className="text-center py-12 text-fg-muted text-xs">
                  {t('Nenhum título encontrado no MangaDex.')}
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {mangas.map((manga) => {
                    const cover = getMangaDexCoverUrl(manga.id, manga.coverFileName);
                    return (
                      <div
                        key={manga.id}
                        onClick={() => handleOpenManga(manga)}
                        className="group flex flex-col bg-surface hover:bg-subtle border border-line hover:border-accent rounded-md overflow-hidden cursor-pointer transition-all shadow-sm"
                      >
                        <div className="w-full h-44 bg-canvas overflow-hidden relative">
                          {cover ? (
                            <img
                              src={cover}
                              alt={manga.title}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-fg-muted">
                              <BookOpen size={32} />
                            </div>
                          )}
                          {manga.status && (
                            <div className="absolute top-1.5 right-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[10px] font-mono text-white capitalize">
                              {manga.status}
                            </div>
                          )}
                        </div>

                        <div className="p-2 flex flex-col justify-between flex-1">
                          <h4 className="text-xs font-medium text-fg line-clamp-2 leading-tight" title={manga.title}>
                            {manga.title}
                          </h4>
                          {manga.year && (
                            <span className="text-[10px] text-fg-muted font-mono mt-1">
                              {manga.year}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Bottom Pagination Footer */}
            {totalPages > 1 && !loading && (
              <div className="mt-6 pt-4 border-t border-line flex items-center justify-between text-xs text-fg-muted">
                <span>{tn(totalCount, 'Total: {n} título encontrado', 'Total: {n} títulos encontrados')}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPage((p) => Math.max(1, p - 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={page <= 1}
                    className="flex items-center gap-1 px-3 py-1 bg-subtle hover:bg-elevated text-white rounded border border-line disabled:opacity-40 transition-colors"
                  >
                    <ChevronLeft size={14} /> {t('Anterior')}
                  </button>
                  <span className="font-mono text-xs text-fg px-2">
                    {t('Página {page} de {total}', { page, total: totalPages })}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setPage((p) => Math.min(totalPages, p + 1));
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    disabled={page >= totalPages}
                    className="flex items-center gap-1 px-3 py-1 bg-subtle hover:bg-elevated text-white rounded border border-line disabled:opacity-40 transition-colors"
                  >
                    {t('Próxima')} <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. Detail Sub-Tab */}
      {currentSubTab.type === 'detail' && (
        <div className="flex flex-col h-full w-full overflow-y-auto p-6 gap-6">
          {currentSubTab.data?.manga && (
            <div className="flex flex-col md:flex-row gap-6 bg-surface p-5 rounded-lg border border-line">
              {currentSubTab.data.manga.coverFileName && (
                <img
                  src={getMangaDexCoverUrl(currentSubTab.data.manga.id, currentSubTab.data.manga.coverFileName)}
                  alt={currentSubTab.data.manga.title}
                  className="w-48 h-64 object-cover rounded-md border border-line shadow-md flex-shrink-0"
                />
              )}
              <div className="flex-1 flex flex-col gap-2.5">
                <h1 className="text-lg font-bold text-fg leading-snug">
                  {currentSubTab.data.manga.title}
                </h1>
                <div className="-mt-3">
                  <WorkTags
                    tags={[...(currentSubTab.data.manga.tags || []), ...(recs.result?.tags || [])]}
                    onPick={(tag) => openLibrarySearch('manga', tag)}
                    hint={t('Ver mangás da sua biblioteca com esta tag')}
                  />
                </div>
                {currentSubTab.data.manga.description && (
                  <p className="text-xs text-fg-muted leading-relaxed line-clamp-5 max-w-2xl mt-1">
                    {currentSubTab.data.manga.description}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Chapters List */}
          <div className="bg-surface p-4 rounded-lg border border-line">
            <h3 className="text-xs font-semibold text-fg uppercase tracking-wider mb-3 flex items-center gap-2">
              <ListOrdered size={14} className="text-accent" />
              {t('Capítulos disponíveis ({n})', { n: chapters.length })}
            </h3>

            {loadingChapters ? (
              <div className="flex items-center justify-center py-8 text-xs text-fg-muted gap-2">
                <Loader2 size={16} className="animate-spin text-accent" />
                <span>{t('Carregando lista de capítulos...')}</span>
              </div>
            ) : chapters.length === 0 ? (
              <div className="text-xs text-fg-muted py-4 text-center max-w-xl mx-auto leading-relaxed">
                {t('Nenhum capítulo traduzido encontrado em PT/EN.')}{' '}
                {t('Obras com publicação oficial costumam ficar sem capítulos no MangaDex. Tente pelas suas extensões ou veja as sugestões abaixo.')}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {chapters.map((chap) => (
                  <div
                    key={chap.id}
                    onClick={() => handleReadChapter(chap, currentSubTab.data?.manga?.title || t('Mangá'))}
                    className="flex items-center justify-between p-2.5 bg-canvas hover:bg-subtle border border-line hover:border-accent rounded cursor-pointer transition-colors text-xs"
                  >
                    <div className="flex flex-col truncate pr-2">
                      <span className="font-semibold text-fg">
                        {t('Capítulo {n}', { n: chap.chapter })}
                      </span>
                      {chap.title && (
                        <span className="text-[10px] text-fg-muted truncate">
                          {chap.title}
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] bg-subtle text-accent px-1.5 py-0.5 rounded font-mono uppercase">
                      {chap.translatedLanguage}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="-mx-6">
            <MaybeYouLike request={recReq} state={recs} />
          </div>
        </div>
      )}

      {/* 3. Reader Sub-Tab */}
      {currentSubTab.type === 'reader' && (
        <div className="flex-1 h-full w-full overflow-hidden">
          {loadingPages ? (
            <div className="flex flex-col items-center justify-center h-full text-fg-muted gap-2">
              <Loader2 size={32} className="animate-spin text-accent" />
              <span className="text-xs">{t('Carregando páginas do capítulo...')}</span>
            </div>
          ) : readerPages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-fg-muted text-xs">
              {t('Não foi possível carregar as páginas deste capítulo.')}
            </div>
          ) : (
            <MangaReader
              title={currentSubTab.title}
              pages={readerPages}
              initialPageIndex={0}
            />
          )}
        </div>
      )}
    </div>
  );
};
