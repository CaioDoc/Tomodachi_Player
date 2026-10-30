// src/components/SearchResults.tsx
// Descobrir → resultado da busca: só obras que as fontes do usuário têm (extensões, addons, plugins),
// em uma lista única ordenada pelo que mais bate com o texto digitado. A mesma obra achada em várias
// fontes vira um card só (com a escolha da fonte). AniList/MyAnimeList só completam capa, nota e nomes.
//  - extensões (sites): busca do site;
//  - addons com catálogo: busca do addon (ou procura nas páginas do catálogo, se ele não tiver busca);
//  - addons só de links (Torrentio…) e plugins do Nuvio: a obra é achada pelo Cinemeta (IMDb), que é o
//    que esses addons entendem; "Assistir" usa eles.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Film, Globe, Link2, Loader2, Package, Play, Star } from 'lucide-react';
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
import { MAL_EVENT } from '../api/myanimelist';
import { buildEnrichIndex, type EnrichIndex } from '../api/searchEnrich';
import { bestRelevance, MIN_RELEVANCE, relevance, titleKey } from '../utils/relevance';
import { canonicalGenre, norm } from '../utils/smartSearch';
import { t, tn } from '../i18n';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;
type SourceKind = 'site' | 'addon' | 'links';

interface SourceRef {
  id: string;
  name: string;
  kind: SourceKind;
  open: () => void;
}

interface RawHit {
  title: string;
  cover?: string;
  year?: string;
  type?: 'movie' | 'series';
  genres?: string[];
  source: SourceRef;
}

interface SourceState {
  id: string;
  name: string;
  status: 'loading' | 'done' | 'error';
  hits: RawHit[];
}

export interface SearchResultsStatus {
  /** Quantas fontes participaram */
  sources: number;
  loading: boolean;
  /** Quantas obras sobraram depois de filtrar por relevância */
  results: number;
}

const BROWSE_PAGES = 3;
const KIND_ORDER: Record<SourceKind, number> = { site: 0, addon: 1, links: 2 };

const baseUrlOf = (ext: InstalledExtension) => {
  const b = String(ext.baseUrl || '').trim();
  return b.startsWith('http') ? b : b ? `https://${b}` : '';
};

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

const yearNum = (y?: string | number) => {
  const m = String(y ?? '').match(/\d{4}/);
  return m ? Number(m[0]) : undefined;
};

const genreKey = (g: string) => canonicalGenre(g) || norm(g);

export const SearchResults: React.FC<{
  query: string;
  /** Gêneros/tags pedidos na busca (ex.: "Seinen, Monster" → Seinen) */
  genres?: string[];
  kind?: 'anilist' | 'series' | 'movie';
  onOpenTab?: OpenTabFn;
  onStatus?: (s: SearchResultsStatus) => void;
}> = ({ query, genres = [], kind = 'anilist', onOpenTab, onStatus }) => {
  const [version, setVersion] = useState(0);
  const [states, setStates] = useState<SourceState[]>([]);
  const [enrich, setEnrich] = useState<EnrichIndex | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const reqId = useRef(0);

  // Fontes mudaram (instalou/removeu/ligou/desligou): refaz a busca
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

  // Fecha o menu "outras fontes" ao clicar fora
  useEffect(() => {
    if (!menuFor) return;
    const close = () => setMenuFor(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuFor]);

  const sources = useMemo(() => {
    const sites = getAnimeSources().filter((e) => baseUrlOf(e));
    const byAddon = new Map<string, AddonCatalogRef[]>();
    for (const c of addonCatalogs()) {
      const list = byAddon.get(c.addon.url) || [];
      list.push(c);
      byAddon.set(c.addon.url, list);
    }
    const addons = Array.from(byAddon.values())
      .map((cats) => {
        const searchable = cats.filter((c) => c.searchable);
        return { addon: cats[0].addon, cats: searchable.length ? searchable : cats.filter((c) => !c.catalog.extra.some((e) => e.isRequired)), browse: !searchable.length };
      })
      .filter((g) => g.cats.length > 0);
    const links = linkOnlyAddons(new Set(byAddon.keys()));
    const st = getNuvioState();
    const pluginCount = st.enabled ? new Set([...activeScrapers('movie'), ...activeScrapers('tv')].map((x) => x.scraper.id)).size : 0;
    return { sites, addons, links, pluginCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const hasLinks = sources.links.length > 0 || sources.pluginCount > 0;
  const total = sources.sites.length + sources.addons.length + (hasLinks ? 1 : 0);

  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    setEnrich(null);
    setMenuFor(null);
    if (!q || total === 0) {
      setStates([]);
      return;
    }
    const linkNames = [...sources.links.map((a) => a.name), ...(sources.pluginCount ? [tn(sources.pluginCount, '{n} plugin do Nuvio', '{n} plugins do Nuvio')] : [])];
    const linksName = linkNames.length <= 2 ? linkNames.join(', ') : `${linkNames.slice(0, 2).join(', ')} +${linkNames.length - 2}`;
    setStates([
      ...sources.sites.map((e) => ({ id: `site:${e.pkg}`, name: e.name || e.sourceName, status: 'loading' as const, hits: [] })),
      ...sources.addons.map((g) => ({ id: `addon:${g.addon.url}`, name: g.addon.name, status: 'loading' as const, hits: [] })),
      ...(hasLinks ? [{ id: 'links', name: linksName, status: 'loading' as const, hits: [] }] : []),
    ]);
    const update = (sid: string, patch: Partial<SourceState>) => {
      if (reqId.current !== id) return;
      setStates((list) => list.map((r) => (r.id === sid ? { ...r, ...patch } : r)));
    };

    // Nomes alternativos, capas e notas (não decide o que aparece, só completa)
    void buildEnrichIndex(q)
      .then((idx) => reqId.current === id && setEnrich(idx))
      .catch(() => {});

    const metaHits = (metas: NuvioMetaPreview[], src: Omit<SourceRef, 'open'>, addonUrl?: string): RawHit[] =>
      metas
        .filter((m) => m.name)
        .map((m) => ({
          title: m.name,
          cover: m.poster,
          year: m.year,
          type: m.type === 'movie' ? 'movie' : 'series',
          genres: m.genres,
          source: {
            ...src,
            open: () =>
              onOpenTab?.('anime-detail', m.name, {
                anime: { url: nuvioWorkUrl(m.type, m.id), title: m.name, cover: m.poster, source: 'nuvio', sourceName: 'Nuvio', addonUrl: addonUrl ?? m.addonUrl },
              }),
          },
        }));

    const siteTasks = sources.sites.map((ext) => async () => {
      const sid = `site:${ext.pkg}`;
      const name = ext.name || ext.sourceName;
      try {
        const res = await window.electronAPI?.scrapeExtensionCatalog?.({ baseUrl: baseUrlOf(ext), query: q, page: 1, sourceName: ext.sourceName || ext.name });
        const items = res?.success ? res.items || [] : [];
        const seen = new Set<string>();
        const hits: RawHit[] = [];
        for (const it of items) {
          if (!it?.url || !it.title || seen.has(it.url)) continue;
          seen.add(it.url);
          hits.push({
            title: it.title,
            cover: it.cover,
            genres: it.genres,
            source: {
              id: sid,
              name,
              kind: 'site',
              open: () =>
                onOpenTab?.('anime-detail', it.title, {
                  anime: {
                    url: it.url,
                    title: it.title,
                    cover: it.cover || '',
                    description: it.description || '',
                    genres: it.genres || [],
                    source: ext.pkg || ext.name,
                    sourceName: name,
                    chapters: [],
                    favorite: false,
                    categories: [],
                  },
                }),
            },
          });
        }
        update(sid, { status: res?.success === false && !hits.length ? 'error' : 'done', hits });
      } catch {
        update(sid, { status: 'error', hits: [] });
      }
    });

    const addonTasks = sources.addons.map((g) => async () => {
      const sid = `addon:${g.addon.url}`;
      const src = { id: sid, name: g.addon.name, kind: 'addon' as const };
      try {
        let hits: RawHit[] = [];
        let failures = 0;
        if (!g.browse) {
          const lists = await Promise.allSettled(g.cats.map((c) => fetchAddonCatalog(c, { search: q })));
          for (const r of lists) {
            if (r.status === 'fulfilled') hits = hits.concat(metaHits(r.value, src));
            else failures++;
          }
        } else {
          // Catálogo sem busca: olha as primeiras páginas e fica com o que bate com o nome
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
              hits = hits.concat(metaHits(metas.filter((m) => relevance(m.name, q) >= MIN_RELEVANCE), src));
            })
          );
        }
        update(sid, { status: failures === g.cats.length && !hits.length ? 'error' : 'done', hits });
      } catch {
        update(sid, { status: 'error', hits: [] });
      }
    });

    const linkTasks = hasLinks
      ? [
          async () => {
            const src = { id: 'links', name: linksName, kind: 'links' as const };
            try {
              const lists = await Promise.allSettled([nuvioCatalog('series', { search: q }), nuvioCatalog('movie', { search: q })]);
              let hits: RawHit[] = [];
              for (const r of lists) if (r.status === 'fulfilled') hits = hits.concat(metaHits(r.value, src));
              update('links', { status: lists.every((r) => r.status === 'rejected') ? 'error' : 'done', hits });
            } catch {
              update('links', { status: 'error', hits: [] });
            }
          },
        ]
      : [];

    // Até 4 buscas ao mesmo tempo
    const queue = [...siteTasks, ...addonTasks, ...linkTasks];
    const worker = async () => {
      while (queue.length && reqId.current === id) await queue.shift()!();
    };
    void Promise.all([worker(), worker(), worker(), worker()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sources]);

  // Junta, filtra por relevância e ordena
  const results = useMemo(() => {
    const q = query.trim();
    const wantGenres = genres.map(genreKey).filter(Boolean);
    const groups = new Map<string, { hits: RawHit[] }>();
    for (const st of states) {
      for (const h of st.hits) {
        // A mesma obra em fontes diferentes; anos diferentes = obras diferentes (ex.: remake)
        const base = titleKey(h.title);
        if (!base) continue;
        const y = yearNum(h.year);
        let key = base;
        const existing = groups.get(base);
        if (existing && y) {
          const ys = existing.hits.map((x) => yearNum(x.year)).filter(Boolean);
          if (ys.length && !ys.includes(y)) key = `${base}|${y}`;
        }
        const g = groups.get(key) || { hits: [] };
        g.hits.push(h);
        groups.set(key, g);
      }
    }
    const out: Array<{
      key: string;
      title: string;
      cover?: string;
      year?: number;
      type?: 'movie' | 'series';
      score?: number;
      scoreFrom?: string;
      sources: SourceRef[];
      rel: number;
    }> = [];
    for (const [key, g] of groups) {
      const first = g.hits[0];
      const extra = enrich?.find(first.title);
      const titles = [first.title, ...g.hits.map((h) => h.title), ...(extra?.titles || [])];
      const rel = bestRelevance(titles, q);
      if (rel < MIN_RELEVANCE) continue;
      const type = g.hits.find((h) => h.type)?.type;
      if (kind === 'series' && type === 'movie') continue;
      if (kind === 'movie' && type === 'series') continue;
      if (wantGenres.length) {
        const known = [...g.hits.flatMap((h) => h.genres || []), ...(extra?.genres || [])].map(genreKey);
        if (known.length && !wantGenres.every((w) => known.includes(w))) continue;
      }
      // Uma entrada por fonte, na ordem: sites, addons, links
      const bySource = new Map<string, SourceRef>();
      for (const h of g.hits) if (!bySource.has(h.source.id)) bySource.set(h.source.id, h.source);
      const srcs = Array.from(bySource.values()).sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind]);
      out.push({
        key,
        title: first.title,
        cover: g.hits.find((h) => h.cover && h.source.kind !== 'site')?.cover || extra?.cover || g.hits.find((h) => h.cover)?.cover,
        year: yearNum(first.year) || g.hits.map((h) => yearNum(h.year)).find(Boolean) || extra?.year,
        type,
        score: extra?.score,
        scoreFrom: extra?.scoreFrom,
        sources: srcs,
        rel,
      });
    }
    out.sort((a, b) => b.rel - a.rel || b.sources.length - a.sources.length || (b.score || 0) - (a.score || 0));
    return out;
  }, [states, enrich, query, genres, kind]);

  const loading = states.filter((s) => s.status === 'loading').length;
  const active = !!query.trim() && total > 0;

  useEffect(() => {
    onStatus?.({ sources: active ? total : 0, loading: active && (loading > 0 || states.length === 0), results: results.length });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, total, loading, results.length, states.length]);

  if (!active || (loading === 0 && results.length === 0)) return null;

  const empty = states.filter((s) => s.status !== 'loading' && !results.some((r) => r.sources.some((x) => x.id === s.id)));
  const iconFor = (k: SourceKind) => (k === 'site' ? <Globe size={11} /> : k === 'links' ? <Link2 size={11} /> : <Package size={11} />);

  return (
    <section className="flex-1 min-h-0 overflow-y-auto" aria-label={t('Resultados nas suas fontes')}>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-x-2 gap-y-1 px-4 py-2.5 bg-canvas/95 backdrop-blur border-b border-line-subtle text-[12px]">
        <span className="font-semibold text-fg">{tn(results.length, '{n} obra encontrada', '{n} obras encontradas')}</span>
        <span className="text-fg-muted">· {t('nas suas fontes, das que mais batem com "{q}" para as que menos batem', { q: query.trim() })}</span>
        {loading > 0 && (
          <span className="inline-flex items-center gap-1.5 text-fg-muted">
            <Loader2 size={12} className="animate-spin text-accent" /> {t('buscando em {n} de {total}…', { n: loading, total: states.length })}
          </span>
        )}
        {loading === 0 && empty.length > 0 && (
          <span className="text-fg-muted" title={empty.map((s) => s.name + (s.status === 'error' ? ` (${t('erro')})` : '')).join(', ')}>
            · {tn(empty.length, '{n} fonte sem resultado', '{n} fontes sem resultado')}
          </span>
        )}
      </div>

      <div className="p-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {results.map((r) => {
          const main = r.sources[0];
          const more = r.sources.length > 1;
          return (
            <div key={r.key} className="relative group">
              <button type="button" onClick={main.open} title={r.title} className="w-full text-left cursor-pointer focus-visible:outline-none">
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-subtle border border-line-subtle group-hover:border-accent/60 flex items-center justify-center">
                  {r.cover ? (
                    <img src={r.cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')} />
                  ) : (
                    <Film size={26} className="text-fg-muted" />
                  )}
                  {r.score != null && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/75 text-[10.5px] text-white inline-flex items-center gap-0.5 tabular-nums" title={r.scoreFrom ? t('Nota no {site}', { site: r.scoreFrom }) : undefined}>
                      <Star size={10} className="text-yellow-400" fill="currentColor" /> {r.score.toFixed(1)}
                      {r.scoreFrom && <span className="opacity-70 ml-0.5 text-[9px]">{r.scoreFrom}</span>}
                    </span>
                  )}
                  <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                    <span className="w-10 h-10 rounded-full bg-accent text-accent-fg flex items-center justify-center shadow-lg">
                      <Play size={18} fill="currentColor" />
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 text-[12.5px] font-medium text-fg leading-snug line-clamp-2 group-hover:text-accent">{r.title}</div>
                <div className="text-[11px] text-fg-muted truncate">{[r.year, r.type === 'movie' ? t('Filme') : r.type === 'series' ? t('Série') : ''].filter(Boolean).join(' · ') || ' '}</div>
              </button>
              <div className="mt-0.5 flex items-center gap-1 text-[11px] text-fg-muted min-w-0">
                <span className="shrink-0">{iconFor(main.kind)}</span>
                <span className="truncate" title={r.sources.map((s) => s.name).join(', ')}>
                  {main.name}
                </span>
                {more && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setMenuFor(menuFor === r.key ? null : r.key);
                    }}
                    className="shrink-0 inline-flex items-center gap-0.5 px-1 rounded text-accent hover:bg-subtle cursor-pointer"
                    aria-haspopup="menu"
                    aria-expanded={menuFor === r.key}
                    title={t('Escolher a fonte')}
                  >
                    +{r.sources.length - 1} <ChevronDown size={11} />
                  </button>
                )}
              </div>
              {menuFor === r.key && (
                <div role="menu" className="absolute z-20 left-0 right-0 mt-1 p-1 rounded-md bg-elevated border border-line shadow-xl" onClick={(e) => e.stopPropagation()}>
                  <div className="px-2 py-1 text-[10.5px] uppercase tracking-wide text-fg-muted">{t('Abrir em')}</div>
                  {r.sources.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuFor(null);
                        s.open();
                      }}
                      className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded text-left text-[12px] text-fg hover:bg-subtle cursor-pointer"
                    >
                      <span className="text-fg-muted">{iconFor(s.kind)}</span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {loading > 0 &&
          Array.from({ length: results.length ? 4 : 12 }).map((_, i) => (
            <div key={`sk-${i}`}>
              <div className="aspect-[2/3] rounded-lg bg-subtle animate-pulse" />
              <div className="mt-1.5 h-3 w-3/4 rounded bg-subtle animate-pulse" />
            </div>
          ))}
      </div>
    </section>
  );
};
