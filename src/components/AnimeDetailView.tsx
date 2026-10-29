// src/components/AnimeDetailView.tsx
// Página de detalhes de um anime/série da biblioteca, aberta em aba própria
// (antes era um modal dentro da biblioteca).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Play,
  Globe,
  Heart,
  CheckCircle2,
  Circle,
  ArrowUpDown,
  Search,
  Film,
  Clock,
  ChevronDown,
  ChevronUp,
  Tv,
  RotateCcw,
  Radio,
} from 'lucide-react';
import type { LibraryItem, LibraryChapter } from './MihonLibrary';
import { readLibrary, updateLibrary } from '../utils/libraryStore';
import { PROGRESS_EVENT, mergeChapterProgress, updateChapterProgress, getVideoPositionInfo } from '../utils/progress';
import { openVideoEpisode, chapterDisplayName } from '../api/openChapter';
import { openWatchSources } from '../api/watchSources';
import { buildAnimeWatchWebUrl } from '../api/extensionRegistry';
import { fetchChapterList } from '../api/chapterList';
import { getResume, CONTINUE_EVENT } from '../utils/continueWatching';
import { Loader2 } from 'lucide-react';
import { FavoriteTagModal } from './FavoriteTagModal';
import { AniListLink } from './AniListPanel';
import { workStatusLabel } from '../constants/labels';
import { t } from '../i18n';
import { MaybeYouLike, WorkTags, useRecommendations, type RecRequest } from './MaybeYouLike';
import { openDiscoverSearch } from '../api/discoverSearch';

type OpenTabFn = (type: any, title: string, data?: any) => void;

interface AnimeDetailViewProps {
  anime: LibraryItem;
  onOpenTab?: OpenTabFn;
}

const stripHtml = (s: string) =>
  (s || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const fmtTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};

const isLocalPath = (url: string) => /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('/') || url.startsWith('\\\\') || url.startsWith('media-file:');

export const AnimeDetailView: React.FC<AnimeDetailViewProps> = ({ anime: initial, onOpenTab }) => {
  const [anime, setAnime] = useState<LibraryItem>(initial);
  const [episodes, setEpisodes] = useState<LibraryChapter[]>(() => mergeChapterProgress(initial?.chapters || [], 'video'));
  const [inLibrary, setInLibrary] = useState(true);
  const [query, setQuery] = useState('');
  const [asc, setAsc] = useState(true);
  const [showFullSynopsis, setShowFullSynopsis] = useState(false);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [, setPosTick] = useState(0);

  // Sempre busca a versão mais recente salva na biblioteca (a aba pode ter sido restaurada)
  const reload = useCallback(async () => {
    if (!initial?.url) return;
    const lib = await readLibrary('video');
    const found = (lib.entries || []).find((e: any) => e?.url === initial.url) as LibraryItem | undefined;
    setInLibrary(!!found);
    if (found) {
      setAnime((a) => ({ ...found, altTitles: a?.altTitles, year: a?.year, format: a?.format, score: a?.score }));
      setEpisodes(mergeChapterProgress(found.chapters || [], 'video'));
    }
  }, [initial?.url]);

  useEffect(() => {
    void reload();
    const onLib = () => void reload();
    const onProgress = (e: any) => {
      if (e?.detail?.source && e.detail.source !== 'video') return;
      setEpisodes((prev) => mergeChapterProgress(prev, 'video'));
      setPosTick((t) => t + 1);
    };
    // Posições de reprodução mudam enquanto o player está aberto em outra aba
    const onFocus = () => setPosTick((t) => t + 1);
    window.addEventListener('video:library-updated', onLib);
    window.addEventListener('backup:applied', onLib);
    window.addEventListener(PROGRESS_EVENT, onProgress);
    window.addEventListener('focus', onFocus);
    window.addEventListener(CONTINUE_EVENT, onFocus);
    const iv = window.setInterval(onFocus, 15000);
    return () => {
      window.removeEventListener('video:library-updated', onLib);
      window.removeEventListener('backup:applied', onLib);
      window.removeEventListener(PROGRESS_EVENT, onProgress);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(CONTINUE_EVENT, onFocus);
      window.clearInterval(iv);
    };
  }, [reload]);

  // Obra aberta fora da biblioteca (catálogo de um site): carrega a lista de episódios do site
  const [loadingEps, setLoadingEps] = useState(false);
  const [epsError, setEpsError] = useState<string | null>(null);
  const triedEps = React.useRef(false);
  useEffect(() => {
    if (triedEps.current || inLibrary || episodes.length > 0) return;
    const url = String(anime?.url || '');
    if (!/^https?:\/\//i.test(url) || /anilist\.co/i.test(url)) return;
    triedEps.current = true;
    setLoadingEps(true);
    setEpsError(null);
    fetchChapterList(url, anime.sourceName || '', url)
      .then((list) => {
        const eps = list
          .filter((c) => c?.url)
          .map((c, i) => ({ url: c.url, name: c.name || t('Episódio {n}', { n: Number(c.number) || i + 1 }), number: Number(c.number) || i + 1, read: false, bookmark: false, lastPageRead: 0, lastSecondSeen: 0, lastModifiedAt: Date.now() }));
        setEpisodes(mergeChapterProgress(eps as LibraryChapter[], 'video'));
      })
      .catch((err) => setEpsError(String(err?.message || err)))
      .finally(() => setLoadingEps(false));
  }, [inLibrary, episodes.length, anime?.url, anime?.sourceName]);

  const persist = useCallback(
    (next: LibraryChapter[]) => {
      void updateLibrary('video', (entries) =>
        entries.map((it: any) => (it?.url === anime.url ? { ...it, chapters: next, readChapters: next.filter((c) => c.read).length } : it))
      );
    },
    [anime.url]
  );

  const setWatched = (urls: string[], read: boolean) => {
    const set = new Set(urls);
    const next = episodes.map((c) => (set.has(c.url) ? { ...c, read } : c));
    setEpisodes(next);
    updateChapterProgress('video', Object.fromEntries(urls.map((u) => [u, { read }])), { silent: true });
    persist(next);
  };

  const sortedAsc = useMemo(() => [...episodes].sort((a, b) => (a.number || 0) - (b.number || 0)), [episodes]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = asc ? sortedAsc : [...sortedAsc].reverse();
    if (!q) return list;
    return list.filter((c) => chapterDisplayName(c, 'video').toLowerCase().includes(q) || String(c.number) === q);
  }, [sortedAsc, asc, query]);

  // Próximo episódio: um em andamento, senão o primeiro não visto
  const next = useMemo(() => {
    const inProgress = sortedAsc.find((c) => !c.read && (getVideoPositionInfo(c.url)?.t || 0) > 0);
    return inProgress || sortedAsc.find((c) => !c.read) || null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedAsc, episodes]);

  const watchedCount = episodes.filter((c) => c.read).length;
  const pct = episodes.length ? Math.round((watchedCount / episodes.length) * 100) : 0;
  const synopsis = stripHtml(anime.description || '');

  // "Talvez você goste" + tags extras (AniList): pelo ID quando a obra veio do AniList, senão pelo título
  const anilistId = Number((String(anime.url || '').match(/anilist\.co\/anime\/(\d+)/) || [])[1]) || undefined;
  const recReq = useMemo<RecRequest | null>(
    () => (anime?.title ? { kind: 'anilist', type: 'ANIME', id: anilistId, title: anime.title, altTitles: anime.altTitles } : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [anilistId, anime?.title]
  );
  const recs = useRecommendations(recReq);
  const workTags = [...(anime.genres || []).filter((g) => g && g !== anime.sourceName), ...(recs.result?.tags || [])];
  const work = { url: anime.url, title: anime.title, sourceName: anime.sourceName, source: anime.source, chapters: sortedAsc };

  // Painel de Fontes (extensões + plugins do Nuvio) para este episódio
  const openSources = (ep?: LibraryChapter | null) =>
    openWatchSources({
      title: anime.title,
      altTitles: anime.altTitles,
      year: anime.year,
      kind: episodes.length <= 1 && /movie|filme/i.test(String(anime.format || '')) ? 'movie' : 'series',
      episode: ep?.number || 1,
      cover: anime.cover,
      episodeUrl: ep?.url,
      workUrl: anime.url,
      episodeUrls: Object.fromEntries(episodes.filter((c) => c.number > 0).map((c) => [String(c.number), c.url])),
      preferred: anime.sourceName && !/anilist/i.test(anime.sourceName) ? { extName: anime.sourceName, url: /^https?:\/\//.test(anime.url) && !/anilist\.co/i.test(anime.url) ? anime.url : undefined } : undefined,
    });
  // Arquivos locais tocam direto; o resto abre "Onde assistir" (o usuário escolhe a fonte)
  const play = (ep: LibraryChapter) => (isLocalPath(ep.url || '') ? openVideoEpisode(work, ep, onOpenTab) : openSources(ep));
  // Continuar: reabre o mesmo vídeo (mesma fonte) no ponto salvo; sem registro, abre "Onde assistir"
  const resumeOrPlay = (ep: LibraryChapter) => {
    const r = isLocalPath(ep.url || '') ? null : getResume(ep.url);
    if (r?.play) onOpenTab?.('video-player', r.title, r.play);
    else play(ep);
  };
  const playWeb = (ep?: LibraryChapter | null) => {
    const n = ep?.number || 1;
    const url = buildAnimeWatchWebUrl(anime.title, n, anime.sourceName);
    onOpenTab?.('webview', t('Assistir: {title} Ep {n}', { title: anime.title, n }), { url, initialUrl: url });
  };

  const nextPos = next ? getVideoPositionInfo(next.url) : null;
  const allLocal = episodes.length > 0 && episodes.every((c) => isLocalPath(c.url));

  return (
    <div className="h-full overflow-y-auto bg-canvas text-fg-2">
      {/* Cabeçalho com fundo desfocado */}
      <div className="relative overflow-hidden border-b border-line-subtle">
        {(anime.background || anime.cover) && (
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center scale-110 blur-2xl opacity-25"
            style={{ backgroundImage: `url("${(anime.background || anime.cover).replace(/"/g, '%22')}")` }}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-canvas/40 via-canvas/70 to-canvas" aria-hidden />

        <div className="relative max-w-6xl mx-auto px-6 pt-8 pb-6 flex flex-col sm:flex-row gap-6">
          <div className="w-40 sm:w-48 shrink-0 aspect-[2/3] rounded-xl overflow-hidden bg-subtle ring-1 ring-line shadow-2xl mx-auto sm:mx-0">
            {anime.cover ? (
              <img src={anime.cover} alt="" className="w-full h-full object-cover" draggable={false} onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-fg-muted">
                <Tv size={36} />
              </div>
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex flex-wrap items-center gap-1.5 mb-2 text-[11px]">
              {anime.year ? <span className="px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-line">{anime.year}</span> : null}
              {anime.score ? <span className="px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-line">★ {anime.score}%</span> : null}
              {anime.status !== undefined && anime.status !== 0 && (
                <span className="px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-line">{workStatusLabel(anime.status)}</span>
              )}
              {episodes.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-line">
                  {t('{watched} de {total} vistos', { watched: watchedCount, total: episodes.length })}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-bold text-fg tracking-tight leading-tight">{anime.title}</h1>
            {anime.author && anime.author !== 'AniList Community' && anime.author !== anime.sourceName && <p className="text-xs text-fg-muted mt-1">{anime.author}</p>}

            {episodes.length > 0 && (
              <div className="mt-3 max-w-sm">
                <div className="h-1.5 rounded-full bg-subtle overflow-hidden">
                  <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[11px] text-fg-muted">{t('{pct}% concluído', { pct })}</span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 mt-4">
              {next ? (
                <button
                  type="button"
                  onClick={() => resumeOrPlay(next)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-semibold shadow-sm cursor-pointer"
                >
                  <Play size={15} fill="currentColor" />
                  <span>
                    {nextPos?.t
                      ? t('Continuar: {name}', { name: chapterDisplayName(next, 'video') })
                      : watchedCount > 0
                      ? t('Próximo: {name}', { name: chapterDisplayName(next, 'video') })
                      : t('Assistir: {name}', { name: chapterDisplayName(next, 'video') })}
                    {nextPos?.t ? <span className="opacity-75 font-normal"> · {fmtTime(nextPos.t)}</span> : null}
                  </span>
                </button>
              ) : episodes.length > 0 ? (
                <button
                  type="button"
                  onClick={() => play(sortedAsc[0])}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-sm font-semibold cursor-pointer"
                >
                  <RotateCcw size={15} />
                  <span>{t('Assistir de novo')}</span>
                </button>
              ) : null}

              {!allLocal && (
                <button
                  type="button"
                  onClick={() => openSources(next || sortedAsc[0])}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-subtle hover:bg-elevated text-fg text-sm font-medium border border-line cursor-pointer"
                  title={t('Procurar este episódio em todas as suas fontes')}
                >
                  <Radio size={15} />
                  <span>{t('Onde assistir')}</span>
                </button>
              )}


              {(
                <button
                  type="button"
                  onClick={() => setFavoriteOpen(true)}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-subtle hover:bg-elevated border border-line text-fg text-sm cursor-pointer"
                >
                  <Heart size={15} className={inLibrary && anime.favorite ? 'text-rose-400' : ''} fill={inLibrary && anime.favorite ? 'currentColor' : 'none'} />
                  <span>{inLibrary && anime.favorite ? t('Favorito') : inLibrary ? t('Na biblioteca') : t('Favoritar')}</span>
                </button>
              )}
              <AniListLink source="video" workUrl={anime.url} title={anime.title} inLibrary={inLibrary} />
            </div>

            <WorkTags tags={workTags} onPick={(tag) => openDiscoverSearch('anilist', tag)} />

            {synopsis && (
              <div className="mt-4 max-w-3xl">
                <p className={`text-[13px] leading-relaxed text-fg-muted whitespace-pre-line ${showFullSynopsis ? '' : 'line-clamp-4'}`}>{synopsis}</p>
                {synopsis.length > 280 && (
                  <button type="button" onClick={() => setShowFullSynopsis((v) => !v)} className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline cursor-pointer">
                    {showFullSynopsis ? (
                      <>
                        <ChevronUp size={13} /> {t('Mostrar menos')}
                      </>
                    ) : (
                      <>
                        <ChevronDown size={13} /> {t('Mostrar mais')}
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Episódios */}
      <div className="max-w-6xl mx-auto px-6 py-5">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2 mr-auto">
            <Film size={15} className="text-accent" />
            {t('Episódios')}
            <span className="text-[11px] px-1.5 rounded bg-subtle text-fg-muted font-mono">{episodes.length}</span>
          </h2>

          {episodes.length > 6 && (
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Buscar episódio…')}
                className="pl-8 pr-3 py-1.5 w-48 rounded-md bg-surface border border-line text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:border-accent"
              />
            </div>
          )}
          <button
            type="button"
            onClick={() => setWatched(episodes.map((c) => c.url), watchedCount < episodes.length)}
            disabled={episodes.length === 0}
            className="px-2.5 py-1.5 rounded-md bg-surface hover:bg-subtle border border-line text-xs text-fg-2 cursor-pointer disabled:opacity-40"
          >
            {watchedCount < episodes.length ? t('Marcar todos como vistos') : t('Desmarcar todos')}
          </button>
          <button
            type="button"
            onClick={() => setAsc((v) => !v)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-surface hover:bg-subtle border border-line text-xs text-fg-2 cursor-pointer"
            title={t('Inverter ordem')}
          >
            <ArrowUpDown size={12} />
            {asc ? t('Primeiro → último') : t('Último → primeiro')}
          </button>
        </div>

        {loadingEps ? (
          <div className="rounded-xl border border-line-subtle p-10 flex items-center justify-center gap-2 text-sm text-fg-muted">
            <Loader2 size={15} className="animate-spin" /> {t('Carregando episódios…')}
          </div>
        ) : episodes.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-10 text-center text-sm text-fg-muted">
            {epsError ? t('Não foi possível carregar os episódios deste site.') : t('Nenhum episódio salvo para esta obra.')}
            {!inLibrary && (
              <div className="mt-3">
                <button type="button" onClick={() => openSources(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-accent-fg text-xs font-semibold cursor-pointer">
                  <Radio size={13} /> {t('Onde assistir')}
                </button>
              </div>
            )}
            <div className="mt-3">
              <button type="button" onClick={() => playWeb(null)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-subtle hover:bg-elevated text-fg text-xs cursor-pointer">
                <Globe size={13} /> {t('Procurar na web')}
              </button>
            </div>
          </div>
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-sm text-fg-muted">{t('Nenhum episódio corresponde à busca.')}</div>
        ) : (
          <div className="rounded-xl border border-line-subtle bg-surface divide-y divide-line-subtle overflow-hidden">
            {visible.map((ep, idx) => {
              const pos = getVideoPositionInfo(ep.url);
              const progress = pos && pos.d > 0 ? Math.min(100, (pos.t / pos.d) * 100) : 0;
              const isNext = next?.url === ep.url;
              return (
                <div
                  key={`${ep.url}-${idx}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => (getVideoPositionInfo(ep.url)?.t ? resumeOrPlay(ep) : play(ep))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') (getVideoPositionInfo(ep.url)?.t ? resumeOrPlay(ep) : play(ep));
                  }}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-subtle/60 focus-visible:outline-none focus-visible:bg-subtle ${
                    ep.read ? 'text-fg-muted' : 'text-fg'
                  }`}
                >
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setWatched([ep.url], !ep.read);
                    }}
                    className="shrink-0 text-fg-muted hover:text-accent cursor-pointer"
                    title={ep.read ? t('Marcar como não visto') : t('Marcar como visto')}
                    aria-label={ep.read ? t('Marcar como não visto') : t('Marcar como visto')}
                  >
                    {ep.read ? <CheckCircle2 size={17} className="text-success" /> : <Circle size={17} />}
                  </button>

                  <div className="w-9 shrink-0 text-center font-mono text-xs text-fg-muted">{ep.number > 0 ? ep.number : '—'}</div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] truncate group-hover:text-accent transition-colors" title={ep.name}>
                      {chapterDisplayName(ep, 'video')}
                      {isNext && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent align-middle">{t('próximo')}</span>}
                    </div>
                    {pos?.t ? (
                      <div className="text-[11px] text-fg-muted flex items-center gap-1 mt-0.5">
                        <Clock size={11} />{' '}
                        {pos.d > 0
                          ? t('Parou em {time} de {total}', { time: fmtTime(pos.t), total: fmtTime(pos.d) })
                          : t('Parou em {time}', { time: fmtTime(pos.t) })}
                      </div>
                    ) : null}
                  </div>

                  {!isLocalPath(ep.url) && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        playWeb(ep);
                      }}
                      className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100 shrink-0 p-1.5 rounded-md text-fg-muted hover:text-accent hover:bg-elevated cursor-pointer"
                      title={t('Assistir este episódio na web')}
                    >
                      <Globe size={14} />
                    </button>
                  )}
                  <span className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-subtle group-hover:bg-accent group-hover:text-accent-fg text-[11px] font-semibold transition-colors">
                    <Play size={11} fill="currentColor" /> {pos?.t ? t('Continuar') : t('Assistir')}
                  </span>

                  {progress > 0 && (
                    <div className="absolute left-0 bottom-0 h-0.5 bg-accent/70" style={{ width: `${progress}%` }} aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <MaybeYouLike request={recReq} state={recs} onOpenTab={onOpenTab} />

      <FavoriteTagModal
        isOpen={favoriteOpen}
        onClose={() => setFavoriteOpen(false)}
        source="video"
        manga={{ ...anime, chapters: episodes }}
        onSaved={(updated) => {
          setAnime((a) => ({ ...a, favorite: updated.favorite, categories: updated.categories }));
          void reload();
        }}
      />
    </div>
  );
};
