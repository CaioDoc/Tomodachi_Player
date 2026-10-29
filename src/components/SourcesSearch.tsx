// src/components/SourcesSearch.tsx
// Descobrir → busca também em TODAS as fontes instaladas (sites/extensões e addons com busca),
// para achar o que não está no AniList/Cinemeta. Cada fonte vira uma fileira com os resultados.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Globe, Loader2, Package, Puzzle, Film } from 'lucide-react';
import { getAnimeSources, type InstalledExtension } from '../api/extensionRegistry';
import { addonCatalogs, fetchAddonCatalog, nuvioWorkUrl, NUVIO_EVENT, type NuvioMetaPreview } from '../api/nuvio';
import { t, tn } from '../i18n';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

interface Hit {
  key: string;
  title: string;
  cover?: string;
  sub?: string;
  open: () => void;
}

interface Row {
  id: string;
  name: string;
  kind: 'site' | 'addon';
  status: 'loading' | 'done' | 'error';
  hits: Hit[];
}

const COLLAPSE_KEY = 'tp_sources_search_collapsed';
const baseUrlOf = (ext: InstalledExtension) => {
  const b = String(ext.baseUrl || '').trim();
  return b.startsWith('http') ? b : b ? `https://${b}` : '';
};

export const SourcesSearch: React.FC<{ query: string; onOpenTab?: OpenTabFn }> = ({ query, onOpenTab }) => {
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

  // Fontes mudaram (instalou/removeu): refaz a lista
  useEffect(() => {
    const on = () => setVersion((v) => v + 1);
    window.addEventListener('extensions:updated', on);
    window.addEventListener(NUVIO_EVENT, on);
    return () => {
      window.removeEventListener('extensions:updated', on);
      window.removeEventListener(NUVIO_EVENT, on);
    };
  }, []);

  const sources = useMemo(() => {
    const sites = getAnimeSources().filter((e) => baseUrlOf(e));
    // Um addon pode ter vários catálogos com busca (filmes, séries…): agrupa por addon
    const byAddon = new Map<string, ReturnType<typeof addonCatalogs>>();
    for (const c of addonCatalogs().filter((c) => c.searchable)) {
      const list = byAddon.get(c.addon.url) || [];
      list.push(c);
      byAddon.set(c.addon.url, list);
    }
    return { sites, addons: Array.from(byAddon.values()) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const total = sources.sites.length + sources.addons.length;

  useEffect(() => {
    const q = query.trim();
    const id = ++reqId.current;
    if (!q || total === 0) {
      setRows([]);
      return;
    }
    const initial: Row[] = [
      ...sources.sites.map((e) => ({ id: `site:${e.pkg}`, name: e.name || e.sourceName, kind: 'site' as const, status: 'loading' as const, hits: [] })),
      ...sources.addons.map((cats) => ({ id: `addon:${cats[0].addon.url}`, name: cats[0].addon.name, kind: 'addon' as const, status: 'loading' as const, hits: [] })),
    ];
    setRows(initial);
    const update = (rowId: string, patch: Partial<Row>) => {
      if (reqId.current !== id) return;
      setRows((list) => list.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
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
        update(`site:${ext.pkg}`, { status: res?.success === false && !hits.length ? 'error' : 'done', hits: hits.slice(0, 30) });
      } catch {
        update(`site:${ext.pkg}`, { status: 'error', hits: [] });
      }
    });

    const addonTasks = sources.addons.map((cats) => async () => {
      const rowId = `addon:${cats[0].addon.url}`;
      try {
        const lists = await Promise.allSettled(cats.map((c) => fetchAddonCatalog(c, { search: q })));
        const seen = new Set<string>();
        const hits: Hit[] = [];
        for (const r of lists) {
          if (r.status !== 'fulfilled') continue;
          for (const m of r.value as NuvioMetaPreview[]) {
            const k = `${m.type}:${m.id}`;
            if (seen.has(k)) continue;
            seen.add(k);
            hits.push({
              key: k,
              title: m.name,
              cover: m.poster,
              sub: [m.year, m.type === 'movie' ? t('Filme') : t('Série')].filter(Boolean).join(' · '),
              open: () =>
                onOpenTab?.('anime-detail', m.name, {
                  anime: { url: nuvioWorkUrl(m.type, m.id), title: m.name, cover: m.poster, source: 'nuvio', sourceName: 'Nuvio', addonUrl: m.addonUrl },
                }),
            });
          }
        }
        const allFailed = lists.length > 0 && lists.every((r) => r.status === 'rejected');
        update(rowId, { status: allFailed ? 'error' : 'done', hits: hits.slice(0, 30) });
      } catch {
        update(rowId, { status: 'error', hits: [] });
      }
    });

    // Até 4 buscas ao mesmo tempo
    const queue = [...siteTasks, ...addonTasks];
    const worker = async () => {
      while (queue.length && reqId.current === id) await queue.shift()!();
    };
    void Promise.all([worker(), worker(), worker(), worker()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, sources]);

  if (!query.trim() || total === 0) return null;

  const loading = rows.filter((r) => r.status === 'loading').length;
  const withHits = rows.filter((r) => r.hits.length > 0);
  const empty = rows.filter((r) => r.status !== 'loading' && r.hits.length === 0);
  const hitCount = withHits.reduce((n, r) => n + r.hits.length, 0);

  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });

  return (
    <section className="flex-shrink-0 border-b border-line-subtle bg-surface/40 max-h-[48%] overflow-y-auto" aria-label={t('Resultados nas suas fontes')}>
      <button type="button" onClick={toggle} className="sticky top-0 z-10 w-full flex items-center gap-2 px-4 py-2.5 bg-surface/95 backdrop-blur text-left cursor-pointer" aria-expanded={!collapsed}>
        <Puzzle size={14} className="text-accent" />
        <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{t('Nas suas fontes')}</span>
        <span className="text-[11.5px] text-fg-muted">
          {loading > 0
            ? t('buscando em {n} de {total}…', { n: loading, total: rows.length })
            : withHits.length
              ? tn(hitCount, '{n} resultado', '{n} resultados') + ' · ' + tn(withHits.length, '{n} fonte', '{n} fontes')
              : t('nada encontrado nas {n} fontes', { n: rows.length })}
        </span>
        {loading > 0 && <Loader2 size={13} className="animate-spin text-accent" />}
        <span className="ml-auto text-fg-muted">{collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-3">
          {rows
            .filter((r) => r.status === 'loading' || r.hits.length > 0)
            .map((r) => (
              <div key={r.id}>
                <div className="flex items-center gap-1.5 mb-1.5 text-[12px]">
                  {r.kind === 'site' ? <Globe size={12} className="text-fg-muted" /> : <Package size={12} className="text-fg-muted" />}
                  <span className="font-medium text-fg">{r.name}</span>
                  <span className="text-fg-muted">{r.kind === 'site' ? t('extensão') : t('addon')}</span>
                  {r.status === 'loading' ? <Loader2 size={11} className="animate-spin text-fg-muted" /> : <span className="text-fg-muted tabular-nums">· {r.hits.length}</span>}
                </div>
                <div className="flex gap-2.5 overflow-x-auto scrollbar-thin pb-1">
                  {r.status === 'loading'
                    ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="w-[104px] shrink-0 aspect-[2/3] rounded-md bg-subtle animate-pulse" />)
                    : r.hits.map((h) => (
                        <button key={h.key} type="button" onClick={h.open} title={h.title} className="group w-[104px] shrink-0 text-left cursor-pointer">
                          <div className="relative aspect-[2/3] rounded-md overflow-hidden bg-subtle border border-line-subtle group-hover:border-accent/60 flex items-center justify-center">
                            {h.cover ? (
                              <img src={h.cover} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover" onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')} />
                            ) : (
                              <Film size={20} className="text-fg-muted" />
                            )}
                          </div>
                          <div className="mt-1 text-[11.5px] text-fg leading-snug line-clamp-2 group-hover:text-accent">{h.title}</div>
                          {h.sub && <div className="text-[10.5px] text-fg-muted truncate">{h.sub}</div>}
                        </button>
                      ))}
                </div>
              </div>
            ))}
          {empty.length > 0 && loading === 0 && (
            <p className="text-[11px] text-fg-muted">
              {t('Sem resultados em: {names}', { names: empty.map((r) => r.name + (r.status === 'error' ? ` (${t('erro')})` : '')).join(', ') })}
            </p>
          )}
        </div>
      )}
    </section>
  );
};
