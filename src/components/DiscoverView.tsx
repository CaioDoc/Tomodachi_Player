// src/components/DiscoverView.tsx
// Animes & Vídeos → Descobrir: busca + Animes · Séries · Filmes na mesma linha.
// Qualquer obra abre a página dela (tela inteira); "Assistir" procura em todas as fontes.
// Navegar pelo catálogo de uma fonte específica fica em Fontes → "Navegar".

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, SearchX, X, Sparkles, Tv, Film, Puzzle } from 'lucide-react';
import { AniListBrowser } from './AniListBrowser';
import { Catalog } from './NuvioView';
import { ContinueWatching } from './ContinueWatching';
import { SourcesSearch, type SourcesSearchStatus } from './SourcesSearch';
import { NUVIO_EVENT } from '../api/nuvio';
import { videoSourceCounts } from '../api/sources';
import { t } from '../i18n';
import { DISCOVER_SEARCH_EVENT, takePendingDiscoverSearch } from '../api/discoverSearch';
import { anilistTagNames, parseAniListQuery } from '../api/anilistTags';
import { parseGenreQuery, parseTerms } from '../utils/smartSearch';
import { NUVIO_GENRES } from '../api/nuvio';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;
type Kind = 'anilist' | 'series' | 'movie';

const SOURCE_KEY = 'tp_discover_source';

const readKind = (): Kind => {
  try {
    const v = localStorage.getItem(SOURCE_KEY);
    return v === 'series' || v === 'movie' ? v : 'anilist';
  } catch {
    return 'anilist';
  }
};

export const DiscoverView: React.FC<{
  onOpenTab?: OpenTabFn;
  onGoToSources: () => void;
}> = ({ onOpenTab, onGoToSources }) => {
  const [kind, setKindState] = useState<Kind>(readKind);
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [counts, setCounts] = useState(videoSourceCounts);
  const inputRef = useRef<HTMLInputElement>(null);
  // Botões do catálogo atual (Atualizar capas / Webview) entram aqui, ao lado das abas
  const [actionsEl, setActionsEl] = useState<HTMLDivElement | null>(null);
  // Quantos resultados o catálogo principal e as fontes acharam (para não deixar áreas vazias)
  const [mainCount, setMainCount] = useState<number | null>(null);
  const [srcStatus, setSrcStatus] = useState<SourcesSearchStatus>({ sources: 0, mal: false, loading: false, hits: 0 });
  useEffect(() => setMainCount(null), [query, kind]);

  const setKind = (k: Kind) => {
    setKindState(k);
    try {
      localStorage.setItem(SOURCE_KEY, k);
    } catch {
      /* ignore */
    }
  };

  useEffect(() => {
    const refresh = () => setCounts(videoSourceCounts());
    window.addEventListener('extensions:updated', refresh);
    window.addEventListener(NUVIO_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('extensions:updated', refresh);
      window.removeEventListener(NUVIO_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  // Busca pedida de fora (tag clicada na página de uma obra)
  useEffect(() => {
    const apply = (d: { kind?: Kind; query?: string } | null) => {
      if (!d) return;
      if (d.kind === 'anilist' || d.kind === 'series' || d.kind === 'movie') setKind(d.kind);
      setInput(d.query || '');
      setQuery((d.query || '').trim());
    };
    apply(takePendingDiscoverSearch());
    const on = (e: Event) => {
      takePendingDiscoverSearch();
      apply((e as CustomEvent).detail);
    };
    window.addEventListener(DISCOVER_SEARCH_EVENT, on);
    return () => window.removeEventListener(DISCOVER_SEARCH_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Como a busca foi entendida (gêneros e tags viram filtros)
  const [tagNames, setTagNames] = useState<string[]>([]);
  useEffect(() => {
    void anilistTagNames().then(setTagNames);
  }, []);
  const parts = useMemo(() => {
    if (!query) return [];
    return kind === 'anilist' ? parseAniListQuery(query, tagNames).parts : parseGenreQuery(query, NUVIO_GENRES).parts;
  }, [query, kind, tagNames]);
  const showParts = parts.length > 1 || parts.some((p) => p.kind !== 'text');
  // Nas fontes só faz sentido buscar o texto (gêneros e tags são filtros dos catálogos)
  const sourcesQuery = useMemo(() => parts.filter((p) => p.kind === 'text').map((p) => p.value).join(' ').trim(), [parts]);
  const mainLabel = kind === 'anilist' ? 'AniList' : 'Cinemeta';
  // Catálogo principal sem nada: some (sem área vazia) e as fontes ocupam o espaço;
  // se as fontes também não acharam nada, mostra um aviso só, com sugestões
  const mainEmpty = !!query && mainCount === 0;
  const nothingFound = mainEmpty && !srcStatus.loading && srcStatus.hits === 0;
  const removeTerm = (idx: number) => {
    const next = parseTerms(input).filter((_, i) => i !== idx).join(', ');
    setInput(next);
    setQuery(next);
  };

  // Busca com atraso curto enquanto digita
  useEffect(() => {
    const id = setTimeout(() => setQuery(input.trim()), 450);
    return () => clearTimeout(id);
  }, [input]);

  const placeholder = useMemo(
    () => (kind === 'series' ? t('Buscar séries… (ex.: Crime, Drama)') : kind === 'movie' ? t('Buscar filmes… (ex.: Terror, Mistério)') : t('Buscar animes… (ex.: Seinen, Monster)')),
    [kind]
  );

  const kinds: [Kind, string, React.ReactNode][] = [
    ['anilist', t('Animes'), <Sparkles key="a" size={13} />],
    ['series', t('Séries'), <Tv key="s" size={13} />],
    ['movie', t('Filmes'), <Film key="m" size={13} />],
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-canvas">
      <div className="px-4 py-3 border-b border-line-subtle bg-surface flex-shrink-0 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px] max-w-2xl">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setQuery(input.trim());
              if (e.key === 'Escape') setInput('');
            }}
            placeholder={placeholder}
            aria-label={placeholder}
            className="w-full h-10 bg-canvas border border-line focus:border-accent rounded-lg pl-10 pr-9 text-[13.5px] text-fg outline-none"
          />
          {input && (
            <button
              type="button"
              onClick={() => {
                setInput('');
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-fg-muted hover:text-fg cursor-pointer"
              aria-label={t('Limpar busca')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div role="tablist" aria-label={t('Catálogos')} className="inline-flex p-1 rounded-lg bg-canvas border border-line-subtle shrink-0">
          {kinds.map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`inline-flex items-center gap-1.5 h-8 px-3.5 rounded-md text-[12.5px] cursor-pointer transition-colors ${
                kind === k ? 'bg-surface text-fg font-semibold shadow-sm' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <span className={kind === k ? 'text-accent' : ''}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        <div ref={setActionsEl} className="flex items-center gap-2 shrink-0" />

        {counts.total > 0 && (
          <button
            type="button"
            onClick={onGoToSources}
            className="ml-auto h-10 px-3 rounded-lg text-[12.5px] font-medium inline-flex items-center gap-1.5 cursor-pointer shrink-0 border bg-subtle hover:bg-elevated text-fg-2 hover:text-fg border-line-subtle"
            title={t('Gerenciar e navegar pelas suas fontes')}
          >
            <Puzzle size={14} />
            {t('Fontes ({n})', { n: counts.total })}
          </button>
        )}
      </div>

      {counts.total === 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border-b border-line-subtle bg-accent/5 text-[12.5px] text-fg-2 flex-shrink-0">
          <Sparkles size={14} className="text-accent shrink-0" />
          <span className="flex-1">{t('Você pode explorar e favoritar à vontade. Para assistir, adicione uma fonte: extensão, plugin ou addon — basta colar o link.')}</span>
          <button type="button" onClick={onGoToSources} className="h-7 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold cursor-pointer shrink-0">
            {t('Adicionar fontes')}
          </button>
        </div>
      )}

      {showParts && (
        <div className="flex items-center gap-1.5 px-4 py-2 border-b border-line-subtle bg-surface/60 flex-shrink-0 overflow-x-auto scrollbar-none" aria-label={t('Filtros da busca')}>
          <span className="text-[11.5px] text-fg-muted shrink-0">{t('Buscando por')}</span>
          {parts.map((p, i) => (
            <button
              key={`${i}-${p.term}`}
              type="button"
              onClick={() => removeTerm(i)}
              title={t('Remover "{tag}" da busca', { tag: p.term })}
              className={`h-6 pl-2 pr-1.5 rounded-full text-[11.5px] whitespace-nowrap inline-flex items-center gap-1 cursor-pointer border ${
                p.kind === 'text' ? 'border-line text-fg-2 bg-subtle' : 'border-accent/40 bg-accent/15 text-fg'
              }`}
            >
              <span className="opacity-70">{p.kind === 'genre' ? t('Gênero') : p.kind === 'tag' ? t('Tag') : t('Texto')}</span>
              <span className="font-medium">{p.value}</span>
              <X size={11} className="opacity-70" />
            </button>
          ))}
          <span className="text-[11px] text-fg-muted shrink-0 ml-1">{t('Separe por vírgula para combinar')}</span>
        </div>
      )}

      {/* Também procura em todas as fontes instaladas (o que não está no AniList/Cinemeta) */}
      <SourcesSearch
        query={sourcesQuery}
        kind={kind}
        onOpenTab={onOpenTab}
        expand={mainEmpty}
        note={mainEmpty ? t('nada no {src} para essa busca', { src: mainLabel }) : undefined}
        onStatus={setSrcStatus}
      />

      {!query && <ContinueWatching onOpenTab={onOpenTab} />}

      {nothingFound && (
        <div className="flex-1 min-h-0 overflow-y-auto flex items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-4 w-14 h-14 rounded-2xl bg-subtle border border-line-subtle flex items-center justify-center text-fg-muted">
              <SearchX size={24} />
            </div>
            <h3 className="text-[15px] font-semibold text-fg">{t('Nada encontrado para "{q}"', { q: query })}</h3>
            <p className="mt-1.5 text-[12.5px] text-fg-muted leading-relaxed">
              {srcStatus.mal
                ? srcStatus.sources > 0
                  ? t('Procuramos no {src}, no MyAnimeList e em {n} fontes suas. Confira a grafia ou tente o nome em inglês ou japonês.', { src: mainLabel, n: srcStatus.sources })
                  : t('Procuramos no {src} e no MyAnimeList. Confira a grafia ou tente o nome em inglês ou japonês.', { src: mainLabel })
                : srcStatus.sources > 0
                  ? t('Procuramos no {src} e em {n} fontes suas. Confira a grafia ou tente o nome em inglês ou japonês.', { src: mainLabel, n: srcStatus.sources })
                  : t('Procuramos no {src}. Confira a grafia ou tente o nome em inglês ou japonês.', { src: mainLabel })}
            </p>
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              {kinds
                .filter(([k]) => k !== kind)
                .map(([k, label, icon]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated border border-line-subtle text-[12.5px] text-fg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    {icon}
                    {t('Buscar em {kind}', { kind: label })}
                  </button>
                ))}
              <button
                type="button"
                onClick={() => {
                  setInput('');
                  setQuery('');
                  inputRef.current?.focus();
                }}
                className="h-8 px-3 rounded-md text-[12.5px] text-fg-muted hover:text-fg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <X size={13} />
                {t('Limpar busca')}
              </button>
            </div>
            <button type="button" onClick={onGoToSources} className="mt-5 text-[12px] text-accent hover:underline cursor-pointer inline-flex items-center gap-1.5">
              <Puzzle size={13} />
              {srcStatus.sources > 0 ? t('Adicionar mais fontes') : t('Adicionar fontes para achar mais obras')}
            </button>
          </div>
        </div>
      )}

      {/* Fica montado (e escondido) quando não achou nada, para atualizar sozinho ao mudar a busca */}
      <div className={`flex-1 min-h-0 overflow-hidden ${mainEmpty ? 'hidden' : ''}`}>
        {kind === 'anilist' ? (
          <AniListBrowser onOpenTab={onOpenTab} externalQuery={query} actionsTarget={actionsEl} onResults={setMainCount} />
        ) : (
          <Catalog key={kind} onOpenTab={onOpenTab} embedded={{ kind, query }} actionsTarget={actionsEl} onResults={setMainCount} />
        )}
      </div>
    </div>
  );
};
