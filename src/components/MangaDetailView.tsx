// src/components/MangaDetailView.tsx
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  BookOpen,
  User,
  Info,
  Calendar,
  Heart,
  Play,
  Loader2,
  CheckCircle2,
  Circle,
  ArrowUpDown,
  Search,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  AlertCircle,
  RefreshCw,
  Globe
} from 'lucide-react';
import type { TabType } from '../types';
import type { LibraryItem, LibraryChapter } from './MihonLibrary';
import {
  getInstalledExtensions,
  resolveWorkUrl,
  type InstalledExtension,
} from '../api/extensionRegistry';
import { fetchChapterPages, loadLocalChapterPages, isLocalChapterPath, loadChapterPages } from '../api/chapterExtractor';
import { updateLibrary } from '../utils/libraryStore';
import { useDownloads, downloadChapter, deleteDownloadedChapter, downloadsAvailable } from '../utils/downloads';
import { toast, confirmDialog } from './Feedback';
import { Download, CheckCircle, Trash2, X as XIcon, HardDriveDownload } from 'lucide-react';
import { PROGRESS_EVENT, mergeChapterProgress, preserveChapterState, updateChapterProgress } from '../utils/progress';
import { fetchChapterList } from '../api/chapterList';
import { FavoriteTagModal } from './FavoriteTagModal';
import { workStatusLabel } from '../constants/labels';
import { AniListLink } from './AniListPanel';
import { t, tn, tMaybe } from '../i18n';

interface MangaDetailViewProps {
  manga: LibraryItem;
  initialExtension?: string;
  onOpenTab?: (type: TabType, title: string, data?: any) => void;
}

export const MangaDetailView: React.FC<MangaDetailViewProps> = ({
  manga,
  initialExtension,
  onOpenTab,
}) => {
  // Apenas extensões de mangá instaladas
  const [installedExtensions, setInstalledExtensions] = useState<InstalledExtension[]>(() =>
    getInstalledExtensions('manga')
  );

  const [isExtensionsExpanded, setIsExtensionsExpanded] = useState<boolean>(false);

  const originExtensionName = useMemo(() => {
    return (manga.sourceName || initialExtension || manga.source || '').trim();
  }, [manga.sourceName, initialExtension, manga.source]);

  // Encontra a extensão de origem onde a obra se encontra
  const originExt = useMemo(() => {
    const norm = originExtensionName.toLowerCase();
    const found = installedExtensions.find(
      (e) =>
        e.name.toLowerCase() === norm ||
        e.sourceName.toLowerCase() === norm ||
        e.pkg.toLowerCase() === norm ||
        (e.baseUrl && manga.url?.toLowerCase().includes(e.baseUrl.replace(/^https?:\/\//, '').toLowerCase()))
    );
    if (found) return found;
    return {
      name: originExtensionName || 'Fonte da Obra',
      sourceName: originExtensionName || 'Fonte da Obra',
      pkg: manga.source || 'origin_ext',
      lang: 'all',
      baseUrl: (() => {
        try {
          return manga.url?.startsWith('http') ? new URL(manga.url).origin : '';
        } catch {
          return '';
        }
      })(),
      versionName: '1.0',
      nsfw: false,
      apk: '',
      installedAt: Date.now(),
    } as InstalledExtension;
  }, [installedExtensions, originExtensionName, manga.url, manga.source]);

  // Identifica se a obra existe em outras extensões através da biblioteca do usuário
  const otherExtensionsWhereWorkExists = useMemo(() => {
    let lib: LibraryItem[] = [];
    try {
      const raw = localStorage.getItem('manga_library');
      if (raw) lib = JSON.parse(raw);
    } catch {}

    const titleNorm = manga.title.trim().toLowerCase();
    const otherSources = new Set<string>();

    for (const item of lib) {
      if (item.title && item.title.trim().toLowerCase() === titleNorm) {
        const sName = (item.sourceName || item.source || '').trim();
        if (
          sName &&
          sName.toLowerCase() !== originExt.name.toLowerCase() &&
          sName.toLowerCase() !== originExt.sourceName.toLowerCase()
        ) {
          otherSources.add(sName.toLowerCase());
        }
      }
    }

    if (otherSources.size === 0) return [];

    return installedExtensions.filter((ext) => {
      const n1 = ext.name.toLowerCase();
      const n2 = ext.sourceName.toLowerCase();
      return otherSources.has(n1) || otherSources.has(n2);
    });
  }, [manga.title, originExt, installedExtensions]);

  // Lista final de extensões: SEMPRE em 1º lugar a extensão onde a obra se encontra
  // e apenas outras extensões onde a obra comprovadamente se encontra
  const availableExtensions = useMemo(() => {
    const list: InstalledExtension[] = [originExt];
    for (const other of otherExtensionsWhereWorkExists) {
      if (other.pkg !== originExt.pkg && !list.some((e) => e.name.toLowerCase() === other.name.toLowerCase())) {
        list.push(other);
      }
    }
    return list;
  }, [originExt, otherExtensionsWhereWorkExists]);

  const [activeExtension, setActiveExtension] = useState<string>(
    originExt.sourceName || originExt.name
  );

  // Inicializa capítulos com os existentes ou com capítulo sintético inicial para permitir leitura imediata
  const [chapters, setChapters] = useState<LibraryChapter[]>(() => {
    if (manga.chapters && manga.chapters.length > 0) {
      return mergeChapterProgress(manga.chapters, 'manga');
    }
    if (manga.url) {
      return [
        {
          url: manga.url,
          name: manga.title || 'Capítulo Completo / Galeria',
          number: 1,
          read: false,
          bookmark: false,
          lastPageRead: 0,
          lastSecondSeen: 0,
          lastModifiedAt: Date.now(),
        },
      ];
    }
    return [];
  });

  const [chapterSearch, setChapterSearch] = useState<string>('');
  const [sortAsc, setSortAsc] = useState<boolean>(false);
  const [loadingChapterUrl, setLoadingChapterUrl] = useState<string | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);

  // Favorite & Tag Modal state
  const [isFavorite, setIsFavorite] = useState<boolean>(manga.favorite ?? false);
  const [categories, setCategories] = useState<string[]>(manga.categories || []);
  const [isFavoriteModalOpen, setIsFavoriteModalOpen] = useState(false);

  useEffect(() => {
    const update = () => setInstalledExtensions(getInstalledExtensions('manga'));
    window.addEventListener('extensions:updated', update);
    return () => window.removeEventListener('extensions:updated', update);
  }, []);

  // Verifica se é fonte local no disco
  const isLocal = useMemo(() => {
    return (
      manga.source === '0' ||
      (manga.sourceName || '').toLowerCase().includes('local') ||
      manga.url.startsWith('/') ||
      /^[a-zA-Z]:[\\/]/.test(manga.url) ||
      manga.url.startsWith('file://')
    );
  }, [manga.source, manga.sourceName, manga.url]);

  // URL canônica/resolvida da obra online (ex: https://atsu.moe/manga/JD89O)
  const resolvedMangaUrl = useMemo(() => {
    if (isLocal) return '';
    return resolveWorkUrl(manga.url, activeExtension || manga.sourceName, originExt?.baseUrl);
  }, [isLocal, manga.url, activeExtension, manga.sourceName, originExt]);

  const webviewTargetUrl = useMemo(() => {
    if (isLocal) return '';
    const webUrl = (manga as any).webUrl;
    if (typeof webUrl === 'string' && /^https?:\/\//i.test(webUrl)) return webUrl;
    if (resolvedMangaUrl && /^https?:\/\//i.test(resolvedMangaUrl)) {
      return resolvedMangaUrl;
    }
    if (manga.url && /^https?:\/\//i.test(manga.url)) {
      return manga.url;
    }
    if (originExt?.baseUrl && /^https?:\/\//i.test(originExt.baseUrl)) {
      try {
        return new URL(manga.url.startsWith('/') ? manga.url : `/${manga.url}`, originExt.baseUrl).href;
      } catch {}
    }
    const q = `${manga.title} ${activeExtension || manga.sourceName || ''} manga ler online`.trim();
    return `https://duckduckgo.com/?q=${encodeURIComponent(q)}`;
  }, [isLocal, resolvedMangaUrl, manga.url, originExt, manga.title, activeExtension, manga.sourceName]);

  // Salva a lista de capítulos na biblioteca (somente se a obra já estiver nela)
  const saveChaptersToStorage = useCallback((newChapters: LibraryChapter[]) => {
    void updateLibrary('manga', (entries) => {
      let changed = false;
      const next = entries.map((item: any) => {
        if (item && (item.url === manga.url || (manga.title && item.title === manga.title))) {
          changed = true;
          return { ...item, chapters: newChapters, totalChapters: newChapters.length };
        }
        return item;
      });
      return changed ? next : entries;
    });
  }, [manga.url, manga.title]);

  // Sempre mantém o estado lido/página ao atualizar a lista de capítulos
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const applyChapters = useCallback(
    (fresh: LibraryChapter[]) => {
      const merged = mergeChapterProgress(preserveChapterState(fresh, chaptersRef.current), 'manga');
      chaptersRef.current = merged;
      setChapters(merged);
      saveChaptersToStorage(merged);
    },
    [saveChaptersToStorage]
  );

  // Progresso salvo pelo leitor
  useEffect(() => {
    const onProgress = (e: any) => {
      if (e?.detail?.source && e.detail.source !== 'manga') return;
      setChapters((prev) => mergeChapterProgress(prev, 'manga'));
    };
    window.addEventListener(PROGRESS_EVENT, onProgress);
    return () => window.removeEventListener(PROGRESS_EVENT, onProgress);
  }, []);

  // Escaneia pasta local se for Fonte Local ou caminho em disco
  const scanLocalChapters = useCallback(async () => {
    if (!window.electronAPI?.readDirectory || !isLocal) return;

    let dirPath = manga.url.replace(/^file:\/\/\/?/i, '');

    // Se manga.url for relativo, busca nas pastas de mangás salvas
    if (!/^[a-zA-Z]:[\\/]/.test(dirPath) && !dirPath.startsWith('/')) {
      try {
        const rawFolders = localStorage.getItem('manga_folders');
        if (rawFolders) {
          const savedFolders: string[] = JSON.parse(rawFolders);
          for (const f of savedFolders) {
            if (f.toLowerCase().endsWith(dirPath.toLowerCase()) || dirPath.toLowerCase().includes(f.toLowerCase())) {
              dirPath = f;
              break;
            }
          }
        }
      } catch {}
    }

    setIsScanning(true);
    try {
      const res = await window.electronAPI.readDirectory(dirPath);
      if (res.success && res.items) {
        const subdirs = res.items.filter((i) => i.isDirectory);
        const images = res.items.filter((i) => i.isImage);
        const archives = res.items.filter((i) => i.isArchive);

        if (subdirs.length > 0) {
          subdirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          const scannedChaps: LibraryChapter[] = subdirs.map((d, idx) => ({
            url: d.path,
            name: d.name,
            number: idx + 1,
            read: false,
            bookmark: false,
            lastPageRead: 0,
            lastSecondSeen: 0,
            lastModifiedAt: d.mtime || Date.now(),
          }));
          applyChapters(scannedChaps);
        } else if (archives.length > 0) {
          archives.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
          const scannedChaps: LibraryChapter[] = archives.map((a, idx) => ({
            url: a.path,
            name: a.name.replace(/\.[^.]+$/, ''),
            number: idx + 1,
            read: false,
            bookmark: false,
            lastPageRead: 0,
            lastSecondSeen: 0,
            lastModifiedAt: a.mtime || Date.now(),
          }));
          applyChapters(scannedChaps);
        } else if (images.length > 0) {
          const singleChap: LibraryChapter[] = [
            {
              url: dirPath,
              name: manga.title || 'Capítulo Completo (Pasta Local)',
              number: 1,
              read: false,
              bookmark: false,
              lastPageRead: 0,
              lastSecondSeen: 0,
              lastModifiedAt: Date.now(),
            },
          ];
          applyChapters(singleChap);
        }
      }
    } catch (e) {
      console.warn('Erro ao escanear capítulos locais:', e);
    } finally {
      setIsScanning(false);
    }
  }, [isLocal, manga.url, manga.title, applyChapters]);

  // Atualizar / Buscar capítulos online da fonte
  const handleRefreshChapters = useCallback(async () => {
    if (isLocal) {
      await scanLocalChapters();
      return;
    }

    const targetUrl = resolvedMangaUrl || manga.url;
    if (!targetUrl) return;
    setIsScanning(true);
    setExtractError(null);

    // 1–3. APIs nativas (Atsumaru, Komga, MangaDex) e raspador da fonte
    try {
      const list = await fetchChapterList(targetUrl, activeExtension || manga.sourceName || '', manga.url);
      if (list.length > 0) {
        applyChapters(list);
        setIsScanning(false);
        return;
      }
    } catch (err: any) {
      console.warn('Erro ao buscar capítulos da fonte:', err);
      if (targetUrl.startsWith('suwayomi:')) {
        setExtractError(`Suwayomi: ${err?.message || err}`);
        setIsScanning(false);
        return;
      }
    }
    if (targetUrl.startsWith('suwayomi:')) {
      setExtractError(t('O Suwayomi não retornou capítulos para esta obra.'));
      setIsScanning(false);
      return;
    }

    // 4. Se não encontrou capítulos múltiplos, verifica se é uma galeria / capítulo único
    try {
      const result = await fetchChapterPages(targetUrl, targetUrl, activeExtension);
      if (result.success && result.data && result.data.pages.length > 0) {
        const singleCh: LibraryChapter[] = [
          {
            url: targetUrl,
            name: result.data.title || manga.title || 'Galeria Completa',
            number: 1,
            read: false,
            bookmark: false,
            lastPageRead: 0,
            lastSecondSeen: 0,
            lastModifiedAt: Date.now(),
          }
        ];
        applyChapters(singleCh);
      } else {
        setExtractError(tMaybe(result.error) || t('Nenhum capítulo adicional encontrado na fonte. Você pode abrir a obra na Webview clicando em "Ler na Webview".'));
      }
    } catch (err: any) {
      setExtractError(tMaybe(err.message) || t('Erro ao buscar capítulos na fonte.'));
    } finally {
      setIsScanning(false);
    }
  }, [isLocal, resolvedMangaUrl, manga.url, manga.title, manga.sourceName, activeExtension, scanLocalChapters, applyChapters]);

  // Carrega ou atualiza capítulos automaticamente ao montar
  useEffect(() => {
    if (isLocal) {
      scanLocalChapters();
    } else if (resolvedMangaUrl && (!chapters || chapters.length <= 1)) {
      handleRefreshChapters();
    }
  }, [isLocal, resolvedMangaUrl]);

  // Capítulos filtrados e ordenados
  const filteredChapters = useMemo(() => {
    let list = [...chapters];
    if (chapterSearch.trim()) {
      const q = chapterSearch.toLowerCase().trim();
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          String(c.number).includes(q)
      );
    }
    list.sort((a, b) => {
      const numA = a.number ?? 0;
      const numB = b.number ?? 0;
      return sortAsc ? numA - numB : numB - numA;
    });
    return list;
  }, [chapters, chapterSearch, sortAsc]);

  // Próximo capítulo a ler
  const nextChapter = useMemo(() => {
    if (!chapters || chapters.length === 0) return null;
    const sorted = [...chapters].sort((a, b) => (a.number || 0) - (b.number || 0));
    const firstUnread = sorted.find((c) => !c.read);
    return firstUnread || sorted[0];
  }, [chapters]);

  // Alterna lido / não lido manualmente
  const toggleChapterRead = (chapterUrl: string) => {
    const target = chapters.find((c) => c.url === chapterUrl);
    const nextRead = !target?.read;
    setChapters((prev) => prev.map((c) => (c.url === chapterUrl ? { ...c, read: nextRead } : c)));
    updateChapterProgress('manga', { [chapterUrl]: { read: nextRead } });
  };

  const buildChapterContext = (chapterUrl: string) => ({
    chapters: chapters.map((c) => ({ url: c.url, name: c.name, number: c.number })),
    currentUrl: chapterUrl,
    mangaUrl: resolvedMangaUrl || manga.url,
    mangaTitle: manga.title,
    sourceName: activeExtension,
  });

  // Leitura 100% nativa sem abrir navegador web
  const handleReadChapter = async (chapter: LibraryChapter) => {
    if (loadingChapterUrl) return;
    setLoadingChapterUrl(chapter.url);
    setExtractError(null);

    const chapTitle = `${manga.title} - ${chapter.name || t('Capítulo {n}', { n: chapter.number })}`;

    const startPage = chapter.lastPageRead && !chapter.read ? Math.max(0, chapter.lastPageRead - 1) : 0;
    const readerData = (pages: any[]) => ({
      pages,
      initialPageIndex: startPage,
      title: chapTitle,
      chapterUrl: chapter.url,
      chapterContext: buildChapterContext(chapter.url),
    });

    try {
      // 1. Se for caminho local no disco
      const isLocalChapter = isLocal || isLocalChapterPath(chapter.url);

      if (isLocalChapter && window.electronAPI?.readDirectory) {
        const local = await loadLocalChapterPages(chapter.url);
        if (local.success && local.data) {
          onOpenTab?.('manga-reader', chapTitle, readerData(local.data.pages));
          return;
        }
      }

      // 2. Extração online / backup normal
      const result = await loadChapterPages(chapter.url, resolvedMangaUrl || manga.url, activeExtension);
      if (result.success && result.data && result.data.pages.length > 0) {
        onOpenTab?.('manga-reader', chapTitle, readerData(result.data.pages));
      } else {
        setExtractError(tMaybe(result.error) || t('Não foi possível carregar as imagens deste capítulo.'));
      }
    } catch (err: any) {
      setExtractError(tMaybe(err.message) || t('Erro ao processar capítulo'));
    } finally {
      setLoadingChapterUrl(null);
    }
  };

  const readCount = chapters.filter((c) => c.read).length;

  /* ── Downloads offline ── */
  const { downloaded, progress: dlProgress } = useDownloads();
  const canDownload = downloadsAvailable() && !isLocal;
  const workForDownload = { title: manga.title, url: resolvedMangaUrl || manga.url, sourceName: activeExtension || manga.sourceName };

  const handleDownload = async (c: LibraryChapter) => {
    const err = await downloadChapter(workForDownload, c);
    if (err) toast.error(t('Falha ao baixar {name}', { name: c.name || t('Capítulo {n}', { n: c.number }) }), tMaybe(err));
  };

  const handleDownloadUnread = async () => {
    const pending = [...chapters]
      .filter((c) => !c.read && !downloaded.has(c.url) && !dlProgress[c.url])
      .sort((a, b) => (a.number || 0) - (b.number || 0));
    if (pending.length === 0) {
      toast.info(t('Nada para baixar'), t('Todos os capítulos não lidos já estão baixados.'));
      return;
    }
    if (pending.length > 5 && !(await confirmDialog({ title: t('Baixar {n} capítulos?', { n: pending.length }), message: t('Os capítulos são baixados um por vez e ficam disponíveis sem internet.'), confirmLabel: t('Baixar') }))) return;
    toast.info(tn(pending.length, 'Baixando {n} capítulo…', 'Baixando {n} capítulos…'));
    let ok = 0;
    for (const c of pending) {
      const err = await downloadChapter(workForDownload, c);
      if (err) toast.error(t('Falha em {name}', { name: c.name || t('Capítulo {n}', { n: c.number }) }), tMaybe(err));
      else ok++;
    }
    if (ok > 0) toast.success(tn(ok, '{n} capítulo baixado', '{n} capítulos baixados'));
  };

  const handleDeleteDownload = async (c: LibraryChapter) => {
    await deleteDownloadedChapter(c.url);
    toast.info(t('Download removido'), c.name || t('Capítulo {n}', { n: c.number }));
  };

  return (
    <div className="flex flex-col h-full bg-canvas text-fg-2 select-none overflow-y-auto">
      {/* Top Banner / Breadcrumb & Source Selector */}
      <div className="bg-surface border-b border-line px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-md bg-subtle border border-line flex items-center justify-center text-accent shrink-0">
            <BookOpen size={18} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-fg truncate max-w-md">
              {manga.title}
            </h2>
            <p className="text-[11px] text-fg-muted">
              {t('Visualização Nativa')} • {chapters.length === 1 && chapters[0].url === manga.url ? t('Galeria / Capítulo Único') : tn(chapters.length, '{n} capítulo', '{n} capítulos')}
            </p>
          </div>
        </div>

        {/* Seletor de Extensões Onde a Obra se Encontra */}
        <div className="flex items-center gap-2 max-w-full">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-fg-muted flex items-center gap-1">
              <Layers size={13} className="text-accent" />
              {t('Abrir com Extensão:')}
            </span>

            {/* Botão de Expandir / Colapsar */}
            {availableExtensions.length > 1 && (
              <button
                type="button"
                onClick={() => setIsExtensionsExpanded((prev) => !prev)}
                className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded bg-subtle hover:bg-elevated border border-line text-fg-muted hover:text-fg transition-colors cursor-pointer"
                title={isExtensionsExpanded ? t('Colapsar container de extensões') : t('Expandir container de extensões')}
              >
                <span>{isExtensionsExpanded ? t('Colapsar') : t('Expandir')}</span>
                {isExtensionsExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
            )}
          </div>

          {/* Lista de Extensões - Colapsada ou Expandida */}
          <div className={`flex items-center gap-1.5 ${isExtensionsExpanded ? 'flex-wrap' : 'overflow-x-auto no-scrollbar max-w-md'}`}>
            {(isExtensionsExpanded ? availableExtensions : [availableExtensions[0]]).map((ext) => {
              const isSelected =
                activeExtension.toLowerCase() === ext.name.toLowerCase() ||
                activeExtension.toLowerCase() === ext.sourceName.toLowerCase();

              return (
                <button
                  key={ext.pkg}
                  type="button"
                  onClick={() => setActiveExtension(ext.sourceName || ext.name)}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1.5 border shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-success border-success-hover text-white shadow-sm'
                      : 'bg-subtle border-line text-fg-muted hover:text-fg hover:bg-elevated'
                  }`}
                  title={t('Fonte: {name}', { name: tMaybe(ext.name) })}
                >
                  <span>{tMaybe(ext.name)}</span>
                  <span className="text-[9px] opacity-75 font-mono">({ext.lang})</span>
                </button>
              );
            })}

            {!isExtensionsExpanded && availableExtensions.length > 1 && (
              <button
                type="button"
                onClick={() => setIsExtensionsExpanded(true)}
                className="px-2 py-1 rounded-md text-[11px] bg-subtle border border-line text-accent hover:text-white hover:bg-elevated transition-colors shrink-0 cursor-pointer"
                title={t('Ver outras fontes disponíveis')}
              >
                {t('+{n} mais', { n: availableExtensions.length - 1 })}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Info Section */}
      <div className="max-w-6xl w-full mx-auto p-6 space-y-6">
        {extractError && (
          <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertCircle size={15} />
              <span>{extractError}</span>
            </div>
            <button
              type="button"
              onClick={() => setExtractError(null)}
              aria-label={t('Fechar')}
              className="text-xs hover:text-white ml-2"
            >
              ✕
            </button>
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-6 bg-surface border border-line rounded-xl p-6 shadow-sm">
          {/* Cover */}
          <div className="w-44 h-64 rounded-lg overflow-hidden bg-canvas border border-line flex-shrink-0 shadow-md relative group">
            {manga.cover ? (
              <img
                src={manga.cover}
                alt={manga.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const img = e.currentTarget;
                  if (!img.dataset.retried && window.electronAPI?.resolveCover && manga.cover) {
                    img.dataset.retried = 'true';
                    window.electronAPI.resolveCover(manga.cover, activeExtension || manga.sourceName).then((res) => {
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
              className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-surface text-fg-muted"
              style={{ display: manga.cover ? 'none' : 'flex' }}
            >
              <BookOpen size={36} className="text-accent/60 mb-2" />
              <span className="text-xs font-medium">{t('Sem imagem de capa')}</span>
            </div>

            {manga.favorite && (
              <div className="absolute top-2 left-2 p-1.5 rounded-md bg-black/70 text-red-400">
                <Heart size={14} fill="currentColor" />
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-accent/[0.13] text-accent border border-accent/[0.27] font-medium flex items-center gap-1">
                  <Sparkles size={11} />
                  {t('Fonte: {name}', { name: tMaybe(activeExtension) })}
                </span>

                {manga.status !== undefined && (
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-subtle text-fg-muted border border-line">
                    {workStatusLabel(manga.status)}
                  </span>
                )}

                <span className="text-xs px-2.5 py-0.5 rounded-full bg-subtle text-fg-muted border border-line">
                  {t('{read} de {total} lidos', { read: readCount, total: chapters.length })}
                </span>
              </div>

              <h1 className="text-2xl font-bold text-fg tracking-tight mb-2">
                {manga.title}
              </h1>

              {manga.author && (
                <p className="text-xs text-fg-muted flex items-center gap-1.5 mb-3">
                  <User size={13} className="text-accent" />
                  <span>{t('Autor:')} <strong className="text-fg-2">{manga.author}</strong></span>
                </p>
              )}

              {/* Categories */}
              {manga.categories && manga.categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {manga.categories.map((cat, i) => (
                    <span
                      key={i}
                      className="bg-subtle border border-line text-cyan-300 text-[10px] px-2 py-0.5 rounded-md font-mono"
                    >
                      {cat === 'Favoritos' ? t('Favoritos') : cat}
                    </span>
                  ))}
                </div>
              )}

              {/* Genres */}
              {manga.genres && manga.genres.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-4">
                  {manga.genres.map((g, i) => (
                    <span
                      key={i}
                      className="bg-canvas text-fg-muted px-2 py-0.5 rounded text-[10px] border border-line"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              {/* Description */}
              {manga.description && (
                <p className="text-xs text-fg-muted leading-relaxed line-clamp-4 hover:line-clamp-none transition-all">
                  {manga.description}
                </p>
              )}
            </div>

            {/* Quick Action Buttons */}
            <div className="pt-2 flex flex-wrap items-center gap-3">
              {nextChapter && (
                <button
                  type="button"
                  disabled={loadingChapterUrl === nextChapter.url}
                  onClick={() => handleReadChapter(nextChapter)}
                  className="px-5 py-2.5 bg-success hover:bg-success-hover text-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-2 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {loadingChapterUrl === nextChapter.url ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>{t('Extraindo páginas nativas...')}</span>
                    </>
                  ) : (
                    <>
                      <Play size={13} fill="currentColor" />
                      <span>
                        {chapters.length === 1 && chapters[0].url === manga.url
                          ? t('Ler Obra Completa / Galeria')
                          : chapters.some((c) => c.read)
                          ? t('Continuar Lendo: Cap. {ch}', { ch: nextChapter.number || nextChapter.name })
                          : t('Começar a Ler: Cap. {ch}', { ch: nextChapter.number || nextChapter.name })}
                      </span>
                    </>
                  )}
                </button>
              )}

              {/* Botão de Favoritar & Gerenciar Tags */}
              <button
                type="button"
                onClick={() => setIsFavoriteModalOpen(true)}
                className={`px-4 py-2.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-2 shadow-sm cursor-pointer border ${
                  isFavorite
                    ? 'bg-rose-950/80 hover:bg-rose-900 border-rose-800 text-rose-300'
                    : 'bg-subtle hover:bg-elevated border-line text-fg-2 hover:text-white'
                }`}
                title={t('Favoritar obra e gerenciar categorias/tags')}
              >
                <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} className={isFavorite ? 'text-rose-400' : ''} />
                <span>{isFavorite ? t('Favoritado (Tags)') : t('Favoritar Obra')}</span>
              </button>

              {!isLocal && <AniListLink source="manga" workUrl={manga.url} title={manga.title} />}

              {/* Botão Ler na Webview */}
              {!isLocal && webviewTargetUrl && (
                <button
                  type="button"
                  onClick={() => {
                    onOpenTab?.('webview', manga.title || t('Navegador Web'), {
                      initialUrl: webviewTargetUrl,
                      url: webviewTargetUrl,
                    });
                  }}
                  className="px-4 py-2.5 rounded-lg font-semibold text-xs transition-all flex items-center gap-2 shadow-sm cursor-pointer border bg-subtle hover:bg-elevated border-line hover:border-accent text-accent hover:text-white"
                  title={t('Abrir e ler esta obra diretamente no Navegador integrado (Webview)')}
                >
                  <Globe size={14} />
                  <span>{t('Ler na Webview')}</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Chapters Section */}
        <div className="bg-surface border border-line rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-line">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-fg">
                {t('Capítulos Disponíveis')}
              </h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-subtle text-fg-muted">
                {filteredChapters.length}
              </span>
              <button
                type="button"
                disabled={isScanning}
                onClick={handleRefreshChapters}
                className="p-1.5 rounded text-fg-muted hover:text-accent hover:bg-subtle transition-colors cursor-pointer"
                title={t('Atualizar / Buscar Capítulos')}
              >
                <RefreshCw size={13} className={isScanning ? 'animate-spin text-accent' : ''} />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-56">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
                <input
                  type="text"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder={t('Buscar capítulo...')}
                  className="w-full bg-canvas border border-line rounded-md pl-7 pr-3 py-1.5 text-xs text-fg placeholder-fg-muted outline-none focus:border-accent"
                />
              </div>

              {canDownload && chapters.length > 0 && (
                <button
                  type="button"
                  onClick={handleDownloadUnread}
                  title={t('Baixar todos os capítulos não lidos para ler offline')}
                  className="px-2.5 py-1.5 rounded-md border border-line bg-canvas text-fg-muted hover:text-fg text-xs flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <HardDriveDownload size={12} />
                  <span>{t('Baixar não lidos')}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setSortAsc(!sortAsc)}
                title={sortAsc ? t('Ordenar Decrescente') : t('Ordenar Crescente')}
                className="px-2.5 py-1.5 rounded-md border border-line bg-canvas text-fg-muted hover:text-fg text-xs flex items-center gap-1 transition-colors cursor-pointer"
              >
                <ArrowUpDown size={12} />
                <span>{sortAsc ? t('Mais Antigo') : t('Mais Recente')}</span>
              </button>
            </div>
          </div>

          {/* Chapter Rows or Fallback Single Work Card */}
          {filteredChapters.length === 0 ? (
            <div className="flex flex-col items-center justify-center p-8 text-center bg-canvas/60 rounded-lg border border-line/50">
              <BookOpen size={32} className="text-fg-muted mb-2" />
              <p className="text-xs text-fg-2 font-medium mb-1">
                {t('Nenhum capítulo avulso listado')}
              </p>
              <p className="text-[11px] text-fg-muted max-w-sm mb-4">
                {t('Esta obra pode ser uma galeria de capítulo único ou os capítulos ainda não foram indexados da fonte.')}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handleReadChapter(
                      chapters[0] || {
                        url: manga.url,
                        name: manga.title,
                        number: 1,
                        read: false,
                        bookmark: false,
                        lastPageRead: 0,
                        lastSecondSeen: 0,
                        lastModifiedAt: Date.now(),
                      }
                    )
                  }
                  className="px-4 py-2 bg-success hover:bg-success-hover text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Play size={12} fill="currentColor" />
                  <span>{t('Ler Obra Completa Agora')}</span>
                </button>
                <button
                  type="button"
                  disabled={isScanning}
                  onClick={handleRefreshChapters}
                  className="px-3 py-2 bg-subtle hover:bg-elevated text-fg-muted hover:text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer border border-line"
                >
                  <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
                  <span>{t('Buscar Capítulos na Fonte')}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-line-subtle max-h-[500px] overflow-y-auto">
              {filteredChapters.map((c) => {
                const isOpening = loadingChapterUrl === c.url;

                return (
                  <div
                    key={c.url}
                    className={`flex items-center justify-between p-2.5 rounded-md hover:bg-subtle/60 transition-colors ${
                      c.read ? 'opacity-70' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        type="button"
                        onClick={() => toggleChapterRead(c.url)}
                        className="text-fg-muted hover:text-success-fg transition-colors cursor-pointer"
                        title={c.read ? t('Marcar como não lido') : t('Marcar como lido')}
                      >
                        {c.read ? (
                          <CheckCircle2 size={16} className="text-success-fg" />
                        ) : (
                          <Circle size={16} />
                        )}
                      </button>
                      <div className="min-w-0">
                        <p className={`text-xs font-medium truncate ${c.read ? 'text-fg-muted' : 'text-fg'}`}>
                          {tMaybe(c.name) || t('Capítulo {n}', { n: c.number })}
                        </p>
                        {!c.read && (c.lastPageRead || 0) > 1 && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            {t('Página {n}', { n: c.lastPageRead || 0 })}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {canDownload &&
                        (dlProgress[c.url] ? (
                          <button
                            type="button"
                            onClick={() => window.electronAPI?.cancelDownload?.(c.url)}
                            className="h-7 px-2 rounded text-[11px] tabular-nums text-accent hover:bg-elevated inline-flex items-center gap-1 cursor-pointer"
                            title={t('Cancelar download')}
                          >
                            {Math.round((dlProgress[c.url].done / Math.max(1, dlProgress[c.url].total)) * 100)}%
                            <XIcon size={11} />
                          </button>
                        ) : downloaded.has(c.url) ? (
                          <button
                            type="button"
                            onClick={() => handleDeleteDownload(c)}
                            className="group/dl p-1.5 rounded text-success-fg hover:text-danger-fg hover:bg-elevated transition-colors cursor-pointer"
                            title={t('Baixado (disponível offline) — clique para apagar')}
                          >
                            <CheckCircle size={13} className="group-hover/dl:hidden" />
                            <Trash2 size={13} className="hidden group-hover/dl:block" />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleDownload(c)}
                            className="p-1.5 rounded text-fg-muted hover:text-accent hover:bg-elevated transition-colors cursor-pointer"
                            title={t('Baixar para ler offline')}
                          >
                            <Download size={13} />
                          </button>
                        ))}
                      {c.url && !c.url.startsWith('suwayomi:') && (!isLocal || /^https?:\/\//i.test(c.url)) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            let targetUrl = c.url;
                            if (!/^https?:\/\//i.test(targetUrl)) {
                              targetUrl = resolveWorkUrl(c.url, activeExtension || manga.sourceName, resolvedMangaUrl);
                            }
                            onOpenTab?.('webview', `${manga.title} - ${c.name || t('Cap. {n}', { n: c.number })}`, {
                              initialUrl: targetUrl,
                              url: targetUrl,
                            });
                          }}
                          className="p-1.5 rounded text-fg-muted hover:text-accent hover:bg-elevated transition-colors cursor-pointer"
                          title={t('Abrir este capítulo na Webview')}
                        >
                          <Globe size={13} />
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isOpening}
                        onClick={() => handleReadChapter(c)}
                        className="px-3 py-1 rounded bg-subtle hover:bg-success text-fg-2 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shrink-0 shadow-xs"
                      >
                        {isOpening ? (
                          <>
                            <Loader2 size={12} className="animate-spin" />
                            <span>{t('Carregando...')}</span>
                          </>
                        ) : (
                          <>
                            <Play size={11} fill="currentColor" />
                            <span>{t('Ler')}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de Favoritos & Tags */}
      <FavoriteTagModal
        isOpen={isFavoriteModalOpen}
        onClose={() => setIsFavoriteModalOpen(false)}
        manga={{
          ...manga,
          favorite: isFavorite,
          categories: categories,
          sourceName: activeExtension || manga.sourceName,
        }}
        onSaved={(updated) => {
          setIsFavorite(updated.favorite);
          setCategories(updated.categories);
        }}
      />
    </div>
  );
};
