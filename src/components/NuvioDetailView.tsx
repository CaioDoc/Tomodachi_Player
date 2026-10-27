// src/components/NuvioDetailView.tsx
// Tela de uma obra do Nuvio: detalhes (Cinemeta), episódios, fontes dos plugins e favoritos.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Play,
  Heart,
  Star,
  Loader2,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Circle,
  Plug,
  Clock,
  Tags,
  Film,
  Radio,
  ChevronDown,
  ChevronRight,
  Subtitles,
  Puzzle,
} from 'lucide-react';
import {
  NUVIO_EVENT,
  activeScrapers,
  addonsFor,
  isHlsStream,
  nuvioChapters,
  nuvioEpisodeUrl,
  nuvioWorkUrl,
  nuvioLibraryItem,
  nuvioMeta,
  nuvioMovieUrl,
  parseNuvioUrl,
  playNuvioStream,
  qualityRank,
  runNuvioScrapers,
  suggestNuvioTags,
  type NuvioMeta,
  type ScraperRun,
} from '../api/nuvio';
import { readLibrary, updateLibrary } from '../utils/libraryStore';
import { getProgressMap, updateChapterProgress, PROGRESS_EVENT } from '../utils/progress';
import { FavoriteTagModal } from './FavoriteTagModal';
import { StreamRunList } from './StreamRunList';
import { openWatchSources } from '../api/watchSources';
import { getResume, CONTINUE_EVENT, fmtClock } from '../utils/continueWatching';
import { getVideoPositionInfo } from '../utils/progress';
import { t, tn, locale } from '../i18n';
import type { TabType } from '../types';

type OpenTabFn = (typeOrTab: TabType | any, title?: string, data?: any) => void;

interface Props {
  work: any;
  focusEpisode?: string;
  onOpenTab?: OpenTabFn;
}

interface Target {
  url: string;
  label: string;
  season?: number;
  episode?: number;
}

export const NuvioDetailView: React.FC<Props> = ({ work, focusEpisode, onOpenTab }) => {
  const parsed = useMemo(() => parseNuvioUrl(work?.url || ''), [work?.url]);
  const [meta, setMeta] = useState<NuvioMeta | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [libEntry, setLibEntry] = useState<any | null>(null);
  const [progress, setProgress] = useState(() => getProgressMap('video'));
  const [posTick, setPosTick] = useState(0);
  useEffect(() => {
    const on = () => setPosTick((n) => n + 1);
    window.addEventListener(CONTINUE_EVENT, on);
    window.addEventListener('focus', on);
    return () => {
      window.removeEventListener(CONTINUE_EVENT, on);
      window.removeEventListener('focus', on);
    };
  }, []);
  const [season, setSeason] = useState<number | null>(null);
  const [target, setTarget] = useState<Target | null>(null);
  const [runs, setRuns] = useState<ScraperRun[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [favOpen, setFavOpen] = useState(false);
  const [pluginsVersion, setPluginsVersion] = useState(0);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const signalRef = useRef<{ cancelled: boolean }>({ cancelled: false });
  const focusDone = useRef(false);

  /* ── dados ── */
  const loadMeta = useCallback(async () => {
    if (!parsed) return;
    setLoadError(null);
    try {
      setMeta(await nuvioMeta(parsed.type, parsed.imdbId, work?.nuvio?.addonUrl || work?.addonUrl));
    } catch (err: any) {
      setLoadError(String(err?.message || err));
    }
  }, [parsed]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const refreshLib = useCallback(() => {
    readLibrary('video').then((lib) => setLibEntry((lib.entries || []).find((e: any) => e?.url === work?.url) || null));
  }, [work?.url]);

  useEffect(() => {
    refreshLib();
    const onProg = () => setProgress(getProgressMap('video'));
    const onPlugins = () => setPluginsVersion((v) => v + 1);
    window.addEventListener('video:library-updated', refreshLib);
    window.addEventListener('backup:applied', refreshLib);
    window.addEventListener(PROGRESS_EVENT, onProg);
    window.addEventListener(NUVIO_EVENT, onPlugins);
    window.addEventListener('extensions:updated', onPlugins);
    return () => {
      window.removeEventListener('extensions:updated', onPlugins);
      window.removeEventListener('video:library-updated', refreshLib);
      window.removeEventListener('backup:applied', refreshLib);
      window.removeEventListener(PROGRESS_EVENT, onProg);
      window.removeEventListener(NUVIO_EVENT, onPlugins);
    };
  }, [refreshLib]);

  // Obra na biblioteca: acrescenta episódios lançados que ainda não estão lá
  useEffect(() => {
    if (!meta || !libEntry || meta.type !== 'series') return;
    const fresh = nuvioChapters(meta).filter((c: any) => !c.dateUpload || c.dateUpload <= Date.now());
    const known = new Set((libEntry.chapters || []).map((c: any) => c.url));
    const missing = fresh.filter((c) => !known.has(c.url));
    if (missing.length === 0) return;
    void updateLibrary(
      'video',
      (all) =>
        all.map((it: any) => (it?.url === libEntry.url ? { ...it, chapters: [...(it.chapters || []), ...missing], totalChapters: (it.chapters || []).length + missing.length } : it)),
      { notify: true }
    );
  }, [meta, libEntry]);

  /* ── episódios ── */
  const seasons = useMemo(() => {
    if (!meta || meta.type !== 'series') return [];
    return Array.from(new Set(meta.episodes.filter((e) => e.season > 0).map((e) => e.season))).sort((a, b) => a - b);
  }, [meta]);

  const isWatched = useCallback((url: string) => !!progress[url]?.read || !!libEntry?.chapters?.find((c: any) => c.url === url && c.read), [progress, libEntry]);

  // Próximo episódio a assistir
  const nextUp = useMemo<Target | null>(() => {
    if (!meta) return null;
    if (meta.type === 'movie') return { url: nuvioMovieUrl(meta.id), label: meta.name };
    const now = Date.now();
    const eps = meta.episodes.filter((e) => e.season > 0 && (!e.released || Date.parse(e.released) <= now));
    if (eps.length === 0) return null;
    // Um episódio em andamento vem primeiro ("Continuar")
    const inProgress = eps.find((e) => {
      const u = nuvioEpisodeUrl(meta.id, e.season, e.episode);
      return !isWatched(u) && (getVideoPositionInfo(u)?.t || 0) > 0;
    });
    let lastIdx = -1;
    eps.forEach((e, i) => {
      if (isWatched(nuvioEpisodeUrl(meta.id, e.season, e.episode))) lastIdx = i;
    });
    const e = inProgress || eps[Math.min(eps.length - 1, lastIdx + 1)];
    return { url: nuvioEpisodeUrl(meta.id, e.season, e.episode), label: t('T{s} E{e}', { s: e.season, e: e.episode }), season: e.season, episode: e.episode };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, isWatched, posTick]);

  useEffect(() => {
    if (season == null && seasons.length) setSeason(nextUp?.season ?? seasons[0]);
  }, [seasons, nextUp, season]);

  /* ── fontes ── */
  // ID no formato do Stremio (filme: "tt123"; episódio: o ID do vídeo, ex.: "tt123:1:2" ou "kitsu:5:3")
  const stremioIdFor = useCallback(
    (tg: Target) => {
      if (!meta) return '';
      if (meta.type === 'movie') return meta.id;
      const ep = meta.episodes.find((e) => e.season === tg.season && e.episode === tg.episode);
      return ep?.id || `${meta.id}:${tg.season}:${tg.episode}`;
    },
    [meta]
  );

  // Assistir: abre "Onde assistir" (todas as fontes), igual à página da Biblioteca
  const search = useCallback(
    async (tg: Target) => {
      if (!meta) return;
      setTarget(tg);
      openWatchSources({
        title: meta.name,
        year: meta.year ? Number(String(meta.year).slice(0, 4)) || undefined : undefined,
        kind: meta.type === 'movie' ? 'movie' : 'series',
        season: tg.season,
        episode: tg.episode ?? 1,
        imdbId: meta.id,
        addonUrl: meta.addonUrl,
        tmdbId: meta.tmdbId,
        cover: meta.poster,
        episodeUrl: tg.url,
        workUrl: nuvioWorkUrl(meta.type, meta.id),
        episodeUrls:
          meta.type === 'series' && tg.season != null
            ? Object.fromEntries(meta.episodes.filter((e) => e.season === tg.season).map((e) => [String(e.episode), nuvioEpisodeUrl(meta.id, e.season, e.episode)]))
            : undefined,
      });
    },
    [meta]
  );

  useEffect(() => () => void (signalRef.current.cancelled = true), []);

  // Vindo de "Atualizações"/"Histórico": abre já no episódio
  useEffect(() => {
    if (!meta || focusDone.current) return;
    if (meta.type === 'movie') {
      focusDone.current = true;
      if (focusEpisode) void search({ url: nuvioMovieUrl(meta.id), label: meta.name });
      return;
    }
    const f = focusEpisode ? parseNuvioUrl(focusEpisode) : null;
    if (f?.season != null && f.episode != null) {
      focusDone.current = true;
      setSeason(f.season);
      void search({ url: focusEpisode!, label: t('T{s} E{e}', { s: f.season, e: f.episode }), season: f.season, episode: f.episode });
    }
  }, [meta, focusEpisode, search]);

  const toggleWatched = (url: string) => updateChapterProgress('video', { [url]: { read: !isWatched(url) } });

  /* ── favoritos ── */
  const favItem = useMemo(() => {
    if (!meta) return null;
    const base = nuvioLibraryItem(meta);
    return libEntry ? { ...base, ...libEntry, categories: libEntry.categories || [], favorite: libEntry.favorite } : base;
  }, [meta, libEntry]);

  const existingCats = useMemo(() => {
    try {
      return JSON.parse(localStorage.getItem('video_categories') || '[]') as string[];
    } catch {
      return [];
    }
  }, [favOpen]);
  const suggestions = useMemo(() => (meta ? suggestNuvioTags(meta, existingCats) : []), [meta, existingCats]);

  /* ── render ── */
  if (!parsed) return <div className="p-8 text-fg-muted text-sm">{t('Obra inválida')}</div>;

  if (loadError && !meta) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-canvas">
        <AlertTriangle size={26} className="text-warning-fg mb-2" />
        <p className="text-sm text-fg">{t('Não foi possível carregar a obra')}</p>
        <p className="text-[12px] text-fg-muted mt-1">{loadError}</p>
        <button type="button" onClick={() => void loadMeta()} className="mt-3 h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-[12px] text-fg cursor-pointer">
          {t('Tentar de novo')}
        </button>
      </div>
    );
  }

  const title = meta?.name || work?.title || '';
  const poster = meta?.poster || work?.cover;
  const inLibrary = !!libEntry;
  const fmtDate = (s?: string) => {
    if (!s) return '';
    const d = new Date(s);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const allStreams = (runs || []).reduce((n, r) => n + r.streams.length, 0);
  const sortedRuns = [...(runs || [])].sort((a, b) => {
    const order = (r: ScraperRun) => (r.status === 'done' && r.streams.length ? 0 : r.status === 'running' ? 1 : 2);
    return order(a) - order(b);
  });

  return (
    <div className="h-full overflow-y-auto bg-canvas text-fg-2">
      {/* Cabeçalho */}
      <div className="relative">
        {meta?.background && (
          <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
            <img src={meta.background} alt="" className="w-full h-full object-cover opacity-30 blur-[2px] scale-105" referrerPolicy="no-referrer" />
            <div className="absolute inset-0 bg-gradient-to-t from-canvas via-canvas/80 to-canvas/30" />
          </div>
        )}
        <div className="relative max-w-6xl mx-auto px-6 pt-8 pb-6 flex gap-6">
          <div className="w-36 sm:w-44 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-subtle border border-line shadow-pop">
            {poster ? <img src={poster} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Film size={30} className="m-auto mt-16 text-fg-muted" />}
          </div>
          <div className="min-w-0 flex-1 flex flex-col">
            <span className="text-[11px] uppercase tracking-[0.1em] text-fg-muted">
              {parsed.type === 'movie' ? t('Filme') : t('Série')}
            </span>
            <h1 className="text-2xl font-bold text-fg mt-1 leading-tight">{title || <span className="inline-block h-7 w-64 rounded bg-subtle animate-pulse" />}</h1>
            {meta && (
              <div className="flex items-center gap-2.5 mt-2 text-[12.5px] text-fg-muted flex-wrap">
                {meta.releaseInfo && <span>{meta.releaseInfo}</span>}
                {meta.runtime && (
                  <span className="inline-flex items-center gap-1">
                    <Clock size={12} /> {meta.runtime}
                  </span>
                )}
                {meta.imdbRating && (
                  <span className="inline-flex items-center gap-1 text-fg">
                    <Star size={12} className="text-yellow-400" fill="currentColor" /> {meta.imdbRating}
                  </span>
                )}
                {meta.type === 'series' && <span>{tn(seasons.length, '{n} temporada', '{n} temporadas')}</span>}
              </div>
            )}
            {meta?.genres?.length ? (
              <div className="flex flex-wrap gap-1.5 mt-3">
                {meta.genres.map((g) => (
                  <span key={g} className="text-[11px] px-2 py-0.5 rounded-full bg-subtle border border-line-subtle text-fg-2">
                    {g}
                  </span>
                ))}
              </div>
            ) : null}
            {meta?.description && <p className="mt-3 text-[13px] leading-relaxed text-fg-2 line-clamp-4 max-w-3xl">{meta.description}</p>}
            {meta?.cast?.length ? <p className="mt-2 text-[11.5px] text-fg-muted truncate">{t('Elenco: {names}', { names: meta.cast.slice(0, 5).join(', ') })}</p> : null}

            <div className="flex items-center gap-2 mt-auto pt-4 flex-wrap">
              <button
                type="button"
                disabled={!nextUp}
                onClick={() => {
                  if (!nextUp) return;
                  // Continuar: reabre a mesma fonte no ponto salvo
                  const r = getResume(nextUp.url);
                  if (r?.play) onOpenTab?.('video-player', r.title, r.play);
                  else void search(nextUp);
                }}
                className="h-9 px-4 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[13px] font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Play size={14} fill="currentColor" />
                {(() => {
                  const pos = nextUp ? getVideoPositionInfo(nextUp.url) : null;
                  if (pos?.t) return meta?.type === 'movie' ? t('Continuar · {time}', { time: fmtClock(pos.t) }) : t('Continuar {ep} · {time}', { ep: nextUp!.label, time: fmtClock(pos.t) });
                  return meta?.type === 'movie' ? t('Assistir') : nextUp ? t('Assistir {ep}', { ep: nextUp.label }) : t('Assistir');
                })()}
              </button>
              <button
                type="button"
                disabled={!favItem}
                onClick={() => setFavOpen(true)}
                className={`h-9 px-4 rounded-md text-[13px] font-medium inline-flex items-center gap-2 cursor-pointer border ${
                  inLibrary && libEntry?.favorite !== false ? 'bg-rose-600/15 border-rose-500/50 text-fg' : 'bg-subtle hover:bg-elevated border-line text-fg'
                }`}
              >
                <Heart size={14} className={inLibrary ? 'text-rose-500' : ''} fill={inLibrary ? 'currentColor' : 'none'} />
                {inLibrary ? t('Na biblioteca') : t('Favoritar')}
              </button>
              {inLibrary && libEntry?.categories?.length ? (
                <span className="text-[11.5px] text-fg-muted inline-flex items-center gap-1">
                  <Tags size={12} /> {libEntry.categories.join(', ')}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      {/* Corpo */}
      <div className="max-w-6xl mx-auto px-6 pb-10">
        {!meta ? (
          <div className="flex items-center gap-2 text-[13px] text-fg-muted py-8">
            <Loader2 size={15} className="animate-spin" /> {t('Carregando…')}
          </div>
        ) : meta.type === 'movie' ? null : (
          <div>
            <section className="min-w-0 w-full">
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-3">
                {seasons.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSeason(s)}
                    className={`h-8 px-3 rounded-full text-[12.5px] border shrink-0 cursor-pointer ${
                      season === s ? 'bg-accent/15 border-accent/50 text-fg font-semibold' : 'border-line-subtle text-fg-muted hover:text-fg hover:bg-subtle'
                    }`}
                  >
                    {t('Temporada {n}', { n: s })}
                  </button>
                ))}
              </div>
              <div className="rounded-xl border border-line bg-surface divide-y divide-line-subtle overflow-hidden">
                {meta.episodes
                  .filter((e) => e.season === season)
                  .map((e) => {
                    const url = nuvioEpisodeUrl(meta.id, e.season, e.episode);
                    const watched = isWatched(url);
                    const selected = target?.url === url;
                    const future = !!e.released && Date.parse(e.released) > Date.now();
                    const label = t('T{s} E{e}', { s: e.season, e: e.episode });
                    return (
                      <div key={url} className={`flex gap-3 p-3 ${selected ? 'bg-accent/10' : 'hover:bg-subtle/50'} ${future ? 'opacity-60' : ''}`}>
                        <button
                          type="button"
                          disabled={future}
                          onClick={() => void search({ url, label, season: e.season, episode: e.episode })}
                          className="relative w-32 aspect-video shrink-0 rounded-md overflow-hidden bg-subtle group cursor-pointer disabled:cursor-default"
                          aria-label={t('Buscar fontes para {ep}', { ep: label })}
                        >
                          {e.thumbnail && <img src={e.thumbnail} alt="" loading="lazy" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(ev) => ((ev.target as HTMLElement).style.display = 'none')} />}
                          {(() => {
                            const pos = getVideoPositionInfo(url);
                            return pos?.t && pos.d > 0 && !watched ? (
                              <span className="absolute left-0 right-0 bottom-0 h-1 bg-black/50">
                                <span className="block h-full bg-accent" style={{ width: `${Math.min(100, (pos.t / pos.d) * 100)}%` }} />
                              </span>
                            ) : null;
                          })()}
                          {!future && (
                            <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/40 transition-colors">
                              <Play size={20} className="text-white opacity-0 group-hover:opacity-100" fill="currentColor" />
                            </span>
                          )}
                        </button>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start gap-2">
                            <button type="button" disabled={future} onClick={() => void search({ url, label, season: e.season, episode: e.episode })} className="text-left min-w-0 flex-1 cursor-pointer disabled:cursor-default">
                              <div className={`text-[13px] font-medium truncate ${watched ? 'text-fg-muted' : 'text-fg'}`}>
                                <span className="text-fg-muted mr-1.5 tabular-nums">E{e.episode}</span>
                                {e.name || label}
                              </div>
                              <div className="text-[11px] text-fg-muted">
                                {future ? t('Estreia em {date}', { date: fmtDate(e.released) }) : fmtDate(e.released)}
                                {!future && !watched && getVideoPositionInfo(url)?.t ? <span className="text-accent"> · {t('Parou em {time}', { time: fmtClock(getVideoPositionInfo(url)!.t) })}</span> : null}
                              </div>
                            </button>
                            {!future && (
                              <button
                                type="button"
                                onClick={() => toggleWatched(url)}
                                title={watched ? t('Marcar como não assistido') : t('Marcar como assistido')}
                                aria-label={watched ? t('Marcar como não assistido') : t('Marcar como assistido')}
                                className="p-1 rounded text-fg-muted hover:text-fg cursor-pointer shrink-0"
                              >
                                {watched ? <CheckCircle2 size={16} className="text-success" /> : <Circle size={16} />}
                              </button>
                            )}
                          </div>
                          {e.overview && <p className="text-[11.5px] text-fg-muted mt-1 line-clamp-2">{e.overview}</p>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </section>
          </div>
        )}
      </div>

      {favItem && (
        <FavoriteTagModal
          isOpen={favOpen}
          onClose={() => setFavOpen(false)}
          manga={favItem as any}
          source="video"
          suggestedTags={suggestions}
          onSaved={() => refreshLib()}
        />
      )}
    </div>
  );
};
