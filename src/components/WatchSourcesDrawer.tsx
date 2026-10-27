// src/components/WatchSourcesDrawer.tsx
// Painel lateral "Onde assistir": aparece ao escolher assistir uma obra (Descobrir, AniList,
// biblioteca…). Procura em todas as fontes de uma vez (extensões, plugins e addons).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ChevronLeft, ChevronRight, Film, ShieldCheck } from 'lucide-react';
import { WATCH_SOURCES_EVENT, type WatchRequest } from '../api/watchSources';
import { WhereToWatch } from './WhereToWatch';
import { t } from '../i18n';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

/* ───────────────────────── Painel ───────────────────────── */

export const WatchSourcesDrawer: React.FC<{ onOpenTab?: OpenTabFn }> = ({ onOpenTab }) => {
  const [req, setReq] = useState<WatchRequest | null>(null);
  const [episode, setEpisode] = useState(1);

  useEffect(() => {
    const on = (e: Event) => {
      const r = (e as CustomEvent).detail as WatchRequest;
      if (!r?.title) return;
      setReq({ ...r });
      setEpisode(Math.max(1, r.episode || 1));
    };
    window.addEventListener(WATCH_SOURCES_EVENT, on);
    return () => window.removeEventListener(WATCH_SOURCES_EVENT, on);
  }, []);

  useEffect(() => {
    if (!req) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setReq(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [req]);

  if (!req) return null;
  const close = () => setReq(null);
  const isSeries = req.kind === 'series';

  return createPortal(
    <div className="fixed inset-0 z-[120] flex justify-end" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="absolute inset-0 bg-black/40" aria-hidden onMouseDown={close} />
      <aside role="dialog" aria-label={t('Onde assistir')} className="relative w-full max-w-[440px] h-full bg-surface border-l border-line shadow-2xl flex flex-col animate-tp-fade-in">
        <div className="flex items-start gap-3 px-4 pt-4 pb-3 border-b border-line-subtle">
          <span className="w-12 h-16 rounded-md bg-subtle overflow-hidden shrink-0 flex items-center justify-center">
            {req.cover ? <img src={req.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <Film size={18} className="text-fg-muted" />}
          </span>
          <div className="min-w-0 flex-1">
            <span className="text-[10.5px] uppercase tracking-[0.08em] text-fg-muted">{t('Onde assistir')}</span>
            <h2 className="text-[14.5px] font-semibold text-fg leading-tight line-clamp-2">{req.title}</h2>
            {isSeries && (
              <div className="flex items-center gap-1 mt-1.5">
                <button type="button" onClick={() => setEpisode((n) => Math.max(1, n - 1))} className="w-7 h-7 rounded-md bg-subtle hover:bg-elevated flex items-center justify-center cursor-pointer" aria-label={t('Episódio anterior')}>
                  <ChevronLeft size={14} />
                </button>
                <label className="h-7 px-2 rounded-md bg-canvas border border-line-subtle inline-flex items-center gap-1 text-[12px] text-fg-2">
                  {t('Episódio')}
                  <input
                    type="number"
                    min={1}
                    value={episode}
                    onChange={(e) => setEpisode(Math.max(1, Number(e.target.value) || 1))}
                    className="w-12 bg-transparent outline-none text-fg tabular-nums"
                  />
                </label>
                <button type="button" onClick={() => setEpisode((n) => n + 1)} className="w-7 h-7 rounded-md bg-subtle hover:bg-elevated flex items-center justify-center cursor-pointer" aria-label={t('Próximo episódio')}>
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>
          <button type="button" onClick={close} className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer" aria-label={t('Fechar')}>
            <X size={17} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <WhereToWatch req={req} episode={episode} onOpenTab={onOpenTab} onPlayed={close} />
        </div>
        <div className="px-4 py-2 border-t border-line-subtle text-[10.5px] text-fg-muted flex items-center gap-1.5">
          <ShieldCheck size={11} /> {t('Procuramos em todas as suas fontes. Só aparecem links que o player consegue reproduzir.')}
        </div>
      </aside>
    </div>,
    document.body
  );
};
