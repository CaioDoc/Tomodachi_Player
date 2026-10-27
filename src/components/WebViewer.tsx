import React, { useState, useEffect, useRef } from 'react';
import { toast, confirmDialog } from './Feedback';
import { t, tn } from '../i18n';
import { 
  ArrowLeft, 
  ArrowRight, 
  RotateCw, 
  Home, 
  ShieldCheck, 
  ShieldOff,
  Loader2,
  Star,
  Bookmark,
  FolderInput,
  Upload,
  Download,
  Search,
  Trash2,
  Plus,
  X,
  Globe,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  BookmarkCheck,
  Check,
  Folder,
  Puzzle
} from 'lucide-react';
import { useIsTabActive } from '../context/TabContext';
import { parseAnyBookmarksTree, exportBookmarksToHtml, mergeBookmarkTrees, getFaviconUrl } from '../utils/bookmarkParser';
import { useBookmarks } from '../utils/bookmarkStore';
import { BookmarkBar, BookmarkManagerModal, FolderSelect } from './BookmarkManager';
import { BrowserExtensionsPanel, useBrowserExtensions } from './BrowserExtensionsPanel';

interface WebViewerProps {
  initialUrl?: string;
  onUpdateTitle?: (title: string) => void;
  /** Notifica o endereço atual (usado para restaurar a sessão) */
  onUrlChange?: (url: string) => void;
}

const DEFAULT_URL = 'https://duckduckgo.com';
const BAR_VISIBILITY_KEY = 'browser_bookmarks_bar_visible';

export const WebViewer: React.FC<WebViewerProps> = ({ 
  initialUrl = DEFAULT_URL,
  onUpdateTitle,
  onUrlChange,
}) => {
  const onUrlChangeRef = useRef(onUrlChange);
  onUrlChangeRef.current = onUrlChange;
  const isTabActive = useIsTabActive();
  // `url` = endereço atual exibido; o atributo src do <webview> é definido uma única vez
  // (alterá-lo a cada navegação recarregava a página e quebrava sites SPA).
  const [url, setUrl] = useState(initialUrl);
  const [webviewSrc] = useState(initialUrl);
  const webviewReadyRef = useRef(false);
  const pendingUrlRef = useRef<string | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const [currentTitle, setCurrentTitle] = useState('DuckDuckGo');
  const [currentFavicon, setCurrentFavicon] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const webviewRef = useRef<any>(null);

  // Favoritos (com pastas)
  const bm = useBookmarks();
  const [starPopover, setStarPopover] = useState<null | { id: string; title: string; parentId?: string; isNew: boolean }>(null);
  const [managerFolder, setManagerFolder] = useState<string | undefined>(undefined);
  const [newFolderName, setNewFolderName] = useState<string | null>(null);
  const [extPanelOpen, setExtPanelOpen] = useState(false);
  const { list: browserExtensions } = useBrowserExtensions();
  const quickExtensions = browserExtensions.filter((e) => e.enabled && e.loaded && e.popup).slice(0, 5);

  const [showBookmarksBar, setShowBookmarksBar] = useState<boolean>(() => {
    return localStorage.getItem(BAR_VISIBILITY_KEY) !== 'false';
  });

  const [isManagerOpen, setIsManagerOpen] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Adblock State
  const [adblockEnabled, setAdblockEnabled] = useState(true);
  const [blockedCount, setBlockedCount] = useState(0);

  useEffect(() => {
    if (window.electronAPI?.getAdblockStatus) {
      window.electronAPI.getAdblockStatus().then((res) => {
        if (res) {
          setAdblockEnabled(res.enabled);
          setBlockedCount(res.blockedCount);
        }
      }).catch(() => {});
    }

    const unsub = window.electronAPI?.onAdblockCountUpdated?.((count) => {
      setBlockedCount(count);
    });
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d && typeof d.enabled === 'boolean') setAdblockEnabled(d.enabled);
    };
    window.addEventListener('tomodachi:adblock-changed', onChanged);

    return () => {
      if (typeof unsub === 'function') unsub();
      window.removeEventListener('tomodachi:adblock-changed', onChanged);
    };
  }, []);

  // Notification helper
  const showToast = (msg: string) => {
    setNotification(msg);
    setTimeout(() => {
      setNotification((curr) => (curr === msg ? null : curr));
    }, 4000);
  };

  // Estrela: salva a página e abre um balão para escolher nome e pasta (como no Chrome)
  const currentBookmark = bm.findByUrl(url);
  const isBookmarked = !!currentBookmark;

  const handleToggleBookmark = () => {
    if (currentBookmark) {
      setStarPopover({ id: currentBookmark.id, title: currentBookmark.title, parentId: currentBookmark.parentId, isNew: false });
      return;
    }
    const title = currentTitle?.trim() || inputUrl;
    const next = bm.addLink(title, url, undefined, currentFavicon || getFaviconUrl(url));
    const created = next.bookmarks[next.bookmarks.length - 1];
    setStarPopover({ id: created.id, title: created.title, isNew: true });
  };

  const openManager = (folderId?: string) => {
    setManagerFolder(folderId);
    setIsManagerOpen(true);
  };

  // Navigation Logic with DuckDuckGo Search Engine
  const handleNavigate = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    let dest = inputUrl.trim();
    if (!dest) return;

    if (!dest.startsWith('http://') && !dest.startsWith('https://')) {
      // Check if it has a domain structure like example.com or sub.example.org/path
      if (dest.includes('.') && !dest.includes(' ') && !dest.endsWith('.')) {
        dest = `https://${dest}`;
      } else {
        // Default to DuckDuckGo search query
        dest = `https://duckduckgo.com/?q=${encodeURIComponent(dest)}`;
      }
    }
    navigateTo(dest);
  };

  // Navigate to specific URL (e.g. from bookmarks)
  function navigateTo(destUrl: string) {
    setUrl(destUrl);
    setInputUrl(destUrl);
    const wv = webviewRef.current;
    if (wv && webviewReadyRef.current) {
      try {
        const p = wv.loadURL(destUrl);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch {
        pendingUrlRef.current = destUrl;
      }
    } else {
      pendingUrlRef.current = destUrl;
    }
  }

  // Electron <webview> Events
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;

    const handleStartLoading = () => setIsLoading(true);
    const handleStopLoading = () => {
      setIsLoading(false);
      try {
        setCanGoBack(webview.canGoBack());
        setCanGoForward(webview.canGoForward());
        const currentUrl = webview.getURL();
        if (currentUrl) {
          setInputUrl(currentUrl);
          setUrl(currentUrl);
        }
      } catch {}
    };

    const handleTitleUpdated = (e: any) => {
      if (e.title) {
        setCurrentTitle(e.title);
        if (onUpdateTitle) {
          onUpdateTitle(e.title);
        }
      }
    };

    const handleFaviconUpdated = (e: any) => {
      if (e.favicons && e.favicons.length > 0) {
        setCurrentFavicon(e.favicons[0]);
      }
    };

    const handleDidNavigate = (e: any) => {
      if (e.url) {
        setInputUrl(e.url);
        setUrl(e.url);
        if (/^https?:/i.test(e.url)) onUrlChangeRef.current?.(e.url);
      }
    };

    const handleDomReady = () => {
      webviewReadyRef.current = true;
      const pending = pendingUrlRef.current;
      if (pending) {
        pendingUrlRef.current = null;
        try {
          const p = webview.loadURL(pending);
          if (p && typeof p.catch === 'function') p.catch(() => {});
        } catch {
          /* ignore */
        }
      }
    };

    const handleFailLoad = (e: any) => {
      // -3 = navegação abortada (comum em redirecionamentos); não é erro real
      if (e?.errorCode === -3 || e?.isMainFrame === false) return;
      setIsLoading(false);
    };

    webview.addEventListener('did-start-loading', handleStartLoading);
    webview.addEventListener('did-stop-loading', handleStopLoading);
    webview.addEventListener('page-title-updated', handleTitleUpdated);
    webview.addEventListener('page-favicon-updated', handleFaviconUpdated);
    webview.addEventListener('did-navigate', handleDidNavigate);
    webview.addEventListener('did-navigate-in-page', handleDidNavigate);
    webview.addEventListener('dom-ready', handleDomReady);
    webview.addEventListener('did-fail-load', handleFailLoad);

    return () => {
      webview.removeEventListener('did-start-loading', handleStartLoading);
      webview.removeEventListener('did-stop-loading', handleStopLoading);
      webview.removeEventListener('page-title-updated', handleTitleUpdated);
      webview.removeEventListener('page-favicon-updated', handleFaviconUpdated);
      webview.removeEventListener('did-navigate', handleDidNavigate);
      webview.removeEventListener('did-navigate-in-page', handleDidNavigate);
      webview.removeEventListener('dom-ready', handleDomReady);
      webview.removeEventListener('did-fail-load', handleFailLoad);
    };
  }, [onUpdateTitle]);

  const goBack = () => {
    if (webviewRef.current && webviewRef.current.canGoBack()) {
      webviewRef.current.goBack();
    }
  };

  const goForward = () => {
    if (webviewRef.current && webviewRef.current.canGoForward()) {
      webviewRef.current.goForward();
    }
  };

  const reload = () => {
    if (webviewRef.current) {
      webviewRef.current.reload();
    }
  };

  const goHome = () => navigateTo(DEFAULT_URL);

  // Atalhos do navegador (somente na aba ativa, com foco fora da página web)
  const shortcutRef = useRef({ toggleBar: () => {}, star: () => {} });
  useEffect(() => {
    if (!isTabActive) return;
    const onKey = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.key === 'F5' || (ctrl && e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        reload();
      } else if (ctrl && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        addressRef.current?.focus();
        addressRef.current?.select();
      } else if (ctrl && e.shiftKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        shortcutRef.current.toggleBar();
      } else if (ctrl && !e.shiftKey && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        shortcutRef.current.star();
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault();
        goForward();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTabActive]);

  shortcutRef.current = { toggleBar: () => toggleBookmarksBar(), star: () => handleToggleBookmark() };

  // Toggle Bookmarks Bar
  const toggleBookmarksBar = () => {
    const next = !showBookmarksBar;
    setShowBookmarksBar(next);
    localStorage.setItem(BAR_VISIBILITY_KEY, String(next));
  };

  // Importa favoritos (HTML de qualquer navegador, JSON do Chrome/Firefox, .jsonlz4) mantendo as pastas
  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const buffer = event.target?.result as ArrayBuffer;
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (!buffer) return;
      const parsed = parseAnyBookmarksTree(buffer);
      if (parsed.bookmarks.length === 0) {
        showToast(t('Nenhum favorito encontrado no arquivo selecionado.'));
        return;
      }
      const r = mergeBookmarkTrees(bm.data, parsed);
      bm.commit({ bookmarks: r.bookmarks, folders: r.folders });
      showToast(
        r.addedCount === 0 && r.addedFolders === 0
          ? t('Todos esses favoritos já estavam salvos.')
          : r.addedFolders
            ? t('{bookmarks} e {folders} importados de "{file}"', {
                bookmarks: tn(r.addedCount, '{n} favorito', '{n} favoritos'),
                folders: tn(r.addedFolders, '{n} pasta', '{n} pastas'),
                file: file.name,
              })
            : t('{bookmarks} importados de "{file}"', { bookmarks: tn(r.addedCount, '{n} favorito', '{n} favoritos'), file: file.name })
      );
    };
    reader.onerror = () => showToast(t('Erro ao ler o arquivo de favoritos.'));
    reader.readAsArrayBuffer(file);
  };

  const handleExportBookmarks = () => {
    if (bm.data.bookmarks.length === 0) {
      showToast(t('Não há favoritos para exportar.'));
      return;
    }
    const html = exportBookmarksToHtml(bm.data.bookmarks, bm.data.folders);
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `tomodachi_favoritos_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    showToast(t('Favoritos exportados (com as pastas)!'));
  };

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-fg-2 relative select-none">
      {/* Hidden File Input for Bookmark Import */}
      <input 
        type="file" 
        ref={fileInputRef} 
        accept=".html,.htm,.json,.jsonlz4,*" 
        className="hidden" 
        onChange={handleFileImport} 
      />

      {/* 1. Main Navigation Toolbar */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-surface border-b border-line flex-shrink-0 z-10">
        <button
          type="button"
          onClick={goBack}
          disabled={!canGoBack}
          className={`p-1.5 rounded-md transition-colors ${
            canGoBack 
              ? 'text-fg-2 hover:bg-subtle hover:text-fg' 
              : 'text-fg-muted opacity-40 cursor-not-allowed'
          }`}
          title={t('Voltar')}
        >
          <ArrowLeft size={16} />
        </button>

        <button
          type="button"
          onClick={goForward}
          disabled={!canGoForward}
          className={`p-1.5 rounded-md transition-colors ${
            canGoForward 
              ? 'text-fg-2 hover:bg-subtle hover:text-fg' 
              : 'text-fg-muted opacity-40 cursor-not-allowed'
          }`}
          title={t('Avançar')}
        >
          <ArrowRight size={16} />
        </button>

        <button
          type="button"
          onClick={reload}
          className="text-fg-2 hover:text-fg p-1.5 rounded-md hover:bg-subtle transition-colors"
          title={t('Recarregar')}
        >
          {isLoading ? (
            <Loader2 size={16} className="animate-spin text-accent" />
          ) : (
            <RotateCw size={15} />
          )}
        </button>

        <button
          type="button"
          onClick={goHome}
          className="text-fg-2 hover:text-fg p-1.5 rounded-md hover:bg-subtle transition-colors"
          title={t('Página Inicial (DuckDuckGo)')}
        >
          <Home size={16} />
        </button>

        {/* URL Input Form */}
        <form onSubmit={handleNavigate} className="flex-1 flex items-center relative min-w-0">
          <button
            type="button"
            onClick={async () => {
              if (window.electronAPI?.toggleAdblock) {
                const res = await window.electronAPI.toggleAdblock();
                setAdblockEnabled(res.enabled);
                setBlockedCount(res.blockedCount);
                window.dispatchEvent(new CustomEvent('tomodachi:adblock-changed', { detail: res }));
                showToast(res.enabled ? t('uBlock Origin ativado') : t('uBlock Origin desativado'));
              }
            }}
            className={`absolute left-2.5 z-10 flex items-center transition-colors cursor-pointer ${
              adblockEnabled
                ? 'text-emerald-400 hover:text-emerald-300'
                : 'text-rose-400 hover:text-rose-300'
            }`}
            title={
              adblockEnabled
                ? t('Protegido por uBlock Origin ({n} anúncios/rastreadores bloqueados). Clique para alternar.', { n: blockedCount })
                : t('uBlock Origin desativado. Clique para reativar proteção.')
            }
          >
            {adblockEnabled ? <ShieldCheck size={14} /> : <ShieldOff size={14} />}
          </button>

          <input
            ref={addressRef}
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setInputUrl(url);
                e.currentTarget.blur();
              }
            }}
            spellCheck={false}
            className="w-full bg-canvas border border-line focus:border-accent rounded-md pl-8 pr-16 py-1.5 text-xs text-fg outline-none font-sans transition-colors placeholder-fg-muted"
            placeholder={t('Pesquisar com DuckDuckGo ou digitar endereço...')}
          />

          <div className="absolute right-1.5 flex items-center gap-1">
            {isLoading && (
              <Loader2 size={13} className="animate-spin text-accent mr-1" />
            )}

            {/* Bookmark Current Page Star Button */}
            <button
              type="button"
              onClick={handleToggleBookmark}
              className={`p-1 rounded transition-colors ${
                isBookmarked 
                  ? 'text-amber-400 hover:text-amber-300' 
                  : 'text-fg-muted hover:text-amber-400'
              }`}
              title={isBookmarked ? t('Editar favorito (pasta, nome ou remover)') : t('Adicionar aos favoritos')}
            >
              <Star 
                size={15} 
                className={isBookmarked ? 'fill-amber-400 text-amber-400' : ''} 
              />
            </button>
          </div>
        </form>

        {/* Extensões com painel (como os ícones do Chrome) */}
        {quickExtensions.map((ext) => (
          <button
            key={ext.key}
            type="button"
            onClick={() => void window.electronAPI?.extensionsOpenPopup?.(ext.key)}
            className="p-1.5 rounded-md hover:bg-subtle"
            title={ext.name}
          >
            {ext.icon ? <img src={ext.icon} alt="" className="w-4 h-4 object-contain" /> : <Puzzle size={15} className="text-fg-muted" />}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setExtPanelOpen(true)}
          className={`p-1.5 rounded-md transition-colors ${extPanelOpen ? 'bg-subtle text-fg' : 'text-fg-2 hover:text-fg hover:bg-subtle'}`}
          title={t('Proteção contra anúncios e extensões')}
        >
          <Puzzle size={16} />
        </button>

        {/* Bookmarks Manager Trigger */}
        <button
          type="button"
          onClick={() => openManager()}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors border ${
            isManagerOpen 
              ? 'bg-subtle text-fg border-accent' 
              : 'bg-subtle hover:bg-elevated text-fg-2 hover:text-fg border-line'
          }`}
          title={t('Gerenciar Favoritos')}
        >
          <Bookmark size={13} className="text-warning-fg" />
          <span className="hidden sm:inline">{t('Favoritos')}</span>
          <span className="text-[10px] bg-surface px-1.5 py-0.5 rounded-full text-fg-muted font-mono">
            {bm.data.bookmarks.length}
          </span>
        </button>
        {!showBookmarksBar && (
          <button
            type="button"
            onClick={toggleBookmarksBar}
            className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-subtle"
            title={t('Mostrar barra de favoritos (Ctrl+Shift+B)')}
          >
            <ChevronDown size={14} />
          </button>
        )}
      </div>

      {/* Balão da estrela: nome e pasta do favorito */}
      {starPopover && (
        <>
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => {
              // Fechar clicando fora também salva (como no Chrome)
              bm.editLink(starPopover.id, { title: starPopover.title.trim() || url, parentId: starPopover.parentId });
              setStarPopover(null);
              setNewFolderName(null);
            }}
            aria-hidden
          />
          <form
            className="absolute right-28 top-11 z-[61] w-80 rounded-xl bg-elevated border border-line shadow-pop p-4 text-xs animate-tp-fade-in"
            onSubmit={(e) => {
              e.preventDefault();
              bm.editLink(starPopover.id, { title: starPopover.title.trim() || url, parentId: starPopover.parentId });
              setStarPopover(null);
            }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Star size={15} className="fill-amber-400 text-amber-400" />
              <span className="text-sm font-semibold text-fg">{starPopover.isNew ? t('Favorito adicionado') : t('Editar favorito')}</span>
            </div>
            <label className="block text-[11px] text-fg-muted mb-1">{t('Nome')}</label>
            <input
              autoFocus
              value={starPopover.title}
              onChange={(e) => setStarPopover({ ...starPopover, title: e.target.value })}
              onFocus={(e) => e.currentTarget.select()}
              className="w-full bg-surface border border-line focus:border-accent rounded px-2.5 py-1.5 text-xs text-fg outline-none mb-3"
            />
            <label className="block text-[11px] text-fg-muted mb-1 flex items-center gap-1">
              <Folder size={11} /> {t('Pasta')}
            </label>
            <FolderSelect data={bm.data} value={starPopover.parentId} onChange={(id) => setStarPopover({ ...starPopover, parentId: id })} className="w-full mb-2" />
            {newFolderName === null ? (
              <div className="flex items-center gap-3 mb-3">
                <button type="button" onClick={() => setNewFolderName('')} className="text-[11px] text-accent hover:underline">
                  {t('+ Nova pasta')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStarPopover(null);
                    openManager(starPopover.parentId);
                  }}
                  className="text-[11px] text-fg-muted hover:text-fg hover:underline"
                >
                  {t('Organizar favoritos…')}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 mb-3">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const id = bm.addFolder(newFolderName.trim() || t('Nova pasta'), starPopover.parentId);
                      setStarPopover({ ...starPopover, parentId: id });
                      setNewFolderName(null);
                    } else if (e.key === 'Escape') {
                      e.stopPropagation();
                      setNewFolderName(null);
                    }
                  }}
                  placeholder={t('Nome da pasta (Enter)')}
                  className="flex-1 bg-surface border border-line focus:border-accent rounded px-2 py-1 text-xs text-fg outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const id = bm.addFolder(newFolderName.trim() || t('Nova pasta'), starPopover.parentId);
                    setStarPopover({ ...starPopover, parentId: id });
                    setNewFolderName(null);
                  }}
                  className="px-2 py-1 rounded bg-subtle hover:bg-surface text-[11px] text-fg"
                >
                  {t('Criar')}
                </button>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  bm.removeLink(starPopover.id);
                  setStarPopover(null);
                  showToast(t('Página removida dos favoritos'));
                }}
                className="px-3 py-1.5 rounded-md text-xs text-danger hover:bg-danger/10"
              >
                {t('Remover')}
              </button>
              <button type="submit" className="px-4 py-1.5 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold">
                {t('Pronto')}
              </button>
            </div>
          </form>
        </>
      )}

      {/* 2. Barra de favoritos (pastas abrem em menu) */}
      {showBookmarksBar && (
        <BookmarkBar
          store={bm}
          onOpen={navigateTo}
          onOpenManager={openManager}
          trailing={
            <div className="flex items-center gap-1 pl-1 border-l border-line-subtle flex-shrink-0">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 px-2 py-1 text-[11px] text-fg-muted hover:text-fg hover:bg-subtle rounded transition-colors"
                title={t('Importar favoritos de outro navegador (mantém as pastas)')}
              >
                <FolderInput size={12} className="text-accent" />
                <span className="hidden md:inline">{t('Importar')}</span>
              </button>
              <button
                type="button"
                onClick={toggleBookmarksBar}
                className="p-1 text-fg-muted hover:text-fg rounded hover:bg-subtle transition-colors"
                title={t('Ocultar barra de favoritos')}
              >
                <ChevronUp size={12} />
              </button>
            </div>
          }
        />
      )}

      {/* Floating Notification Toast */}
      {notification && (
        <div className="absolute top-12 right-6 z-50 bg-surface border border-accent text-fg px-3.5 py-2 rounded-lg shadow-xl text-xs flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <Check size={14} className="text-emerald-400 flex-shrink-0" />
          <span>{notification}</span>
        </div>
      )}

      {/* 3. Persistent Webview Container */}
      <div className="flex-1 relative w-full h-full bg-canvas overflow-hidden">
        {/* @ts-ignore */}
        <webview
          ref={webviewRef}
          src={webviewSrc}
          partition="persist:user_session"
          className="w-full h-full border-none"
          /* string: o React descarta atributos booleanos em <webview> (sem isso, links que abrem nova aba não funcionavam) */
          {...({ allowpopups: 'true' } as Record<string, string>)}
        />
      </div>

      {extPanelOpen && <BrowserExtensionsPanel onClose={() => setExtPanelOpen(false)} />}

      {/* 4. Gerenciador de favoritos */}
      {isManagerOpen && (
        <BookmarkManagerModal
          store={bm}
          initialFolder={managerFolder}
          onClose={() => setIsManagerOpen(false)}
          onOpen={navigateTo}
          onImport={() => fileInputRef.current?.click()}
          onExport={handleExportBookmarks}
          notify={showToast}
          currentPage={{ url, title: currentTitle }}
        />
      )}
    </div>
  );
};
