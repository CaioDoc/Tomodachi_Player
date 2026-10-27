// src/components/ContinueWatching.tsx
// Faixa "Continuar assistindo": os episódios parados no meio, com um clique para retomar
// da mesma fonte e no mesmo ponto. Se o link não funcionar mais, "Outras fontes" abre o painel.

import React, { useEffect, useState } from 'react';
import { Play, X, Radio, Film, ChevronDown, ChevronUp } from 'lucide-react';
import { CONTINUE_EVENT, listResume, removeResume, fmtClock, type ResumeEntry } from '../utils/continueWatching';
import { openWatchSources } from '../api/watchSources';
import { readLibrary } from '../utils/libraryStore';
import { t } from '../i18n';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

const HIDE_KEY = 'tp_continue_collapsed';

/** Número do episódio no título ("… - Episódio 3", "T1 E3", "Ep 3") */
const episodeNumberOf = (title: string): number | undefined => {
  const m = title.match(/\bE(?:p(?:is[oó]dio)?\.?)?\s*(\d{1,4})\b/i) || title.match(/Epis[oó]dio\s*(\d{1,4})/i);
  return m ? Number(m[1]) : undefined;
};

export const ContinueWatching: React.FC<{ onOpenTab?: OpenTabFn }> = ({ onOpenTab }) => {
  const [items, setItems] = useState<ResumeEntry[]>(() => listResume());
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(HIDE_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Capa de quem não guardou uma: procura na biblioteca (pela obra ou pelo título)
  const [covers, setCovers] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!items.some((e) => !e.cover)) return;
    void readLibrary('video').then((lib) => {
      const out: Record<string, string> = {};
      const entries: any[] = lib.entries || [];
      for (const e of items) {
        if (e.cover) continue;
        const name = (e.workTitle || e.title.split(' - ')[0]).toLowerCase();
        const hit = entries.find((w) => (e.workUrl && w?.url === e.workUrl) || String(w?.title || '').toLowerCase() === name || (w?.chapters || []).some((c: any) => c?.url === e.key));
        if (hit?.cover) out[e.key] = hit.cover;
      }
      setCovers(out);
    });
  }, [items]);

  useEffect(() => {
    const refresh = () => setItems(listResume());
    window.addEventListener(CONTINUE_EVENT, refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener(CONTINUE_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  if (items.length === 0) return null;

  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(HIDE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  };

  const isLocal = (e: ResumeEntry) => /^[a-zA-Z]:[\\/]/.test(e.key) || e.key.startsWith('/') || e.key.startsWith('\\\\');

  return (
    <section className="flex-shrink-0 border-b border-line-subtle bg-surface/60">
      <button type="button" onClick={toggle} className="w-full flex items-center gap-2 px-4 pt-3 pb-2 text-left cursor-pointer" aria-expanded={!collapsed}>
        <Play size={13} className="text-accent" fill="currentColor" />
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{t('Continuar assistindo')}</h2>
        <span className="text-[11px] text-fg-muted tabular-nums">{items.length}</span>
        <span className="ml-auto text-fg-muted">{collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
      </button>
      {!collapsed && (
        <div className="flex gap-3 overflow-x-auto px-4 pb-3 scrollbar-thin">
          {items.map((e) => {
            const pct = e.d > 0 ? Math.min(100, (e.t / e.d) * 100) : 0;
            const work = e.workTitle || e.title.split(' - ')[0];
            const episode = e.workTitle && e.title.startsWith(e.workTitle) ? e.title.slice(e.workTitle.length).replace(/^\s*-\s*/, '') : e.title !== work ? e.title : '';
            return (
              <div key={e.key} className="group relative w-[260px] shrink-0 rounded-lg border border-line-subtle bg-canvas hover:border-accent/60 overflow-hidden transition-colors">
                <button type="button" onClick={() => onOpenTab?.('video-player', e.title, e.play)} className="w-full flex gap-3 p-2 text-left cursor-pointer" title={t('Continuar de {time}', { time: fmtClock(e.t) })}>
                  <span className="relative w-14 h-20 rounded-md overflow-hidden bg-subtle shrink-0 flex items-center justify-center">
                    {e.cover || covers[e.key] ? <img src={e.cover || covers[e.key]} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(ev) => ((ev.target as HTMLElement).style.display = 'none')} /> : <Film size={18} className="text-fg-muted" />}
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/45 transition-colors">
                      <Play size={18} className="text-white opacity-0 group-hover:opacity-100" fill="currentColor" />
                    </span>
                  </span>
                  <span className="min-w-0 flex-1 py-0.5 flex flex-col">
                    <span className="text-[12.5px] font-semibold text-fg line-clamp-2 leading-snug">{work}</span>
                    {episode && <span className="text-[11px] text-fg-muted truncate mt-0.5">{episode}</span>}
                    <span className="mt-auto text-[10.5px] text-fg-muted tabular-nums">
                      {e.d > 0 ? t('{time} de {total}', { time: fmtClock(e.t), total: fmtClock(e.d) }) : t('Parou em {time}', { time: fmtClock(e.t) })}
                    </span>
                  </span>
                </button>
                <span className="absolute left-0 right-0 bottom-0 h-[3px] bg-line-subtle">
                  <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
                </span>
                <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                  {!isLocal(e) && (
                    <button
                      type="button"
                      onClick={() =>
                        e.workUrl?.startsWith('nuvio:')
                          ? onOpenTab?.('anime-detail', work, { anime: { url: e.workUrl, title: work, cover: e.cover }, focusEpisode: e.key })
                          : openWatchSources({
                          title: work,
                          kind: 'series',
                          episode: episodeNumberOf(e.title) || 1,
                          cover: e.cover,
                          episodeUrl: e.key,
                          workUrl: e.workUrl,
                        })
                      }
                      className="p-1 rounded bg-surface/90 border border-line text-fg-muted hover:text-fg cursor-pointer"
                      title={t('Outras fontes')}
                      aria-label={t('Outras fontes')}
                    >
                      <Radio size={12} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeResume(e.key)}
                    className="p-1 rounded bg-surface/90 border border-line text-fg-muted hover:text-danger-fg cursor-pointer"
                    title={t('Remover de Continuar assistindo')}
                    aria-label={t('Remover de Continuar assistindo')}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
