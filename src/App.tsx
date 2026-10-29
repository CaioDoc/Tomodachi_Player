import React, { useCallback, useEffect, useRef, useState } from 'react';
import { TitleBar } from './components/TitleBar';
import { Sidebar } from './components/Sidebar';
import { TabStrip, SubTabBar } from './components/TabManager';
import { MangasSection } from './components/MangasSection';
import { VideosSection } from './components/VideosSection';
import { LocalExplorer } from './components/LocalExplorer';
import { MangaReader } from './components/MangaReader';
import { TorrentGate } from './components/TorrentGate';
import { SourceBrowseView } from './components/SourceBrowseView';
import { VideoPlayer } from './components/VideoPlayer';
import { NHentaiBrowser } from './components/NHentaiBrowser';
import { MangaDex } from './components/MangaDex';
import { WebViewer } from './components/WebViewer';
import { BackupPanel } from './components/BackupPanel';
import { SettingsRepos } from './components/SettingsRepos';
import { ReposPanel } from './components/ReposPanel';
import { NHentaiReader } from './components/NHentaiReader';
import { LocalVideoLibrary } from './components/LocalVideoLibrary';
import { MangaDetailView } from './components/MangaDetailView';
import { AnimeDetailView } from './components/AnimeDetailView';
import { NuvioDetailView } from './components/NuvioDetailView';
import { WatchSourcesDrawer } from './components/WatchSourcesDrawer';
import { ExtensionCatalogView } from './components/ExtensionCatalogView';
import { TabActiveContext, isTypingTarget } from './context/TabContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { FeedbackHost } from './components/Feedback';
import { CommandPalette } from './components/CommandPalette';
import { WelcomeDialog } from './components/WelcomeDialog';
import { UpdateNotice } from './components/AppUpdates';
import { readLibrary } from './utils/libraryStore';
import type { TabItem, TabType, SubTab } from './types';
import { LABELS, type SectionView } from './constants/labels';
import { t } from './i18n';

const DEFAULT_BROWSER_URL = 'https://duckduckgo.com';
const SIDEBAR_KEY = 'tp_sidebar_collapsed';
const VIEW_KEY = (type: 'mangas' | 'videos') => `tp_last_view_${type}`;
const VALID_VIEWS: SectionView[] = ['library', 'updates', 'history', 'online', 'extensions', 'repos', 'local', 'backup', 'nuvio'];

const readStoredView = (type: 'mangas' | 'videos'): SectionView => {
  try {
    const v = localStorage.getItem(VIEW_KEY(type)) as SectionView | null;
    if (v && VALID_VIEWS.includes(v) && !(v === 'nuvio' && type === 'mangas')) return v;
  } catch {
    /* ignore */
  }
  return 'library';
};

const catalogSubTab = (): SubTab => ({ id: 'catalog', title: t('Catálogo'), type: 'catalog' });

const makeSectionTab = (type: 'mangas' | 'videos', view?: SectionView): TabItem => ({
  id: `tab-${type}-${Date.now().toString(36)}`,
  title: type === 'mangas' ? LABELS.mangas : LABELS.videos,
  type,
  data: { view: view || readStoredView(type) },
  subTabs: type === 'mangas' ? [catalogSubTab()] : undefined,
  activeSubTab: type === 'mangas' ? 'catalog' : undefined,
});

const newTabId = () => `tab-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/* ─────────────── Sessão: reabre as abas da última vez ─────────────── */

const SESSION_KEY = 'tp_session_v1';
const RESTORABLE: TabType[] = ['mangas', 'videos', 'settings-repos', 'webview', 'manga-detail', 'anime-detail', 'extension-catalog', 'source-browse', 'repos', 'repo-manga', 'repo-anime'];

const serializeTab = (t: TabItem): TabItem | null => {
  if (!RESTORABLE.includes(t.type)) return null;
  let data = t.data;
  if (t.type === 'webview') data = { url: t.data?.url || t.data?.initialUrl, initialUrl: t.data?.url || t.data?.initialUrl };
  try {
    const json = JSON.stringify(data ?? null);
    if (json.length > 150_000) return null; // evita estourar o armazenamento
  } catch {
    return null;
  }
  return { id: t.id, title: t.title, type: t.type, data, subTabs: t.type === 'mangas' ? [catalogSubTab()] : undefined, activeSubTab: t.type === 'mangas' ? 'catalog' : undefined };
};

const loadSession = (): { tabs: TabItem[]; activeTabId: string } | null => {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const list: TabItem[] = (parsed?.tabs || []).filter((t: any) => t && typeof t.id === 'string' && RESTORABLE.includes(t.type));
    if (list.length === 0) return null;
    // Seções sempre usam a última visão escolhida
    for (const t of list) {
      if ((t.type === 'mangas' || t.type === 'videos') && !VALID_VIEWS.includes(t.data?.view)) t.data = { ...(t.data || {}), view: 'library' };
    }
    // Títulos fixos no idioma atual (a sessão pode ter sido salva em outro idioma)
    for (const tab of list) {
      if (tab.type === 'mangas') tab.title = LABELS.mangas;
      else if (tab.type === 'videos') tab.title = LABELS.videos;
      else if (tab.type === 'settings-repos') tab.title = t('Configurações');
    }
    const active = list.some((t) => t.id === parsed.activeTabId) ? parsed.activeTabId : list[0].id;
    return { tabs: list, activeTabId: active };
  } catch {
    return null;
  }
};

export const App: React.FC = () => {
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_KEY) === '1';
    } catch {
      return false;
    }
  });

  const [initialSession] = useState(loadSession);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const [tabs, setTabs] = useState<TabItem[]>(() => {
    if (initialSession) return initialSession.tabs;
    const mangas = makeSectionTab('mangas');
    mangas.id = 'tab-mangas-default';
    const videos = makeSectionTab('videos');
    videos.id = 'tab-videos-default';
    return [mangas, videos];
  });
  const [activeTabId, setActiveTabId] = useState<string>(() => initialSession?.activeTabId || 'tab-mangas-default');

  // Refs para que atalhos e callbacks sempre vejam o estado mais recente
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const activeTabIdRef = useRef(activeTabId);
  activeTabIdRef.current = activeTabId;
  const closedTabsRef = useRef<TabItem[]>([]);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Garante que sempre exista uma aba ativa válida
  useEffect(() => {
    if (tabs.length === 0) {
      const fresh = makeSectionTab('mangas');
      setTabs([fresh]);
      setActiveTabId(fresh.id);
    } else if (!tabs.some((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  // Salva a sessão (abas restauráveis) com pequeno atraso
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        const list = tabs.map(serializeTab).filter(Boolean) as TabItem[];
        const active = list.some((x) => x.id === activeTabId) ? activeTabId : list[0]?.id;
        localStorage.setItem(SESSION_KEY, JSON.stringify({ tabs: list, activeTabId: active }));
      } catch {
        /* ignore */
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [tabs, activeTabId]);

  // Boas-vindas no primeiro uso (biblioteca vazia)
  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem('tp_welcome_done')) return;
    } catch {
      return;
    }
    Promise.all([readLibrary('manga'), readLibrary('video')]).then(([m, v]) => {
      if (cancelled) return;
      if ((m.entries?.length || 0) + (v.entries?.length || 0) === 0) setShowWelcome(true);
      else {
        try {
          localStorage.setItem('tp_welcome_done', '1');
        } catch {
          /* ignore */
        }
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const closeWelcome = () => {
    setShowWelcome(false);
    try {
      localStorage.setItem('tp_welcome_done', '1');
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  /* ─────────────────────────── Abrir / fechar abas ─────────────────────────── */

  const handleOpenTab = useCallback((typeOrTab: TabType | any, titleArg?: string, dataArg?: any, opts?: { background?: boolean }) => {
    let type: TabType;
    let title: string;
    let data: any;
    let customId: string | undefined;

    if (typeof typeOrTab === 'object' && typeOrTab !== null && typeOrTab.type) {
      type = typeOrTab.type;
      title = typeOrTab.title || t('Nova aba');
      data = typeOrTab.data;
      customId = typeOrTab.id;
    } else {
      type = typeOrTab;
      title = titleArg || t('Nova aba');
      data = dataArg;
    }

    const current = tabsRef.current;
    const existing = current.find((t) => {
      if (customId && t.id === customId) return true;
      if (t.type !== type) return false;
      switch (type) {
        case 'mangas':
        case 'videos':
        case 'repos':
        case 'settings-repos':
          return true;
        case 'nhentai-reader':
          return !!t.data?.id && t.data.id === data?.id;
        case 'video-player':
          return !!t.data?.filePath && t.data.filePath === data?.filePath;
        case 'manga-reader':
        case 'mangadex-reader':
          if (data?.chapterUrl || t.data?.chapterUrl) return !!data?.chapterUrl && t.data?.chapterUrl === data.chapterUrl;
          return !!t.data?.title && t.data.title === data?.title;
        case 'manga-detail':
          return !!t.data?.manga?.url && t.data.manga.url === data?.manga?.url;
        case 'anime-detail':
          return !!t.data?.anime?.url && t.data.anime.url === data?.anime?.url;
        case 'backup-viewer':
          return !!t.data?.filePath && t.data.filePath === data?.filePath;
        case 'extension-catalog':
          return !!t.data?.extension?.pkg && t.data.extension.pkg === data?.extension?.pkg;
        case 'source-browse':
          return !!t.data?.target?.url && t.data.target.url === data?.target?.url;
        default:
          return false;
      }
    });

    if (existing) {
      // Leitor já aberto: atualiza a página inicial pedida (ex.: clicou em outra imagem da pasta)
      if ((type === 'manga-reader' || type === 'mangadex-reader') && data) {
        setTabs((prev) =>
          prev.map((t) => (t.id === existing.id ? { ...t, data: { ...t.data, ...data, nonce: Date.now() } } : t))
        );
      }
      // Obra já aberta, pedido para ir a um episódio (ex.: vindo de Atualizações)
      if (type === 'anime-detail' && data?.focusEpisode) {
        setTabs((prev) => prev.map((t) => (t.id === existing.id ? { ...t, data: { ...t.data, focusEpisode: data.focusEpisode } } : t)));
      }
      if (!opts?.background) setActiveTabId(existing.id);
      return;
    }

    const id = customId || newTabId();
    const isSection = type === 'mangas' || type === 'videos';
    const newTab: TabItem = {
      id,
      title,
      type,
      data: isSection ? { view: readStoredView(type as 'mangas' | 'videos'), ...(data || {}) } : data,
      subTabs: type === 'mangas' || type === 'mangadex' ? [catalogSubTab()] : undefined,
      activeSubTab: type === 'mangas' || type === 'mangadex' ? 'catalog' : undefined,
    };

    setTabs((prev) => {
      // Abre a nova aba logo à direita da aba atual (comportamento de navegador)
      const idx = prev.findIndex((t) => t.id === activeTabIdRef.current);
      if (idx < 0) return [...prev, newTab];
      const next = [...prev];
      next.splice(idx + 1, 0, newTab);
      return next;
    });
    if (!opts?.background) setActiveTabId(id);
  }, []);

  const handleCloseTab = useCallback((idToClose: string) => {
    const current = tabsRef.current;
    const index = current.findIndex((t) => t.id === idToClose);
    if (index < 0) return;

    closedTabsRef.current.push(current[index]);
    if (closedTabsRef.current.length > 15) closedTabsRef.current.shift();

    const remaining = current.filter((t) => t.id !== idToClose);

    if (remaining.length === 0) {
      const fresh = makeSectionTab('mangas');
      setTabs([fresh]);
      setActiveTabId(fresh.id);
      return;
    }

    setTabs(remaining);
    if (activeTabIdRef.current === idToClose) {
      const nextIndex = Math.min(remaining.length - 1, Math.max(0, index - 1));
      setActiveTabId(remaining[index] ? remaining[index].id : remaining[nextIndex].id);
    }
  }, []);

  const reopenClosedTab = useCallback(() => {
    const last = closedTabsRef.current.pop();
    if (!last) return;
    if (tabsRef.current.some((t) => t.id === last.id)) {
      setActiveTabId(last.id);
      return;
    }
    setTabs((prev) => [...prev, last]);
    setActiveTabId(last.id);
  }, []);

  const openBrowserTab = useCallback(
    (url: string = DEFAULT_BROWSER_URL, background = false) => {
      handleOpenTab('webview', t('Nova aba'), { initialUrl: url, url }, { background });
    },
    [handleOpenTab]
  );

  const handleUpdateTabTitle = useCallback((tabId: string, newTitle: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId && t.title !== newTitle ? { ...t, title: newTitle } : t)));
  }, []);

  // Guarda o endereço atual do navegador (para restaurar a sessão) sem recarregar a página
  const handleUpdateTabUrl = useCallback((tabId: string, url: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId && t.data?.url !== url ? { ...t, data: { ...(t.data || {}), url } } : t)));
  }, []);

  const setSectionView = useCallback((tabId: string, view: SectionView) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        if (t.type === 'mangas' || t.type === 'videos') {
          try {
            localStorage.setItem(VIEW_KEY(t.type), view);
          } catch {
            /* ignore */
          }
        }
        return t.data?.view === view ? t : { ...t, data: { ...(t.data || {}), view } };
      })
    );
  }, []);

  // Navegação pela barra lateral
  const handleNavigate = useCallback(
    (type: TabType, view?: SectionView) => {
      const existing = tabsRef.current.find((t) => t.type === type);
      if (existing) {
        setActiveTabId(existing.id);
        if (view) setSectionView(existing.id, view);
        return;
      }
      if (type === 'mangas' || type === 'videos') {
        const tab = makeSectionTab(type, view);
        setTabs((prev) => [...prev, tab]);
        setActiveTabId(tab.id);
        if (view) {
          try {
            localStorage.setItem(VIEW_KEY(type), view);
          } catch {
            /* ignore */
          }
        }
        return;
      }
      handleOpenTab(type, type === 'settings-repos' ? t('Configurações') : t('Nova aba'));
    },
    [handleOpenTab, setSectionView]
  );

  // Navegação pedida por telas internas (ex.: "Abrir plugins" na tela de uma obra do Nuvio)
  useEffect(() => {
    const onNav = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.type === 'mangas' || d.type === 'videos') handleNavigate(d.type, VALID_VIEWS.includes(d.view) ? d.view : undefined);
      else if (d.type === 'settings-repos') {
        handleNavigate('settings-repos');
        if (d.section) window.setTimeout(() => window.dispatchEvent(new CustomEvent('tomodachi:settings-section', { detail: d.section })), 0);
      }
    };
    window.addEventListener('tomodachi:navigate', onNav);
    return () => window.removeEventListener('tomodachi:navigate', onNav);
  }, [handleNavigate]);

  const handleOpenBrowserFromSidebar = useCallback(() => {
    const existing = tabsRef.current.find((t) => t.type === 'webview');
    if (existing) setActiveTabId(existing.id);
    else openBrowserTab();
  }, [openBrowserTab]);

  /* ─────────────────────────── Sub-abas ─────────────────────────── */

  const handleSelectSubTab = useCallback((tabId: string, subTabId: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, activeSubTab: subTabId } : t)));
  }, []);

  const handleCloseSubTab = useCallback((tabId: string, subTabId: string) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId || !t.subTabs) return t;
        const remaining = t.subTabs.filter((st) => st.id !== subTabId);
        const nextActive = t.activeSubTab === subTabId ? remaining[remaining.length - 1]?.id || 'catalog' : t.activeSubTab;
        return {
          ...t,
          subTabs: remaining.length > 0 ? remaining : [catalogSubTab()],
          activeSubTab: nextActive,
        };
      })
    );
  }, []);

  const handleOpenSubTab = useCallback((tabId: string, subTab: SubTab) => {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== tabId) return t;
        const currentSubTabs = t.subTabs || [catalogSubTab()];
        const exists = currentSubTabs.some((st) => st.id === subTab.id);
        return { ...t, subTabs: exists ? currentSubTabs : [...currentSubTabs, subTab], activeSubTab: subTab.id };
      })
    );
  }, []);

  /* ─────────────────────────── Atalhos de teclado ─────────────────────────── */

  /** Muda a aba de lugar (arrastar e soltar ou Ctrl+Shift+PageUp/PageDown) */
  const moveTab = useCallback((id: string, toIndex: number) => {
    setTabs((prev) => {
      const from = prev.findIndex((x) => x.id === id);
      if (from < 0) return prev;
      let to = Math.max(0, Math.min(prev.length, toIndex));
      if (to > from) to -= 1;
      if (to === from) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const cycleTab = useCallback((dir: 1 | -1) => {
    const list = tabsRef.current;
    if (list.length < 2) return;
    const idx = list.findIndex((t) => t.id === activeTabIdRef.current);
    const next = (idx + dir + list.length) % list.length;
    setActiveTabId(list[next].id);
  }, []);

  const runShortcut = useCallback(
    (key: string, shift: boolean) => {
      switch (key) {
        case 'w':
          handleCloseTab(activeTabIdRef.current);
          return true;
        case 't':
          if (shift) reopenClosedTab();
          else openBrowserTab();
          return true;
        case 'tab':
          cycleTab(shift ? -1 : 1);
          return true;
        case 'k':
          setPaletteOpen((o) => !o);
          return true;
        default:
          return false;
      }
    },
    [handleCloseTab, reopenClosedTab, openBrowserTab, cycleTab]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const key = e.key.toLowerCase();

      if (key === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (key === 'b' && !isTypingTarget(e.target)) {
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
        return;
      }
      if (e.shiftKey && (key === 'pageup' || key === 'pagedown')) {
        const list = tabsRef.current;
        const idx = list.findIndex((x) => x.id === activeTabIdRef.current);
        if (idx >= 0) {
          e.preventDefault();
          moveTab(list[idx].id, key === 'pageup' ? idx - 1 : idx + 2);
        }
        return;
      }
      if (/^[1-9]$/.test(key)) {
        const list = tabsRef.current;
        const n = Number(key);
        const target = n === 9 ? list[list.length - 1] : list[n - 1];
        if (target) {
          e.preventDefault();
          setActiveTabId(target.id);
        }
        return;
      }
      if (runShortcut(key, e.shiftKey)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [runShortcut, moveTab]);

  // Atalhos encaminhados pelo processo principal quando o foco está dentro de um <webview>
  useEffect(() => {
    const unsubShortcut = window.electronAPI?.onAppShortcut?.(({ key, shift }) => runShortcut(key, shift));
    const unsubOpen = window.electronAPI?.onWebviewOpenUrl?.(({ url, background }) => openBrowserTab(url, background));
    return () => {
      if (typeof unsubShortcut === 'function') unsubShortcut();
      if (typeof unsubOpen === 'function') unsubOpen();
    };
  }, [runShortcut, openBrowserTab]);

  /* ─────────────────────────── Render ─────────────────────────── */

  const activeView: SectionView | undefined =
    activeTab && (activeTab.type === 'mangas' || activeTab.type === 'videos') ? activeTab.data?.view || 'library' : undefined;

  const renderTabContent = (tab: TabItem) => {
    switch (tab.type) {
      case 'mangas':
        return (
          <MangasSection
            onOpenTab={handleOpenTab}
            view={tab.data?.view || 'library'}
            onChangeView={(v) => setSectionView(tab.id, v)}
            activeSubTab={tab.activeSubTab}
            subTabs={tab.subTabs}
            onOpenSubTab={(sub) => handleOpenSubTab(tab.id, sub)}
          />
        );
      case 'videos':
        return (
          <VideosSection
            onOpenTab={handleOpenTab}
            view={tab.data?.view || 'library'}
            onChangeView={(v) => setSectionView(tab.id, v)}
          />
        );
      case 'repos':
      case 'repo-manga':
        return <ReposPanel type="manga" onOpenTab={handleOpenTab} />;
      case 'repo-anime':
        return <ReposPanel type="anime" onOpenTab={handleOpenTab} />;
      case 'manga-reader':
      case 'mangadex-reader':
        return (
          <MangaReader
            key={`${tab.id}-${tab.data?.nonce || 0}`}
            title={tab.data?.title || tab.title}
            pages={tab.data?.pages || []}
            initialPageIndex={tab.data?.initialPageIndex || 0}
            chapterContext={tab.data?.chapterContext}
            onTitleChange={(t) => handleUpdateTabTitle(tab.id, t)}
          />
        );
      case 'manga-detail':
        return (
          <MangaDetailView
            key={tab.id + (tab.data?.manga?.url || tab.data?.manga?.title || '')}
            manga={tab.data?.manga}
            initialExtension={tab.data?.initialExtension}
            onOpenTab={handleOpenTab}
          />
        );
      case 'anime-detail':
        if (String(tab.data?.anime?.url || '').startsWith('nuvio:')) {
          return (
            <NuvioDetailView
              key={tab.id + tab.data.anime.url + (tab.data?.focusEpisode || '')}
              work={tab.data.anime}
              focusEpisode={tab.data?.focusEpisode}
              onOpenTab={handleOpenTab}
            />
          );
        }
        return <AnimeDetailView key={tab.id + (tab.data?.anime?.url || '')} anime={tab.data?.anime} onOpenTab={handleOpenTab} />;
      case 'extension-catalog':
        return (
          <ExtensionCatalogView
            key={tab.id + (tab.data?.extension?.pkg || tab.data?.extension?.name || '')}
            extension={tab.data?.extension}
            mediaType={tab.data?.mediaType}
            onOpenTab={handleOpenTab}
          />
        );
      case 'source-browse':
        return tab.data?.target ? <SourceBrowseView key={tab.id + tab.data.target.url} target={tab.data.target} onOpenTab={handleOpenTab} /> : null;
      case 'video-player':
        if (tab.data?.torrent) {
          return (
            <TorrentGate key={tab.id + tab.data.torrent.magnet} torrent={tab.data.torrent} title={tab.data?.title || tab.title}>
              {(url, name) => (
                <VideoPlayer
                  key={url}
                  title={tab.data?.title || tab.title}
                  filePath={url}
                  item={{ path: url, name: tab.data?.title || name }}
                  episodeUrl={tab.data?.episodeUrl}
                  episodeContext={tab.data?.episodeContext}
                  directStream
                  remoteSubtitles={tab.data?.subtitles}
                  stremioRef={tab.data?.stremio}
                  playData={tab.data}
                  work={tab.data?.work}
                  onTitleChange={(t) => handleUpdateTabTitle(tab.id, t)}
                  onOpenTab={handleOpenTab}
                />
              )}
            </TorrentGate>
          );
        }
        return (
          <VideoPlayer
            key={tab.id + (tab.data?.filePath || '')}
            title={tab.data?.title || tab.title}
            filePath={tab.data?.filePath || ''}
            item={tab.data?.item}
            episodeUrl={tab.data?.episodeUrl}
            episodeContext={tab.data?.episodeContext}
            directStream={!!tab.data?.directStream}
            streamReferer={tab.data?.streamReferer}
            remoteSubtitles={tab.data?.subtitles}
            stremioRef={tab.data?.stremio}
            playData={tab.data}
            work={tab.data?.work}
            onTitleChange={(t) => handleUpdateTabTitle(tab.id, t)}
            onOpenTab={handleOpenTab}
          />
        );
      case 'nhentai':
        return <NHentaiBrowser onOpenTab={handleOpenTab} />;
      case 'nhentai-reader':
        return <NHentaiReader gallery={tab.data} />;
      case 'mangadex':
        return (
          <MangaDex
            activeSubTab={tab.activeSubTab}
            subTabs={tab.subTabs}
            onOpenSubTab={(sub) => handleOpenSubTab(tab.id, sub)}
          />
        );
      case 'webview':
        return (
          <WebViewer
            key={tab.id}
            initialUrl={tab.data?.initialUrl || tab.data?.url || DEFAULT_BROWSER_URL}
            onUpdateTitle={(t) => handleUpdateTabTitle(tab.id, t)}
            onUrlChange={(u) => handleUpdateTabUrl(tab.id, u)}
          />
        );
      case 'manga-local':
        return <LocalExplorer mediaType="image" onOpenTab={handleOpenTab} />;
      case 'manga-backup':
      case 'backup-viewer':
        return <BackupPanel source="manga" onOpenTab={handleOpenTab} />;
      case 'video-local':
        return <LocalVideoLibrary onOpenTab={handleOpenTab} />;
      case 'video-backup':
        return <BackupPanel source="video" onOpenTab={handleOpenTab} />;
      case 'settings-repos':
        return <SettingsRepos />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-canvas text-fg-2 overflow-hidden">
      <TitleBar>
        <TabStrip
          tabs={tabs}
          activeTabId={activeTab?.id || ''}
          onSelectTab={setActiveTabId}
          onCloseTab={handleCloseTab}
          onNewTab={() => openBrowserTab()}
          onMoveTab={moveTab}
        />
      </TitleBar>

      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
          onNavigate={handleNavigate}
          onOpenBrowser={handleOpenBrowserFromSidebar}
          activeTabType={activeTab?.type}
          activeView={activeView}
        />

        <main className="flex-1 flex flex-col overflow-hidden bg-surface min-w-0">
          <SubTabBar tab={activeTab} onSelectSubTab={handleSelectSubTab} onCloseSubTab={handleCloseSubTab} />

          {/* Todas as abas ficam montadas para preservar estado; só a ativa é exibida */}
          <div className="flex-1 overflow-hidden relative">
            {tabs.map((tab) => {
              const isActive = tab.id === activeTab?.id;
              return (
                <div
                  key={tab.id}
                  role="tabpanel"
                  aria-hidden={!isActive}
                  className={`absolute inset-0 ${isActive ? 'block' : 'hidden'}`}
                >
                  <TabActiveContext.Provider value={isActive}>
                    <ErrorBoundary label={tab.title}>{renderTabContent(tab)}</ErrorBoundary>
                  </TabActiveContext.Provider>
                </div>
              );
            })}
          </div>
        </main>
      </div>

      <WatchSourcesDrawer onOpenTab={handleOpenTab} />
      <UpdateNotice />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        tabs={tabs}
        onSelectTab={setActiveTabId}
        onNavigate={handleNavigate}
        onOpenTab={handleOpenTab}
      />

      {showWelcome && (
        <WelcomeDialog
          onClose={closeWelcome}
          onImportBackup={() => {
            closeWelcome();
            handleNavigate('mangas', 'backup');
          }}
          onLocalFolder={() => {
            closeWelcome();
            handleNavigate('mangas', 'local');
          }}
          onWatch={() => {
            closeWelcome();
            handleNavigate('videos', 'online');
          }}
          onExplore={() => {
            closeWelcome();
            handleNavigate('mangas', 'online');
          }}
        />
      )}

      <FeedbackHost />
    </div>
  );
};

export default App;
