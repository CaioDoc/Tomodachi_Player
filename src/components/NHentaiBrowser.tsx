import React, { useState, useEffect } from 'react';
import { toast, confirmDialog } from './Feedback';
import { 
  Search, 
  Flame, 
  BookOpen, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  Tag, 
  Eye, 
  AlertCircle,
  Heart,
  User,
  LogIn,
  RefreshCw
} from 'lucide-react';
import { 
  searchGalleries, 
  fetchFavorites,
  getGalleryDetails, 
  getGalleryThumbnail, 
  getGalleryCover, 
  getStoredNHentaiUser,
  isNHentaiLoggedIn,
  checkIsFavorited,
  addToFavorites,
  removeFromFavorites,
  type NHentaiUser 
} from '../api/nhentai';
import { NHentaiLoginModal } from './NHentaiLoginModal';
import { FavoriteTagModal } from './FavoriteTagModal';
import type { GalleryItem } from '../types';
import { t } from '../i18n';

interface NHentaiBrowserProps {
  onOpenTab: (typeOrTab: any, title?: string, data?: any) => void;
}

type BrowseMode = 'catalog' | 'favorites';

export const NHentaiBrowser: React.FC<NHentaiBrowserProps> = ({ onOpenTab }) => {
  const [mode, setMode] = useState<BrowseMode>('catalog');
  const [query, setQuery] = useState<string>('');
  const [searchInput, setSearchInput] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number | undefined>(undefined);
  const [galleries, setGalleries] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Auth state & modal
  const [currentUser, setCurrentUser] = useState<NHentaiUser | null>(getStoredNHentaiUser());
  const [loggedIn, setLoggedIn] = useState(isNHentaiLoggedIn());
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);

  // Selected gallery for preview modal
  const [selectedGallery, setSelectedGallery] = useState<GalleryItem | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [isFavorited, setIsFavorited] = useState<boolean>(false);
  const [favoriting, setFavoriting] = useState<boolean>(false);
  const [isTagModalOpen, setIsTagModalOpen] = useState(false);
  const [tagModalManga, setTagModalManga] = useState<any>(null);

  const galleryToLibraryManga = (g: GalleryItem) => {
    const title = g.title?.pretty || g.title?.english || g.english_title || `Obra #${g.id}`;
    const cover = getGalleryCover(g);
    const tags = Array.isArray(g.tags) ? g.tags.map((t: any) => t.name) : [];
    return {
      title,
      url: `/g/${g.id}/`,
      cover,
      source: 'nhentai',
      sourceName: 'NHentai',
      categories: ['Favoritos'],
      favorite: true,
      author: (g.tags || []).find((t: any) => t.type === 'artist')?.name || 'NHentai',
      description: `NHentai #${g.id} - ${g.num_pages || g.pages?.length || 0} páginas`,
      genres: tags,
      chapters: [
        {
          name: 'Obra Completa',
          url: `/g/${g.id}/`,
          chapterNumber: 1,
          uploadDate: Date.now()
        }
      ],
      status: 2
    };
  };

  // Sync auth state with global events
  useEffect(() => {
    const handleAuth = () => {
      const user = getStoredNHentaiUser();
      const isLog = isNHentaiLoggedIn();
      setCurrentUser(user);
      setLoggedIn(isLog);
    };

    window.addEventListener('nhentai:auth-changed', handleAuth);
    return () => window.removeEventListener('nhentai:auth-changed', handleAuth);
  }, []);

  // Fetch either general catalog or user favorites based on mode
  const fetchItems = async (currentMode: BrowseMode, q: string, p: number) => {
    setLoading(true);
    setError(null);
    try {
      if (currentMode === 'favorites') {
        if (!isNHentaiLoggedIn()) {
          setGalleries([]);
          setNumPages(1);
          setTotalItems(0);
          setLoading(false);
          return;
        }
        const data = await fetchFavorites(q, p);
        setGalleries(data.result || []);
        setNumPages(data.num_pages || 1);
        setTotalItems(data.total);
      } else {
        const data = await searchGalleries(q, p);
        setGalleries(data.result || []);
        setNumPages(data.num_pages || 1);
        setTotalItems(data.total);
      }
    } catch (err: any) {
      const errMsg = typeof err === 'object' && err?.message ? err.message : String(err);
      setError(errMsg || t('Falha ao buscar galerias da API NHentai v2'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems(mode, query, page);
  }, [mode, query, page, loggedIn]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setQuery(searchInput);
  };

  const handleSwitchMode = (newMode: BrowseMode) => {
    if (newMode === mode) return;
    setMode(newMode);
    setPage(1);
    setQuery('');
    setSearchInput('');
  };

  const handleSelectGallery = async (gallery: GalleryItem) => {
    setSelectedGallery(gallery);
    setLoadingDetails(true);
    setIsFavorited(false);

    try {
      const [full, favStatus] = await Promise.all([
        getGalleryDetails(gallery.id).catch(() => gallery),
        checkIsFavorited(gallery.id).catch(() => false)
      ]);
      setSelectedGallery(full);
      setIsFavorited(favStatus);
    } catch {
      // Keep existing summary data
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleToggleFavorite = async () => {
    if (!selectedGallery || favoriting) return;
    if (!loggedIn) {
      setIsLoginModalOpen(true);
      return;
    }

    setFavoriting(true);
    try {
      if (isFavorited) {
        await removeFromFavorites(selectedGallery.id);
        setIsFavorited(false);
        if (mode === 'favorites') {
          setGalleries((prev) => prev.filter((g) => g.id !== selectedGallery.id));
        }
      } else {
        await addToFavorites(selectedGallery.id);
        setIsFavorited(true);
        // Also ensure it is present in the unified manga_library
        try {
          const manga = galleryToLibraryManga(selectedGallery);
          const raw = localStorage.getItem('manga_library');
          const lib = raw ? JSON.parse(raw) : [];
          if (!lib.some((item: any) => item.url === manga.url)) {
            lib.push(manga);
            localStorage.setItem('manga_library', JSON.stringify(lib));
            if ((window as any).electron?.saveLibrary) {
              (window as any).electron.saveLibrary(lib);
            }
            window.dispatchEvent(new CustomEvent('manga:library-updated', { detail: lib }));
          }
        } catch (e) {
          console.error('Error syncing NHentai to local library:', e);
        }
      }
    } catch (err: any) {
      toast.error(t('Erro ao atualizar favoritos'), String(err?.message || err));
    } finally {
      setFavoriting(false);
    }
  };

  const openGallery = async (gallery: any) => {
    let fullGallery = gallery;
    const hasMediaId = Boolean(gallery.media_id);
    const hasPages = Boolean(
      (gallery.images && Array.isArray(gallery.images.pages) && gallery.images.pages.length > 0) ||
      (Array.isArray(gallery.pages) && gallery.pages.length > 0)
    );

    if ((!hasMediaId || !hasPages) && gallery.id) {
      try {
        fullGallery = await getGalleryDetails(gallery.id);
      } catch (err) {
        console.warn('Could not fetch full details, passing current gallery', err);
      }
    }

    const title = fullGallery.title?.pretty || fullGallery.title?.english || fullGallery.english_title || t('Obra #{id}', { id: fullGallery.id });

    onOpenTab({
      id: `nh-reader-${fullGallery.id}`,
      title,
      type: 'nhentai-reader',
      data: fullGallery,
    });
  };

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-fg-2 select-none overflow-hidden">
      {/* Top Search, Mode Switch & Filter Bar */}
      <div className="p-2.5 bg-surface border-b border-line flex items-center justify-between gap-3 text-xs flex-wrap sm:flex-nowrap">
        {/* Left: Brand & Mode Switcher */}
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-rose-950/60 border border-rose-800/80 text-rose-400">
            <Flame size={16} />
          </div>
          <span className="font-semibold text-fg text-sm">NHentai v2</span>

          <div className="flex items-center bg-canvas rounded-md p-0.5 border border-line ml-1">
            <button
              type="button"
              onClick={() => handleSwitchMode('catalog')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                mode === 'catalog'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-fg-muted hover:text-fg hover:bg-subtle'
              }`}
            >
              <Flame size={13} />
              <span>{t('Catálogo')}</span>
            </button>

            <button
              type="button"
              onClick={() => handleSwitchMode('favorites')}
              className={`px-2.5 py-1 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                mode === 'favorites'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-fg-muted hover:text-fg hover:bg-subtle'
              }`}
            >
              <Heart size={13} className={mode === 'favorites' ? 'fill-white' : ''} />
              <span>{t('Meus Favoritos')}</span>
              {mode === 'favorites' && totalItems !== undefined && (
                <span className="text-[10px] bg-black/40 px-1.5 py-0.2 rounded font-mono">
                  {totalItems}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search Form */}
        <form onSubmit={handleSearchSubmit} className="flex-1 max-w-sm relative">
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={
              mode === 'favorites'
                ? t('Pesquisar em seus favoritos...')
                : t('Pesquisar títulos, tags, artistas...')
            }
            className="w-full bg-canvas border border-line focus:border-accent rounded-md pl-8 pr-3 py-1 text-xs text-fg outline-none transition-colors"
          />
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
        </form>

        {/* Right: Pagination & Account Button */}
        <div className="flex items-center gap-2">
          {/* Pagination */}
          <div className="flex items-center gap-1 bg-canvas border border-line rounded-md px-1 py-0.5">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1 || loading}
              className="p-1 hover:bg-subtle text-white rounded disabled:opacity-30 transition-colors"
              title={t('Página anterior')}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-[11px] font-mono text-fg-muted px-1">
              {page} / {numPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(numPages, page + 1))}
              disabled={page >= numPages || loading}
              className="p-1 hover:bg-subtle text-white rounded disabled:opacity-30 transition-colors"
              title={t('Próxima página')}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Account Button */}
          {loggedIn && currentUser ? (
            <button
              type="button"
              onClick={() => setIsLoginModalOpen(true)}
              className="px-2.5 py-1 rounded bg-subtle hover:bg-elevated border border-line text-fg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer"
              title={t('Minha conta NHentai')}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <User size={13} className="text-rose-400" />
              <span className="max-w-[90px] truncate">{currentUser.username}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setIsLoginModalOpen(true)}
              className="px-2.5 py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow cursor-pointer hover:scale-105"
              title={t('Entrar com conta NHentai')}
            >
              <LogIn size={13} />
              <span>{t('Login')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4">
        {mode === 'favorites' && !loggedIn ? (
          /* Unauthenticated Favorites Banner */
          <div className="flex flex-col items-center justify-center h-80 text-center max-w-md mx-auto p-6 bg-surface border border-line rounded-xl shadow-lg my-8">
            <div className="w-14 h-14 rounded-full bg-rose-950/70 border border-rose-800 flex items-center justify-center text-rose-400 mb-4 shadow-inner">
              <Heart size={28} className="fill-rose-500/20" />
            </div>
            <h3 className="text-base font-bold text-fg mb-1.5">
              {t('Acesse seus favoritos do NHentai')}
            </h3>
            <p className="text-xs text-fg-muted mb-5 leading-relaxed">
              {t('Conecte sua conta do NHentai para sincronizar sua lista de obras favoritadas, pesquisar e ler diretamente aqui.')}
            </p>
            <button
              type="button"
              onClick={() => setIsLoginModalOpen(true)}
              className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all hover:scale-105 cursor-pointer"
            >
              <LogIn size={15} />
              <span>{t('Fazer login com usuário e senha')}</span>
            </button>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center h-64 text-fg-muted gap-3">
            <Loader2 size={32} className="animate-spin text-rose-500" />
            <span className="text-xs">
              {mode === 'favorites' ? t('Carregando seus favoritos...') : t('Carregando catálogo oficial NHentai v2...')}
            </span>
          </div>
        ) : error ? (
          <div className="p-4 bg-rose-950/20 border border-rose-900/60 rounded-md text-rose-300 text-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <AlertCircle size={18} className="flex-shrink-0 text-rose-400" />
              <div>
                <p className="font-semibold">{t('Erro ao conectar com a API NHentai')}</p>
                <p className="text-[11px] opacity-80 mt-0.5 font-mono">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => fetchItems(mode, query, page)}
              className="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 text-white rounded text-xs flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw size={12} />
              <span>{t('Tentar novamente')}</span>
            </button>
          </div>
        ) : galleries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center text-fg-muted text-xs">
            {mode === 'favorites' 
              ? t('Nenhuma obra favoritada encontrada nesta busca.')
              : t('Nenhuma galeria encontrada. Tente outra busca.')}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {galleries.map((gallery) => {
              const cover = getGalleryThumbnail(gallery);
              const title = 
                gallery.title?.pretty || 
                gallery.title?.english || 
                gallery.english_title || 
                t('Galeria #{id}', { id: gallery.id });

              return (
                <div
                  key={gallery.id}
                  onClick={() => openGallery(gallery)}
                  className="group flex flex-col bg-surface hover:bg-subtle border border-line hover:border-rose-500 rounded-md overflow-hidden cursor-pointer transition-all shadow-sm relative"
                >
                  <div className="w-full h-44 bg-canvas overflow-hidden relative">
                    <img
                      src={cover}
                      alt={title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute top-1.5 right-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[10px] font-mono text-white">
                      {gallery.pages?.length || gallery.num_pages || '?'} p
                    </div>

                    {/* Quick hover actions */}
                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openGallery(gallery);
                        }}
                        className="p-2 bg-rose-600 hover:bg-rose-500 text-white rounded-full shadow-lg transition-transform hover:scale-110"
                        title={t('Ler obra')}
                      >
                        <BookOpen size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setTagModalManga(galleryToLibraryManga(gallery));
                          setIsTagModalOpen(true);
                        }}
                        className="p-2 bg-subtle hover:bg-rose-950/80 text-fg-2 hover:text-rose-400 rounded-full shadow-lg border border-line transition-transform hover:scale-110"
                        title={t('Favoritar com tags')}
                      >
                        <Heart size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectGallery(gallery);
                        }}
                        className="p-2 bg-subtle hover:bg-elevated text-fg-2 hover:text-white rounded-full shadow-lg border border-line transition-transform hover:scale-110"
                        title={t('Ver detalhes e tags')}
                      >
                        <Eye size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="p-2 flex flex-col justify-between flex-1">
                    <h4 className="text-xs font-medium text-fg line-clamp-2 leading-tight" title={title}>
                      {title}
                    </h4>
                    <div className="flex items-center justify-between text-[10px] text-fg-muted font-mono mt-1.5">
                      <span>#{gallery.id}</span>
                      {gallery.num_favorites !== undefined && (
                        <span className="text-rose-400">♥ {gallery.num_favorites}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Gallery Details Modal */}
      {selectedGallery && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-surface border border-line rounded-lg max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-canvas">
              <div className="flex items-center gap-2 truncate">
                <Flame size={18} className="text-rose-400 flex-shrink-0" />
                <span className="font-semibold text-sm text-fg truncate">
                  {selectedGallery.title?.pretty || selectedGallery.title?.english || selectedGallery.english_title}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedGallery(null)}
                aria-label={t('Fechar')}
                className="text-fg-muted hover:text-white text-base px-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 overflow-y-auto flex-1 flex flex-col sm:flex-row gap-4">
              {/* Cover Preview & Primary Actions */}
              <div className="w-48 flex-shrink-0 flex flex-col gap-2.5">
                <img
                  src={getGalleryCover(selectedGallery)}
                  alt={t('Capa')}
                  className="w-full h-64 object-cover rounded-md border border-line shadow"
                />

                <button
                  type="button"
                  onClick={() => {
                    openGallery(selectedGallery);
                    setSelectedGallery(null);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-success hover:bg-success-hover text-white rounded-md font-semibold text-xs shadow-xs transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400"
                >
                  <BookOpen size={15} />
                  <span>{t('Ler agora')}</span>
                </button>

                {/* Favorite with Tags Button */}
                <button
                  type="button"
                  onClick={() => {
                    setTagModalManga(galleryToLibraryManga(selectedGallery));
                    setIsTagModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 bg-subtle hover:bg-elevated border border-line text-fg rounded-md font-semibold text-xs shadow-xs transition-colors cursor-pointer focus-visible:ring-1 focus-visible:ring-neutral-400"
                >
                  <Heart size={14} className="text-rose-400" />
                  <span>{t('Favoritar com tags')}</span>
                </button>

                {/* Favorite Toggle Button on NHentai Account */}
                <button
                  type="button"
                  disabled={favoriting}
                  onClick={handleToggleFavorite}
                  className={`w-full flex items-center justify-center gap-2 py-1.5 rounded-md font-medium text-xs border transition-colors cursor-pointer ${
                    isFavorited
                      ? 'bg-surface hover:bg-subtle border-line text-rose-300'
                      : 'bg-surface hover:bg-subtle border-line text-fg-muted hover:text-fg'
                  }`}
                >
                  {favoriting ? (
                    <Loader2 size={13} className="animate-spin text-rose-400" />
                  ) : (
                    <User size={13} className={isFavorited ? 'text-rose-400' : ''} />
                  )}
                  <span>{isFavorited ? t('Favoritado no NHentai') : t('Favoritar no NHentai')}</span>
                </button>
              </div>

              {/* Information & Tags */}
              <div className="flex-1 flex flex-col gap-3 text-xs">
                <div>
                  <h3 className="text-sm font-bold text-fg leading-snug">
                    {selectedGallery.title?.english || selectedGallery.english_title || selectedGallery.title?.pretty}
                  </h3>
                  {(selectedGallery.title?.japanese || selectedGallery.japanese_title) && (
                    <p className="text-fg-muted text-xs mt-0.5 font-sans">
                      {selectedGallery.title?.japanese || selectedGallery.japanese_title}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 font-mono text-[11px] text-fg-muted">
                  <span>{t('Páginas: {n}', { n: selectedGallery.pages?.length || selectedGallery.num_pages || '' })}</span>
                  <span>•</span>
                  <span>ID: #{selectedGallery.id}</span>
                  {selectedGallery.num_favorites !== undefined && (
                    <>
                      <span>•</span>
                      <span className="text-rose-400">♥ {selectedGallery.num_favorites}</span>
                    </>
                  )}
                </div>

                {/* Tags grouped */}
                {selectedGallery.tags && selectedGallery.tags.length > 0 && (
                  <div className="space-y-2 mt-1">
                    <span className="text-[11px] font-semibold text-fg-muted flex items-center gap-1">
                      <Tag size={12} /> {t('Tags:')}
                    </span>
                    <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-1.5 bg-canvas rounded border border-line">
                      {selectedGallery.tags.map((tag) => (
                        <span
                          key={tag.id}
                          className="bg-subtle text-fg-2 px-2 py-0.5 rounded text-[10px] font-mono border border-line"
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Login Modal */}
      <NHentaiLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onSuccess={() => {
          if (mode === 'favorites') {
            fetchItems('favorites', query, page);
          }
        }}
      />

      {/* Favorite with Tags Modal */}
      <FavoriteTagModal
        isOpen={isTagModalOpen}
        onClose={() => setIsTagModalOpen(false)}
        manga={tagModalManga}
        onSaved={() => {
          setIsFavorited(true);
        }}
      />
    </div>
  );
};
