// src/components/ExtensionsHub.tsx
// Extensões + Repositórios em uma única tela, separadas por abas.

import React, { useEffect, useState } from 'react';
import { Puzzle, Server, X } from 'lucide-react';
import { openSuwayomiSettings } from './SuwayomiSetup';
import { InstalledExtensionsView } from './InstalledExtensionsView';
import { ReposPanel } from './ReposPanel';
import { BackButton } from './SectionChrome';
import { getInstalledExtensions, type InstalledExtension } from '../api/extensionRegistry';
import { loadRepos } from '../api/reposStore';
import type { TabType } from '../types';
import { t } from '../i18n';

export type ExtensionsHubTab = 'installed' | 'repos';

interface ExtensionsHubProps {
  type: 'manga' | 'anime';
  tab: ExtensionsHubTab;
  onChangeTab: (tab: ExtensionsHubTab) => void;
  onBack: () => void;
  backLabel: string;
  onOpenTab?: (typeOrTab: TabType | any, title?: string, data?: any) => void;
  onBrowseExtension: (ext: InstalledExtension) => void;
}

export const ExtensionsHub: React.FC<ExtensionsHubProps> = ({ type, tab, onChangeTab, onBack, backLabel, onOpenTab, onBrowseExtension }) => {
  const [installedCount, setInstalledCount] = useState(() => getInstalledExtensions(type).length);
  const [repoCount, setRepoCount] = useState(() => loadRepos(type).length);
  const [suwaHintHidden, setSuwaHintHidden] = useState(() => {
    try {
      return localStorage.getItem('tp_suwa_hint_hidden') === '1';
    } catch {
      return false;
    }
  });
  const [visited, setVisited] = useState<ExtensionsHubTab[]>([tab]);

  useEffect(() => {
    setVisited((v) => (v.includes(tab) ? v : [...v, tab]));
    setRepoCount(loadRepos(type).length);
  }, [tab, type]);

  useEffect(() => {
    const refresh = () => {
      setInstalledCount(getInstalledExtensions(type).length);
      setRepoCount(loadRepos(type).length);
    };
    window.addEventListener('extensions:updated', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('extensions:updated', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [type]);

  const tabs: { id: ExtensionsHubTab; label: string; icon: React.ReactNode; count: number }[] = [
    { id: 'installed', label: t('Instaladas'), icon: <Puzzle size={14} />, count: installedCount },
    { id: 'repos', label: t('Repositórios'), icon: <Server size={14} />, count: repoCount },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-canvas">
      <div className="flex items-center gap-3 px-4 h-12 border-b border-line-subtle bg-surface flex-shrink-0 min-w-0">
        <BackButton label={backLabel} onClick={onBack} />
        <span className="text-fg-muted/50">/</span>
        <h1 className="text-[14px] font-semibold text-fg flex items-center gap-2 shrink-0">
          <Puzzle size={16} className="text-accent" />
          {t('Extensões')}
        </h1>
        <div role="tablist" aria-label={t('Extensões')} className="ml-2 inline-flex items-center p-0.5 rounded-lg bg-canvas border border-line-subtle">
          {tabs.map((it) => {
            const active = it.id === tab;
            return (
              <button
                key={it.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onChangeTab(it.id)}
                className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12.5px] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
                  active ? 'bg-surface text-fg font-semibold shadow-sm' : 'text-fg-muted hover:text-fg'
                }`}
              >
                <span className={active ? 'text-accent' : ''}>{it.icon}</span>
                {it.label}
                <span className="text-[10.5px] px-1.5 rounded bg-subtle text-fg-muted tabular-nums font-normal">{it.count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {type === 'manga' && !suwaHintHidden && (
        <div className="flex items-start gap-3 px-4 py-2.5 border-b border-line-subtle bg-accent/5 text-[12.5px] text-fg-2 flex-shrink-0">
          <Server size={15} className="text-accent shrink-0 mt-0.5" />
          <span className="flex-1 min-w-0 leading-relaxed">
            {t('As extensões do Mihon (Keiyoushi e outras) só funcionam por completo com o Suwayomi, um servidor gratuito que roda as extensões no seu computador. Sem ele, o app tenta ler os sites de forma genérica e muitos não funcionam.')}
          </span>
          <button type="button" onClick={openSuwayomiSettings} className="h-7 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold cursor-pointer shrink-0">
            {t('Configurar Suwayomi')}
          </button>
          <button
            type="button"
            onClick={() => {
              setSuwaHintHidden(true);
              try {
                localStorage.setItem('tp_suwa_hint_hidden', '1');
              } catch {
                /* ignore */
              }
            }}
            className="p-1 rounded text-fg-muted hover:text-fg cursor-pointer shrink-0"
            aria-label={t('Fechar aviso')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      <div className="flex-1 min-h-0 relative">
        {visited.includes('installed') && (
          <div className={`absolute inset-0 ${tab === 'installed' ? 'flex flex-col' : 'hidden'}`}>
            <InstalledExtensionsView
              type={type}
              onOpenTab={onOpenTab}
              onGoToRepos={() => onChangeTab('repos')}
              onBrowseExtension={onBrowseExtension}
            />
          </div>
        )}
        {visited.includes('repos') && (
          <div className={`absolute inset-0 ${tab === 'repos' ? 'flex flex-col' : 'hidden'}`}>
            <ReposPanel type={type} onOpenTab={onOpenTab} />
          </div>
        )}
      </div>
    </div>
  );
};
