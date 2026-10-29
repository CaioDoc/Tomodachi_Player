// src/components/MaybeYouLike.tsx
// Seção "Talvez você goste" (embaixo dos episódios/capítulos) + tags clicáveis da obra.

import React, { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Star, Tag } from 'lucide-react';
import {
  anilistAnimeToWork,
  anilistRecommendations,
  cinemetaRecommendations,
  reasonLabel,
  type RecItem,
  type RecResult,
} from '../api/recommend';
import { nuvioWorkUrl, type NuvioType } from '../api/nuvio';
import { openMangaDexTitle } from '../api/mangaSearch';
import { t } from '../i18n';

type OpenTabFn = (type: any, title: string, data?: any) => void;

export type RecRequest =
  | { kind: 'anilist'; type: 'ANIME' | 'MANGA'; id?: number; title: string; altTitles?: string[] }
  | { kind: 'cinemeta'; meta: { id: string; type: NuvioType; name: string; genres?: string[]; year?: string | number } };

const requestKey = (r: RecRequest) => (r.kind === 'anilist' ? `al:${r.type}:${r.id || r.title}` : `cm:${r.meta.type}:${r.meta.id}`);

/** Carrega as recomendações (e as tags extras do AniList) de uma obra */
export function useRecommendations(req: RecRequest | null) {
  const [state, setState] = useState<{ loading: boolean; result: RecResult | null; error: boolean }>({ loading: !!req, result: null, error: false });
  const key = req ? requestKey(req) : '';
  useEffect(() => {
    if (!req) {
      setState({ loading: false, result: null, error: false });
      return;
    }
    let alive = true;
    setState({ loading: true, result: null, error: false });
    const p = req.kind === 'anilist' ? anilistRecommendations({ type: req.type, id: req.id, title: req.title, altTitles: req.altTitles }) : cinemetaRecommendations(req.meta);
    p.then((result) => alive && setState({ loading: false, result, error: false })).catch(() => alive && setState({ loading: false, result: null, error: true }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** Tags da obra: clicar procura obras com aquela tag */
export const WorkTags: React.FC<{ tags: string[]; onPick: (tag: string) => void; hint?: string }> = ({ tags, onPick, hint }) => {
  const list = Array.from(new Set(tags.filter(Boolean)));
  if (!list.length) return null;
  return (
    <div className="flex flex-wrap items-center gap-1 mt-4">
      <Tag size={12} className="text-fg-muted mr-0.5" aria-hidden />
      {list.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => onPick(g)}
          title={hint || t('Ver obras com "{tag}"', { tag: g })}
          className="px-2 py-0.5 rounded text-[11px] bg-subtle/80 text-fg-muted border border-line-subtle hover:text-fg hover:border-accent/50 hover:bg-accent/10 cursor-pointer transition-colors"
        >
          {g}
        </button>
      ))}
    </div>
  );
};

const reasonClass = (r: RecItem['reason']) =>
  r === 'sequel' || r === 'prequel' || r === 'parent' || r === 'franchise'
    ? 'bg-accent text-accent-fg'
    : r === 'recommended' || r === 'similar'
      ? 'bg-black/70 text-white'
      : 'bg-violet-600 text-white';

export const MaybeYouLike: React.FC<{
  request: RecRequest | null;
  state: ReturnType<typeof useRecommendations>;
  onOpenTab?: OpenTabFn;
}> = ({ request, state, onOpenTab }) => {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const items = state.result?.items || [];

  const updateEdges = () => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(updateEdges, [items.length]);

  if (!request || (!state.loading && items.length === 0)) return null;

  const open = (it: RecItem) => {
    if (it.anilist) {
      if (it.anilist.type === 'ANIME') {
        const work = anilistAnimeToWork(it.anilist);
        onOpenTab?.('anime-detail', work.title, { anime: work });
      } else {
        openMangaDexTitle(it.title, [it.anilist.title.romaji, it.anilist.title.english].filter(Boolean) as string[]);
      }
      return;
    }
    if (it.meta) {
      onOpenTab?.('anime-detail', it.meta.name, {
        anime: { url: nuvioWorkUrl(it.meta.type, it.meta.id), title: it.meta.name, cover: it.meta.poster, source: 'nuvio', sourceName: 'Nuvio', addonUrl: it.meta.addonUrl },
      });
    }
  };

  const scrollBy = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * Math.max(300, (scroller.current?.clientWidth || 600) * 0.8), behavior: 'smooth' });

  return (
    <section className="max-w-6xl mx-auto px-6 pb-8" aria-label={t('Talvez você goste')}>
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-sm font-semibold text-fg flex items-center gap-2 mr-auto">
          <Sparkles size={15} className="text-accent" />
          {t('Talvez você goste')}
        </h2>
        <button
          type="button"
          onClick={() => scrollBy(-1)}
          disabled={!edges.left}
          aria-label={t('Anterior')}
          className="h-7 w-7 rounded-md border border-line bg-surface hover:bg-subtle text-fg-2 inline-flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default"
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          onClick={() => scrollBy(1)}
          disabled={!edges.right}
          aria-label={t('Próxima')}
          className="h-7 w-7 rounded-md border border-line bg-surface hover:bg-subtle text-fg-2 inline-flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default"
        >
          <ChevronRight size={15} />
        </button>
      </div>

      <div ref={scroller} onScroll={updateEdges} className="flex gap-3 overflow-x-auto scrollbar-thin pb-2 scroll-smooth snap-x">
        {state.loading
          ? Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="w-[140px] shrink-0">
                <div className="aspect-[2/3] rounded-lg bg-subtle animate-pulse" />
                <div className="mt-2 h-3 w-4/5 rounded bg-subtle animate-pulse" />
              </div>
            ))
          : items.map((it) => (
              <button
                key={it.key}
                type="button"
                onClick={() => open(it)}
                className="group w-[140px] shrink-0 text-left cursor-pointer snap-start focus-visible:outline-none"
                title={it.shared?.length ? `${it.title} · ${it.shared.join(', ')}` : it.title}
              >
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-subtle border border-line-subtle group-hover:border-accent/60 group-focus-visible:ring-2 group-focus-visible:ring-accent/60 transition-colors">
                  {it.cover ? (
                    <img
                      src={it.cover}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-300"
                      onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')}
                    />
                  ) : null}
                  <span className={`absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold shadow ${reasonClass(it.reason)}`}>{reasonLabel(it.reason)}</span>
                  {it.score ? (
                    <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white inline-flex items-center gap-0.5 tabular-nums">
                      <Star size={9} className="text-yellow-400" fill="currentColor" /> {it.score >= 10 ? (it.score / 10).toFixed(1) : it.score}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1.5 text-[12px] font-medium text-fg line-clamp-2 leading-snug group-hover:text-accent">{it.title}</div>
                <div className="text-[11px] text-fg-muted truncate">{[it.year, it.anilist?.format && it.anilist.format.replace(/_/g, ' ')].filter(Boolean).join(' · ') || '—'}</div>
              </button>
            ))}
      </div>
    </section>
  );
};
