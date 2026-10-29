// src/components/SourcesSearch.tsx
// Descobrir → busca também em TODAS as fontes instaladas, para achar o que não está no AniList/Cinemeta:
//  - extensões (sites) com busca;
//  - addons com catálogo: usa a busca do addon; se o catálogo não tem busca, procura nas páginas dele;
//  - addons só de links (Torrentio, Comet…) e plugins do Nuvio: não têm catálogo, então a obra é
//    encontrada pelo Cinemeta (IMDb), que é o que esses addons entendem. Ao abrir, "Assistir" usa eles.
//  - MyAnimeList (aba Animes): pelo Jikan ou pela API oficial, se houver Client ID nas Configurações.
// Fontes sem resultado não ocupam espaço; quando nada é encontrado, quem decide o aviso é o Descobrir.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Globe, Link2, Loader2, Package, Puzzle, Film, Star } from 'lucide-react';
import { getAnimeSources, type InstalledExtension } from '../api/extensionRegistry';
import {
  activeScrapers,
  addonCatalogs,
  addonsFor,
  fetchAddonCatalog,
  getNuvioState,
  nuvioCatalog,
  nuvioWorkUrl,
  NUVIO_EVENT,
  type AddonCatalogRef,
  type NuvioMetaPreview,
  type StremioAddon,
} from '../api/nuvio';
import { norm } from '../utils/smartSearch';
import { isMalSearchEnabled, malSearch, malTypeLabel, MAL_EVENT, openMalAnime } from '../api/myanimelist';
import { t, tn } from '../i18n';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

interface Hit {
  key: string;
  title: string;
  cover?: string;
  sub?: string;
  score?: number;
  open: () => void;
}

type RowKind = 'site' | 'addon' | 'links' | 'mal';

interface Row {
  id: string;
  name: string;
  kind: RowKind;
  /** Texto curto ao lado do nome (ex.: "addon", "via Cinemeta") */
  note: string;
  status: 'loading' | 'done' | 'error';
  hits: Hit[];
}

export interface SourcesSearchStatus {
  /** Quantas fontes instaladas participam da busca (sem contar o MyAnimeList) */
  sources: number;
  /** O MyAnimeList também foi consultado */
  mal: boolean;
  loading: boolean;
  hits: number;
}

const COLLAPSE_KEY = 'tp_sources_search_collapsed';
const MAX_HITS = 30;
/** Catálogo sem busca: quantas páginas olhar procurando o nome */
const BROWSE_PAGES = 3;

const baseUrlOf = (ext: InstalledExtension) => {
  const b = String(ext.baseUrl || '').trim();
  return b.startsWith('http') ? b : b ? `https://${b}` : '';
};

/** Todas as palavras da busca aparecem no nome (sem acentos, maiúsculas ou pontuação) */
export function nameMatches(name: string, query: string): boolean {
  const n = norm(name);
  const words = norm(query).split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => n.includes(w));
}

/** Addons de links que entendem IDs do IMDb e não têm catálogo próprio */
function linkOnlyAddons(catalogAddons: Set<string>): StremioAddon[] {
  const seen = new Set<string>();
  return [...addonsFor('stream', 'movie'), ...addonsFor('stream', 'series')].filter((a) => {
    if (seen.has(a.url) || catalogAddons.has(a.url)) return false;
    seen.add(a.url);
    const r = a.resources.find((x) => x.name === 'stream');
    const prefixes = r?.idPrefixes || a.idPrefixes || [];
    return !prefixes.length || prefixes.some((p) => p.startsWith('tt'));
  });
}

const listNames = (names: string[]) => (names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`);

export const SourcesSearch: React.FC<{
  query: string;
  /** Catálogo aberto no Descobrir: em Séries/Filmes o Cinemeta já aparece na grade principal */
  kind?: 'anilist' | 'series' | 'movie';
  onOpenTab?: OpenTabFn;
  /** Ocupa toda a altura (quando o catálogo principal não achou nada) */
  expand?: boolean;
  /** Aviso discreto no topo (ex.: "Nada no AniList") */
  note?: string;
  onStatus?: (s: SourcesSearchStatus) => void;
}> = ({ query, kind = 'anilist', onOpenTab, expand, note, onStatus }) => {
  const [version, setVersion] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const reqId = useRef(0);

  // Fontes mudaram (instalou/removeu/ligou/desligou): refaz a lista
  useEffect(() => {
    const on = () => setVersion((v) => v + 1);
    window.addEventListener('extensions:updated', on);
    window.addEventListener(NUVIO_EVENT, on);
    window.addEventListener(MAL_EVENT, on);
    return () => {
      window.removeEventListener('extensions:updated', on);
      window.removeEventListener(NUVIO_EVENT, on);
      window.removeEventListener(MAL_EVENT, on);
    };
  }, []);

  const sources = useMemo(() => {
    const sites = getAnimeSources().filter((e) => baseUrlOf(e));
    // Um addon pode ter vários catálogos (filmes, séries…): agrupa por addon.
    // Se algum catálogo tem busca, usa só esses; senão procura nas páginas dos catálogos.
    const byAddon = new Map<string, AddonCatalogRef[]>();
    for (const c of addonCatalogs()) {
      const list = byAddon.get(c.addon.url) || [];
      list.push(c);
      byAddon.set(c.addon.url, list);
    }
    const addons = Array.from(byAddon.values()).map((cats) => {
      const searchable = cats.filter((c) => c.searchable);
      return { addon: cats[0].addon, cats: searchable.length ? searchable : cats.filter((c) => !c.catalog.extra.some((e) => e.isRequired)), browse: !searchable.length };
    }).filter((g) => g.cats.length > 0);
    const links = linkOnlyAddons(new Set(byAddon.keys()));
    const st = getNuvioState();
    const pluginCount = st.enabled ? new Set([...activeScrapers('movie'), ...activeScrapers('tv')].map((x) => x.scraper.id)).size : 0;
    return { sites, addons, links, pluginCount, mal: isMalSearchEnabled() };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  // Em Séries/Filmes a grade principal já é o Cinemeta: a fileira "via Cinemeta" seria repetida
  const showLinksRow = kind === 'anilist' && (sources.links.length > 0 || sources.pluginCount > 0);
  // MyAnimeList só tem animes: entra na aba Animes
  const showMal = kind === 'anilist' && sources.mal;
  const installedCount = sources.sites.length + sources.addons.length + (showLinksRow ? 1 : 0);
  const total = installedCount + (showMal ? 1 : 0);

  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    if (!q || total === 0) {
      setRows([]);
      return;
    }
    const linkNames = [...sources.links.map((a) => a.name), ...(sources.pluginCount ? [tn(sources.pluginCount, '{n} plugin do Nuvio', '{n} plugins do Nuvio')] : [])];
    const initial: Row[] = [
      ...(showMal ? [{ id: 'mal', name: 'MyAnimeList', kind: 'mal' as const, note: t('animes · nota do MAL'), status: 'loading' as const, hits: [] }] : []),
      ...sources.sites.map((e) => ({ id: `site:${e.pkg}`, name: e.name || e.sourceName, kind: 'site' as const, note: t('extensão'), status: 'loading' as const, hits: [] })),
      ...sources.addons.map((g) => ({
        id: `addon:${g.addon.url}`,
        name: g.addon.name,
        kind: 'addon' as const,
        note: g.browse ? t('addon · procurado no catálogo') : t('addon'),
        status: 'loading' as const,
        hits: [],
      })),
      ...(showLinksRow
        ? [{ id: 'links', name: listNames(linkNames), kind: 'links' as const, note: t('links · obras achadas pelo Cinemeta'), status: 'loading' as const, hits: [] }]
        : []),
    ];
    setRows(initial);
    const update = (rowId: string, patch: Partial<Row>) => {
      if (reqId.current !== id) return;
      setRows((list) => list.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
    };

    const metaHits = (metas: NuvioMetaPreview[], seen: Set<string>, addonUrl?: string): Hit[] => {
      const hits: Hit[] = [];
      for (const m of metas) {
        const k = `${m.type}:${m.id}`;
        if (!m.name || seen.has(k)) continue;
        seen.add(k);
        hits.push({
          key: k,
          title: m.name,
          cover: m.poster,
          sub: [m.year, m.type === 'movie' ? t('Filme') : t('Série')].filter(Boolean).join(' · '),
          open: () =>
            onOpenTab?.('anime-detail', m.name, {
              anime: { url: nuvioWorkUrl(m.type, m.id), title: m.name, cover: m.poster, source: 'nuvio', sourceName: 'Nuvio', addonUrl: addonUrl ?? m.addonUrl },
            }),
        });
      }
      return hits;
    };

    const siteTasks = sources.sites.map((ext) => async () => {
      try {
        const res = await window.electronAPI?.scrapeExtensionCatalog?.({ baseUrl: baseUrlOf(ext), query: q, page: 1, sourceName: ext.sourceName || ext.name });
        const items = res?.success ? res.items || [] : [];
        const seen = new Set<string>();
        const hits: Hit[] = [];
        for (const it of items) {
          if (!it?.url || !it.title || seen.has(it.url)) continue;
          seen.add(it.url);
          hits.push({
            key: it.url,
            title: it.title,
            cover: it.cover,
            open: () =>
              onOpenTab?.('anime-detail', it.title, {
                anime: {
                  url: it.url,
                  title: it.title,
                  cover: it.cover || '',
                  description: it.description || '',
                  genres: it.genres || [],
                  source: ext.pkg || ext.name,
                  sourceName: ext.name || ext.sourceName,
                  chapters: [],
                  favorite: false,
                  categories: [],
                },
              }),
          });
        }
        update(`site:${ext.pkg}`, { status: res?.success === false && !hits.length ? 'error' : 'done', hits: hits.slice(0, MAX_HITS) });
      } catch {
        update(`site:${ext.pkg}`, { status: 'error', hits: [] });
      }
    });

    const addonTasks = sources.addons.map((g) => async () => {
      const rowId = `addon:${g.addon.url}`;
      try {
        const seen = new Set<string>();
        let hits: Hit[] = [];
        let failures = 0;
        if (!g.browse) {
          const lists = await Promise.allSettled(g.cats.map((c) => fetchAddonCatalog(c, { search: q })));
          for (const r of lists) {
            if (r.status === 'fulfilled') hits = hits.concat(metaHits(r.value, seen));
            else failures++;
          }
        } else {
          // Catálogo sem busca: olha as primeiras páginas e filtra pelo nome
          await Promise.all(
            g.cats.map(async (c) => {
              const metas: NuvioMetaPreview[] = [];
              for (let page = 0; page < BROWSE_PAGES && reqId.current === id; page++) {
                try {
                  const list = await fetchAddonCatalog(c, { skip: metas.length });
                  if (!list.length) break;
                  metas.push(...list);
                } catch {
                  if (page === 0) failures++;
                  break;
                }
              }
              hits = hits.concat(metaHits(metas.filter((m) => nameMatches(m.name, q)), seen));
            })
          );
        }
        update(rowId, { status: failures === g.cats.length && !hits.length ? 'error' : 'done', hits: hits.slice(0, MAX_HITS) });
      } catch {
        update(rowId, { status: 'error', hits: [] });
      }
    });

    const linkTasks = showLinksRow
      ? [
          async () => {
            try {
              const seen = new Set<string>();
              const lists = await Promise.allSettled([nuvioCatalog('series', { search: q }), nuvioCatalog('movie', { search: q })]);
              let hits: Hit[] = [];
              for (const r of lists) if (r.status === 'fulfilled') hits = hits.concat(metaHits(r.value, seen));
              const allFailed = lists.every((r) => r.status === 'rejected');
              update('links', { status: allFailed ? 'error' : 'done', hits: hits.slice(0, MAX_HITS) });
            } catch {
              update('links', { status: 'error', hits: [] });
            }
          },
        ]
      : [];

    const malTasks = showMal
      ? [
          async () => {
            try {
              const res = await malSearch(q, 24);
              if (!res.success) {
                update('mal', { status: 'error', hits: [] });
                return;
              }
              const hits: Hit[] = (res.items || []).map((m) => ({
                key: `mal:${m.id}`,
                title: m.title,
                cover: m.cover,
                score: m.score,
                sub: [m.year, malTypeLabel(m.type)].filter(Boolean).join(' · '),
                open: () => void openMalAnime(m, onOpenTab),
              }));
              update('mal', {
                status: 'done',
                hits: hits.slice(0, MAX_HITS),
                note: res.clientIdRejected ? t('o MAL recusou o seu Client ID; usando o Jikan') : res.via === 'api' ? t('animes · API oficial') : t('animes · nota do MAL'),
              });
            } catch {
              update('mal', { status: 'error', hits: [] });
            }
          },
        ]
      : [];

    // Até 4 buscas ao mesmo tempo
    const queue = [...malTasks, ...siteTasks, ...addonTasks, ...linkTasks];
    const worker = async () => {
      while (queue.length && reqId.current === id) await queue.shift()!();
    };
    void Promise.all([worker(), worker(), worker(), worker()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sources, showLinksRow, showMal]);

  const active = !!query.trim() && total > 0;
  const loading = active ? rows.filter((r) => r.status === 'loading').length : 0;
  const withHits = active ? rows.filter((r) => r.hits.length > 0) : [];
  const hitCount = withHits.reduce((n, r) => n + r.hits.length, 0);
  const empty = rows.filter((r) => r.status !== 'loading' && r.hits.length === 0);

  useEffect(() => {
    onStatus?.({ sources: active ? installedCount : 0, mal: active && showMal, loading: loading > 0 || (active && rows.length === 0), hits: hitCount });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, total, installedCount, showMal, loading, hitCount, rows.length]);

  // Nada para mostrar: sem busca, sem fontes, ou terminou sem achar nada (o Descobrir mostra o aviso)
  if (!active || (loading === 0 && hitCount === 0)) return null;

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });

  const isCollapsed = collapsed && !expand;
  const emptyNames = empty.map((r) => r.name + (r.status === 'error' ? ` (${t('erro')})` : '')).join(', ');

  return (
    <section
      className={`border-b border-line-subtle bg-surface/40 overflow-y-auto ${expand ? 'flex-1 min-h-0' : 'flex-shrink-0 max-h-[48%]'}`}
      aria-label={t('Resultados nas suas fontes')}
    >
      <button
        type="button"
        onClick={expand ? undefined : toggle}
        className={`sticky top-0 z-10 w-full flex items-center gap-2 px-4 py-2.5 bg-surface/95 backdrop-blur text-left ${expand ? 'cursor-default' : 'cursor-pointer'}`}
        aria-expanded={!isCollapsed}
        title={loading === 0 && empty.length ? t('Sem resultados em: {names}', { names: emptyNames }) : undefined}
      >
        <Puzzle size={14} className="text-accent" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
          {installedCount === 0 ? t('No MyAnimeList') : showMal ? t('Nas suas fontes e no MyAnimeList') : t('Nas suas fontes')}
        </span>
        <span className="text-[11.5px] text-fg-muted">
          {hitCount > 0 && tn(hitCount, '{n} resultado', '{n} resultados') + ' · ' + tn(withHits.length, '{n} fonte', '{n} fontes')}
          {hitCount > 0 && loading > 0 && ' · '}
          {loading > 0 && t('buscando em {n} de {total}…', { n: loading, total: rows.length })}
        </span>
        {loading > 0 && <Loader2 size={13} className="animate-spin text-accent" />}
        {note && <span className="text-[11.5px] text-fg-muted truncate">· {note}</span>}
        {!expand && <span className="ml-auto text-fg-muted">{isCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>}
      </button>

      {!isCollapsed && (
        <div className="px-4 pb-3 space-y-3">
          {rows
            .filter((r) => r.status === 'loading' || r.hits.length > 0)
            .map((r) => (
              <div key={r.id}>
                <div className="flex items-center gap-1.5 mb-1.5 text-[12px] min-w-0">
                  {r.kind === 'mal' ? (
                    <span className="h-3.5 px-1 rounded-[3px] bg-[#2e51a2] text-white text-[8.5px] font-black leading-[14px] shrink-0">MAL</span>
                  ) : r.kind === 'site' ? (
                    <Globe size={12} className="text-fg-muted shrink-0" />
                  ) : r.kind === 'links' ? (
                    <Link2 size={12} className="text-fg-muted shrink-0" />
                  ) : (
                    <Package size={12} className="text-fg-muted shrink-0" />
                  )}
                  <span className="font-medium text-fg truncate">{r.name}</span>
                  <span className="text-fg-muted shrink-0">{r.note}</span>
                  {r.status === 'loading' ? <Loader2 size={11} className="animate-spin text-fg-muted shrink-0" /> : <span className="text-fg-muted tabular-nums shrink-0">· {r.hits.length}</span>}
                </div>
                <div className={expand ? 'grid gap-2.5' : 'flex gap-2.5 overflow-x-auto scrollbar-thin pb-1'} style={expand ? { gridTemplateColumns: 'repeat(auto-fill, minmax(104px, 1fr))' } : undefined}>
                  {r.status === 'loading'
                    ? Array.from({ length: 6 }).map((_, i) => <div key={i} className={`${expand ? '' : 'w-[104px] shrink-0'} aspect-[2/3] rounded-md bg-subtle animate-pulse`} />)
                    : r.hits.map((h) => (
                        <button key={h.key} type="button" onClick={h.open} title={h.title} className={`group text-left cursor-pointer ${expand ? 'min-w-0' : 'w-[104px] shrink-0'}`}>
                          <div className="relative aspect-[2/3] rounded-md overflow-hidden bg-subtle border border-line-subtle group-hover:border-accent/60 flex items-center justify-center">
                            {h.cover ? (
                              <img src={h.cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')} />
                            ) : (
                              <Film size={20} className="text-fg-muted" />
                            )}
                            {h.score != null && (
                              <span className="absolute top-1 left-1 px-1 py-px rounded bg-black/70 text-[10px] text-white inline-flex items-center gap-0.5 tabular-nums">
                                <Star size={9} className="text-yellow-400" fill="currentColor" /> {h.score.toFixed(2)}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-[11.5px] text-fg leading-snug line-clamp-2 group-hover:text-accent">{h.title}</div>
                          {h.sub && <div className="text-[10.5px] text-fg-muted truncate">{h.sub}</div>}
                        </button>
                      ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </section>
  );
};
