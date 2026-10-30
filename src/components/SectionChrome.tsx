import React, { useEffect, useState } from 'react';
import { ArrowLeft, Heart, VenetianMask } from 'lucide-react';
import { useIncognito } from '../utils/incognito';
import type { ProgressSource } from '../utils/progress';
import { toast } from './Feedback';
import { t } from '../i18n';

/** Chip de seleção (fontes do catálogo, filtros etc.) */
export const SourceChip: React.FC<{
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}> = ({ active, onClick, children, title }) => (
  <button
    type="button"
    role="tab"
    aria-selected={active}
    onClick={onClick}
    title={title}
    className={`h-7 px-3 text-[12px] font-medium rounded-full transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
      active
        ? 'bg-accent/15 text-fg border-accent/40'
        : 'bg-transparent text-fg-muted border-line-subtle hover:text-fg hover:bg-subtle hover:border-line'
    }`}
  >
    {children}
  </button>
);

/** Botão "voltar" usado nas sub-telas (Atualizações, Histórico, Extensões…) */
export const BackButton: React.FC<{ label: string; onClick: () => void }> = ({ label, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    title={t('Voltar para {name}', { name: label })}
    className="inline-flex items-center gap-1 h-7 pl-1.5 pr-2.5 rounded-md text-[12px] text-fg-muted hover:text-fg hover:bg-subtle transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
  >
    <ArrowLeft size={14} />
    <span>{label}</span>
  </button>
);

/** Cabeçalho compacto de página com "migalha" da seção (ou botão de voltar) */
export const PageHeader: React.FC<{
  section: string;
  title: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children?: React.ReactNode;
  /** Quando informado, a "migalha" vira um botão de voltar */
  onBack?: () => void;
  backLabel?: string;
}> = ({ section, title, icon, badge, children, onBack, backLabel }) => (
  <div className="flex items-center gap-4 px-4 h-12 border-b border-line-subtle bg-surface flex-shrink-0 min-w-0">
    <div className="flex items-center gap-2 shrink-0 min-w-0">
      {onBack ? (
        <>
          <BackButton label={backLabel || section} onClick={onBack} />
          <span className="text-fg-muted/50">/</span>
          {icon && <span className="text-accent shrink-0">{icon}</span>}
        </>
      ) : (
        <>
          {icon && <span className="text-accent shrink-0">{icon}</span>}
          <span className="text-[12px] text-fg-muted hidden lg:inline">{section}</span>
          <span className="text-fg-muted/50 hidden lg:inline">/</span>
        </>
      )}
      <h1 className="text-[14px] font-semibold text-fg truncate">{title}</h1>
      {badge}
    </div>
    {children && <div className="flex-1 min-w-0 flex items-center justify-end gap-2">{children}</div>}
  </div>
);

/**
 * Mantém montadas as visões já visitadas (preservando busca, rolagem e
 * resultados) e exibe apenas a ativa.
 */
export function KeepAliveViews<K extends string>({
  active,
  render,
}: {
  active: K;
  render: (key: K) => React.ReactNode;
}) {
  const [visited, setVisited] = useState<K[]>([active]);

  useEffect(() => {
    setVisited((prev) => (prev.includes(active) ? prev : [...prev, active]));
  }, [active]);

  const keys = visited.includes(active) ? visited : [...visited, active];

  return (
    <>
      {keys.map((key) => (
        <div key={key} className={`absolute inset-0 ${key === active ? 'flex flex-col' : 'hidden'}`}>
          {render(key)}
        </div>
      ))}
    </>
  );
}

/* ───────────────────── Abas internas das seções ───────────────────── */

export type SectionGroup = 'library' | 'explore' | 'local' | 'nuvio' | 'sources';

export interface SectionTabDef {
  id: SectionGroup;
  label: string;
  icon: React.ReactNode;
  count?: number;
}

/** Botão de ação no canto direito da barra de abas */
export const SectionAction: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  primary?: boolean;
  badge?: number;
  title?: string;
}> = ({ icon, label, onClick, active, primary, badge, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-pressed={active}
    className={`relative inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-medium transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
      primary
        ? 'bg-accent hover:bg-accent-hover text-accent-fg'
        : active
          ? 'bg-accent/15 text-fg border border-accent/40'
          : 'bg-subtle hover:bg-elevated text-fg-2 hover:text-fg border border-line-subtle'
    }`}
  >
    {icon}
    <span className="hidden sm:inline">{label}</span>
    {!!badge && badge > 0 && (
      <span
        className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold tabular-nums inline-flex items-center justify-center ${
          primary ? 'bg-accent-fg/20 text-accent-fg' : 'bg-accent text-accent-fg'
        }`}
      >
        {badge > 99 ? '99+' : badge}
      </span>
    )}
  </button>
);

/** Barra de abas internas (Biblioteca · Explorar · Local) com ações da aba atual */
export const SectionTabBar: React.FC<{
  section: string;
  sectionIcon: React.ReactNode;
  tabs: SectionTabDef[];
  active: SectionGroup;
  onSelect: (tab: SectionGroup) => void;
  actions?: React.ReactNode;
}> = ({ section, sectionIcon, tabs, active, onSelect, actions }) => (
  <div className="flex items-center gap-3 px-3 sm:px-4 h-12 border-b border-line bg-canvas flex-shrink-0 min-w-0">
    <div className="hidden xl:flex items-center gap-2 pr-2 mr-1 border-r border-line-subtle shrink-0 h-6">
      <span className="text-accent">{sectionIcon}</span>
      <span className="text-[12.5px] font-semibold text-fg whitespace-nowrap">{section}</span>
    </div>
    <div role="tablist" aria-label={section} className="flex items-stretch gap-1 h-full min-w-0 overflow-x-auto scrollbar-none">
      {tabs.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onSelect(tab.id)}
            className={`relative inline-flex items-center gap-1.5 px-3 text-[13px] whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:bg-subtle ${
              isActive ? 'text-fg font-semibold' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <span className={isActive ? 'text-accent' : ''}>{tab.icon}</span>
            {tab.label}
            {typeof tab.count === 'number' && tab.count > 0 && (
              <span className="text-[10.5px] px-1.5 py-px rounded-md bg-subtle text-fg-muted tabular-nums font-normal">{tab.count}</span>
            )}
            {isActive && <span className="absolute left-2 right-2 bottom-0 h-[2px] rounded-t bg-accent" aria-hidden="true" />}
          </button>
        );
      })}
    </div>
    {actions && <div className="ml-auto flex items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

/** Botão "Doar" (mesmo estilo dos outros botões da barra, com o texto rosa) */
export const DonateAction: React.FC<{ onClick: () => void; label: string; title?: string }> = ({ onClick, label, title }) => (
  <button
    type="button"
    onClick={onClick}
    title={title || label}
    className="relative inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold transition-colors cursor-pointer shrink-0 bg-subtle hover:bg-elevated border border-line-subtle hover:border-pink-500/40 text-pink-400 hover:text-pink-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
  >
    <Heart size={14} fill="currentColor" />
    <span className="hidden sm:inline">{label}</span>
  </button>
);

/** Modo anônimo da seção: enquanto ligado, o que é assistido/lido não fica salvo */
export const IncognitoAction: React.FC<{ source: ProgressSource }> = ({ source }) => {
  const [on, setOn] = useIncognito(source);
  const what = source === 'video' ? t('o que você assistir') : t('o que você ler');
  const toggle = () => {
    setOn(!on);
    if (!on) toast.info(t('Modo anônimo ligado'), t('Até você desligar ou fechar o app, {what} não fica salvo: sem histórico, "Continuar", progresso nem AniList.', { what }));
    else toast.info(t('Modo anônimo desligado'), t('O progresso volta a ser salvo normalmente.'));
  };
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={toggle}
      title={on ? t('Modo anônimo ligado: nada do que você assistir ou ler fica salvo. Clique para desligar.') : t('Modo anônimo: assistir e ler sem salvar histórico nem progresso')}
      className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-[12.5px] font-semibold transition-colors cursor-pointer shrink-0 border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
        on ? 'bg-violet-500/20 border-violet-400/50 text-violet-200 hover:bg-violet-500/30' : 'bg-subtle hover:bg-elevated border-line-subtle text-fg-muted hover:text-fg'
      }`}
    >
      <VenetianMask size={15} />
      <span className="hidden sm:inline">{t('Anônimo')}</span>
      <span className={`relative w-7 h-4 rounded-full transition-colors ${on ? 'bg-violet-400' : 'bg-elevated border border-line'}`} aria-hidden>
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-all ${on ? 'left-[13px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
};
