import React, { useEffect, useRef } from 'react';
import {
  X,
  Plus,
  Film,
  BookOpen,
  Globe,
  Flame,
  Database,
  Settings,
  Server,
  Compass,
  Clapperboard,
  BookMarked,
  PlayCircle,
} from 'lucide-react';
import type { TabItem, TabType } from '../types';
import { t } from '../i18n';

/* ───────────────────────── Ícones por tipo de aba ───────────────────────── */

export const TabIcon: React.FC<{ type: TabType; className?: string; size?: number }> = ({ type, className = '', size = 13 }) => {
  const props = { size, className: `flex-shrink-0 ${className}`, 'aria-hidden': true } as const;
  switch (type) {
    case 'mangas':
      return <BookOpen {...props} />;
    case 'manga-local':
    case 'manga-detail':
      return <BookMarked {...props} />;
    case 'manga-reader':
    case 'mangadex-reader':
      return <BookOpen {...props} />;
    case 'videos':
      return <Clapperboard {...props} />;
    case 'video-local':
    case 'anime-detail':
      return <Film {...props} />;
    case 'video-player':
      return <PlayCircle {...props} />;
    case 'manga-backup':
    case 'video-backup':
    case 'backup-viewer':
      return <Database {...props} />;
    case 'repos':
    case 'repo-manga':
    case 'repo-anime':
      return <Server {...props} />;
    case 'extension-catalog':
    case 'source-browse':
    case 'mangadex':
      return <Compass {...props} />;
    case 'nhentai':
    case 'nhentai-reader':
      return <Flame {...props} />;
    case 'webview':
      return <Globe {...props} />;
    case 'settings-repos':
      return <Settings {...props} />;
    default:
      return <BookOpen {...props} />;
  }
};

/* ───────────────────────── Barra de abas principal ───────────────────────── */

interface TabStripProps {
  tabs: TabItem[];
  activeTabId: string;
  onSelectTab: (id: string) => void;
  onCloseTab: (id: string) => void;
  onNewTab: () => void;
}

export const TabStrip: React.FC<TabStripProps> = ({ tabs, activeTabId, onSelectTab, onCloseTab, onNewTab }) => {
  const scrollerRef = useRef<HTMLDivElement>(null);

  // Mantém a aba ativa visível quando há muitas abas
  useEffect(() => {
    const el = scrollerRef.current?.querySelector<HTMLElement>(`[data-tab-id="${CSS.escape(activeTabId)}"]`);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [activeTabId, tabs.length]);

  // Rolagem horizontal com a roda do mouse
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || Math.abs(e.deltaY) < Math.abs(e.deltaX)) return;
    el.scrollLeft += e.deltaY;
  };

  return (
    <div className="flex items-end min-w-0 h-full app-no-drag">
      <div
        ref={scrollerRef}
        role="tablist"
        aria-label={t('Abas abertas')}
        onWheel={handleWheel}
        className="flex items-end gap-0.5 h-full overflow-x-auto overflow-y-hidden scrollbar-none min-w-0"
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              title={tab.title}
              onClick={() => onSelectTab(tab.id)}
              onMouseDown={(e) => {
                // Clique do meio fecha a aba (como no navegador)
                if (e.button === 1) {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTab(tab.id);
                } else if (e.key === 'Delete') {
                  e.preventDefault();
                  onCloseTab(tab.id);
                }
              }}
              className={`group relative flex items-center gap-2 h-[30px] pl-3 pr-1.5 rounded-t-lg text-[12px] cursor-pointer select-none shrink-0 min-w-[96px] max-w-[220px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/60 ${
                isActive
                  ? 'bg-surface text-fg shadow-[0_-1px_0_0_rgb(var(--c-border))]'
                  : 'text-fg-muted hover:bg-subtle/70 hover:text-fg'
              }`}
            >
              <TabIcon type={tab.type} className={isActive ? 'text-accent' : 'opacity-80'} />
              <span className="truncate flex-1 leading-none">{tab.title}</span>
              <button
                type="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                aria-label={t('Fechar aba {title}', { title: tab.title })}
                title={t('Fechar aba (Ctrl+W)')}
                className={`p-0.5 rounded hover:bg-elevated text-fg-muted hover:text-fg transition-opacity cursor-pointer ${
                  isActive ? 'opacity-80' : 'opacity-0 group-hover:opacity-80'
                }`}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={onNewTab}
        aria-label={t('Nova aba do navegador')}
        title={t('Nova aba do navegador (Ctrl+T)')}
        className="ml-1 mb-[3px] p-1.5 text-fg-muted hover:text-fg hover:bg-subtle rounded-md transition-colors flex-shrink-0 cursor-pointer"
      >
        <Plus size={14} aria-hidden="true" />
      </button>
    </div>
  );
};

/* ───────────────────────── Sub-abas (somente quando há mais de uma) ───────────────────────── */

interface SubTabBarProps {
  tab?: TabItem;
  onSelectSubTab?: (tabId: string, subTabId: string) => void;
  onCloseSubTab?: (tabId: string, subTabId: string) => void;
}

export const SubTabBar: React.FC<SubTabBarProps> = ({ tab, onSelectSubTab, onCloseSubTab }) => {
  if (!tab?.subTabs || tab.subTabs.length <= 1) return null;

  return (
    <div
      role="tablist"
      aria-label={t('Sub-abas')}
      className="flex items-center bg-surface border-b border-line-subtle px-3 py-1.5 gap-1 overflow-x-auto scrollbar-none flex-shrink-0"
    >
      {tab.subTabs.map((st) => {
        const isSubActive = tab.activeSubTab === st.id;
        return (
          <div
            key={st.id}
            role="tab"
            aria-selected={isSubActive}
            tabIndex={0}
            onClick={() => onSelectSubTab?.(tab.id, st.id)}
            onMouseDown={(e) => {
              if (e.button === 1 && st.id !== 'catalog') {
                e.preventDefault();
                onCloseSubTab?.(tab.id, st.id);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectSubTab?.(tab.id, st.id);
              }
            }}
            className={`group flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] cursor-pointer border transition-colors shrink-0 ${
              isSubActive
                ? 'bg-subtle border-line text-fg font-medium'
                : 'border-transparent text-fg-muted hover:bg-subtle/60 hover:text-fg'
            }`}
          >
            <span className="truncate max-w-[180px]">{st.title}</span>
            {st.id !== 'catalog' && onCloseSubTab && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseSubTab(tab.id, st.id);
                }}
                aria-label={t('Fechar sub-aba {title}', { title: st.title })}
                className="opacity-50 group-hover:opacity-100 hover:bg-elevated p-0.5 rounded cursor-pointer"
              >
                <X size={10} aria-hidden="true" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
};
