// src/components/SourceBrowseView.tsx
// Fontes → "Navegar" de um plugin (Nuvio) ou addon (Stremio).
// Addon com catálogo próprio: mostra os catálogos dele. Sem catálogo (ex.: Torrentio) ou plugin:
// mostra o catálogo de filmes e séries que a fonte atende (Cinemeta).

import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Package, Plug, Tv, Film, Info } from 'lucide-react';
import { Catalog } from './NuvioView';
import { NUVIO_EVENT, addonCatalogs, getNuvioState } from '../api/nuvio';
import { t } from '../i18n';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

export interface SourceBrowseTarget {
  kind: 'addon' | 'plugin';
  /** URL do manifest (addon) ou do repositório (plugin) */
  url: string;
  name: string;
}

export const SourceBrowseView: React.FC<{ target: SourceBrowseTarget; onOpenTab?: OpenTabFn }> = ({ target, onOpenTab }) => {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const on = () => setVersion((v) => v + 1);
    window.addEventListener(NUVIO_EVENT, on);
    return () => window.removeEventListener(NUVIO_EVENT, on);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const catalogs = useMemo(() => (target.kind === 'addon' ? addonCatalogs().filter((c) => c.addon.url === target.url) : []), [target.kind, target.url, version]);
  // Tipos que a fonte atende (para o catálogo padrão)
  const types = useMemo(() => {
    const st = getNuvioState();
    if (target.kind === 'addon') {
      const a = st.addons.find((x) => x.url === target.url);
      const ty = a?.types?.filter((x) => x === 'movie' || x === 'series') || [];
      return ty.length ? ty : ['series', 'movie'];
    }
    const repo = st.repos.find((r) => r.url === target.url);
    const set = new Set<string>();
    for (const s of repo?.scrapers || []) for (const ty of s.supportedTypes) set.add(ty === 'tv' ? 'series' : ty);
    const ty = ['series', 'movie'].filter((x) => set.has(x));
    return ty.length ? ty : ['series', 'movie'];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.url, version]);

  // Abas: catálogos do addon, ou Séries/Filmes do catálogo padrão
  const tabs = useMemo(
    () =>
      catalogs.length
        ? catalogs.map((c) => ({ id: c.key, label: c.catalog.name || c.catalog.id, sub: c.catalog.type === 'movie' ? t('Filmes') : c.catalog.type === 'anime' ? t('Animes') : t('Séries'), searchable: c.searchable, kind: undefined as 'series' | 'movie' | undefined }))
        : types.map((ty) => ({ id: ty, label: ty === 'movie' ? t('Filmes') : t('Séries'), sub: '', searchable: true, kind: ty as 'series' | 'movie' })),
    [catalogs, types]
  );
  const [active, setActive] = useState<string>('');
  const current = tabs.find((x) => x.id === active) || tabs[0];
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 450);
    return () => clearTimeout(id);
  }, [input]);

  const Icon = target.kind === 'addon' ? Package : Plug;

  return (
    <div className="flex flex-col h-full min-h-0 bg-canvas">
      <div className="px-4 py-3 border-b border-line-subtle bg-surface flex-shrink-0 space-y-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 mr-2 min-w-0">
            <Icon size={16} className="text-accent shrink-0" />
            <h1 className="text-[14px] font-semibold text-fg truncate">{target.name}</h1>
          </span>
          <div className="relative flex-1 min-w-[200px] max-w-xl">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              value={input}
              disabled={!current?.searchable}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setQuery(input.trim())}
              placeholder={current?.searchable ? t('Buscar em {name}…', { name: current.label }) : t('Este catálogo não tem busca')}
              className="w-full h-9 bg-canvas border border-line focus:border-accent rounded-lg pl-9 pr-8 text-[13px] text-fg outline-none disabled:opacity-60"
            />
            {input && (
              <button
                type="button"
                onClick={() => {
                  setInput('');
                  setQuery('');
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg cursor-pointer"
                aria-label={t('Limpar busca')}
              >
                <X size={13} />
              </button>
            )}
          </div>
          {tabs.length > 1 && (
            <div role="tablist" className="inline-flex p-1 rounded-lg bg-canvas border border-line-subtle overflow-x-auto max-w-full">
              {tabs.map((tb) => (
                <button
                  key={tb.id}
                  type="button"
                  role="tab"
                  aria-selected={current?.id === tb.id}
                  onClick={() => setActive(tb.id)}
                  className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12.5px] whitespace-nowrap cursor-pointer ${
                    current?.id === tb.id ? 'bg-surface text-fg font-semibold shadow-sm' : 'text-fg-muted hover:text-fg'
                  }`}
                >
                  {tb.kind === 'series' ? <Tv size={12} /> : tb.kind === 'movie' ? <Film size={12} /> : null}
                  {tb.label}
                  {tb.sub && <span className="text-[10px] opacity-60">{tb.sub}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {!catalogs.length && (
          <p className="text-[11.5px] text-fg-muted flex items-center gap-1.5">
            <Info size={12} className="shrink-0" />
            {target.kind === 'addon'
              ? t('Este addon não tem catálogo próprio: ele fornece links para os filmes e séries abaixo.')
              : t('Plugins não têm catálogo próprio: eles procuram links para os filmes e séries abaixo.')}
          </p>
        )}
      </div>
      <div className="flex-1 min-h-0">
        {current &&
          (current.kind ? (
            <Catalog key={current.id} onOpenTab={onOpenTab} embedded={{ kind: current.kind, query }} />
          ) : (
            <Catalog key={current.id} onOpenTab={onOpenTab} embedded={{ sourceKey: current.id, query: current.searchable ? query : '' }} />
          ))}
      </div>
    </div>
  );
};
