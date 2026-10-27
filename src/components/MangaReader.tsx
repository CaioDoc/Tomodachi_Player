import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Maximize,
  Minimize,
  ZoomIn,
  ZoomOut,
  BookOpen,
  ScrollText,
  Columns2,
  LayoutGrid,
  ExternalLink,
  Loader2,
  ImageOff,
  RefreshCw,
  ArrowLeftRight,
  MoveVertical,
  MoveHorizontal,
  Scan,
  CheckCircle2,
  X,
} from 'lucide-react';
import { toMediaUrl } from '../utils/mediaUrl';
import { useIsTabActive, isTypingTarget } from '../context/TabContext';
import { updateChapterProgress } from '../utils/progress';
import { loadChapterPages } from '../api/chapterExtractor';
import { t, tMaybe } from '../i18n';

export interface MangaPage {
  index: number;
  url: string;
  name?: string;
}

export interface ReaderChapterRef {
  url: string;
  name?: string;
  number?: number;
}

/** Contexto opcional que permite navegar entre capítulos dentro do próprio leitor */
export interface ReaderChapterContext {
  chapters: ReaderChapterRef[];
  currentUrl: string;
  mangaUrl?: string;
  mangaTitle?: string;
  sourceName?: string;
}

interface MangaReaderProps {
  title?: string;
  pages: MangaPage[];
  initialPageIndex?: number;
  onPageChange?: (index: number) => void;
  chapterContext?: ReaderChapterContext;
  onTitleChange?: (title: string) => void;
  /** Link para abrir a obra no site original */
  externalUrl?: string;
  /** Ícone exibido ao lado do título */
  icon?: React.ReactNode;
}

type ReaderMode = 'continuous' | 'single' | 'double';
type FitMode = 'height' | 'width' | 'original';
type Direction = 'ltr' | 'rtl';

interface ReaderPrefs {
  mode: ReaderMode;
  fit: FitMode;
  direction: Direction;
  /** Largura das páginas no modo contínuo (% da área de leitura) */
  stripWidth: number;
  /** Zoom dos modos paginados (%) */
  zoom: number;
  gaps: boolean;
  /** Página dupla: primeira página (capa) sozinha, para alinhar as páginas duplas */
  coverAlone: boolean;
}

const PREFS_KEY = 'tp_reader_prefs';
const DEFAULT_PREFS: ReaderPrefs = { mode: 'continuous', fit: 'height', direction: 'ltr', stripWidth: 60, zoom: 100, gaps: true, coverAlone: true };

const loadPrefs = (): ReaderPrefs => {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
};

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

const chapterLabel = (ch?: ReaderChapterRef) =>
  !ch ? '' : ch.name?.trim() || (ch.number !== undefined ? t('Capítulo {n}', { n: ch.number }) : t('Capítulo'));

/* ─────────────────────────── Página com estado de carregamento/erro ─────────────────────────── */

const PageImage: React.FC<{
  page: MangaPage;
  index: number;
  className?: string;
  style?: React.CSSProperties;
  lazy?: boolean;
  placeholderClass?: string;
  onLoaded?: () => void;
}> = ({ page, index, className = '', style, lazy, placeholderClass = 'min-h-[60vh]', onLoaded }) => {
  const [src, setSrc] = useState(() => toMediaUrl(page.url));
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading');
  const attempts = useRef(0);
  const imgRef = useRef<HTMLImageElement>(null);
  const lastUrl = useRef(page.url);

  // Só reinicia quando a página realmente muda (evita perder o onLoad de imagens em cache)
  useEffect(() => {
    if (lastUrl.current === page.url) return;
    lastUrl.current = page.url;
    setSrc(toMediaUrl(page.url));
    setState('loading');
    attempts.current = 0;
  }, [page.url]);

  // Imagens já decodificadas (cache) podem terminar antes do React ouvir o evento
  useEffect(() => {
    const img = imgRef.current;
    if (state === 'loading' && img?.complete && img.naturalWidth > 0) {
      setState('loaded');
      onLoaded?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, state]);

  const handleError = async () => {
    attempts.current += 1;
    // 1ª tentativa: espelho alternativo conhecido
    if (attempts.current === 1 && /\/\/i\.nhentai\.net\//.test(src)) {
      setSrc(src.replace('//i.nhentai.net/', '//i3.nhentai.net/'));
      return;
    }
    // 2ª tentativa: resolvedor do processo principal (cabeçalhos/Referer corretos)
    if (attempts.current <= 2 && window.electronAPI?.resolveCover && /^https?:/.test(page.url)) {
      try {
        const res = await window.electronAPI.resolveCover(page.url);
        if (res.success && res.url && res.url !== src) {
          setSrc(res.url);
          return;
        }
      } catch {
        /* ignore */
      }
    }
    setState('error');
  };

  const retry = () => {
    attempts.current = 0;
    setState('loading');
    const base = toMediaUrl(page.url);
    setSrc(base.startsWith('http') ? `${base}${base.includes('?') ? '&' : '?'}_r=${Date.now()}` : base);
  };

  if (state === 'error') {
    return (
      <div className={`flex flex-col items-center justify-center gap-2 bg-subtle/50 border border-dashed border-line rounded-md text-fg-muted text-xs p-8 w-full ${placeholderClass}`}>
        <ImageOff size={26} />
        <span>{t('Falha ao carregar a página {n}', { n: index + 1 })}</span>
        <button
          type="button"
          onClick={retry}
          className="mt-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-elevated hover:bg-line text-fg text-xs cursor-pointer"
        >
          <RefreshCw size={12} /> {t('Tentar novamente')}
        </button>
      </div>
    );
  }

  return (
    <div className={`relative ${state === 'loading' ? placeholderClass : ''} flex items-center justify-center`}>
      {state === 'loading' && (
        <div className="absolute inset-0 flex items-center justify-center text-fg-muted pointer-events-none">
          <Loader2 size={22} className="animate-spin opacity-60" />
        </div>
      )}
      <img
        ref={imgRef}
        src={src}
        alt={t('Página {n}', { n: index + 1 })}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
        draggable={false}
        onLoad={() => {
          setState('loaded');
          onLoaded?.();
        }}
        onError={handleError}
        className={`reader-page ${className} ${state === 'loading' ? 'opacity-0' : 'opacity-100'} transition-opacity duration-150`}
        style={style}
      />
    </div>
  );
};

/* ─────────────────────────── Botão de barra de ferramentas ─────────────────────────── */

const ToolButton: React.FC<{
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, title, active, disabled, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    aria-pressed={active}
    disabled={disabled}
    className={`h-7 min-w-7 px-1.5 inline-flex items-center justify-center gap-1 rounded-md text-[12px] transition-colors cursor-pointer disabled:opacity-35 ${
      active ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg hover:bg-subtle'
    }`}
  >
    {children}
  </button>
);

/* ─────────────────────────── Leitor ─────────────────────────── */

export const MangaReader: React.FC<MangaReaderProps> = ({
  title = t('Leitor de Mangá'),
  pages: initialPages = [],
  initialPageIndex = 0,
  onPageChange,
  chapterContext,
  onTitleChange,
  externalUrl,
  icon,
}) => {
  const isActive = useIsTabActive();

  const [prefs, setPrefs] = useState<ReaderPrefs>(loadPrefs);
  const [pages, setPages] = useState<MangaPage[]>(initialPages);
  const [currentPage, setCurrentPage] = useState<number>(() => clamp(initialPageIndex, 0, Math.max(0, initialPages.length - 1)));
  const [chapterUrl, setChapterUrl] = useState<string | undefined>(chapterContext?.currentUrl);
  const [chapterTitle, setChapterTitle] = useState<string>(title);
  const [loadingChapter, setLoadingChapter] = useState<string | null>(null);
  const [chapterError, setChapterError] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [uiHidden, setUiHidden] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pendingScrollTo = useRef<number | null>(prefs.mode === 'continuous' ? currentPage : null);
  const scrollTicking = useRef(false);

  const total = pages.length;
  const isPaged = prefs.mode !== 'continuous';
  const isRtl = isPaged && prefs.direction === 'rtl';
  const isSoloCover = prefs.mode === 'double' && prefs.coverAlone && currentPage === 0;
  const showsSecond = prefs.mode === 'double' && !isSoloCover && !!pages[currentPage + 1];
  const step = showsSecond ? 2 : 1;

  const updatePrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /* ── Capítulos (anterior / próximo) ── */
  const orderedChapters = useMemo(() => {
    const list = chapterContext?.chapters || [];
    return list
      .map((c, i) => ({ c, i }))
      .sort((a, b) => {
        const na = typeof a.c.number === 'number' && isFinite(a.c.number) ? a.c.number : NaN;
        const nb = typeof b.c.number === 'number' && isFinite(b.c.number) ? b.c.number : NaN;
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return a.i - b.i;
      })
      .map((x) => x.c);
  }, [chapterContext?.chapters]);

  const chapterIndex = chapterUrl ? orderedChapters.findIndex((c) => c.url === chapterUrl) : -1;
  const prevChapter = chapterIndex > 0 ? orderedChapters[chapterIndex - 1] : undefined;
  const nextChapter = chapterIndex >= 0 && chapterIndex < orderedChapters.length - 1 ? orderedChapters[chapterIndex + 1] : undefined;
  const currentChapter = chapterIndex >= 0 ? orderedChapters[chapterIndex] : undefined;

  /* ── Progresso ── */
  useEffect(() => {
    onPageChange?.(currentPage);
    if (!chapterUrl || total === 0) return;
    const isLast = currentPage >= total - step;
    const timer = window.setTimeout(() => {
      updateChapterProgress('manga', { [chapterUrl]: isLast ? { lastPageRead: currentPage + 1, read: true } : { lastPageRead: currentPage + 1 } }, { silent: !isLast });
    }, 400);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, chapterUrl, total]);

  // Pré-carrega as próximas páginas nos modos paginados
  useEffect(() => {
    if (!isPaged) return;
    for (let i = 1; i <= 3; i++) {
      const p = pages[currentPage + step - 1 + i];
      if (p && /^https?:/.test(p.url)) {
        const img = new Image();
        img.src = p.url;
      }
    }
  }, [currentPage, isPaged, pages, step]);

  /* ── Navegação de páginas ── */
  const goToPage = useCallback(
    (index: number, opts: { scroll?: boolean } = {}) => {
      if (total === 0) return;
      const target = clamp(index, 0, total - 1);
      setCurrentPage(target);
      if (prefs.mode === 'continuous' && opts.scroll !== false) {
        const el = pageRefs.current[target];
        if (el && scrollRef.current) {
          scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: 'auto' });
        }
      } else if (scrollRef.current) {
        scrollRef.current.scrollTo({ top: 0, left: 0 });
      }
    },
    [total, prefs.mode]
  );

  const loadChapter = useCallback(
    async (ch: ReaderChapterRef, startAt: 'start' | 'end' = 'start') => {
      if (!ch || loadingChapter) return;
      setLoadingChapter(ch.url);
      setChapterError(null);
      try {
        const res = await loadChapterPages(ch.url, chapterContext?.mangaUrl || '', chapterContext?.sourceName || '');
        if (res.success && res.data && res.data.pages.length > 0) {
          const newPages = res.data.pages;
          const start = startAt === 'end' ? Math.max(0, newPages.length - 1) : 0;
          setPages(newPages);
          setChapterUrl(ch.url);
          setCurrentPage(start);
          pageRefs.current = [];
          pendingScrollTo.current = start;
          scrollRef.current?.scrollTo({ top: 0, left: 0 });
          const newTitle = chapterContext?.mangaTitle ? `${chapterContext.mangaTitle} - ${chapterLabel(ch)}` : chapterLabel(ch);
          setChapterTitle(newTitle);
          onTitleChange?.(newTitle);
        } else {
          setChapterError(tMaybe(res.error) || t('Não foi possível carregar este capítulo.'));
        }
      } catch (err: any) {
        setChapterError(tMaybe(err?.message) || t('Erro ao carregar o capítulo.'));
      } finally {
        setLoadingChapter(null);
      }
    },
    [chapterContext?.mangaUrl, chapterContext?.sourceName, chapterContext?.mangaTitle, loadingChapter, onTitleChange]
  );

  const goNext = useCallback(() => {
    const target = prefs.mode === 'double' ? (isSoloCover ? 1 : currentPage + 2) : currentPage + 1;
    if (target <= total - 1) goToPage(target);
    else if (nextChapter) loadChapter(nextChapter, 'start');
  }, [currentPage, total, goToPage, nextChapter, loadChapter, prefs.mode, isSoloCover]);

  const goPrev = useCallback(() => {
    if (currentPage > 0) {
      const target = prefs.mode === 'double' ? (prefs.coverAlone && currentPage <= 2 ? (currentPage === 2 ? 1 : 0) : currentPage - 2) : currentPage - 1;
      goToPage(Math.max(0, target));
    } else if (prevChapter) loadChapter(prevChapter, isPaged ? 'end' : 'start');
  }, [currentPage, goToPage, prevChapter, loadChapter, isPaged, prefs.mode, prefs.coverAlone]);

  // Esquerda/direita respeitam a direção de leitura (mangá japonês = direita para esquerda)
  const goLeft = isRtl ? goNext : goPrev;
  const goRight = isRtl ? goPrev : goNext;

  const toggleFullscreen = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const zoomIn = useCallback(() => {
    if (prefs.mode === 'continuous') updatePrefs({ stripWidth: clamp(prefs.stripWidth + 10, 20, 100) });
    else updatePrefs({ zoom: clamp(prefs.zoom + 10, 30, 300) });
  }, [prefs.mode, prefs.stripWidth, prefs.zoom, updatePrefs]);

  const zoomOut = useCallback(() => {
    if (prefs.mode === 'continuous') updatePrefs({ stripWidth: clamp(prefs.stripWidth - 10, 20, 100) });
    else updatePrefs({ zoom: clamp(prefs.zoom - 10, 30, 300) });
  }, [prefs.mode, prefs.stripWidth, prefs.zoom, updatePrefs]);

  /* ── Teclado (somente na aba ativa e fora de campos de texto) ── */
  useEffect(() => {
    if (!isActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const container = scrollRef.current;
      switch (e.key) {
        case 'ArrowRight':
        case 'd':
        case 'D':
          if (!isPaged && container && e.key === 'ArrowRight' && container.scrollWidth > container.clientWidth) return;
          e.preventDefault();
          if (isPaged) goRight();
          else goNext();
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          if (!isPaged && container && e.key === 'ArrowLeft' && container.scrollWidth > container.clientWidth) return;
          e.preventDefault();
          if (isPaged) goLeft();
          else goPrev();
          break;
        case 'PageDown':
        case ' ':
          e.preventDefault();
          if (!isPaged && container) {
            const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
            if (atBottom && e.key === ' ' && !e.shiftKey && nextChapter) loadChapter(nextChapter);
            else container.scrollBy({ top: (e.shiftKey ? -1 : 1) * container.clientHeight * 0.85, behavior: 'smooth' });
          } else if (e.shiftKey) goPrev();
          else goNext();
          break;
        case 'PageUp':
          e.preventDefault();
          if (!isPaged && container) container.scrollBy({ top: -container.clientHeight * 0.85, behavior: 'smooth' });
          else goPrev();
          break;
        case 'Home':
          e.preventDefault();
          goToPage(0);
          break;
        case 'End':
          e.preventDefault();
          goToPage(total - 1);
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case '+':
        case '=':
          e.preventDefault();
          zoomIn();
          break;
        case '-':
          e.preventDefault();
          zoomOut();
          break;
        case 'Escape':
          if (showThumbnails) setShowThumbnails(false);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isActive, isPaged, goLeft, goRight, goNext, goPrev, goToPage, total, toggleFullscreen, zoomIn, zoomOut, showThumbnails, nextChapter, loadChapter]);

  // Sai da tela cheia se a aba deixar de ser a ativa
  useEffect(() => {
    if (!isActive && document.fullscreenElement && document.fullscreenElement === rootRef.current) {
      document.exitFullscreen?.().catch(() => {});
    }
  }, [isActive]);

  /* ── Modo contínuo: acompanha a página visível ── */
  const handleScroll = () => {
    if (prefs.mode !== 'continuous' || scrollTicking.current) return;
    scrollTicking.current = true;
    requestAnimationFrame(() => {
      scrollTicking.current = false;
      const container = scrollRef.current;
      if (!container) return;
      const probe = container.scrollTop + container.clientHeight * 0.35;
      const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 4;
      let idx = 0;
      for (let i = 0; i < pageRefs.current.length; i++) {
        const el = pageRefs.current[i];
        if (!el) continue;
        if (el.offsetTop <= probe) idx = i;
        else break;
      }
      // No fim da rolagem, considera a última página lida
      if (atBottom) idx = Math.max(0, pageRefs.current.length - 1);
      setCurrentPage((prev) => (prev === idx ? prev : idx));
    });
  };

  // Rola até a página inicial (ou a página atual ao trocar de modo)
  useEffect(() => {
    if (prefs.mode !== 'continuous') return;
    const target = pendingScrollTo.current;
    if (target === null || target === undefined) return;
    const raf = requestAnimationFrame(() => {
      const el = pageRefs.current[target];
      if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - 8;
      pendingScrollTo.current = null;
    });
    return () => cancelAnimationFrame(raf);
  }, [prefs.mode, pages]);

  // Ajusta a página para o início de um par (respeitando "capa sozinha")
  const alignDouble = (page: number, coverAlone: boolean) => {
    if (coverAlone) return page === 0 ? 0 : page % 2 === 1 ? page : page - 1;
    return page % 2 === 0 ? page : page - 1;
  };

  const setMode = (mode: ReaderMode) => {
    if (mode === prefs.mode) return;
    if (mode === 'continuous') pendingScrollTo.current = currentPage;
    if (mode === 'double') setCurrentPage(alignDouble(currentPage, prefs.coverAlone));
    updatePrefs({ mode });
  };

  /* ── Clique nas laterais da página (modos paginados) ── */
  const handlePagedClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 0.33) goLeft();
    else if (x > 0.67) goRight();
    else setUiHidden((h) => !h);
  };

  /* ── Estilos de ajuste ── */
  const pagedImgStyle = (count: number): React.CSSProperties => {
    const z = prefs.zoom / 100;
    if (prefs.fit === 'height') return { height: `calc((100% - 0px) * ${z})`, maxHeight: 'none', width: 'auto', maxWidth: count === 2 ? 'none' : 'none' };
    if (prefs.fit === 'width') return { width: `${(100 / count) * z}%`, height: 'auto' };
    return { width: 'auto', height: 'auto', transform: z !== 1 ? `scale(${z})` : undefined, transformOrigin: 'top center' };
  };

  const progressPct = total > 0 ? ((currentPage + 1) / total) * 100 : 0;

  /* ─────────────────────────── Estados vazios ─────────────────────────── */

  if (total === 0 && !loadingChapter) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-canvas text-fg-muted">
        <div className="w-14 h-14 rounded-2xl bg-subtle flex items-center justify-center mb-4 text-accent">
          <BookOpen size={28} />
        </div>
        <h3 className="text-base font-semibold text-fg mb-1">{t('Nenhuma página para exibir')}</h3>
        <p className="text-xs max-w-sm leading-relaxed">
          {t('Abra uma pasta com imagens em')} <strong className="text-fg-2">{t('Pasta local')}</strong> {t('ou escolha um capítulo na sua biblioteca para começar a ler.')}
        </p>
      </div>
    );
  }

  const displayTitle = chapterTitle || title;
  const endOfChapter = total > 0 && currentPage >= total - step;

  /* ─────────────────────────── Render ─────────────────────────── */

  return (
    <div ref={rootRef} className="flex flex-col h-full w-full bg-canvas text-fg-2 select-none overflow-hidden relative">
      {/* Barra superior */}
      <div
        className={`flex items-center gap-3 px-3 h-11 bg-surface border-b border-line-subtle text-xs z-20 flex-shrink-0 transition-[margin] duration-200 ${
          uiHidden ? '-mt-11' : ''
        }`}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <span className="text-accent shrink-0">{icon || <BookOpen size={16} />}</span>
          <div className="min-w-0">
            <div className="font-semibold text-fg truncate text-[13px] leading-tight" title={displayTitle}>
              {displayTitle}
            </div>
            {currentChapter && orderedChapters.length > 1 && (
              <div className="text-[10.5px] text-fg-muted leading-tight">
                {t('Capítulo {n} de {total}', { n: chapterIndex + 1, total: orderedChapters.length })}
              </div>
            )}
          </div>
        </div>

        {/* Modo de leitura */}
        <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-canvas border border-line-subtle shrink-0" role="group" aria-label={t('Modo de leitura')}>
          <ToolButton onClick={() => setMode('continuous')} active={prefs.mode === 'continuous'} title={t('Contínuo / Webtoon')}>
            <ScrollText size={15} />
          </ToolButton>
          <ToolButton onClick={() => setMode('single')} active={prefs.mode === 'single'} title={t('Página única')}>
            <BookOpen size={15} />
          </ToolButton>
          <ToolButton onClick={() => setMode('double')} active={prefs.mode === 'double'} title={t('Página dupla')}>
            <Columns2 size={15} />
          </ToolButton>
        </div>

        {isPaged && (
          <div className="flex items-center gap-0.5 shrink-0" role="group" aria-label={t('Ajuste')}>
            <ToolButton onClick={() => updatePrefs({ fit: 'height' })} active={prefs.fit === 'height'} title={t('Ajustar à altura')}>
              <MoveVertical size={15} />
            </ToolButton>
            <ToolButton onClick={() => updatePrefs({ fit: 'width' })} active={prefs.fit === 'width'} title={t('Ajustar à largura')}>
              <MoveHorizontal size={15} />
            </ToolButton>
            <ToolButton onClick={() => updatePrefs({ fit: 'original' })} active={prefs.fit === 'original'} title={t('Tamanho original')}>
              <Scan size={15} />
            </ToolButton>
            <span className="w-px h-4 bg-line mx-1" />
            <ToolButton
              onClick={() => updatePrefs({ direction: prefs.direction === 'ltr' ? 'rtl' : 'ltr' })}
              active={prefs.direction === 'rtl'}
              title={prefs.direction === 'rtl' ? t('Direção: direita → esquerda (mangá)') : t('Direção: esquerda → direita')}
            >
              <ArrowLeftRight size={15} />
              <span className="text-[10.5px] font-semibold">{prefs.direction === 'rtl' ? 'RTL' : 'LTR'}</span>
            </ToolButton>
            {prefs.mode === 'double' && (
              <ToolButton
                onClick={() => {
                  const next = !prefs.coverAlone;
                  updatePrefs({ coverAlone: next });
                  setCurrentPage((p) => alignDouble(p, next));
                }}
                active={prefs.coverAlone}
                title={prefs.coverAlone ? t('Capa sozinha (desative se as páginas duplas ficarem desalinhadas)') : t('Capa junto (ative se as páginas duplas ficarem desalinhadas)')}
              >
                <BookOpen size={15} />
                <span className="text-[10.5px] font-semibold">1+2</span>
              </ToolButton>
            )}
          </div>
        )}

        <div className="flex items-center gap-0.5 shrink-0">
          <ToolButton onClick={zoomOut} title={t('Diminuir (−)')}>
            <ZoomOut size={15} />
          </ToolButton>
          <button
            type="button"
            onClick={() => (prefs.mode === 'continuous' ? updatePrefs({ stripWidth: DEFAULT_PREFS.stripWidth }) : updatePrefs({ zoom: 100 }))}
            className="text-[11px] tabular-nums w-11 text-center text-fg-muted hover:text-fg cursor-pointer"
            title={t('Restaurar tamanho')}
          >
            {prefs.mode === 'continuous' ? `${prefs.stripWidth}%` : `${prefs.zoom}%`}
          </button>
          <ToolButton onClick={zoomIn} title={t('Aumentar (+)')}>
            <ZoomIn size={15} />
          </ToolButton>
          <span className="w-px h-4 bg-line mx-1" />
          <ToolButton onClick={() => setShowThumbnails((s) => !s)} active={showThumbnails} title={t('Miniaturas das páginas')}>
            <LayoutGrid size={15} />
          </ToolButton>
          {externalUrl && (
            <ToolButton
              onClick={() => {
                if (window.electronAPI?.openExternal) window.electronAPI.openExternal(externalUrl);
              }}
              title={t('Abrir no site original')}
            >
              <ExternalLink size={15} />
            </ToolButton>
          )}
          <ToolButton onClick={toggleFullscreen} active={isFullscreen} title={isFullscreen ? t('Sair da tela cheia (F)') : t('Tela cheia (F)')}>
            {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
          </ToolButton>
        </div>
      </div>

      {/* Barra fina de progresso */}
      <div className="h-[2px] bg-line-subtle flex-shrink-0 z-20">
        <div className="h-full bg-accent transition-[width] duration-200" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Área de leitura */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className={`flex-1 overflow-auto relative ${prefs.mode === 'continuous' ? '' : 'flex'} bg-[#0a0a0c]`}
          style={{ overflowAnchor: 'auto' }}
        >
          {prefs.mode === 'continuous' && (
            <div className="mx-auto flex flex-col items-center py-4" style={{ width: `${prefs.stripWidth}%`, minWidth: 280 }}>
              {pages.map((p, idx) => (
                <div
                  key={`${p.url}-${idx}`}
                  ref={(el) => {
                    pageRefs.current[idx] = el;
                  }}
                  data-page={idx}
                  className={`w-full ${prefs.gaps ? 'mb-2' : ''}`}
                >
                  <PageImage page={p} index={idx} lazy={Math.abs(idx - initialPageIndex) > 2} className="w-full h-auto block" />
                </div>
              ))}

              {/* Fim do capítulo */}
              <div className="w-full mt-6 mb-10 rounded-xl border border-line-subtle bg-surface p-5 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 text-sm text-fg">
                  <CheckCircle2 size={18} className="text-success-fg" />
                  <span>{t('Fim de')} <strong className="font-semibold">{chapterLabel(currentChapter) || displayTitle}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  {prevChapter && (
                    <button
                      type="button"
                      onClick={() => loadChapter(prevChapter)}
                      className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg-2 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <ChevronsLeft size={14} /> {t('Anterior')}
                    </button>
                  )}
                  {nextChapter ? (
                    <button
                      type="button"
                      onClick={() => loadChapter(nextChapter)}
                      className="h-8 px-4 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {t('Próximo: {name}', { name: chapterLabel(nextChapter) })} <ChevronsRight size={14} />
                    </button>
                  ) : (
                    orderedChapters.length > 1 && <span className="text-xs text-fg-muted">{t('Você chegou ao último capítulo disponível.')}</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {isPaged && pages[currentPage] && (
            <div
              className={`relative flex-1 min-h-full flex items-center justify-center ${prefs.fit === 'original' ? 'items-start' : ''} p-2 cursor-pointer`}
              onClick={handlePagedClick}
            >
              <div className={`flex ${isRtl ? 'flex-row-reverse' : 'flex-row'} items-center justify-center gap-1 h-full ${prefs.fit === 'width' ? 'w-full' : ''}`}>
                <PageImage
                  key={`p-${currentPage}-${pages[currentPage].url}`}
                  page={pages[currentPage]}
                  index={currentPage}
                  placeholderClass="min-h-[50vh] min-w-[30vw]"
                  className={prefs.fit === 'height' ? 'h-full w-auto object-contain' : 'object-contain'}
                  style={prefs.fit === 'height' ? { height: `calc(100vh * ${prefs.zoom / 100} - ${isFullscreen ? 60 : 160}px)` } : pagedImgStyle(prefs.mode === 'double' ? 2 : 1)}
                />
                {showsSecond && (
                  <PageImage
                    key={`p-${currentPage + 1}-${pages[currentPage + 1].url}`}
                    page={pages[currentPage + 1]}
                    index={currentPage + 1}
                    placeholderClass="min-h-[50vh] min-w-[30vw]"
                    className={prefs.fit === 'height' ? 'h-full w-auto object-contain' : 'object-contain'}
                    style={prefs.fit === 'height' ? { height: `calc(100vh * ${prefs.zoom / 100} - ${isFullscreen ? 60 : 160}px)` } : pagedImgStyle(2)}
                  />
                )}
              </div>
            </div>
          )}

          {/* Carregando outro capítulo */}
          {loadingChapter && (
            <div className="absolute inset-0 z-30 bg-canvas/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-fg">
              <Loader2 size={30} className="animate-spin text-accent" />
              <span className="text-sm">{t('Carregando capítulo…')}</span>
            </div>
          )}
        </div>

        {/* Indicador flutuante de página (modo contínuo) */}
        {prefs.mode === 'continuous' && total > 0 && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 px-3 py-1 rounded-full bg-surface/90 border border-line text-[11px] text-fg tabular-nums shadow-pop pointer-events-none">
            {currentPage + 1} / {total}
          </div>
        )}

        {/* Erro ao trocar de capítulo */}
        {chapterError && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 max-w-lg flex items-center gap-2 px-3 py-2 rounded-lg bg-surface border border-danger/50 text-xs text-danger-fg shadow-pop">
            <span className="flex-1">{chapterError}</span>
            <button type="button" onClick={() => setChapterError(null)} className="p-0.5 rounded hover:bg-subtle cursor-pointer" aria-label={t('Fechar')}>
              <X size={13} />
            </button>
          </div>
        )}

        {/* Miniaturas */}
        {showThumbnails && (
          <aside className="w-52 bg-surface border-l border-line-subtle overflow-y-auto flex-shrink-0 animate-tp-fade-in">
            <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur px-3 py-2 text-[11px] font-semibold text-fg-muted border-b border-line-subtle flex items-center justify-between">
              <span>{t('Páginas ({n})', { n: total })}</span>
              <button type="button" onClick={() => setShowThumbnails(false)} className="p-0.5 rounded hover:bg-subtle cursor-pointer" aria-label={t('Fechar miniaturas')}>
                <X size={13} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 p-2">
              {pages.map((p, idx) => (
                <button
                  type="button"
                  key={`t-${idx}`}
                  onClick={() => goToPage(prefs.mode === 'double' ? alignDouble(idx, prefs.coverAlone) : idx)}
                  className={`rounded-md overflow-hidden border-2 transition-colors cursor-pointer text-left ${
                    currentPage === idx || (showsSecond && currentPage + 1 === idx) ? 'border-accent' : 'border-transparent hover:border-line'
                  }`}
                >
                  <img src={toMediaUrl(p.url)} alt="" loading="lazy" draggable={false} className="w-full aspect-[3/4] object-cover bg-subtle" />
                  <span className="block text-center text-[10px] text-fg-muted py-0.5 tabular-nums">{idx + 1}</span>
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      {/* Barra inferior (modos paginados) */}
      {isPaged && (
        <div
          className={`flex items-center gap-3 px-3 h-12 bg-surface border-t border-line-subtle text-xs flex-shrink-0 transition-[margin] duration-200 ${
            uiHidden ? '-mb-12' : ''
          }`}
        >
          <ToolButton onClick={() => prevChapter && loadChapter(prevChapter)} disabled={!prevChapter} title={prevChapter ? t('Capítulo anterior: {name}', { name: chapterLabel(prevChapter) }) : t('Sem capítulo anterior')}>
            <ChevronsLeft size={16} />
          </ToolButton>
          <ToolButton onClick={goLeft} title={t('Página à esquerda (←)')}>
            <ChevronLeft size={16} />
          </ToolButton>

          <div className="flex-1 flex items-center gap-3" dir={isRtl ? 'rtl' : 'ltr'}>
            <input
              type="range"
              min={0}
              max={Math.max(0, total - 1)}
              value={currentPage}
              onChange={(e) => goToPage(Number(e.target.value))}
              className="w-full h-1.5 cursor-pointer"
              aria-label={t('Página')}
            />
          </div>
          <span className="text-[12px] tabular-nums text-fg-muted whitespace-nowrap w-16 text-center">
            {showsSecond ? `${currentPage + 1}-${currentPage + 2}` : currentPage + 1} / {total}
          </span>

          <ToolButton onClick={goRight} title={t('Página à direita (→)')}>
            <ChevronRight size={16} />
          </ToolButton>
          <ToolButton onClick={() => nextChapter && loadChapter(nextChapter)} disabled={!nextChapter} title={nextChapter ? t('Próximo capítulo: {name}', { name: chapterLabel(nextChapter) }) : t('Sem próximo capítulo')}>
            <ChevronsRight size={16} />
          </ToolButton>
        </div>
      )}

      {/* Aviso de fim de capítulo nos modos paginados */}
      {isPaged && endOfChapter && nextChapter && !uiHidden && (
        <div className="absolute bottom-16 right-4 z-20 animate-tp-slide-up">
          <button
            type="button"
            onClick={() => loadChapter(nextChapter)}
            className="h-9 px-4 rounded-full bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 shadow-pop cursor-pointer"
          >
            {t('Próximo: {name}', { name: chapterLabel(nextChapter) })} <ChevronsRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
};
