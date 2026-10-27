// src/components/ContinueReading.tsx
// Faixa "Continuar lendo" (Mangás): o capítulo em andamento de cada obra da biblioteca,
// ou o próximo depois do último lido. Um clique abre o leitor na página onde parou.

import React, { useCallback, useEffect, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { readLibrary } from '../utils/libraryStore';
import { getProgressMap, PROGRESS_EVENT } from '../utils/progress';
import { openMangaChapter, chapterDisplayName } from '../api/openChapter';
import { toast } from './Feedback';
import { t } from '../i18n';

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

const COLLAPSE_KEY = 'tp_continue_reading_collapsed';
const HIDDEN_KEY = 'tp_continue_reading_hidden';

interface Row {
  work: any;
  chapter: any;
  page?: number;
  isNext: boolean;
  at: number;
}

const readHidden = (): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) || '{}') || {};
  } catch {
    return {};
  }
};

export const ContinueReading: React.FC<{ onOpenTab?: OpenTabFn }> = ({ onOpenTab }) => {
  const [rows, setRows] = useState<Row[]>([]);
  const [opening, setOpening] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const build = useCallback(async () => {
    const lib = await readLibrary('manga');
    const progress = getProgressMap('manga');
    const hidden = readHidden();
    const cutoff = Date.now() - 60 * 86400000;
    const out: Row[] = [];
    for (const work of lib.entries || []) {
      const chapters = [...(work?.chapters || [])].sort((a: any, b: any) => (Number(a.number) || 0) - (Number(b.number) || 0));
      if (!chapters.length) continue;
      let last: { idx: number; at: number } | null = null;
      chapters.forEach((c: any, idx: number) => {
        const at = progress[c.url]?.updatedAt || 0;
        if (at && (!last || at > last.at)) last = { idx, at };
      });
      if (!last) continue;
      const { idx, at } = last as { idx: number; at: number };
      if (at < cutoff || (hidden[work.url] && hidden[work.url] >= at)) continue;
      const cur = chapters[idx];
      const p = progress[cur.url] || {};
      const read = p.read ?? cur.read;
      if (!read) {
        out.push({ work, chapter: { ...cur, lastPageRead: p.lastPageRead ?? cur.lastPageRead, read: false }, page: p.lastPageRead ?? cur.lastPageRead, isNext: false, at });
      } else {
        // Terminou o capítulo: sugere o próximo ainda não lido
        const next = chapters.slice(idx + 1).find((c: any) => !(progress[c.url]?.read ?? c.read));
        if (next) out.push({ work, chapter: next, isNext: true, at });
      }
    }
    out.sort((a, b) => b.at - a.at);
    setRows(out.slice(0, 20));
  }, []);

  useEffect(() => {
    void build();
    const on = () => void build();
    window.addEventListener(PROGRESS_EVENT, on);
    window.addEventListener('manga:library-updated', on);
    window.addEventListener('backup:applied', on);
    return () => {
      window.removeEventListener(PROGRESS_EVENT, on);
      window.removeEventListener('manga:library-updated', on);
      window.removeEventListener('backup:applied', on);
    };
  }, [build]);

  if (rows.length === 0) return null;

  const open = async (r: Row) => {
    if (opening) return;
    setOpening(r.chapter.url);
    const err = await openMangaChapter(r.work, r.chapter, onOpenTab as any);
    setOpening(null);
    if (err) toast.error(t('Não foi possível abrir o capítulo'), err);
  };

  const hide = (r: Row) => {
    const h = readHidden();
    h[r.work.url] = Date.now();
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(h));
    } catch {
      /* ignore */
    }
    setRows((list) => list.filter((x) => x.work.url !== r.work.url));
  };

  return (
    <section className="flex-shrink-0 border-b border-line-subtle bg-surface/60">
      <button
        type="button"
        onClick={() =>
          setCollapsed((c) => {
            try {
              localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
            } catch {
              /* ignore */
            }
            return !c;
          })
        }
        className="w-full flex items-center gap-2 px-4 pt-3 pb-2 text-left cursor-pointer"
        aria-expanded={!collapsed}
      >
        <BookOpen size={13} className="text-accent" />
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{t('Continuar lendo')}</h2>
        <span className="text-[11px] text-fg-muted tabular-nums">{rows.length}</span>
        <span className="ml-auto text-fg-muted">{collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</span>
      </button>
      {!collapsed && (
        <div className="flex gap-3 overflow-x-auto px-4 pb-3 scrollbar-thin">
          {rows.map((r) => {
            const total = r.work.chapters?.length || 0;
            const readCount = (r.work.chapters || []).filter((c: any) => getProgressMap('manga')[c.url]?.read ?? c.read).length;
            const pct = total ? Math.round((readCount / total) * 100) : 0;
            return (
              <div key={r.work.url} className="group relative w-[260px] shrink-0 rounded-lg border border-line-subtle bg-canvas hover:border-accent/60 overflow-hidden transition-colors">
                <button type="button" onClick={() => void open(r)} disabled={!!opening} className="w-full flex gap-3 p-2 text-left cursor-pointer disabled:cursor-wait">
                  <span className="relative w-14 h-20 rounded-md overflow-hidden bg-subtle shrink-0 flex items-center justify-center">
                    {r.work.cover ? <img src={r.work.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(ev) => ((ev.target as HTMLElement).style.visibility = 'hidden')} /> : <BookOpen size={18} className="text-fg-muted" />}
                    {opening === r.chapter.url && (
                      <span className="absolute inset-0 flex items-center justify-center bg-black/50">
                        <Loader2 size={18} className="animate-spin text-white" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1 py-0.5 flex flex-col">
                    <span className="text-[12.5px] font-semibold text-fg line-clamp-2 leading-snug">{r.work.title}</span>
                    <span className="text-[11px] text-fg-muted truncate mt-0.5">
                      {r.isNext ? t('Próximo: {name}', { name: chapterDisplayName(r.chapter, 'manga') }) : chapterDisplayName(r.chapter, 'manga')}
                    </span>
                    <span className="mt-auto text-[10.5px] text-fg-muted tabular-nums">
                      {!r.isNext && r.page ? t('Página {n}', { n: r.page }) : t('{read} de {total} lidos', { read: readCount, total })}
                    </span>
                  </span>
                </button>
                <span className="absolute left-0 right-0 bottom-0 h-[3px] bg-line-subtle">
                  <span className="block h-full bg-accent" style={{ width: `${pct}%` }} />
                </span>
                <button
                  type="button"
                  onClick={() => hide(r)}
                  className="absolute top-1.5 right-1.5 p-1 rounded bg-surface/90 border border-line text-fg-muted hover:text-danger-fg cursor-pointer opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity"
                  title={t('Remover de Continuar lendo')}
                  aria-label={t('Remover de Continuar lendo')}
                >
                  <X size={12} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
