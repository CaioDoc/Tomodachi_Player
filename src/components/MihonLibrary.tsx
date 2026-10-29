// src/components/MihonLibrary.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  BookOpen, 
  Film, 
  Search, 
  Filter, 
  CheckCircle2, 
  Circle, 
  Bookmark, 
  Heart, 
  ExternalLink, 
  ArrowUpDown, 
  Upload, 
  X,
  Calendar,
  User,
  Info,
  Play,
  Loader2,
  Layers,
  Sparkles,
  Download,
  Globe,
  LayoutGrid,
  Grid3x3,
  List,
  Tag
} from 'lucide-react';
import type { TabType } from '../types';
import { getChapterPages } from '../api/mangadex';
import {
  resolveSourceBaseUrl,
  buildChapterWebUrl,
  buildMangaWebUrl,
  buildAnimeWatchWebUrl,
  findExtensionInRepos,
  installExtension as registerExtension,
  isExtensionInstalled,
  getInstalledExtensions,
  type ExtensionMatch,
  type InstalledExtension,
} from '../api/extensionRegistry';
import { loadChapterPages } from '../api/chapterExtractor';
import { openVideoEpisode } from '../api/openChapter';
import { FavoriteTagModal } from './FavoriteTagModal';
import { PROGRESS_EVENT, mergeChapterProgress, updateChapterProgress, getProgressMap } from '../utils/progress';
import { useIsTabActive } from '../context/TabContext';
import { t, tn, tMaybe } from '../i18n';
import { parseTerms, matchesAll, topTags } from '../utils/smartSearch';
import { LIBRARY_SEARCH_EVENT, takePendingLibrarySearch } from '../api/discoverSearch';

/** Exibe o nome de uma categoria; a categoria padrão salva ('Favoritos') é traduzida só na tela. */
const categoryLabel = (cat: string) => (cat === 'Favoritos' ? t('Favoritos') : cat);
/** "Favoritos" é implícito (tudo na biblioteca é favorito): não vira aba nem filtro */
const isImplicitCategory = (cat: string) => /^(favoritos|favorites|favoritas)$/i.test(String(cat || '').trim());
const realCategories = (cats?: string[]) => (cats || []).filter((c) => c && typeof c === 'string' && c.trim() && !isImplicitCategory(c));

export interface LibraryChapter {
  url: string;
  name: string;
  number: number;
  read: boolean;
  bookmark: boolean;
  lastPageRead: number;
  lastSecondSeen: number;
  lastModifiedAt: number;
}

export interface LibraryItem {
  source: string;
  sourceName?: string;
  url: string;
  title: string;
  author: string;
  description: string;
  genres: string[];
  status: number;
  cover: string;
  background?: string;
  dateAdded: number;
  favorite: boolean;
  categories: string[];
  chapters: LibraryChapter[];
  totalChapters?: number;
  readChapters?: number;
  /** Extras de obras abertas fora da biblioteca (ajudam a achar a obra nas fontes) */
  altTitles?: string[];
  year?: number;
  format?: string;
  score?: number;
}

interface MihonLibraryProps {
  source: 'manga' | 'video';
  onOpenTab?: (type: TabType | any, title: string, data?: any) => void;
  onGoToBackup?: () => void;
  onGoToExplore?: () => void;
  onGoToRepos?: () => void;
}

export const MihonLibrary: React.FC<MihonLibraryProps> = ({
  source,
  onOpenTab,
  onGoToBackup,
  onGoToExplore,
  onGoToRepos,
}) => {
  const isManga = source === 'manga';
  const isTabActive = useIsTabActive();
  const [displayMode, setDisplayMode] = useState<'grid' | 'compact' | 'list'>(() => {
    try {
      return (localStorage.getItem(`tp_library_mode_${source}`) as any) || 'grid';
    } catch {
      return 'grid';
    }
  });
  const [coverSize, setCoverSize] = useState<number>(() => {
    try {
      return Number(localStorage.getItem(`tp_library_size_${source}`)) || 150;
    } catch {
      return 150;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(`tp_library_mode_${source}`, displayMode);
      localStorage.setItem(`tp_library_size_${source}`, String(coverSize));
    } catch {
      /* ignore */
    }
  }, [displayMode, coverSize, source]);
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchTerms = useMemo(() => parseTerms(searchQuery), [searchQuery]);
  // Tag clicada na página de uma obra: abre a biblioteca já filtrando por ela
  useEffect(() => {
    const pending = takePendingLibrarySearch(source);
    if (pending) {
      setSelectedCategory('all');
      setSearchQuery(pending);
    }
    const on = (e: Event) => {
      const d = (e as CustomEvent).detail || {};
      if (d.source !== source) return;
      takePendingLibrarySearch(source);
      setSelectedCategory('all');
      setSearchQuery(String(d.query || ''));
    };
    window.addEventListener(LIBRARY_SEARCH_EVENT, on);
    return () => window.removeEventListener(LIBRARY_SEARCH_EVENT, on);
  }, [source]);
  const [statusFilter, setStatusFilter] = useState<'all' | 'reading' | 'unread' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'default' | 'recent_read' | 'date_added' | 'unread_desc' | 'title_asc' | 'title_desc' | 'chapters_desc' | 'chapters_asc'>(() => {
    try {
      return (localStorage.getItem(`tp_library_sort_${source}`) as any) || 'default';
    } catch {
      return 'default';
    }
  });
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [chapterSearch, setChapterSearch] = useState<string>('');
  const [sortChaptersAsc, setSortChaptersAsc] = useState<boolean>(false);
  const [loadingChapterUrl, setLoadingChapterUrl] = useState<string | null>(null);
  const [extensionPrompt, setExtensionPrompt] = useState<{
    manga: LibraryItem;
    chapter: LibraryChapter;
    match: ExtensionMatch | null;
    sourceName: string;
  } | null>(null);
  const [extensionChooserItem, setExtensionChooserItem] = useState<LibraryItem | null>(null);
  const [installedExtensions, setInstalledExtensions] = useState<InstalledExtension[]>(() =>
    getInstalledExtensions(source === 'video' ? 'anime' : 'manga')
  );

  // Modal de Favoritos e Gerenciamento de Tags
  const [favoriteModalItem, setFavoriteModalItem] = useState<LibraryItem | null>(null);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);

  useEffect(() => {
    const update = () => setInstalledExtensions(getInstalledExtensions(source === 'video' ? 'anime' : 'manga'));
    window.addEventListener('extensions:updated', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('extensions:updated', update);
      window.removeEventListener('storage', update);
    };
  }, [source]);

  // Carrega a biblioteca do Electron ou localStorage
  const loadLibraryData = useCallback(async () => {
    setLoading(true);
    let loadedItems: LibraryItem[] = [];
    let loadedCategories: string[] = [];

    // 1. Tenta carregar do disco físico do Electron
    if (window.electronAPI?.loadLibrary) {
      try {
        const res = await window.electronAPI.loadLibrary(source);
        if (res.success && res.data?.entries) {
          loadedItems = res.data.entries;
          loadedCategories = res.data.categories || [];
        }
      } catch (err) {
        console.warn('Falha ao carregar do Electron, usando fallback:', err);
      }
    }

    // 2. Fallback para localStorage se não houver no Electron
    if (loadedItems.length === 0) {
      try {
        const raw = localStorage.getItem(`${source}_library`);
        if (raw) {
          loadedItems = JSON.parse(raw);
        }
        const catsRaw = localStorage.getItem(`${source}_categories`);
        if (catsRaw) {
          loadedCategories = JSON.parse(catsRaw);
        }
      } catch (e) {
        console.warn('Erro ao ler localStorage:', e);
      }
    }

    // 3. Mescla progresso salvo
    try {
      const progRaw = localStorage.getItem(`${source}_progress`);
      if (progRaw) {
        const progressMap: Record<string, any> = JSON.parse(progRaw);
        loadedItems = loadedItems.map((item) => {
          const chaps = (item.chapters || []).map((ch) => {
            const p = progressMap[ch.url];
            return p ? { ...ch, read: !!p.read, bookmark: !!p.bookmark, lastPageRead: p.lastPageRead ?? ch.lastPageRead } : ch;
          });
          return {
            ...item,
            chapters: chaps,
            totalChapters: chaps.length,
            readChapters: chaps.filter((c) => c.read).length,
          };
        });
      }
    } catch {
      /* ignore */
    }

    // Deriva lista única de categorias a partir de loadedCategories + categorias existentes em loadedItems
    const EXCLUDED_CATEGORIES = new Set([
      'todos',
      'todas',
      'completos',
      'planejo ler',
      'planejo assistir',
      'recomendados',
      'recomentados',
    ]);

    const derivedCats = new Set<string>();
    for (const cat of loadedCategories) {
      if (cat && typeof cat === 'string' && cat.trim() && !EXCLUDED_CATEGORIES.has(cat.toLowerCase().trim())) {
        derivedCats.add(cat.trim());
      }
    }

    for (const item of loadedItems) {
      if (Array.isArray(item.categories)) {
        for (const cat of item.categories) {
          if (cat && typeof cat === 'string' && cat.trim() && !EXCLUDED_CATEGORIES.has(cat.toLowerCase().trim())) {
            derivedCats.add(cat.trim());
          }
        }
      }
    }

    const cleanCategories = Array.from(derivedCats);
    setItems(loadedItems);
    setCategories(cleanCategories);
    try {
      localStorage.setItem(`${source}_categories`, JSON.stringify(cleanCategories));
    } catch {}
    setLoading(false);
  }, [source]);

  // Reseta seleção de categoria e busca ao alternar entre mangá e vídeo
  useEffect(() => {
    setSelectedCategory('all');
    setSearchQuery('');
    setStatusFilter('all');
    setSelectedItem(null);
  }, [source]);

  useEffect(() => {
    loadLibraryData();

    const handleBackupApplied = (e: any) => {
      if (!e.detail || e.detail.source === source) {
        loadLibraryData();
      }
    };
    const handleLibraryUpdated = () => loadLibraryData();

    window.addEventListener('backup:applied', handleBackupApplied);
    window.addEventListener('manga:library-updated', handleLibraryUpdated);
    window.addEventListener('video:library-updated', handleLibraryUpdated);
    window.addEventListener('storage', loadLibraryData);
    return () => {
      window.removeEventListener('backup:applied', handleBackupApplied);
      window.removeEventListener('manga:library-updated', handleLibraryUpdated);
      window.removeEventListener('video:library-updated', handleLibraryUpdated);
      window.removeEventListener('storage', loadLibraryData);
    };
  }, [loadLibraryData, source]);

  // Progresso salvo pelos leitores/players: aplica sem recarregar tudo do disco
  useEffect(() => {
    const onProgress = (e: any) => {
      if (e?.detail?.source && e.detail.source !== source) return;
      setItems((prev) =>
        prev.map((item) => {
          const chaps = mergeChapterProgress(item.chapters || [], source);
          return { ...item, chapters: chaps, readChapters: chaps.filter((c) => c.read).length };
        })
      );
      setSelectedItem((prev) => {
        if (!prev) return prev;
        const chaps = mergeChapterProgress(prev.chapters || [], source);
        return { ...prev, chapters: chaps, readChapters: chaps.filter((c) => c.read).length };
      });
    };
    window.addEventListener(PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(PROGRESS_EVENT, onProgress);
  }, [source]);

  useEffect(() => {
    try {
      localStorage.setItem(`tp_library_sort_${source}`, sortBy);
    } catch {
      /* ignore */
    }
  }, [sortBy, source]);

  // Esc fecha o modal de detalhes
  useEffect(() => {
    if (!selectedItem || !isTabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedItem, isTabActive]);

  // Última atividade por obra (para ordenar por "lidos recentemente")
  const lastActivity = useMemo(() => {
    const map = getProgressMap(source);
    const out: Record<string, number> = {};
    for (const item of items) {
      let max = 0;
      for (const ch of item.chapters || []) {
        const ts = map[ch.url]?.updatedAt || 0;
        if (ts > max) max = ts;
      }
      out[item.url] = max;
    }
    return out;
  }, [items, source]);

  // Contagem por categoria e contagem de itens sem categoria
  const { categoryCounts, uncategorizedCount } = useMemo(() => {
    const counts: Record<string, number> = {};
    let uncategorized = 0;
    for (const item of items) {
      const cats = realCategories(item.categories);
      if (cats.length === 0) {
        uncategorized++;
      } else {
        for (const cat of cats) {
          counts[cat] = (counts[cat] || 0) + 1;
        }
      }
    }
    return { categoryCounts: counts, uncategorizedCount: uncategorized };
  }, [items]);

  // Filtro e Ordenação
  const filteredItems = useMemo(() => {
    return items
      .filter((item) => {
        // Categoria normalizada
        if (selectedCategory !== 'all') {
          const itemCats = realCategories(item.categories);
          if (selectedCategory === '__uncategorized__') {
            if (itemCats.length > 0) return false;
          } else {
            const normSelected = selectedCategory.trim().toLowerCase();
            const hasMatch = itemCats.some((c) => c.trim().toLowerCase() === normSelected);
            if (!hasMatch) return false;
          }
        }

        // Status de Leitura
        const total = item.chapters?.length || item.totalChapters || 0;
        const read = item.chapters?.filter((c) => c.read).length ?? item.readChapters ?? 0;

        if (statusFilter === 'reading' && (read === 0 || read >= total)) return false;
        if (statusFilter === 'unread' && read > 0) return false;
        if (statusFilter === 'completed' && (total === 0 || read < total)) return false;

        // Busca: vários termos separados por vírgula, todos precisam bater (título, autor, gêneros, tags)
        if (searchTerms.length && !matchesAll(item as any, searchTerms)) return false;

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'recent_read') return (lastActivity[b.url] || 0) - (lastActivity[a.url] || 0);
        if (sortBy === 'date_added') return (b.dateAdded || 0) - (a.dateAdded || 0);
        if (sortBy === 'unread_desc') {
          const ua = (a.chapters?.length || 0) - (a.chapters?.filter((c) => c.read).length || 0);
          const ub = (b.chapters?.length || 0) - (b.chapters?.filter((c) => c.read).length || 0);
          return ub - ua;
        }
        if (sortBy === 'title_asc') return a.title.localeCompare(b.title);
        if (sortBy === 'title_desc') return b.title.localeCompare(a.title);
        if (sortBy === 'chapters_desc') {
          const ca = a.chapters?.length || a.totalChapters || 0;
          const cb = b.chapters?.length || b.totalChapters || 0;
          return cb - ca;
        }
        if (sortBy === 'chapters_asc') {
          const ca = a.chapters?.length || a.totalChapters || 0;
          const cb = b.chapters?.length || b.totalChapters || 0;
          return ca - cb;
        }
        return 0;
      });
  }, [items, selectedCategory, statusFilter, searchTerms, sortBy, lastActivity]);

  // Sugestões de tags a partir do que está na tela agora (respeita categoria, status e termos)
  const tagSuggestions = useMemo(() => topTags(filteredItems as any, searchTerms, 16).filter((s) => s.count < filteredItems.length || filteredItems.length <= 1), [filteredItems, searchTerms]);
  const addSearchTerm = (tag: string) => {
    setSearchQuery((q) => {
      const terms = parseTerms(q);
      if (terms.some((x) => x.toLowerCase() === tag.toLowerCase())) return q;
      return [...terms, tag].join(', ');
    });
  };
  const removeSearchTerm = (idx: number) => setSearchQuery((q) => parseTerms(q).filter((_, i) => i !== idx).join(', '));

  // Alternar lido/não lido de um capítulo
  const toggleChapterRead = (chapterUrl: string) => {
    if (!selectedItem) return;
    const updatedChapters = (selectedItem.chapters || []).map((c) =>
      c.url === chapterUrl ? { ...c, read: !c.read } : c
    );
    const updatedItem = {
      ...selectedItem,
      chapters: updatedChapters,
      readChapters: updatedChapters.filter((c) => c.read).length,
    };

    setSelectedItem(updatedItem);
    setItems((prev) => prev.map((it) => (it.url === updatedItem.url ? updatedItem : it)));

    // Atualiza progress em localStorage
    try {
      const progRaw = localStorage.getItem(`${source}_progress`);
      const progressMap: Record<string, any> = progRaw ? JSON.parse(progRaw) : {};
      const targetCh = updatedChapters.find((c) => c.url === chapterUrl);
      if (targetCh) {
        progressMap[chapterUrl] = {
          read: targetCh.read,
          bookmark: targetCh.bookmark,
          lastPageRead: targetCh.lastPageRead,
          lastSecondSeen: targetCh.lastSecondSeen,
        };
        localStorage.setItem(`${source}_progress`, JSON.stringify(progressMap));
      }
    } catch {
      /* ignore */
    }
  };

  // Marcar todos os capítulos como lidos/não lidos
  const setAllChaptersReadState = (readState: boolean) => {
    if (!selectedItem) return;
    const updatedChapters = (selectedItem.chapters || []).map((c) => ({
      ...c,
      read: readState,
    }));
    const updatedItem = {
      ...selectedItem,
      chapters: updatedChapters,
      readChapters: readState ? updatedChapters.length : 0,
    };

    setSelectedItem(updatedItem);
    setItems((prev) => prev.map((it) => (it.url === updatedItem.url ? updatedItem : it)));

    try {
      const progRaw = localStorage.getItem(`${source}_progress`);
      const progressMap: Record<string, any> = progRaw ? JSON.parse(progRaw) : {};
      for (const c of updatedChapters) {
        progressMap[c.url] = { ...(progressMap[c.url] || {}), read: readState };
      }
      localStorage.setItem(`${source}_progress`, JSON.stringify(progressMap));
    } catch {
      /* ignore */
    }
  };

  // Extrai UUID do MangaDex se aplicável
  const extractMangaDexChapterId = (chapUrl: string): string | null => {
    if (!chapUrl) return null;
    const match = chapUrl.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    return match ? match[0] : null;
  };

  // Identifica próximo capítulo a ler na obra aberta (ou capítulo inicial único para obras de backup/locais)
  const nextChapterToRead = useMemo(() => {
    if (!selectedItem) return null;
    const chaps = selectedItem.chapters && selectedItem.chapters.length > 0
      ? selectedItem.chapters
      : selectedItem.url
      ? [
          {
            url: selectedItem.url,
            name: selectedItem.title || (isManga ? 'Capítulo Completo / Galeria' : 'Episódio Completo'),
            number: 1,
            read: false,
            bookmark: false,
            lastPageRead: 0,
            lastSecondSeen: 0,
            lastModifiedAt: Date.now(),
          },
        ]
      : [];

    if (chaps.length === 0) return null;
    const sorted = [...chaps].sort((a, b) => (a.number || 0) - (b.number || 0));
    const firstUnread = sorted.find((c) => !c.read);
    return firstUnread || sorted[0];
  }, [selectedItem, isManga]);

  // Marca capítulo como lido e persiste
  const markChapterRead = (chapter: LibraryChapter, manga: LibraryItem) => {
    const updatedChapters = (manga.chapters || []).map((c) =>
      c.url === chapter.url ? { ...c, read: true } : c
    );
    const updatedItem = {
      ...manga,
      chapters: updatedChapters,
      readChapters: updatedChapters.filter((c) => c.read).length,
    };
    setSelectedItem(updatedItem);
    setItems((prev) => prev.map((it) => (it.url === updatedItem.url ? updatedItem : it)));

    try {
      const progRaw = localStorage.getItem(`${source}_progress`);
      const progressMap: Record<string, any> = progRaw ? JSON.parse(progRaw) : {};
      progressMap[chapter.url] = {
        ...(progressMap[chapter.url] || {}),
        read: true,
        lastPageRead: chapter.lastPageRead || 1,
      };
      localStorage.setItem(`${source}_progress`, JSON.stringify(progressMap));
    } catch { /* ignore */ }
  };

  // Contexto de capítulos para navegação anterior/próximo dentro do leitor
  const buildChapterContext = (manga: LibraryItem, chapterUrl: string, sourceName: string) => ({
    chapters: (manga.chapters || []).map((c) => ({ url: c.url, name: c.name, number: c.number })),
    currentUrl: chapterUrl,
    mangaUrl: manga.url,
    mangaTitle: manga.title,
    sourceName,
  });

  // Ação principal de abrir capítulo — integrada com extensionRegistry
  const handleOpenChapter = async (chapter: LibraryChapter, manga: LibraryItem) => {
    if (loadingChapterUrl) return;
    setLoadingChapterUrl(chapter.url);

    const chapTitle = `${manga.title} - ${chapter.name || (isManga ? t('Capítulo {n}', { n: chapter.number }) : t('Episódio {n}', { n: chapter.number }))}`;
    const mangaSourceName = manga.sourceName || '';

    if (!isManga) {
      // Abre o player nativo; o episódio é marcado como visto ao chegar perto do fim
      openVideoEpisode(manga, chapter, onOpenTab);
      updateChapterProgress('video', { [chapter.url]: {} }, { silent: true });
      setSelectedItem(null);
      setLoadingChapterUrl(null);
      return;
    }

    const openReader = (pages: any[]) => {
      onOpenTab?.('manga-reader', chapTitle, {
        pages,
        initialPageIndex: chapter.lastPageRead && !chapter.read ? Math.max(0, chapter.lastPageRead - 1) : 0,
        title: chapTitle,
        chapterUrl: chapter.url,
        chapterContext: buildChapterContext(manga, chapter.url, mangaSourceName),
      });
      setSelectedItem(null);
    };

    try {
      // 1. Tenta extrair páginas nativas (MangaDex At-Home ou extrator Electron)
      const res = await loadChapterPages(chapter.url, manga.url, mangaSourceName);
      if (res.success && res.data && res.data.pages.length > 0) {
        openReader(res.data.pages);
        return;
      }

      // 2. Se a fonte não estiver instalada nos repositórios, exibe prompt
      if (mangaSourceName && !isExtensionInstalled(mangaSourceName)) {
        const match = findExtensionInRepos(mangaSourceName);
        if (match) {
          setExtensionPrompt({ manga, chapter, match, sourceName: mangaSourceName });
          return;
        }
      }

      // 3. Abre a tela de detalhes da obra (lista de capítulos)
      onOpenTab?.('manga-detail', manga.title, { manga, initialExtension: mangaSourceName });
      setSelectedItem(null);
    } catch {
      onOpenTab?.('manga-detail', manga.title, { manga, initialExtension: mangaSourceName });
      setSelectedItem(null);
    } finally {
      setLoadingChapterUrl(null);
    }
  };

  // Callback quando o usuário confirma instalação de extensão no prompt
  const handleInstallAndOpen = async (prompt: NonNullable<typeof extensionPrompt>) => {
    const { manga, chapter, match } = prompt;
    const domain = match?.baseUrl || resolveSourceBaseUrl(prompt.sourceName, manga.url);

    if (match && domain) {
      registerExtension({
        pkg: match.extension.pkg,
        name: match.extension.name,
        sourceName: match.sourceName,
        lang: match.extension.lang,
        baseUrl: domain,
        repoUrl: match.repoUrl,
        installedAt: Date.now(),
      });
    } else if (domain) {
      registerExtension({
        pkg: prompt.sourceName.toLowerCase().replace(/\s+/g, '.'),
        name: prompt.sourceName,
        sourceName: prompt.sourceName,
        lang: 'all',
        baseUrl: domain,
        installedAt: Date.now(),
      });
    }

    setExtensionPrompt(null);

    // Tenta abrir as páginas nativas ou abre a tela nativa do mangá (sem webview)
    const res = await loadChapterPages(chapter.url, manga.url, prompt.sourceName);
    if (res.success && res.data && res.data.pages.length > 0) {
      const chapTitle = `${manga.title} - ${chapter.name || t('Capítulo {n}', { n: chapter.number })}`;
      onOpenTab?.('manga-reader', chapTitle, {
        pages: res.data.pages,
        initialPageIndex: chapter.lastPageRead && !chapter.read ? Math.max(0, chapter.lastPageRead - 1) : 0,
        title: chapTitle,
        chapterUrl: chapter.url,
        chapterContext: buildChapterContext(manga, chapter.url, prompt.sourceName),
      });
      setSelectedItem(null);
    } else {
      onOpenTab?.('manga-detail', manga.title, {
        manga,
        initialExtension: prompt.sourceName,
      });
      setSelectedItem(null);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-fg-2 select-none overflow-hidden">
      {/* Barra de ferramentas: busca, categorias, status e ordenação */}
      {items.length > 0 && (
        <div className="flex flex-col gap-2 px-4 pt-3 pb-2.5 bg-canvas border-b border-line-subtle flex-shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isManga ? t('Buscar por título, autor ou tags (ex.: Seinen, Monster)') : t('Buscar por título ou tags (ex.: Ação, Isekai)')}
                title={t('Separe por vírgula para combinar: todas as palavras precisam bater')}
                className="w-full h-8 bg-surface border border-line-subtle focus:border-accent rounded-md pl-8 pr-7 text-[12.5px] text-fg placeholder-fg-muted outline-none transition-colors"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg cursor-pointer"
                  aria-label={t('Limpar busca')}
                >
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 ml-auto">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="h-8 bg-surface border border-line-subtle hover:border-line text-fg rounded-md px-2 text-[12.5px] outline-none cursor-pointer focus:border-accent"
                aria-label={t('Filtrar por status')}
              >
                <option value="all">{t('Todos os status')}</option>
                <option value="reading">{isManga ? t('Lendo') : t('Assistindo')}</option>
                <option value="unread">{isManga ? t('Não lidos') : t('Não assistidos')}</option>
                <option value="completed">{t('Concluídos')}</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="h-8 bg-surface border border-line-subtle hover:border-line text-fg rounded-md px-2 text-[12.5px] outline-none cursor-pointer focus:border-accent"
                aria-label={t('Ordenar')}
              >
                <option value="default">{t('Ordem padrão')}</option>
                <option value="recent_read">{isManga ? t('Lidos recentemente') : t('Vistos recentemente')}</option>
                <option value="date_added">{t('Adicionados recentemente')}</option>
                <option value="unread_desc">{isManga ? t('Mais não lidos') : t('Mais não vistos')}</option>
                <option value="title_asc">{t('Título (A-Z)')}</option>
                <option value="title_desc">{t('Título (Z-A)')}</option>
                <option value="chapters_desc">{isManga ? t('Mais capítulos') : t('Mais episódios')}</option>
                <option value="chapters_asc">{isManga ? t('Menos capítulos') : t('Menos episódios')}</option>
              </select>

              <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-line-subtle bg-surface" role="group" aria-label={t('Exibição')}>
                {([
                  ['grid', <LayoutGrid key="g" size={14} />, t('Grade')],
                  ['compact', <Grid3x3 key="c" size={14} />, t('Grade compacta')],
                  ['list', <List key="l" size={14} />, t('Lista')],
                ] as const).map(([mode, icon, label]) => (
                  <button
                    key={mode}
                    type="button"
                    title={label}
                    aria-label={label}
                    aria-pressed={displayMode === mode}
                    onClick={() => setDisplayMode(mode)}
                    className={`h-7 w-7 inline-flex items-center justify-center rounded cursor-pointer transition-colors ${
                      displayMode === mode ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg hover:bg-subtle'
                    }`}
                  >
                    {icon}
                  </button>
                ))}
              </div>
              {displayMode !== 'list' && (
                <input
                  type="range"
                  min={110}
                  max={230}
                  step={10}
                  value={coverSize}
                  onChange={(e) => setCoverSize(Number(e.target.value))}
                  className="w-20 h-1 cursor-pointer"
                  title={t('Tamanho das capas')}
                  aria-label={t('Tamanho das capas')}
                />
              )}

              <span className="text-[12px] text-fg-muted tabular-nums whitespace-nowrap">
                {tn(filteredItems.length, '{n} obra', '{n} obras')}
              </span>
            </div>
          </div>

          {(categories.some((c) => !isImplicitCategory(c)) || uncategorizedCount > 0) && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none" role="tablist" aria-label={t('Categorias')}>
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`h-7 px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                  selectedCategory === 'all'
                    ? 'bg-accent/15 text-fg border-accent/40'
                    : 'border-line-subtle text-fg-muted hover:text-fg hover:bg-subtle'
                }`}
              >
                {t('Todas')} <span className="opacity-60 tabular-nums">{items.length}</span>
              </button>
              {categories.filter((cat) => !isImplicitCategory(cat)).map((cat, idx) => {
                const count = categoryCounts[cat] || 0;
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setSelectedCategory(isSelected ? 'all' : cat)}
                    className={`h-7 px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-accent/15 text-fg border-accent/40'
                        : 'border-line-subtle text-fg-muted hover:text-fg hover:bg-subtle'
                    }`}
                    title={isSelected ? t('Remover filtro {cat}', { cat: categoryLabel(cat) }) : t('Filtrar por {cat}', { cat: categoryLabel(cat) })}
                  >
                    {categoryLabel(cat)} <span className="opacity-60 tabular-nums">{count}</span>
                  </button>
                );
              })}
              {uncategorizedCount > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory(selectedCategory === '__uncategorized__' ? 'all' : '__uncategorized__')}
                  className={`h-7 px-3 rounded-full text-[12px] font-medium whitespace-nowrap transition-colors cursor-pointer border ${
                    selectedCategory === '__uncategorized__'
                      ? 'bg-accent/15 text-fg border-accent/40'
                      : 'border-line-subtle text-fg-muted hover:text-fg hover:bg-subtle'
                  }`}
                >
                  {t('Sem categoria')} <span className="opacity-60 tabular-nums">{uncategorizedCount}</span>
                </button>
              )}
            </div>
          )}

          {(searchTerms.length > 0 || tagSuggestions.length > 0) && (
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none" aria-label={t('Tags')}>
              <Tag size={12} className="text-fg-muted shrink-0" aria-hidden />
              {searchTerms.map((term, i) => (
                <button
                  key={`term-${i}-${term}`}
                  type="button"
                  onClick={() => removeSearchTerm(i)}
                  className="h-6 pl-2.5 pr-1.5 rounded-full text-[11.5px] font-medium whitespace-nowrap inline-flex items-center gap-1 bg-accent text-accent-fg cursor-pointer"
                  title={t('Remover "{tag}" da busca', { tag: term })}
                >
                  {term} <X size={11} />
                </button>
              ))}
              {tagSuggestions.map((s) => (
                <button
                  key={`sug-${s.tag}`}
                  type="button"
                  onClick={() => addSearchTerm(s.tag)}
                  className="h-6 px-2.5 rounded-full text-[11.5px] whitespace-nowrap border border-line-subtle text-fg-muted hover:text-fg hover:border-accent/50 hover:bg-subtle cursor-pointer"
                  title={t('Filtrar também por "{tag}"', { tag: s.tag })}
                >
                  {s.tag} <span className="opacity-60 tabular-nums">{s.count}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grade de Obras ou Tela Vazia */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }} aria-busy="true">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="aspect-[2/3] rounded-lg bg-subtle" />
                <div className="h-3 mt-2 rounded bg-subtle w-4/5" />
                <div className="h-2.5 mt-1.5 rounded bg-subtle/70 w-1/2" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center max-w-md mx-auto p-6">
            <div className="w-16 h-16 rounded-2xl bg-subtle flex items-center justify-center text-accent mb-4">
              {isManga ? <BookOpen size={30} /> : <Film size={30} />}
            </div>
            <h3 className="text-base font-semibold text-fg mb-1.5">
              {isManga ? t('Sua biblioteca de mangás está vazia') : t('Sua biblioteca de animes está vazia')}
            </h3>
            <p className="text-[13px] text-fg-muted mb-6 leading-relaxed">
              {t('Importe um backup do {app} (.tachibk) para trazer suas obras, capítulos e categorias — ou explore o catálogo online e favorite o que gostar.', {
                app: isManga ? t('Mihon ou Tachiyomi') : 'Aniyomi',
              })}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              {onGoToBackup && (
                <button
                  type="button"
                  onClick={onGoToBackup}
                  className="inline-flex items-center gap-2 h-9 px-4 bg-accent hover:bg-accent-hover text-accent-fg text-[13px] font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  <Upload size={15} />
                  <span>{t('Importar backup')}</span>
                </button>
              )}
              {onGoToExplore && (
                <button
                  type="button"
                  onClick={onGoToExplore}
                  className="inline-flex items-center gap-2 h-9 px-4 bg-subtle hover:bg-elevated text-fg text-[13px] font-medium rounded-lg transition-colors cursor-pointer"
                >
                  <Sparkles size={15} />
                  <span>{t('Explorar catálogo')}</span>
                </button>
              )}
            </div>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <Search size={28} className="text-fg-muted" />
            <p className="text-[13px] text-fg-muted">{t('Nenhuma obra encontrada com os filtros atuais.')}</p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
                setSelectedCategory('all');
              }}
              className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium cursor-pointer"
            >
              {t('Limpar filtros')}
            </button>
          </div>
        ) : (
          <div
            className={displayMode === 'list' ? 'flex flex-col gap-1 max-w-5xl' : displayMode === 'compact' ? 'grid gap-2' : 'grid gap-x-4 gap-y-5'}
            style={displayMode === 'list' ? undefined : { gridTemplateColumns: `repeat(auto-fill, minmax(${displayMode === 'compact' ? Math.round(coverSize * 0.8) : coverSize}px, 1fr))` }}
          >
            {filteredItems.map((item, idx) => {
              const totalCaps = item.chapters?.length || item.totalChapters || 0;
              const readCaps = item.chapters?.filter((c) => c.read).length ?? item.readChapters ?? 0;
              const unread = Math.max(0, totalCaps - readCaps);
              const isCompleted = totalCaps > 0 && readCaps >= totalCaps;
              const pct = totalCaps > 0 ? Math.round((readCaps / totalCaps) * 100) : 0;

              const openItem = () => {
                if (!isManga) {
                  onOpenTab?.('anime-detail', item.title, { anime: item });
                  return;
                }
                if ((item.sourceName || item.source || '').toLowerCase().includes('nhentai')) {
                  const matchId = item.url.match(/\/(?:g|galleries)\/(\d+)/);
                  const galleryId = matchId ? parseInt(matchId[1], 10) : undefined;
                  onOpenTab?.('nhentai-reader', item.title, {
                    id: galleryId,
                    title: item.title,
                    media_id: (item as any).media_id,
                    images: (item as any).images,
                  });
                  return;
                }
                onOpenTab?.('manga-detail', item.title, {
                  manga: item,
                  initialExtension: item.sourceName || item.source,
                });
              };

              if (displayMode === 'list') {
                return (
                  <div
                    key={`${item.url}-${idx}`}
                    role="button"
                    tabIndex={0}
                    onClick={openItem}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openItem();
                      }
                    }}
                    className="group flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-surface cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
                  >
                    <div className="w-10 h-14 rounded-md overflow-hidden bg-subtle shrink-0 ring-1 ring-line-subtle">
                      {item.cover && <img src={item.cover} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-medium text-fg truncate group-hover:text-accent">{item.title}</div>
                      <div className="text-[11.5px] text-fg-muted truncate">
                        {(isManga ? [item.author, item.sourceName || item.source] : [item.author && item.author !== 'AniList Community' ? item.author : '']).filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {totalCaps > 0 && (
                      <div className="w-32 shrink-0 hidden md:block">
                        <div className="h-1 rounded-full bg-line-subtle overflow-hidden">
                          <div className={`h-full ${isCompleted ? 'bg-success-fg' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )}
                    <span className="text-[12px] text-fg-muted tabular-nums w-20 text-right shrink-0">
                      {readCaps}/{totalCaps}
                    </span>
                    {unread > 0 && !isCompleted && (
                      <span className="min-w-6 h-5 px-1.5 rounded-md bg-accent text-accent-fg text-[11px] font-semibold tabular-nums inline-flex items-center justify-center shrink-0">{unread}</span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFavoriteModalItem(item);
                        setIsFavoriteModalOpen(true);
                      }}
                      className={`p-1.5 rounded-md cursor-pointer shrink-0 ${item.favorite ? 'text-rose-400' : 'text-fg-muted opacity-0 group-hover:opacity-100 hover:text-fg'}`}
                      aria-label={t('Favoritar')}
                    >
                      <Heart size={14} fill={item.favorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                );
              }

              return (
                <div
                  key={`${item.url}-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={openItem}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openItem();
                    }
                  }}
                  title={item.title}
                  className="group flex flex-col cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  {/* Capa */}
                  <div className="w-full aspect-[2/3] bg-subtle relative overflow-hidden rounded-lg ring-1 ring-line-subtle group-hover:ring-accent/60 transition-shadow shadow-xs">
                    {item.cover ? (
                      <img
                        src={item.cover}
                        alt=""
                        loading="lazy"
                        draggable={false}
                        className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                        onError={(e) => {
                          const img = e.currentTarget;
                          const showFallback = () => {
                            img.style.display = 'none';
                            const fb = img.nextElementSibling as HTMLElement;
                            if (fb) fb.style.display = 'flex';
                          };
                          if (!img.dataset.retried && window.electronAPI?.resolveCover && item.cover) {
                            img.dataset.retried = 'true';
                            window.electronAPI
                              .resolveCover(item.cover, item.sourceName)
                              .then((res) => {
                                if (res.success && res.url) {
                                  img.src = res.url;
                                  img.style.display = 'block';
                                } else showFallback();
                              })
                              .catch(showFallback);
                            return;
                          }
                          showFallback();
                        }}
                      />
                    ) : null}
                    <div
                      className="w-full h-full flex-col items-center justify-center p-3 text-center bg-linear-to-b from-subtle to-canvas text-fg-muted"
                      style={{ display: item.cover ? 'none' : 'flex' }}
                    >
                      {isManga ? <BookOpen size={26} className="text-accent/60 mb-2" /> : <Film size={26} className="text-accent/60 mb-2" />}
                      <span className="text-[11px] line-clamp-3 text-fg-2 font-medium leading-tight">{item.title}</span>
                    </div>

                    {/* Selo: não lidos / concluído */}
                    {totalCaps > 0 && (
                      <div className="absolute top-1.5 left-1.5 flex items-center gap-1">
                        {isCompleted ? (
                          <span className="px-1.5 h-5 inline-flex items-center rounded-md text-[10.5px] font-semibold bg-success text-white shadow-xs" title={isManga ? t('Tudo lido') : t('Tudo visto')}>
                            <CheckCircle2 size={11} className="mr-0.5" /> {isManga ? t('Lido') : t('Visto')}
                          </span>
                        ) : (
                          <span
                            className={`px-1.5 h-5 inline-flex items-center rounded-md text-[10.5px] font-semibold tabular-nums shadow-xs ${
                              readCaps > 0 ? 'bg-accent text-accent-fg' : 'bg-black/70 text-white'
                            }`}
                            title={isManga ? t('{unread} não lidos de {total}', { unread, total: totalCaps }) : t('{unread} não vistos de {total}', { unread, total: totalCaps })}
                          >
                            {unread}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Favorito / tags */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFavoriteModalItem(item);
                        setIsFavoriteModalOpen(true);
                      }}
                      className={`absolute top-1.5 right-1.5 w-7 h-7 inline-flex items-center justify-center rounded-full transition-all z-10 cursor-pointer ${
                        item.favorite
                          ? 'bg-rose-600 text-white'
                          : 'bg-black/60 text-white/80 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:bg-black/80'
                      }`}
                      title={item.favorite ? t('Favorito — gerenciar tags') : t('Favoritar')}
                      aria-label={item.favorite ? t('Gerenciar favorito') : t('Favoritar')}
                    >
                      <Heart size={13} fill={item.favorite ? 'currentColor' : 'none'} />
                    </button>

                    {displayMode === 'compact' && (
                      <div className="absolute inset-x-0 bottom-0 pt-8 pb-1.5 px-2 bg-linear-to-t from-black/90 via-black/50 to-transparent pointer-events-none">
                        <span className="text-[11.5px] font-medium text-white line-clamp-2 leading-snug">{item.title}</span>
                      </div>
                    )}

                    {/* Barra de progresso */}
                    {pct > 0 && pct < 100 && (
                      <div className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
                        <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>

                  {/* Título e fonte */}
                  <div className={`pt-2 px-0.5 min-w-0 ${displayMode === 'compact' ? 'hidden' : ''}`}>
                    <h4 className="text-[12.5px] font-medium text-fg line-clamp-2 leading-snug group-hover:text-accent transition-colors">{item.title}</h4>
                    <p className="text-[11px] text-fg-muted truncate mt-0.5">
                      {isManga ? (
                        <>
                          {tMaybe(item.sourceName || item.source) || t('Mangá')}
                          {totalCaps > 0 && <span className="tabular-nums"> · {readCaps}/{totalCaps}</span>}
                        </>
                      ) : totalCaps > 0 ? (
                        <span className="tabular-nums">{t('{watched} de {total} vistos', { watched: readCaps, total: totalCaps })}</span>
                      ) : (
                        'Anime'
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Detalhes da Obra */}
      {selectedItem && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-surface border border-line rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Cabeçalho do Modal */}
            <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-canvas">
              <span className="font-semibold text-sm text-fg truncate pr-4">
                {selectedItem.title}
              </span>
              <button
                type="button"
                onClick={() => setSelectedItem(null)}
                aria-label={t('Fechar')}
                className="text-fg-muted hover:text-white p-1 rounded hover:bg-subtle transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 text-xs">
              {/* Informações Principais */}
              <div className="flex gap-4">
                <div className="w-28 h-40 rounded border border-line overflow-hidden bg-canvas flex-shrink-0 flex items-center justify-center relative">
                  {selectedItem.cover ? (
                    <img
                      src={selectedItem.cover}
                      alt={selectedItem.title}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const img = e.currentTarget;
                        if (!img.dataset.retried && window.electronAPI?.resolveCover && selectedItem.cover) {
                          img.dataset.retried = 'true';
                          window.electronAPI.resolveCover(selectedItem.cover, selectedItem.sourceName).then((res) => {
                            if (res.success && res.url) {
                              img.src = res.url;
                              img.style.display = 'block';
                              return;
                            }
                            img.style.display = 'none';
                            const fb = img.nextElementSibling as HTMLElement;
                            if (fb) fb.style.display = 'flex';
                          }).catch(() => {
                            img.style.display = 'none';
                            const fb = img.nextElementSibling as HTMLElement;
                            if (fb) fb.style.display = 'flex';
                          });
                          return;
                        }
                        img.style.display = 'none';
                        const fb = img.nextElementSibling as HTMLElement;
                        if (fb) fb.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-surface text-fg-muted"
                    style={{ display: selectedItem.cover ? 'none' : 'flex' }}
                  >
                    {isManga ? <BookOpen size={30} className="text-accent/60 mb-1" /> : <Film size={30} className="text-accent/60 mb-1" />}
                    <span className="text-[9px] text-fg-muted">{t('Sem capa')}</span>
                  </div>
                </div>

                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-base text-fg mb-1">
                      {selectedItem.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                      {selectedItem.author ? (
                        <p className="text-fg-2 flex items-center gap-1.5 text-xs">
                          <User size={12} className="text-accent" />
                          <span>{t('Autor:')} <strong className="text-fg font-medium">{selectedItem.author}</strong></span>
                        </p>
                      ) : (
                        <p className="text-fg-muted italic flex items-center gap-1.5 text-xs">
                          <User size={12} />
                          <span>{t('Autor não informado')}</span>
                        </p>
                      )}
                      {selectedItem.sourceName && (
                        <p className="text-fg-muted flex items-center gap-1.5 text-xs">
                          <Info size={12} className="text-cyan-400" />
                          <span>{t('Fonte:')} <strong className="text-fg-2 font-medium">{tMaybe(selectedItem.sourceName)}</strong></span>
                        </p>
                      )}
                    </div>
                    {selectedItem.categories && selectedItem.categories.length > 0 && (
                      <div className="mt-2.5">
                        <span className="text-[10px] text-fg-muted uppercase font-mono tracking-wider block mb-1">
                          {t('Categorias')}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {selectedItem.categories.map((cat, i) => (
                            <span
                              key={i}
                              className="bg-subtle border border-line text-cyan-300 text-[10px] px-2 py-0.5 rounded-full font-mono font-medium"
                            >
                              {categoryLabel(cat)}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Ações da Obra */}
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    {nextChapterToRead && (
                      <button
                        type="button"
                        disabled={loadingChapterUrl === nextChapterToRead.url}
                        onClick={() => handleOpenChapter(nextChapterToRead, selectedItem)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-success hover:bg-success-hover text-white rounded border border-success-hover text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                      >
                        {loadingChapterUrl === nextChapterToRead.url ? (
                          <>
                            <Loader2 size={13} className="animate-spin" />
                            <span>{t('Carregando...')}</span>
                          </>
                        ) : (
                          <>
                            <Play size={12} fill="currentColor" />
                            <span>
                              {selectedItem.chapters?.some((c) => c.read)
                                ? isManga
                                  ? t('Continuar Lendo: Cap. {ch}', { ch: nextChapterToRead.number || nextChapterToRead.name })
                                  : t('Continuar Assistindo: Ep. {ch}', { ch: nextChapterToRead.number || nextChapterToRead.name })
                                : isManga
                                ? t('Começar a Ler: Cap. {ch}', { ch: nextChapterToRead.number || nextChapterToRead.name })
                                : t('Assistir Agora: Ep. {ch}', { ch: nextChapterToRead.number || nextChapterToRead.name })}
                            </span>
                          </>
                        )}
                      </button>
                    )}

                    {isManga ? (
                      <button
                        type="button"
                        onClick={() => {
                          onOpenTab?.('manga-detail', selectedItem.title, { 
                            manga: selectedItem, 
                            initialExtension: selectedItem.sourceName || installedExtensions[0]?.sourceName 
                          });
                          setSelectedItem(null);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-accent-fg rounded border border-accent-hover text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                      >
                        <BookOpen size={13} />
                        <span>{t('Abrir em Nova Aba')}</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            const targetEp = nextChapterToRead || selectedItem.chapters?.[0];
                            if (targetEp) {
                              handleOpenChapter(targetEp, selectedItem);
                            }
                            setSelectedItem(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-accent hover:bg-accent-hover text-accent-fg rounded border border-accent-hover text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                        >
                          <Film size={13} />
                          <span>{t('Assistir no Player')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const epNum = nextChapterToRead?.number || 1;
                            const url = buildAnimeWatchWebUrl(selectedItem.title, epNum, selectedItem.sourceName);
                            onOpenTab?.('webview', t('Assistir: {name}', { name: selectedItem.title }), { url, initialUrl: url });
                            setSelectedItem(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-subtle hover:bg-elevated text-accent hover:text-white rounded border border-line text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                          title={t('Assistir através da Webview integrada')}
                        >
                          <Globe size={13} />
                          <span>{t('Assistir na Webview')}</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setFavoriteModalItem(selectedItem);
                        setIsFavoriteModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-subtle hover:bg-elevated text-rose-300 border border-line rounded text-xs font-semibold transition-colors cursor-pointer shadow-xs"
                      title={t('Gerenciar tags e status de favorito')}
                    >
                      <Heart size={13} fill={selectedItem.favorite ? 'currentColor' : 'none'} className={selectedItem.favorite ? 'text-rose-400' : ''} />
                      <span>{selectedItem.favorite ? t('Favoritado (Tags)') : t('Favoritar Obra')}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Gêneros */}
              {selectedItem.genres && selectedItem.genres.length > 0 && (
                <div>
                  <span className="text-[10px] text-fg-muted uppercase font-mono tracking-wider block mb-1">
                    {t('Gêneros / Tags')}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {selectedItem.genres.map((g, idx) => (
                      <span
                        key={idx}
                        className="bg-canvas text-fg-muted px-2 py-0.5 rounded text-[10px] border border-line"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sinopse */}
              {selectedItem.description && (
                <div className="bg-canvas p-3 rounded border border-line text-fg-muted leading-relaxed max-h-32 overflow-y-auto">
                  {selectedItem.description}
                </div>
              )}

              {/* Seção de Capítulos */}
              <div className="border border-line rounded-lg overflow-hidden bg-canvas">
                {/* Header de Capítulos */}
                <div className="px-3 py-2 bg-surface border-b border-line flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-fg">
                      {isManga ? t('Capítulos ({n})', { n: selectedItem.chapters?.length || 0 }) : t('Episódios ({n})', { n: selectedItem.chapters?.length || 0 })}
                    </span>
                    <span className="text-[11px] font-mono text-cyan-400">
                      {isManga
                        ? t('{n} lidos', { n: selectedItem.chapters?.filter((c) => c.read).length || 0 })
                        : t('{n} vistos', { n: selectedItem.chapters?.filter((c) => c.read).length || 0 })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAllChaptersReadState(true)}
                      className="text-[11px] text-accent hover:underline"
                    >
                      {isManga ? t('Marcar todos lidos') : t('Marcar todos vistos')}
                    </button>
                    <span className="text-line">|</span>
                    <button
                      type="button"
                      onClick={() => setAllChaptersReadState(false)}
                      className="text-[11px] text-fg-muted hover:underline"
                    >
                      {isManga ? t('Marcar não lidos') : t('Marcar não vistos')}
                    </button>
                    <span className="text-line">|</span>
                    <button
                      type="button"
                      onClick={() => setSortChaptersAsc(!sortChaptersAsc)}
                      className="inline-flex items-center gap-1 text-[11px] text-fg-muted hover:text-white"
                      title={t('Inverter ordem')}
                    >
                      <ArrowUpDown size={12} />
                      <span>{sortChaptersAsc ? t('Crescente') : t('Decrescente')}</span>
                    </button>
                  </div>
                </div>

                {/* Lista de Capítulos */}
                <div className="max-h-60 overflow-y-auto divide-y divide-line-subtle">
                  {(() => {
                    const chaps = [...(selectedItem.chapters || [])];
                    if (sortChaptersAsc) {
                      chaps.sort((a, b) => (a.number || 0) - (b.number || 0));
                    } else {
                      chaps.sort((a, b) => (b.number || 0) - (a.number || 0));
                    }

                    if (chaps.length === 0) {
                      return (
                        <div className="p-4 text-center text-fg-muted text-xs">
                          {t('Nenhum capítulo detalhado no backup.')}
                        </div>
                      );
                    }

                    return chaps.map((c, idx) => {
                      const isOpening = loadingChapterUrl === c.url;
                      return (
                        <div
                          key={`${c.url}-${idx}`}
                          onClick={() => handleOpenChapter(c, selectedItem)}
                          className={`px-3 py-2 flex items-center justify-between hover:bg-surface text-xs transition-colors group cursor-pointer ${
                            c.read ? 'text-fg-muted' : 'text-fg'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate mr-3 min-w-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleChapterRead(c.url);
                              }}
                              className="text-fg-muted hover:text-cyan-400 shrink-0"
                              title={c.read ? (isManga ? t('Marcar como não lido') : t('Marcar como não visto')) : (isManga ? t('Marcar como lido') : t('Marcar como visto'))}
                            >
                              {c.read ? (
                                <CheckCircle2 size={16} className="text-emerald-500" />
                              ) : (
                                <Circle size={16} />
                              )}
                            </button>
                            <span className="truncate font-medium group-hover:text-accent transition-colors" title={c.name}>
                              {c.name || (isManga ? t('Capítulo {n}', { n: c.number || idx + 1 }) : t('Episódio {n}', { n: c.number || idx + 1 }))}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0 text-[11px] font-mono">
                            {c.bookmark && (
                              <Bookmark size={13} className="text-warning" fill="currentColor" />
                            )}
                            {c.lastPageRead > 0 && (
                              <span className="text-fg-muted">{t('Pág {n}', { n: c.lastPageRead })}</span>
                            )}
                            <button
                              type="button"
                              disabled={isOpening}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenChapter(c, selectedItem);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded bg-subtle group-hover:bg-success text-fg-2 group-hover:text-white transition-colors text-[11px] font-semibold shrink-0 cursor-pointer"
                            >
                              {isOpening ? (
                                <>
                                  <Loader2 size={11} className="animate-spin" />
                                  <span>{t('Abrindo...')}</span>
                                </>
                              ) : (
                                <>
                                  <Play size={10} fill="currentColor" />
                                  <span>{isManga ? t('Ler') : t('Assistir')}</span>
                                </>
                              )}
                            </button>

                            {!isManga && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  const epNum = c.number || idx + 1;
                                  const url = buildAnimeWatchWebUrl(selectedItem.title, epNum, selectedItem.sourceName);
                                  onOpenTab?.('webview', t('Assistir: {title} Ep {n}', { title: selectedItem.title, n: epNum }), { url, initialUrl: url });
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface hover:bg-subtle text-accent hover:text-white border border-line transition-colors text-[11px] font-semibold shrink-0 cursor-pointer"
                                title={t('Assistir episódio na Webview')}
                              >
                                <Globe size={10} />
                                <span>Webview</span>
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Instalação de Extensão */}
      {extensionPrompt && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-150">
          <div className="bg-surface border border-line rounded-lg max-w-md w-full shadow-2xl">
            <div className="px-4 py-3 border-b border-line flex items-center justify-between bg-canvas">
              <span className="font-semibold text-sm text-fg">
                {extensionPrompt.match ? t('Instalar Extensão') : t('Fonte Não Encontrada')}
              </span>
              <button
                type="button"
                onClick={() => setExtensionPrompt(null)}
                aria-label={t('Fechar')}
                className="text-fg-muted hover:text-white p-1 rounded hover:bg-subtle transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <p className="text-fg-2">
                {t('A obra')} <strong className="text-fg">{extensionPrompt.manga.title}</strong> {t('pertence à fonte:')}
              </p>

              <div className="bg-canvas rounded border border-line p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-subtle border border-line flex items-center justify-center text-accent shrink-0">
                  <Download size={18} />
                </div>
                <div>
                  <p className="text-fg font-semibold text-sm">
                    {extensionPrompt.match?.extension.name || extensionPrompt.sourceName || t('Fonte Desconhecida')}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {extensionPrompt.match && (
                      <>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-fg-muted font-mono">
                          {extensionPrompt.match.extension.lang}
                        </span>
                        <span className="text-[10px] text-fg-muted">
                          v{extensionPrompt.match.extension.version}
                        </span>
                      </>
                    )}
                    {extensionPrompt.match?.baseUrl && (
                      <span className="text-[10px] text-cyan-400 font-mono">
                        {extensionPrompt.match.baseUrl}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {extensionPrompt.match ? (
                <p className="text-fg-muted leading-relaxed">
                  {t('Esta extensão foi encontrada nos repositórios. Ao instalar, você poderá ler capítulos desta fonte e navegar pelo website.')}
                </p>
              ) : (
                <div className="bg-warning/10 border border-warning/30 rounded p-2.5 text-warning flex items-start gap-2">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  <p className="leading-relaxed">
                    {t('Esta fonte')} (<strong>{extensionPrompt.sourceName}</strong>) {t('não foi encontrada nos repositórios configurados.')}{' '}
                    {t('Você pode adicionar o repositório correto na aba de Repositórios ou tentar abrir o mangá diretamente.')}
                  </p>
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-line flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setExtensionPrompt(null)}
                className="px-3 py-1.5 text-xs text-fg-muted hover:text-fg rounded border border-line hover:bg-subtle transition-colors"
              >
                {t('Cancelar')}
              </button>
              {onGoToRepos && !extensionPrompt.match && (
                <button
                  type="button"
                  onClick={() => {
                    setExtensionPrompt(null);
                    setSelectedItem(null);
                    onGoToRepos();
                  }}
                  className="px-3 py-1.5 text-xs text-accent hover:text-white rounded border border-line hover:bg-subtle transition-colors font-medium"
                >
                  {t('Ir para Repositórios')}
                </button>
              )}
              <button
                type="button"
                onClick={() => handleInstallAndOpen(extensionPrompt)}
                className="px-3.5 py-1.5 text-xs bg-success hover:bg-success-hover text-white rounded font-semibold transition-colors flex items-center gap-1.5"
              >
                <Download size={12} />
                <span>{extensionPrompt.match ? t('Instalar e Abrir') : t('Tentar Abrir Mesmo Assim')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Seletor de Extensão para Abrir Obra */}
      {extensionChooserItem && (
        <div className="fixed inset-0 bg-black/75 flex items-center justify-center p-4 z-[60] animate-in fade-in duration-150">
          <div className="bg-surface border border-line rounded-xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col">
            <div className="px-5 py-3.5 border-b border-line flex items-center justify-between bg-canvas">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-accent" />
                <span className="font-semibold text-sm text-fg">
                  {t('Escolha como deseja abrir a obra')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setExtensionChooserItem(null)}
                aria-label={t('Fechar')}
                className="text-fg-muted hover:text-white p-1 rounded hover:bg-subtle transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="flex items-center gap-3 bg-canvas p-3 rounded-lg border border-line">
                {extensionChooserItem.cover ? (
                  <img
                    src={extensionChooserItem.cover}
                    alt={extensionChooserItem.title}
                    className="w-12 h-16 object-cover rounded bg-surface"
                    onError={(e) => {
                      const img = e.currentTarget;
                      if (!img.dataset.retried && window.electronAPI?.resolveCover && extensionChooserItem.cover) {
                        img.dataset.retried = 'true';
                        window.electronAPI.resolveCover(extensionChooserItem.cover, extensionChooserItem.sourceName).then((res) => {
                          if (res.success && res.url) {
                            img.src = res.url;
                          }
                        }).catch(() => {});
                      }
                    }}
                  />
                ) : (
                  <div className="w-12 h-16 rounded bg-subtle flex items-center justify-center text-accent">
                    <BookOpen size={20} />
                  </div>
                )}
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-fg truncate">
                    {extensionChooserItem.title}
                  </h4>
                  <p className="text-xs text-fg-muted mt-0.5">
                    {tn(extensionChooserItem.chapters?.length || 0, '{n} capítulo', '{n} capítulos')} • {t('Origem:')}{' '}
                    <strong className="text-cyan-400">{extensionChooserItem.sourceName || t('Padrão')}</strong>
                  </p>
                </div>
              </div>

              <div>
                <span className="text-xs text-fg-muted font-medium block mb-2">
                  {t('Selecione a extensão instalada para ler esta obra:')}
                </span>
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {(() => {
                    const origNorm = (extensionChooserItem.sourceName || extensionChooserItem.source || '').toLowerCase().trim();
                    const sorted = [...installedExtensions].sort((a, b) => {
                      const aOrig = a.name.toLowerCase() === origNorm || a.sourceName.toLowerCase() === origNorm || (a.baseUrl && extensionChooserItem.url?.toLowerCase().includes(a.baseUrl.replace(/^https?:\/\//, '').toLowerCase()));
                      const bOrig = b.name.toLowerCase() === origNorm || b.sourceName.toLowerCase() === origNorm || (b.baseUrl && extensionChooserItem.url?.toLowerCase().includes(b.baseUrl.replace(/^https?:\/\//, '').toLowerCase()));
                      if (aOrig && !bOrig) return -1;
                      if (!aOrig && bOrig) return 1;
                      return 0;
                    });
                    return sorted.map((ext) => {
                      const isOriginal = (extensionChooserItem.sourceName || '').toLowerCase() === ext.name.toLowerCase() ||
                        (extensionChooserItem.sourceName || '').toLowerCase() === ext.sourceName.toLowerCase() ||
                        (ext.baseUrl && extensionChooserItem.url?.toLowerCase().includes(ext.baseUrl.replace(/^https?:\/\//, '').toLowerCase()));

                      return (
                      <div
                        key={ext.pkg}
                        onClick={() => {
                          onOpenTab?.('manga-detail', extensionChooserItem.title, {
                            manga: extensionChooserItem,
                            initialExtension: ext.sourceName || ext.name,
                          });
                          setExtensionChooserItem(null);
                        }}
                        className="flex items-center justify-between p-3 rounded-lg border border-line bg-canvas hover:border-accent hover:bg-subtle/50 cursor-pointer transition-all group"
                      >
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded bg-subtle border border-line flex items-center justify-center text-accent font-bold text-xs">
                            {ext.name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-fg group-hover:text-accent transition-colors">
                                {ext.name}
                              </span>
                              {isOriginal && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded bg-success/[0.13] text-success-fg border border-success/[0.27] font-medium">
                                  {t('Fonte da Obra')}
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-fg-muted">
                              {t('Idioma: {lang}', { lang: ext.lang })} • {ext.baseUrl || ext.pkg}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="px-3 py-1 rounded bg-success hover:bg-success-hover text-white text-xs font-semibold flex items-center gap-1 transition-colors shrink-0 shadow-xs"
                        >
                          <BookOpen size={12} />
                          <span>{t('Abrir')}</span>
                        </button>
                      </div>
                    );
                  });
                })()}
                </div>
              </div>
            </div>

            <div className="px-5 py-3 border-t border-line flex items-center justify-between bg-canvas">
              <button
                type="button"
                onClick={() => {
                  setSelectedItem(extensionChooserItem);
                  setExtensionChooserItem(null);
                }}
                className="text-xs text-fg-muted hover:text-fg transition-colors flex items-center gap-1"
              >
                <Info size={13} />
                <span>{t('Ver Detalhes do Backup')}</span>
              </button>

              <button
                type="button"
                onClick={() => setExtensionChooserItem(null)}
                className="px-3.5 py-1.5 text-xs text-fg-muted hover:text-fg rounded border border-line hover:bg-subtle transition-colors"
              >
                {t('Cancelar')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Favoritos e Gerenciamento de Tags */}
      <FavoriteTagModal
        isOpen={isFavoriteModalOpen}
        onClose={() => setIsFavoriteModalOpen(false)}
        manga={favoriteModalItem}
        source={source}
        onSaved={() => {
          loadLibraryData();
        }}
      />
    </div>
  );
};
