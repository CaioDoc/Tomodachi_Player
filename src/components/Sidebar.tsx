import React, { useEffect, useState } from 'react';
import {
  Globe,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  Clapperboard,
} from 'lucide-react';
import type { TabType } from '../types';
import { LABELS, viewGroup, videoViewGroup, type SectionView } from '../constants/labels';
import { getUnseenCount, UPDATES_EVENT } from '../utils/updates';
import { t, tn } from '../i18n';

interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  /** Abre (ou foca) a seção e, opcionalmente, troca a sub-visão */
  onNavigate: (type: TabType, view?: SectionView) => void;
  onOpenBrowser: () => void;
  activeTabType?: TabType;
  activeView?: SectionView;
}

const NavButton: React.FC<{
  label: string;
  icon: React.ReactNode;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  shortcut?: string;
  badge?: number;
  /** Linha secundária (ex.: aba interna atual) */
  sub?: string;
}> = ({ label, icon, active, collapsed, onClick, shortcut, badge, sub }) => (
  <button
    type="button"
    onClick={onClick}
    title={collapsed ? label : shortcut ? `${label} (${shortcut})` : undefined}
    aria-label={label}
    aria-current={active ? 'page' : undefined}
    className={`group relative w-full flex items-center gap-2.5 rounded-md text-[13px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
      collapsed ? 'justify-center h-9' : sub ? 'px-2.5 h-11' : 'px-2.5 h-8'
    } ${active ? 'bg-accent/15 text-fg font-medium' : 'text-fg-muted hover:bg-subtle hover:text-fg'}`}
  >
    {active && <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-accent" aria-hidden="true" />}
    <span className={`shrink-0 ${active ? 'text-accent' : 'text-fg-muted group-hover:text-fg'}`}>{icon}</span>
    {!collapsed &&
      (sub ? (
        <span className="flex-1 min-w-0 text-left leading-tight">
          <span className="block truncate">{label}</span>
          <span className="block truncate text-[11px] font-normal text-fg-muted">{sub}</span>
        </span>
      ) : (
        <span className="truncate text-left flex-1">{label}</span>
      ))}
    {!!badge && badge > 0 && (
      <span
        className={`${collapsed ? 'absolute top-0.5 right-1 min-w-4 h-4 text-[9.5px]' : 'min-w-5 h-5 text-[10.5px]'} px-1 rounded-full bg-accent text-accent-fg font-semibold tabular-nums inline-flex items-center justify-center`}
        aria-label={tn(badge, '{n} novidade', '{n} novidades')}
      >
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

const GroupHeader: React.FC<{ label: string; icon?: React.ReactNode; collapsed: boolean }> = ({ label, icon, collapsed }) =>
  collapsed ? (
    <div className="mx-auto my-2 h-px w-6 bg-line" aria-hidden="true" />
  ) : (
    <div className="flex items-center gap-1.5 px-2.5 pt-3 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-fg-muted/80">
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );

export const Sidebar: React.FC<SidebarProps> = ({
  collapsed,
  onToggleCollapse,
  onNavigate,
  onOpenBrowser,
  activeTabType,
  activeView,
}) => {
  const [unseen, setUnseen] = useState(() => ({ manga: getUnseenCount('manga'), video: getUnseenCount('video') }));
  useEffect(() => {
    const refresh = () => setUnseen({ manga: getUnseenCount('manga'), video: getUnseenCount('video') });
    window.addEventListener(UPDATES_EVENT, refresh);
    return () => window.removeEventListener(UPDATES_EVENT, refresh);
  }, []);

  /** Subtítulo do item: aba interna atual da seção (Biblioteca · Explorar · Local) */
  const currentLabel = (type: 'mangas' | 'videos') => {
    if (activeTabType !== type || !activeView) return undefined;
    if (type === 'videos') {
      const v = videoViewGroup(activeView);
      return v === 'library' ? t('Biblioteca') : v === 'local' ? t('Local') : v === 'sources' ? t('Fontes') : t('Descobrir');
    }
    const g = viewGroup(activeView);
    return g === 'library' ? t('Biblioteca') : g === 'local' ? t('Local') : t('Explorar');
  };

  const sectionButton = (type: 'mangas' | 'videos') => {
    const kind = type === 'mangas' ? 'manga' : 'video';
    const label = type === 'mangas' ? LABELS.mangas : LABELS.videos;
    const Icon = type === 'mangas' ? BookOpen : Clapperboard;
    const sub = currentLabel(type);
    return (
      <NavButton
        label={label}
        icon={<Icon size={17} />}
        active={activeTabType === type}
        collapsed={collapsed}
        onClick={() => onNavigate(type)}
        badge={unseen[kind]}
        sub={sub}
      />
    );
  };

  return (
    <aside
      aria-label={t('Navegação principal')}
      className={`bg-canvas border-r border-line-subtle flex flex-col flex-shrink-0 select-none transition-[width] duration-200 ease-out ${
        collapsed ? 'w-14' : 'w-56'
      }`}
    >
      <nav className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-none px-2 pb-2 space-y-0.5">
        <div className="pt-2" aria-hidden="true" />
        {sectionButton('mangas')}
        {sectionButton('videos')}

        <GroupHeader label={t('Ferramentas')} icon={<Globe size={11} />} collapsed={collapsed} />
        <NavButton
          label={t('Navegador')}
          icon={<Globe size={16} />}
          active={activeTabType === 'webview'}
          collapsed={collapsed}
          onClick={onOpenBrowser}
          shortcut="Ctrl+T"
        />
      </nav>

      <div className="p-2 border-t border-line-subtle space-y-0.5">
        <NavButton
          label={t('Configurações')}
          icon={<Settings size={16} />}
          active={activeTabType === 'settings-repos'}
          collapsed={collapsed}
          onClick={() => onNavigate('settings-repos')}
        />
        <NavButton
          label={collapsed ? t('Expandir menu') : t('Recolher menu')}
          icon={collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          active={false}
          collapsed={collapsed}
          onClick={onToggleCollapse}
          shortcut="Ctrl+B"
        />
      </div>
    </aside>
  );
};
