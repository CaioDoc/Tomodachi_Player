// src/components/WhereToWatch.tsx
// "Onde assistir": procura a obra em TODAS as fontes de uma vez e mostra numa lista só.
//  - Plugins (Nuvio) e addons (Stremio): links prontos para tocar
//  - Extensões (sites, estilo Aniyomi): acha a obra no site e lista os episódios
// O usuário não precisa saber de onde vem cada link.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Puzzle, Loader2, ChevronLeft, ChevronRight, ChevronDown, Play, RefreshCw, Plus, Globe, Zap, Pencil, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  animeExtensionsFor,
  searchInExtension,
  extensionEpisodes,
  findCatalogMatches,
  mapEpisode,
  enrichWatchRequest,
  kitsuIdFor,
  type WatchRequest,
  type ExtensionMatch,
  type ExtensionEpisode,
} from '../api/watchSources';
import { nuvioMeta, runNuvioScrapers, playNuvioStream, getNuvioState, nuvioWorkUrl, addonsFor, activeScrapers, kitsuOnlyStreamAddons, type NuvioMeta, type NuvioMetaPreview, type ScraperRun } from '../api/nuvio';
import { type InstalledExtension } from '../api/extensionRegistry';
import { StreamRunList } from './StreamRunList';
import { t, tn } from '../i18n';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

/** Leva o usuário para Animes & Vídeos → Fontes */
export function goToVideoSources() {
  window.dispatchEvent(new CustomEvent('tomodachi:navigate', { detail: { type: 'videos', view: 'extensions' } }));
}

const SectionTitle: React.FC<{ icon: React.ReactNode; title: string; hint?: string; right?: React.ReactNode }> = ({ icon, title, hint, right }) => (
  <div className="flex items-center gap-2 px-4 pt-3 pb-1.5">
    <span className="text-accent">{icon}</span>
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{title}</h3>
    {hint && <span className="text-[11px] text-fg-muted/80 truncate">· {hint}</span>}
    {right && <span className="ml-auto">{right}</span>}
  </div>
);

/* ───────────────────────── Sites (extensões) ───────────────────────── */

interface ExtState {
  status: 'idle' | 'searching' | 'done' | 'error';
  matches: ExtensionMatch[];
  error?: string;
}

/* Sites desligados no "Onde assistir" (vale para todos os episódios e obras até ligar de novo) */
const OFF_KEY = 'tp_watch_ext_off';
const EXT_TOGGLE_EVENT = 'tomodachi:watch-ext-toggle';
function readOff(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(OFF_KEY) || '[]'));
  } catch {
    return new Set();
  }
}
const CHOSEN_KEY = 'tp_watch_ext_chosen';
function writeOff(off: Set<string>) {
  try {
    localStorage.setItem(OFF_KEY, JSON.stringify([...off]));
    localStorage.setItem(CHOSEN_KEY, '1');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent(EXT_TOGGLE_EVENT));
}
function setExtOn(pkg: string, on: boolean) {
  const off = readOff();
  if (on) off.delete(pkg);
  else off.add(pkg);
  writeOff(off);
}
const neverChose = () => {
  try {
    return !localStorage.getItem(CHOSEN_KEY) && !localStorage.getItem(OFF_KEY);
  } catch {
    return false;
  }
};

/* Obra já achada em cada site: o próximo episódio não precisa buscar de novo */
const MATCH_KEY = 'tp_watch_match_cache';
const workKeyOf = (req: WatchRequest) => req.workUrl || req.title.trim().toLowerCase();
function readMatches(): Record<string, { title: string; url: string; cover?: string; at: number }> {
  try {
    return JSON.parse(localStorage.getItem(MATCH_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function rememberMatch(req: WatchRequest, pkg: string, m: ExtensionMatch | null) {
  const all = readMatches();
  const k = `${workKeyOf(req)}|${pkg}`;
  if (m) all[k] = { title: m.title, url: m.url, cover: m.cover, at: Date.now() };
  else delete all[k];
  // Guarda só os 400 mais recentes
  const entries = Object.entries(all).sort((a, b) => b[1].at - a[1].at).slice(0, 400);
  try {
    localStorage.setItem(MATCH_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* ignore */
  }
}
function forgetWork(req: WatchRequest) {
  const all = readMatches();
  const prefix = `${workKeyOf(req)}|`;
  for (const k of Object.keys(all)) if (k.startsWith(prefix)) delete all[k];
  try {
    localStorage.setItem(MATCH_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/* Lista de episódios de cada página (vale por 20 min): trocar de episódio fica instantâneo */
const EPS_TTL = 20 * 60 * 1000;
const epsCache = new Map<string, { at: number; list: ExtensionEpisode[] }>();
async function cachedEpisodes(ext: InstalledExtension, url: string): Promise<ExtensionEpisode[]> {
  const hit = epsCache.get(url);
  if (hit && Date.now() - hit.at < EPS_TTL) return hit.list;
  const list = await extensionEpisodes(ext, url);
  if (list.length) epsCache.set(url, { at: Date.now(), list });
  return list;
}

const ExtensionCard: React.FC<{
  ext: InstalledExtension;
  state: ExtState;
  req: WatchRequest;
  episode: number;
  onPlay: (ext: InstalledExtension, ep: ExtensionEpisode | null, match: ExtensionMatch) => void;
  onPicked?: (match: ExtensionMatch | null) => void;
  /** Para de buscar neste site (fica salvo) */
  onSkip?: () => void;
}> = ({ ext, state, req, episode, onPlay, onPicked, onSkip }) => {
  const [picked, setPicked] = useState<ExtensionMatch | null>(null);
  const [eps, setEps] = useState<ExtensionEpisode[] | null>(null);
  const [loadingEps, setLoadingEps] = useState(false);
  const [epsError, setEpsError] = useState<string | null>(null);

  const pick = async (m: ExtensionMatch) => {
    setPicked(m);
    onPicked?.(m);
    setEps(null);
    setEpsError(null);
    setLoadingEps(true);
    try {
      setEps(await cachedEpisodes(ext, m.url));
    } catch (err: any) {
      setEpsError(String(err?.message || err));
      setEps([]);
    } finally {
      setLoadingEps(false);
    }
  };

  // Resultado muito parecido: já abre os episódios
  useEffect(() => {
    if (state.status === 'searching') setPicked(null);
    if (!picked && state.status === 'done' && state.matches[0]?.score >= 0.8) void pick(state.matches[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  const target = eps?.find((e) => e.number === episode) || null;
  const isMovie = req.kind === 'movie';
  // Sites que não acharam nada ficam numa linha só, discreta
  if (state.status === 'done' && state.matches.length === 0) return null;
  if (state.status === 'error') return null;

  return (
    <div className="mx-3 mb-2 rounded-lg border border-line-subtle bg-canvas/40 overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <Globe size={13} className="text-fg-muted shrink-0" />
        <span className="text-[12.5px] font-medium text-fg truncate">{ext.name}</span>
        <span className="text-[10px] uppercase text-fg-muted font-mono">{ext.lang}</span>
        <span className="ml-auto text-[11px] text-fg-muted inline-flex items-center gap-1 shrink-0">
          {state.status === 'searching' ? (
            <>
              <Loader2 size={11} className="animate-spin" /> {t('buscando…')}
            </>
          ) : picked ? null : (
            tn(state.matches.length, '{n} resultado', '{n} resultados')
          )}
          {onSkip && (
            <button
              type="button"
              onClick={onSkip}
              className="ml-1 p-0.5 rounded text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer"
              title={t('Não buscar neste site (fica salvo; dá para religar em "Escolher sites")')}
              aria-label={t('Não buscar em {site}', { site: ext.name })}
            >
              <X size={12} />
            </button>
          )}
        </span>
      </div>

      {state.status === 'done' && !picked && (
        <div className="px-2 pb-2 space-y-0.5">
          {state.matches.map((m) => (
            <button key={m.url} type="button" onClick={() => void pick(m)} className="w-full flex items-center gap-2.5 p-1.5 rounded-md hover:bg-subtle text-left cursor-pointer">
              <span className="w-8 h-11 rounded bg-subtle overflow-hidden shrink-0">
                {m.cover && <img src={m.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12.5px] text-fg truncate">{m.title}</span>
                <span className="block text-[10.5px] text-fg-muted">{m.score >= 0.75 ? t('Mesmo título') : m.score >= 0.45 ? t('Parecido') : t('Talvez')}</span>
              </span>
              <ChevronRight size={14} className="text-fg-muted" />
            </button>
          ))}
        </div>
      )}

      {picked && (
        <div className="px-3 pb-3 space-y-2">
          <div className="flex items-center gap-1.5 text-[11.5px] text-fg-muted">
            {state.matches.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  setPicked(null);
                  onPicked?.(null);
                }}
                className="hover:text-fg cursor-pointer"
                aria-label={t('Voltar')}
                title={t('Escolher outro resultado')}
              >
                <ChevronLeft size={14} />
              </button>
            )}
            <span className="truncate" title={picked.title}>
              {picked.title}
            </span>
          </div>
          {loadingEps ? (
            <div className="flex items-center gap-2 text-[12px] text-fg-muted">
              <Loader2 size={13} className="animate-spin" /> {t('Carregando episódios…')}
            </div>
          ) : isMovie || (eps && eps.length === 0) ? (
            <div className="space-y-1.5">
              {!isMovie && <p className="text-[11.5px] text-fg-muted">{epsError ? epsError : t('O site não listou episódios. Você pode abrir a página da obra no player.')}</p>}
              <button type="button" onClick={() => onPlay(ext, null, picked)} className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer">
                <Play size={12} fill="currentColor" /> {t('Assistir')}
              </button>
            </div>
          ) : (
            <>
              {target ? (
                <button type="button" onClick={() => onPlay(ext, target, picked)} className="w-full h-9 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer">
                  <Play size={13} fill="currentColor" /> {t('Assistir episódio {n}', { n: episode })}
                </button>
              ) : (
                <p className="text-[11.5px] text-warning-fg">{t('O episódio {n} não está neste site. Escolha outro abaixo.', { n: episode })}</p>
              )}
              <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
                {(eps || []).map((e) => (
                  <button
                    key={e.url}
                    type="button"
                    onClick={() => onPlay(ext, e, picked)}
                    title={e.name}
                    className={`h-7 min-w-[34px] px-2 rounded text-[11.5px] tabular-nums cursor-pointer border ${
                      e.number === episode ? 'bg-accent/20 border-accent/50 text-fg' : 'bg-subtle border-line-subtle text-fg-2 hover:bg-elevated'
                    }`}
                  >
                    {e.number}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

/** Procura a obra em todas as extensões de anime instaladas */
export const ExtensionSites: React.FC<{ req: WatchRequest; episode: number; onOpenTab?: OpenTabFn; onPlayed?: () => void; episodeUrl?: string }> = ({
  req,
  episode,
  onOpenTab,
  onPlayed,
  episodeUrl,
}) => {
  const allExts = useMemo(() => animeExtensionsFor(req), [req]);
  const [off, setOff] = useState<Set<string>>(readOff);
  useEffect(() => {
    const on = () => setOff(readOff());
    window.addEventListener(EXT_TOGGLE_EVENT, on);
    return () => window.removeEventListener(EXT_TOGGLE_EVENT, on);
  }, []);
  const exts = useMemo(() => allExts.filter((e) => !off.has(e.pkg)), [allExts, off]);
  // Site desligado no meio da busca: para de buscar nele na hora
  useEffect(() => {
    for (const pkg of off) if (signals.current[pkg]) signals.current[pkg].cancelled = true;
  }, [off]);
  const [states, setStates] = useState<Record<string, ExtState>>({});
  const [showEmpty, setShowEmpty] = useState(false);
  // Muitos sites e nenhuma escolha feita ainda: já mostra a lista para marcar/desmarcar
  const [choosing, setChoosing] = useState(() => animeExtensionsFor(req).length > 5 && neverChose());
  const signals = useRef<Record<string, { cancelled: boolean }>>({});
  const reqRef = useRef(req);
  reqRef.current = req;
  const searched = useRef<Set<string>>(new Set());

  /** Busca nos sites ligados que ainda não foram buscados (ou em todos, ao pedir de novo) */
  const searchSome = useCallback(
    async (list: InstalledExtension[], fresh: boolean) => {
      const initial: Record<string, ExtState> = {};
      const cached = fresh ? {} : readMatches();
      const wk = workKeyOf(req);
      for (const e of list) {
        const c = cached[`${wk}|${e.pkg}`];
        // Obra já achada neste site (em outro episódio): vai direto para os episódios
        initial[e.pkg] = c ? { status: 'done', matches: [{ title: c.title, url: c.url, cover: c.cover, score: 1 }] } : { status: 'searching', matches: [] };
      }
      // Obra que já veio de uma extensão: usa o link dela sem buscar
      if (req.preferred?.url && allExts[0] && list.some((e) => e.pkg === allExts[0].pkg)) {
        initial[allExts[0].pkg] = { status: 'done', matches: [{ title: req.title, url: req.preferred.url, score: 1 }] };
      }
      for (const e of list) searched.current.add(e.pkg);
      setStates((s) => ({ ...s, ...initial }));
      const queue = list.filter((e) => initial[e.pkg].status === 'searching');
      const worker = async () => {
        while (queue.length) {
          const ext = queue.shift()!;
          const signal = { cancelled: false };
          signals.current[ext.pkg] = signal;
          if (readOff().has(ext.pkg)) continue;
          try {
            const matches = await searchInExtension(ext, req, signal);
            if (signal.cancelled) continue;
            if (reqRef.current !== req) return;
            setStates((s) => ({ ...s, [ext.pkg]: { status: 'done', matches } }));
          } catch (err: any) {
            if (reqRef.current !== req) return;
            setStates((s) => ({ ...s, [ext.pkg]: { status: 'error', matches: [], error: String(err?.message || err) } }));
          }
        }
      };
      // Vários sites ao mesmo tempo (cada um é um servidor diferente)
      await Promise.all(Array.from({ length: Math.min(6, Math.max(1, queue.length)) }, () => worker()));
    },
    [req, allExts]
  );

  // Pedido novo: busca nos sites ligados
  useEffect(() => {
    searched.current = new Set();
    setStates({});
    void searchSome(exts, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req]);
  // Site religado: busca só nele
  useEffect(() => {
    const pending = exts.filter((e) => !searched.current.has(e.pkg));
    if (pending.length) void searchSome(pending, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exts]);

  const searchAll = useCallback(() => {
    forgetWork(req);
    return searchSome(exts, true);
  }, [exts, req, searchSome]);

  if (allExts.length === 0) return null;

  const play = (ext: InstalledExtension, ep: ExtensionEpisode | null, match: ExtensionMatch) => {
    const url = ep?.url || match.url;
    const label = req.kind === 'movie' ? req.title : `${req.title} - ${t('Episódio {n}', { n: ep?.number ?? episode })}`;
    onOpenTab?.('video-player', label, {
      filePath: url,
      title: label,
      item: { path: url, name: label },
      episodeUrl: (ep ? req.episodeUrls?.[String(ep.number)] ?? (ep.number === episode ? episodeUrl : undefined) : episodeUrl || req.episodeUrl) || url,
      work: { title: req.title, url: req.workUrl, cover: req.cover },
    });
    onPlayed?.();
  };

  const list = exts.map((e) => ({ ext: e, state: states[e.pkg] || { status: 'idle' as const, matches: [] } }));
  const searching = list.filter((x) => x.state.status === 'searching' || x.state.status === 'idle').length;
  const found = list.filter((x) => x.state.status === 'done' && x.state.matches.length > 0).length;
  const empty = list.filter((x) => (x.state.status === 'done' && x.state.matches.length === 0) || x.state.status === 'error');

  return (
    <div>
      <SectionTitle
        icon={<Puzzle size={13} />}
        title={t('Sites')}
        hint={t('extensões')}
        right={
          <button type="button" onClick={() => void searchAll()} className="p-1 rounded text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer" title={t('Buscar de novo')} aria-label={t('Buscar de novo')}>
            <RefreshCw size={12} />
          </button>
        }
      />
      {allExts.length > 1 && (
        <div className="mx-3 mb-2 rounded-lg border border-accent/30 bg-accent/5" data-testid="site-chooser">
          <button type="button" onClick={() => setChoosing((v) => !v)} aria-expanded={choosing} className="w-full flex items-center gap-2 px-3 py-2 text-left cursor-pointer">
            <SlidersHorizontal size={13} className="text-accent shrink-0" />
            <span className="text-[12px] text-fg">{t('Buscando em {n} de {total} sites', { n: allExts.length - [...off].filter((p) => allExts.some((e) => e.pkg === p)).length, total: allExts.length })}</span>
            <span className="ml-auto text-[11.5px] text-accent font-semibold inline-flex items-center gap-0.5">
              {choosing ? t('Fechar') : t('Escolher sites')} {choosing ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            </span>
          </button>
          {choosing && (
            <div className="px-3 pb-3">
              <p className="text-[11px] text-fg-muted mb-2">{t('Marque só os sites onde quer procurar. Menos sites = busca mais rápida. A escolha fica salva para os próximos episódios e obras.')}</p>
              <div className="flex items-center gap-3 mb-2 text-[11.5px]">
                <button type="button" onClick={() => writeOff(new Set())} className="text-accent hover:underline cursor-pointer">
                  {t('Marcar todos')}
                </button>
                <button type="button" onClick={() => writeOff(new Set(allExts.map((e) => e.pkg)))} className="text-fg-muted hover:text-fg hover:underline cursor-pointer">
                  {t('Desmarcar todos')}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1 max-h-64 overflow-y-auto pr-1">
                {allExts.map((e) => {
                  const on = !off.has(e.pkg);
                  return (
                    <label key={e.pkg} className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-[12px] ${on ? 'bg-surface text-fg' : 'text-fg-muted hover:bg-subtle'}`}>
                      <input type="checkbox" checked={on} onChange={() => setExtOn(e.pkg, !on)} className="accent-accent w-3.5 h-3.5 cursor-pointer" />
                      <span className="truncate">{e.name}</span>
                      <span className="ml-auto text-[9.5px] uppercase font-mono text-fg-muted">{e.lang}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
      {exts.length === 0 && <p className="px-4 pb-2 text-[12px] text-fg-muted">{t('Todos os sites estão desligados. Ligue algum acima para buscar.')}</p>}
      {list
        .filter((x) => x.state.status !== 'idle')
        .map(({ ext, state }) => (
          <ExtensionCard
            key={ext.pkg}
            ext={ext}
            req={req}
            episode={episode}
            state={state}
            onPlay={play}
            onPicked={(m) => rememberMatch(req, ext.pkg, m)}
            onSkip={allExts.length > 1 ? () => setExtOn(ext.pkg, false) : undefined}
          />
        ))}
      {exts.length > 0 && searching === 0 && found === 0 && <p className="px-4 pb-2 text-[12px] text-fg-muted">{t('Nenhum site encontrou “{title}”.', { title: req.title })}</p>}
      {empty.length > 0 && found > 0 && (
        <div className="px-4 pb-2">
          <button type="button" onClick={() => setShowEmpty((v) => !v)} className="text-[11px] text-fg-muted hover:text-fg inline-flex items-center gap-1 cursor-pointer">
            {showEmpty ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {tn(empty.length, '{n} site sem resultado', '{n} sites sem resultado')}
          </button>
        </div>
      )}
      {empty.length > 0 && (showEmpty || found === 0) && searching === 0 && (
        <ul className="px-4 pb-2 space-y-0.5">
          {empty.map((x) => (
            <li key={x.ext.pkg} className="flex items-center gap-2 text-[11px] text-fg-muted">
              <Globe size={10} className="shrink-0" />
              <span className="text-fg-2 truncate">{x.ext.name}</span>
              <span className="truncate" title={x.state.error}>
                · {x.state.status === 'error' ? t('o site não respondeu') : t('nada encontrado')}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

/* ───────────────────────── Plugins e addons ───────────────────────── */

/** Há plugins/addons que podem fornecer links? */
export function hasStreamSources(kind: 'movie' | 'series'): boolean {
  const st = getNuvioState();
  if (!st.enabled) return false;
  return activeScrapers(kind === 'movie' ? 'movie' : 'tv').length > 0 || addonsFor('stream', kind).length > 0;
}

const CatalogLinks: React.FC<{ req: WatchRequest; episode: number; onOpenTab?: OpenTabFn; onPlayed?: () => void; episodeUrl?: string }> = ({ req, episode, onOpenTab, onPlayed, episodeUrl }) => {
  const [candidates, setCandidates] = useState<NuvioMetaPreview[] | null>(null);
  const [chosen, setChosen] = useState<NuvioMetaPreview | null>(null);
  const [meta, setMeta] = useState<NuvioMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [se, setSe] = useState<{ season: number; episode: number } | null>(null);
  const [runs, setRuns] = useState<ScraperRun[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [editing, setEditing] = useState(false);
  const signalRef = useRef({ cancelled: false });

  // 1. Acha a obra no catálogo (Cinemeta)
  useEffect(() => {
    let alive = true;
    setCandidates(null);
    setChosen(null);
    setMeta(null);
    setError(null);
    findCatalogMatches(req)
      .then((list) => {
        if (!alive) return;
        setCandidates(list);
        setChosen(list[0] || null);
      })
      .catch((err) => alive && setError(String(err?.message || err)));
    return () => {
      alive = false;
    };
  }, [req]);

  // 2. Detalhes (TMDB, episódios)
  useEffect(() => {
    if (!chosen) return;
    let alive = true;
    setMeta(null);
    nuvioMeta(chosen.type, chosen.id, chosen.addonUrl)
      .then((m) => {
        if (!alive) return;
        setMeta(m);
        setSe(mapEpisode(m, { ...req, episode }));
      })
      .catch((err) => alive && setError(String(err?.message || err)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen]);

  useEffect(() => {
    if (meta) setSe(mapEpisode(meta, { ...req, episode }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episode]);

  // 3. Roda plugins e addons
  const run = useCallback(async () => {
    if (!meta) return;
    signalRef.current.cancelled = true;
    const signal = { cancelled: false };
    signalRef.current = signal;
    const ep = se ? meta.episodes.find((e) => e.season === se.season && e.episode === se.episode) : null;
    const stremioId = meta.type === 'movie' ? meta.id : ep?.id || (se ? `${meta.id}:${se.season}:${se.episode}` : meta.id);
    setSearching(true);
    setRuns(null);
    await runNuvioScrapers(
      { tmdbId: meta.tmdbId, stremioId, mediaType: meta.type === 'movie' ? 'movie' : 'tv', season: se?.season ?? null, episode: se?.episode ?? null },
      (r) => !signal.cancelled && setRuns(r),
      signal
    );
    if (!signal.cancelled) setSearching(false);
  }, [meta, se]);

  useEffect(() => {
    if (meta && (meta.type === 'movie' || se)) void run();
    return () => {
      signalRef.current.cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, se?.season, se?.episode]);

  const seasons = meta ? Array.from(new Set(meta.episodes.filter((e) => e.season > 0).map((e) => e.season))) : [];
  const epsOfSeason = meta && se ? meta.episodes.filter((e) => e.season === se.season) : [];
  const select = 'h-8 bg-canvas border border-line-subtle rounded-md px-2 text-[12px] text-fg outline-none cursor-pointer';

  const header = (
    <SectionTitle
      icon={<Zap size={13} />}
      title={t('Links prontos')}
      hint={t('plugins e addons')}
      right={
        meta && runs && !searching ? (
          <button type="button" onClick={() => void run()} className="p-1 rounded text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer" title={t('Buscar de novo')} aria-label={t('Buscar de novo')}>
            <RefreshCw size={12} />
          </button>
        ) : null
      }
    />
  );

  if (error && !meta) {
    return (
      <div>
        {header}
        <p className="px-4 pb-2 text-[12px] text-fg-muted">{error}</p>
      </div>
    );
  }
  if (!candidates || (chosen && !meta)) {
    return (
      <div>
        {header}
        <div className="px-4 pb-3 flex items-center gap-2 text-[12px] text-fg-muted">
          <Loader2 size={13} className="animate-spin" /> {t('Procurando a obra no catálogo…')}
        </div>
      </div>
    );
  }
  if (candidates.length === 0 || !meta) {
    return (
      <div>
        {header}
        <p className="px-4 pb-2 text-[12px] text-fg-muted">{t('Não encontrei “{title}” no catálogo de filmes e séries.', { title: req.title })}</p>
      </div>
    );
  }

  return (
    <div>
      {header}
      {/* Obra identificada (dá para corrigir) */}
      <div className="px-4 pb-2">
        {!editing ? (
          <div className="flex items-center gap-2 text-[11.5px] text-fg-muted min-w-0">
            <span className="truncate">
              {meta.name}
              {meta.year ? ` (${String(meta.year).slice(0, 4)})` : ''}
              {meta.type === 'series' && se ? ` · ${t('T{s} E{e}', { s: se.season, e: se.episode })}` : ''}
            </span>
            <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-accent hover:underline cursor-pointer shrink-0">
              <Pencil size={11} /> {t('Corrigir')}
            </button>
          </div>
        ) : (
          <div className="space-y-1.5">
            <select value={chosen?.id || ''} onChange={(e) => setChosen(candidates.find((c) => c.id === e.target.value) || null)} aria-label={t('Obra no catálogo')} className={`${select} w-full`}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.year ? ` (${c.year})` : ''}
                </option>
              ))}
            </select>
            {meta.type === 'series' && se && (
              <div className="flex items-center gap-1.5">
                <select
                  value={se.season}
                  onChange={(e) => {
                    const s = Number(e.target.value);
                    const first = meta.episodes.find((x) => x.season === s);
                    setSe({ season: s, episode: first?.episode || 1 });
                  }}
                  aria-label={t('Temporada')}
                  className={select}
                >
                  {seasons.map((s) => (
                    <option key={s} value={s}>
                      {t('Temporada {n}', { n: s })}
                    </option>
                  ))}
                </select>
                <select value={se.episode} onChange={(e) => setSe({ season: se.season, episode: Number(e.target.value) })} aria-label={t('Episódio')} className={`${select} flex-1 min-w-0`}>
                  {epsOfSeason.map((e) => (
                    <option key={e.episode} value={e.episode}>
                      {`E${e.episode}${e.name ? ' · ' + e.name : ''}`}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button type="button" onClick={() => setEditing(false)} className="text-[11.5px] text-accent hover:underline cursor-pointer">
              {t('Pronto')}
            </button>
          </div>
        )}
      </div>
      {!runs ? (
        <div className="px-4 pb-3 flex items-center gap-2 text-[12px] text-fg-muted">
          <Loader2 size={13} className="animate-spin" /> {t('Iniciando plugins…')}
        </div>
      ) : (
        <StreamRunList
          runs={runs}
          searching={searching}
          onPlay={(s) => {
            const label = meta.type === 'movie' ? meta.name : `${req.title} - ${t('T{s} E{e}', { s: se?.season ?? 1, e: se?.episode ?? 1 })}`;
            const ep = se ? meta.episodes.find((e) => e.season === se.season && e.episode === se.episode) : null;
            void playNuvioStream(
              s,
              {
                title: label,
                episodeUrl: episodeUrl || req.episodeUrl || (meta.type === 'movie' ? nuvioWorkUrl('movie', meta.id) : `${nuvioWorkUrl('series', meta.id)}:${se?.season}:${se?.episode}`),
                stremio: { type: meta.type, id: meta.type === 'movie' ? meta.id : ep?.id || `${meta.id}:${se?.season}:${se?.episode}` },
                work: { title: req.title, url: req.workUrl, cover: req.cover || meta.poster },
              },
              onOpenTab
            );
            onPlayed?.();
          }}
        />
      )}
    </div>
  );
};

/** Addons de anime que só entendem IDs do Kitsu: acha a obra no Kitsu e busca neles também */
const KitsuLinks: React.FC<{ req: WatchRequest; episode: number; onOpenTab?: OpenTabFn; onPlayed?: () => void; episodeUrl?: string }> = ({ req, episode, onOpenTab, onPlayed, episodeUrl }) => {
  const addons = useMemo(() => kitsuOnlyStreamAddons(req.kind === 'movie' ? 'movie' : 'series'), [req.kind]);
  const [runs, setRuns] = useState<ScraperRun[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [kitsuId, setKitsuId] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (!addons.length) return;
    let alive = true;
    setKitsuId(undefined);
    kitsuIdFor(req)
      .then((id) => alive && setKitsuId(id))
      .catch(() => alive && setKitsuId(null));
    return () => {
      alive = false;
    };
  }, [req, addons.length]);

  useEffect(() => {
    if (!kitsuId || !addons.length) return;
    const signal = { cancelled: false };
    const urls = new Set(addons.map((a) => a.url));
    const stremioId = req.kind === 'movie' ? `kitsu:${kitsuId}` : `kitsu:${kitsuId}:${Math.max(1, episode)}`;
    setSearching(true);
    setRuns(null);
    void runNuvioScrapers({ stremioId, mediaType: req.kind === 'movie' ? 'movie' : 'tv', addonFilter: (a) => urls.has(a.url) }, (r) => !signal.cancelled && setRuns(r), signal).then(
      () => !signal.cancelled && setSearching(false)
    );
    return () => {
      signal.cancelled = true;
    };
  }, [kitsuId, episode, req.kind, addons]);

  if (!addons.length) return null;
  if (kitsuId === undefined) {
    return (
      <div className="px-4 py-2 flex items-center gap-2 text-[11.5px] text-fg-muted">
        <Loader2 size={12} className="animate-spin" /> {t('Procurando no Kitsu (addons de anime)…')}
      </div>
    );
  }
  if (kitsuId === null) {
    return <p className="px-4 py-1.5 text-[11.5px] text-fg-muted">{t('Não encontrei a obra no Kitsu; {n} addon(s) de anime ficaram de fora.', { n: addons.length })}</p>;
  }
  if (!runs) return null;
  return (
    <StreamRunList
      runs={runs}
      searching={searching}
      onPlay={(s) => {
        const label = req.kind === 'movie' ? req.title : `${req.title} - ${t('Episódio {n}', { n: episode })}`;
        void playNuvioStream(
          s,
          { title: label, episodeUrl: episodeUrl || req.episodeUrl || `kitsu:${kitsuId}:${episode}`, stremio: { type: req.kind === 'movie' ? 'movie' : 'series', id: req.kind === 'movie' ? `kitsu:${kitsuId}` : `kitsu:${kitsuId}:${episode}` }, work: { title: req.title, url: req.workUrl, cover: req.cover } },
          onOpenTab
        );
        onPlayed?.();
      }}
    />
  );
};

const DirectLinks: React.FC<{ req: WatchRequest; episode: number; onOpenTab?: OpenTabFn; onPlayed?: () => void; episodeUrl?: string }> = (props) => (
  <>
    <CatalogLinks {...props} />
    <KitsuLinks {...props} />
  </>
);

/* ───────────────────────── Tudo junto ───────────────────────── */

/** Mensagem quando não há nenhuma fonte instalada */
export const NoSourcesHint: React.FC<{ compact?: boolean; onNavigate?: () => void }> = ({ compact, onNavigate }) => (
  <div className={compact ? 'p-5 text-center' : 'p-8 text-center'}>
    <Puzzle size={22} className="mx-auto text-fg-muted mb-2" />
    <p className="text-[13px] font-semibold text-fg">{t('Nenhuma fonte instalada')}</p>
    <p className="text-[12px] text-fg-muted mt-1 max-w-xs mx-auto leading-relaxed">
      {t('Para assistir, adicione pelo menos uma fonte: uma extensão (sites de anime), um plugin do Nuvio ou um addon do Stremio. Basta colar o link.')}
    </p>
    <button
      type="button"
      onClick={() => {
        goToVideoSources();
        onNavigate?.();
      }}
      className="mt-3 h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
    >
      <Plus size={13} /> {t('Adicionar fontes')}
    </button>
  </div>
);

export const WhereToWatch: React.FC<{ req: WatchRequest; episode: number; onOpenTab?: OpenTabFn; onPlayed?: () => void }> = ({ req, episode, onOpenTab, onPlayed }) => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const on = () => setVersion((v) => v + 1);
    window.addEventListener('extensions:updated', on);
    window.addEventListener('tomodachi:nuvio-changed', on);
    return () => {
      window.removeEventListener('extensions:updated', on);
      window.removeEventListener('tomodachi:nuvio-changed', on);
    };
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasLinks = useMemo(() => hasStreamSources(req.kind), [req.kind, version]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const hasSites = useMemo(() => animeExtensionsFor(req).length > 0, [req, version]);

  // Nome digitado pelo usuário ("Buscar com outro nome")
  const [custom, setCustom] = useState('');
  const [override, setOverride] = useState<string | null>(null);
  useEffect(() => {
    setOverride(null);
    setCustom('');
  }, [req]);

  // Antes de buscar: completa com os nomes alternativos (AniList) — títulos de sites e em português
  // muitas vezes não batem com o nome usado nos catálogos e nos outros sites
  const [ready, setReady] = useState<WatchRequest | null>(null);
  useEffect(() => {
    let alive = true;
    let done = false;
    const base: WatchRequest = override ? { ...req, title: override, altTitles: [req.title, ...(req.altTitles || [])], imdbId: undefined, preferred: undefined } : req;
    setReady(null);
    const finish = (r: WatchRequest) => {
      if (!alive || done) return;
      done = true;
      setReady(r);
    };
    const timer = setTimeout(() => finish(base), 5000);
    enrichWatchRequest(base)
      .then(finish)
      .catch(() => finish(base));
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [req, override]);

  // Episódio escolhido no painel: usa a URL dele (para marcar como visto e retomar o certo)
  const epUrl = req.episodeUrls?.[String(episode)] ?? (episode === (req.episode ?? 1) ? req.episodeUrl : undefined);

  if (!hasLinks && !hasSites) return <NoSourcesHint compact onNavigate={onPlayed} />;
  if (!ready) {
    return (
      <div className="p-6 flex items-center justify-center gap-2 text-[12.5px] text-fg-muted">
        <Loader2 size={14} className="animate-spin" /> {t('Preparando a busca…')}
      </div>
    );
  }
  return (
    <div className="pb-2">
      {hasLinks && <DirectLinks key={`l${version}`} req={ready} episode={episode} episodeUrl={epUrl} onOpenTab={onOpenTab} onPlayed={onPlayed} />}
      {hasLinks && hasSites && <div className="mx-4 my-1 border-t border-line-subtle" />}
      {hasSites && <ExtensionSites key={`s${version}`} req={ready} episode={episode} episodeUrl={epUrl} onOpenTab={onOpenTab} onPlayed={onPlayed} />}
      <form
        className="mx-4 mt-3 pt-3 border-t border-line-subtle"
        onSubmit={(e) => {
          e.preventDefault();
          if (custom.trim()) setOverride(custom.trim());
        }}
      >
        <label className="block text-[11px] text-fg-muted mb-1">{t('Não achou? Busque com outro nome (ex.: o título em inglês ou japonês)')}</label>
        <div className="flex gap-1.5">
          <div className="relative flex-1 min-w-0">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder={override || req.title}
              className="w-full h-8 bg-canvas border border-line-subtle focus:border-accent rounded-md pl-7 pr-2 text-[12px] text-fg outline-none"
            />
          </div>
          <button type="submit" disabled={!custom.trim()} className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated border border-line-subtle text-[12px] text-fg cursor-pointer disabled:opacity-50">
            {t('Buscar')}
          </button>
        </div>
      </form>
    </div>
  );
};
