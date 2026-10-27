// src/components/CommandPalette.tsx
// Busca global (Ctrl+K): obras da biblioteca, telas do app, abas abertas e pesquisa na web.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, BookOpen, Film, Compass, Globe, Layers, CornerDownLeft, Settings } from 'lucide-react';
import { readLibrary } from '../utils/libraryStore';
import { LABELS, SECTION_VIEW_LABELS, type SectionView } from '../constants/labels';
import type { TabItem, TabType } from '../types';
import { t } from '../i18n';

interface PaletteItem {
  id: string;
  group: string;
  label: string;
  hint?: string;
  icon: React.ReactNode;
  cover?: string;
  keywords?: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  tabs: TabItem[];
  onSelectTab: (id: string) => void;
  onNavigate: (type: TabType, view?: SectionView) => void;
  onOpenTab: (type: any, title: string, data?: any) => void;
}

const norm = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const GROUP_MANGA_LIB = t('Mangás na biblioteca');
const GROUP_VIDEO_LIB = t('Animes na biblioteca');

const VIEWS: SectionView[] = ['library', 'updates', 'history', 'online', 'extensions', 'repos', 'local', 'backup', 'nuvio'];

export const CommandPalette: React.FC<CommandPaletteProps> = ({ open, onClose, tabs, onSelectTab, onNavigate, onOpenTab }) => {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [library, setLibrary] = useState<{ manga: any[]; video: any[] }>({ manga: [], video: [] });
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    window.setTimeout(() => inputRef.current?.focus(), 0);
    Promise.all([readLibrary('manga'), readLibrary('video')]).then(([m, v]) =>
      setLibrary({ manga: m.entries || [], video: v.entries || [] })
    );
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const out: PaletteItem[] = [];
    const q = norm(query.trim());

    // Telas
    for (const type of ['mangas', 'videos'] as const) {
      const kind = type === 'mangas' ? 'manga' : 'video';
      for (const v of VIEWS) {
        if (v === 'nuvio') continue;
        // Em Animes & Vídeos, Extensões/Repositórios viraram uma tela só (Fontes)
        if (type === 'videos' && v === 'repos') continue;
        out.push({
          id: `nav-${type}-${v}`,
          group: t('Ir para'),
          label: `${SECTION_VIEW_LABELS[kind][v]}`,
          hint: type === 'mangas' ? LABELS.mangas : LABELS.videos,
          icon: type === 'mangas' ? <BookOpen size={15} /> : <Film size={15} />,
          keywords: `${SECTION_VIEW_LABELS[kind][v]} ${type === 'mangas' ? 'manga mangas comics' : 'anime animes video videos'}`,
          run: () => onNavigate(type, v),
        });
      }
    }
    out.push({
      id: 'nav-settings',
      group: t('Ir para'),
      label: t('Configurações'),
      hint: t('Temas, repositórios, contas'),
      icon: <Settings size={15} />,
      keywords: 'configuracoes tema settings',
      run: () => onNavigate('settings-repos'),
    });

    // Abas abertas
    for (const tab of tabs) {
      out.push({
        id: `tab-${tab.id}`,
        group: t('Abas abertas'),
        label: tab.title,
        icon: <Layers size={15} />,
        run: () => onSelectTab(tab.id),
      });
    }

    // Biblioteca
    const addWorks = (list: any[], kind: 'manga' | 'video') => {
      for (const w of list) {
        if (!w?.title) continue;
        out.push({
          id: `w-${kind}-${w.url}`,
          group: kind === 'manga' ? GROUP_MANGA_LIB : GROUP_VIDEO_LIB,
          label: w.title,
          hint: [w.author, w.sourceName || w.source].filter(Boolean).join(' · '),
          icon: kind === 'manga' ? <BookOpen size={15} /> : <Film size={15} />,
          cover: w.cover,
          keywords: `${w.author || ''} ${(w.genres || []).join(' ')}`,
          run: () => {
            if (kind === 'manga') onOpenTab('manga-detail', w.title, { manga: w, initialExtension: w.sourceName || w.source });
            else onOpenTab('anime-detail', w.title, { anime: w });
          },
        });
      }
    };
    addWorks(library.manga, 'manga');
    addWorks(library.video, 'video');

    let result = out;
    if (q) {
      const terms = q.split(/\s+/);
      result = out.filter((it) => {
        const hay = norm(`${it.label} ${it.hint || ''} ${it.keywords || ''}`);
        return terms.every((term) => hay.includes(term));
      });
      // Pesquisa na web sempre disponível ao digitar
      result.push({
        id: 'web',
        group: 'Web',
        label: t('Pesquisar “{q}” na web', { q: query.trim() }),
        icon: <Globe size={15} />,
        run: () => {
          const url = `https://duckduckgo.com/?q=${encodeURIComponent(query.trim())}`;
          onOpenTab('webview', query.trim(), { url, initialUrl: url });
        },
      });
    } else {
      // Sem busca: mostra só atalhos principais e abas
      result = out.filter((it) => it.group !== GROUP_MANGA_LIB && it.group !== GROUP_VIDEO_LIB).slice(0, 40);
    }
    return result.slice(0, 80);
  }, [query, tabs, library, onNavigate, onOpenTab, onSelectTab]);

  useEffect(() => setSelected(0), [query]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${selected}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const run = (it?: PaletteItem) => {
    if (!it) return;
    onClose();
    it.run();
  };

  let lastGroup = '';

  return (
    <div
      className="fixed inset-0 z-[150] bg-black/50 flex items-start justify-center pt-[12vh] px-4 animate-tp-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={t('Busca global')} className="w-full max-w-xl rounded-xl bg-surface border border-line shadow-pop overflow-hidden animate-tp-zoom-in">
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-line-subtle">
          <Search size={16} className="text-fg-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelected((s) => Math.min(items.length - 1, s + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelected((s) => Math.max(0, s - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                run(items[selected]);
              } else if (e.key === 'Escape') {
                e.preventDefault();
                onClose();
              }
            }}
            placeholder={t('Buscar obras, telas, abas…')}
            className="flex-1 bg-transparent outline-none text-[14px] text-fg placeholder-fg-muted"
            spellCheck={false}
          />
          <kbd className="text-[10.5px] text-fg-muted border border-line rounded px-1.5 py-0.5">Esc</kbd>
        </div>

        <div ref={listRef} className="max-h-[55vh] overflow-y-auto py-1.5" role="listbox">
          {items.length === 0 && <p className="text-center text-[13px] text-fg-muted py-8">{t('Nada encontrado.')}</p>}
          {items.map((it, idx) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <React.Fragment key={it.id}>
                {header && <div className="px-4 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted">{header}</div>}
                <button
                  type="button"
                  data-idx={idx}
                  role="option"
                  aria-selected={idx === selected}
                  onMouseMove={() => setSelected(idx)}
                  onClick={() => run(it)}
                  className={`w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer ${idx === selected ? 'bg-accent/15' : ''}`}
                >
                  {it.cover ? (
                    <img src={it.cover} alt="" className="w-6 h-8 rounded object-cover bg-subtle shrink-0" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                  ) : (
                    <span className={`w-6 flex justify-center shrink-0 ${idx === selected ? 'text-accent' : 'text-fg-muted'}`}>{it.icon}</span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-[13px] text-fg truncate">{it.label}</span>
                    {it.hint && <span className="block text-[11.5px] text-fg-muted truncate">{it.hint}</span>}
                  </span>
                  {idx === selected && <CornerDownLeft size={13} className="text-fg-muted shrink-0" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>

        <div className="flex items-center gap-4 px-4 h-9 border-t border-line-subtle text-[11px] text-fg-muted">
          <span>{t('↑↓ navegar')}</span>
          <span>{t('Enter abrir')}</span>
          <span className="ml-auto inline-flex items-center gap-1">
            <Compass size={11} /> Ctrl+K
          </span>
        </div>
      </div>
    </div>
  );
};
