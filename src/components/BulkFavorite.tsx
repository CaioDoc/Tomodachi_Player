// src/components/BulkFavorite.tsx
// Favoritar várias obras de uma vez: o coração da capa marca/desmarca a obra e
// uma barra flutuante aparece com "Favoritar N" (abre o modal de tags uma vez só).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Heart, Loader2, X } from 'lucide-react';
import { useIsTabActive } from '../context/TabContext';
import { t, tn } from '../i18n';

export interface BulkSelection<T> {
  items: T[];
  count: number;
  has: (key: string) => boolean;
  toggle: (key: string, item: T) => void;
  clear: () => void;
}

/** Guarda as obras marcadas (por chave estável, ex.: URL) na ordem em que foram marcadas */
export function useBulkSelection<T>(): BulkSelection<T> {
  const [map, setMap] = useState<Map<string, T>>(() => new Map());

  const toggle = useCallback((key: string, item: T) => {
    setMap((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, item);
      return next;
    });
  }, []);

  const clear = useCallback(() => setMap((prev) => (prev.size ? new Map() : prev)), []);

  return useMemo(
    () => ({
      items: Array.from(map.values()),
      count: map.size,
      has: (key: string) => map.has(key),
      toggle,
      clear,
    }),
    [map, toggle, clear]
  );
}

/** Classes do botão de coração na capa: favoritada, marcada para favoritar ou neutra */
export function heartButtonClass(favorited: boolean, selected: boolean) {
  if (favorited) return 'bg-rose-600 text-white shadow-rose-900/50';
  if (selected) return 'bg-accent text-accent-fg ring-2 ring-white/80 scale-110';
  return 'bg-black/60 text-fg-muted hover:text-white hover:bg-rose-600';
}

/** Dica do coração para quem ainda não está na biblioteca */
export function heartSelectTitle(selected: boolean) {
  return selected ? t('Desmarcar') : t('Marcar para favoritar (dá para marcar várias)');
}

interface BarProps {
  count: number;
  busy?: boolean;
  onFavorite: () => void;
  onClear: () => void;
}

/** Barra flutuante que aparece quando há obras marcadas */
export const BulkFavoriteBar: React.FC<BarProps> = ({ count, busy, onFavorite, onClear }) => {
  const active = useIsTabActive();

  // Esc desmarca tudo (só na aba visível)
  useEffect(() => {
    if (!count || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"], .z-\\[99999\\]')) onClear();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, active, onClear]);

  if (!count) return null;

  return (
    <div
      role="toolbar"
      aria-label={t('Obras marcadas')}
      className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[9000] flex items-center gap-2 pl-4 pr-2 py-2 rounded-xl bg-elevated border border-line shadow-2xl animate-in fade-in slide-in-from-bottom-2 duration-150"
    >
      <Heart size={15} className="text-accent" fill="currentColor" />
      <span className="text-[13px] text-fg font-medium tabular-nums whitespace-nowrap">{tn(count, '{n} obra marcada', '{n} obras marcadas')}</span>
      <button
        type="button"
        onClick={onFavorite}
        disabled={busy}
        className="ml-2 h-8 px-3.5 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60 disabled:cursor-wait"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <Heart size={14} fill="currentColor" />}
        {t('Favoritar')}
      </button>
      <button
        type="button"
        onClick={onClear}
        disabled={busy}
        title={t('Desmarcar tudo (Esc)')}
        aria-label={t('Desmarcar tudo (Esc)')}
        className="h-8 w-8 rounded-lg text-fg-muted hover:text-fg hover:bg-subtle inline-flex items-center justify-center cursor-pointer"
      >
        <X size={15} />
      </button>
    </div>
  );
};
