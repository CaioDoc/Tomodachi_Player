// src/components/InstalledExtensionsView.tsx
import React, { useState, useEffect } from 'react';
import { 
  Puzzle, 
  Search, 
  Trash2, 
  ExternalLink, 
  Compass, 
  Globe, 
  Clock, 
  PlusCircle,
  FolderSync
} from 'lucide-react';
import type { TabType } from '../types';
import {
  getInstalledExtensions,
  removeExtension,
  type InstalledExtension,
} from '../api/extensionRegistry';
import { t, locale } from '../i18n';

interface InstalledExtensionsViewProps {
  type?: 'manga' | 'anime';
  onOpenTab?: (type: TabType, title: string, data?: any) => void;
  onGoToRepos?: () => void;
  onBrowseExtension?: (ext: InstalledExtension) => void;
}

export const InstalledExtensionsView: React.FC<InstalledExtensionsViewProps> = ({
  type,
  onOpenTab,
  onGoToRepos,
  onBrowseExtension,
}) => {
  const [extensions, setExtensions] = useState<InstalledExtension[]>(() => getInstalledExtensions(type));
  const [query, setQuery] = useState('');

  const refreshList = () => {
    setExtensions(getInstalledExtensions(type));
  };

  useEffect(() => {
    refreshList();
    window.addEventListener('extensions:updated', refreshList);
    window.addEventListener('storage', refreshList);
    return () => {
      window.removeEventListener('extensions:updated', refreshList);
      window.removeEventListener('storage', refreshList);
    };
  }, [type]);

  const filtered = extensions.filter((ext) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      ext.name.toLowerCase().includes(q) ||
      ext.sourceName.toLowerCase().includes(q) ||
      ext.lang.toLowerCase().includes(q) ||
      (ext.baseUrl && ext.baseUrl.toLowerCase().includes(q))
    );
  });

  const handleOpenExtension = (ext: InstalledExtension) => {
    if (onBrowseExtension) {
      onBrowseExtension(ext);
      return;
    }
    if (onOpenTab) {
      onOpenTab('extension-catalog', ext.name, { extension: ext });
    }
  };

  const handleUninstall = (pkg: string) => {
    removeExtension(pkg);
    refreshList();
  };

  const titleText =
    type === 'anime'
      ? t('Extensões de Vídeo & Anime')
      : type === 'manga'
      ? t('Extensões de Mangá & Quadrinhos')
      : t('Extensões Instaladas');

  const subtitleText =
    type === 'anime'
      ? t('Navegue pelos websites das fontes de anime e explore todos os episódios disponíveis')
      : t('Navegue pelos websites das fontes e explore todos os títulos disponíveis');

  return (
    <div className="flex flex-col h-full bg-canvas text-fg-2 select-none">
      {/* Header bar */}
      <div className="p-4 border-b border-line bg-surface flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-subtle border border-line flex items-center justify-center text-accent">
            <Puzzle size={20} />
          </div>
          <div>
            <h2 className="text-base font-semibold text-fg flex items-center gap-2">
              {titleText}
              <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-subtle text-fg-muted border border-line">
                {extensions.length}
              </span>
            </h2>
            <p className="text-xs text-fg-muted">
              {subtitleText}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Buscar extensão instalada...')}
              className="w-full bg-canvas border border-line rounded-md pl-8 pr-3 py-1.5 text-xs text-fg placeholder-fg-muted outline-none focus:border-accent transition-colors"
            />
          </div>

          {onGoToRepos && (
            <button
              type="button"
              onClick={onGoToRepos}
              className="px-3 py-1.5 rounded-md bg-success hover:bg-success-hover text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shrink-0 shadow-sm cursor-pointer"
            >
              <PlusCircle size={14} />
              <span>{type === 'anime' ? t('Obter Extensões de Anime') : t('Obter Extensões')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center p-8 bg-surface/40 rounded-xl border border-dashed border-line">
            <div className="w-14 h-14 rounded-2xl bg-subtle border border-line flex items-center justify-center text-fg-muted mb-4">
              <Puzzle size={28} />
            </div>
            {query ? (
              <>
                <h3 className="text-sm font-semibold text-fg mb-1">
                  {t('Nenhuma extensão encontrada para "{query}"', { query })}
                </h3>
                <p className="text-xs text-fg-muted max-w-sm mb-4">
                  {t('Tente buscar por outro termo ou limpe o campo de busca.')}
                </p>
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="px-3 py-1.5 rounded bg-subtle text-fg-2 text-xs hover:text-white transition-colors"
                >
                  {t('Limpar busca')}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-fg mb-1">
                  {t('Nenhuma extensão instalada ainda')}
                </h3>
                <p className="text-xs text-fg-muted max-w-md mb-5 leading-relaxed">
                  {type === 'anime'
                    ? t('As extensões de anime são instaladas diretamente pelos repositórios de anime (como Aniyomi e Anime Repo). Clique no botão abaixo para explorar os repositórios disponíveis e instalá-las com 1 clique.')
                    : t('As extensões são instaladas automaticamente quando você abre uma obra de determinada fonte do backup Mihon/Aniyomi, ou você pode instalá-las diretamente pelos repositórios.')}
                </p>
                {onGoToRepos && (
                  <button
                    type="button"
                    onClick={onGoToRepos}
                    className="px-4 py-2 rounded-lg bg-success hover:bg-success-hover text-white text-xs font-semibold flex items-center gap-2 transition-colors shadow-sm cursor-pointer"
                  >
                    <FolderSync size={15} />
                    <span>{t('Explorar Repositórios e Extensões')}</span>
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((ext) => {
              const url = ext.baseUrl.startsWith('http') ? ext.baseUrl : `https://${ext.baseUrl}`;

              return (
                <div
                  key={ext.pkg}
                  className="bg-surface border border-line hover:border-accent/50 rounded-lg p-4 flex flex-col justify-between transition-all group shadow-sm hover:shadow-md"
                >
                  {/* Top: Info */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded bg-subtle border border-line flex items-center justify-center text-accent shrink-0 font-bold text-xs uppercase">
                          {ext.name.slice(0, 2)}
                        </div>
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-fg truncate group-hover:text-accent transition-colors" title={ext.name}>
                            {ext.name}
                          </h4>
                          <span className="text-[11px] text-fg-muted truncate block">
                            {t('Fonte: {name}', { name: ext.sourceName })}
                          </span>
                        </div>
                      </div>

                      <span className="text-[10px] px-2 py-0.5 rounded bg-elevated text-fg-muted font-mono shrink-0 uppercase">
                        {ext.lang}
                      </span>
                    </div>

                    {/* Domain */}
                    {ext.baseUrl && (
                      <div className="flex items-center gap-1.5 text-xs text-cyan-400 font-mono mb-3 bg-canvas px-2.5 py-1.5 rounded border border-line/60">
                        <Globe size={12} className="shrink-0 text-fg-muted" />
                        <span className="truncate">{ext.baseUrl}</span>
                      </div>
                    )}

                    {ext.installedAt && (
                      <div className="flex items-center gap-1 text-[10px] text-fg-muted mb-4">
                        <Clock size={10} />
                        <span>{t('Instalada em {date}', { date: new Date(ext.installedAt).toLocaleDateString(locale) })}</span>
                      </div>
                    )}
                  </div>

                  {/* Bottom: Action buttons */}
                  <div className="flex items-center gap-2 pt-3 border-t border-line-subtle">
                    <button
                      type="button"
                      onClick={() => handleOpenExtension(ext)}
                      className="flex-1 px-3 py-1.5 rounded bg-success hover:bg-success-hover text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors shadow-sm"
                    >
                      <Compass size={13} />
                      <span>{t('Navegar')}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleUninstall(ext.pkg)}
                      title={t('Desinstalar extensão')}
                      className="p-1.5 rounded text-fg-muted hover:text-danger-fg hover:bg-danger/[0.13] border border-line hover:border-danger/[0.27] transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
