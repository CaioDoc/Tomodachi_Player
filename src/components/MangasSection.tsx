import React, { useState, useEffect, useMemo } from 'react';
import { MangaDex } from './MangaDex';
import { MANGADEX_OPEN_EVENT } from '../api/mangaSearch';
import { NHentaiBrowser } from './NHentaiBrowser';
import { ExtensionsHub } from './ExtensionsHub';
import { BackupModal, type BackupModalMode } from './BackupModal';
import { ExtensionCatalogView } from './ExtensionCatalogView';
import { LocalExplorer } from './LocalExplorer';
import { MihonLibrary } from './MihonLibrary';
import { ContinueReading } from './ContinueReading';
import { SuwayomiBrowser } from './SuwayomiBrowser';
import { SourceChip, KeepAliveViews, SectionTabBar, SectionAction, type SectionGroup, DonateAction } from './SectionChrome';
import { openDonate } from '../constants/support';
import { UpdatesView, HistoryView } from './ActivityViews';
import { getInstalledExtensions, type InstalledExtension } from '../api/extensionRegistry';
import { Puzzle, Compass, Library, Server, FolderOpen, RefreshCw, History, ArchiveRestore, BookOpen } from 'lucide-react';
import { getUnseenCount, UPDATES_EVENT } from '../utils/updates';
import type { TabType, SubTab } from '../types';
import { LABELS, viewGroup, type SectionView } from '../constants/labels';
import { t } from '../i18n';

interface MangasSectionProps {
  onOpenTab?: (typeOrTab: TabType | any, title?: string, data?: any) => void;
  view: SectionView;
  onChangeView: (view: SectionView) => void;
  activeSubTab?: string;
  subTabs?: SubTab[];
  onOpenSubTab?: (sub: SubTab) => void;
}

const SOURCE_KEY = 'tp_manga_online_source';

export const MangasSection: React.FC<MangasSectionProps> = ({
  onOpenTab,
  view,
  onChangeView,
  activeSubTab,
  subTabs,
  onOpenSubTab,
}) => {
  const [mangaCount, setMangaCount] = useState<number>(0);
  const [source, setSourceState] = useState<string>(() => {
    try {
      return localStorage.getItem(SOURCE_KEY) || 'mangadex';
    } catch {
      return 'mangadex';
    }
  });
  const [installedExtensions, setInstalledExtensions] = useState<InstalledExtension[]>(() => getInstalledExtensions('manga'));
  const [backupMode, setBackupMode] = useState<BackupModalMode | null>(null);
  const [updateToken, setUpdateToken] = useState(0);
  const [unseen, setUnseen] = useState(() => getUnseenCount('manga'));

  useEffect(() => {
    const refresh = () => setUnseen(getUnseenCount('manga'));
    window.addEventListener(UPDATES_EVENT, refresh);
    return () => window.removeEventListener(UPDATES_EVENT, refresh);
  }, []);

  // "Backup" deixou de ser uma tela: links antigos (boas-vindas, paleta) abrem o modal
  useEffect(() => {
    if (view === 'backup') {
      setBackupMode('import');
      onChangeView('online');
    }
  }, [view, onChangeView]);

  const setSource = (s: string) => {
    setSourceState(s);
    try {
      localStorage.setItem(SOURCE_KEY, s);
    } catch {
      /* ignore */
    }
  };

  // "Talvez você goste" de um mangá: abre a obra no MangaDex
  useEffect(() => {
    const on = () => setSource('mangadex');
    window.addEventListener(MANGADEX_OPEN_EVENT, on);
    return () => window.removeEventListener(MANGADEX_OPEN_EVENT, on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Somente extensões de MANGÁ aparecem como fontes aqui
  const activeExtension = useMemo(
    () => installedExtensions.find((e) => e.pkg === source || e.name === source || e.sourceName === source),
    [installedExtensions, source]
  );

  // Se a extensão selecionada foi removida, volta para o MangaDex
  const effectiveSource =
    source === 'mangadex' || source === 'nhentai' || source === 'suwayomi' || activeExtension ? source : 'mangadex';


  useEffect(() => {
    const refreshExtList = () => setInstalledExtensions(getInstalledExtensions('manga'));

    const refreshCount = async () => {
      if (window.electronAPI?.loadLibrary) {
        try {
          const res = await window.electronAPI.loadLibrary('manga');
          if (res.success && Array.isArray(res.data?.entries) && res.data.entries.length > 0) {
            setMangaCount(res.data.entries.length);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      try {
        const raw = localStorage.getItem('manga_library');
        const parsed = raw ? JSON.parse(raw) : [];
        setMangaCount(Array.isArray(parsed) ? parsed.length : 0);
      } catch {
        setMangaCount(0);
      }
    };

    refreshCount();
    const onApplied = (e: any) => {
      if (!e?.detail || e.detail.source === 'manga') refreshCount();
    };

    window.addEventListener('backup:applied', onApplied);
    window.addEventListener('manga:library-updated', refreshCount);
    window.addEventListener('extensions:updated', refreshExtList);
    window.addEventListener('storage', refreshExtList);
    window.addEventListener('storage', refreshCount);
    return () => {
      window.removeEventListener('backup:applied', onApplied);
      window.removeEventListener('manga:library-updated', refreshCount);
      window.removeEventListener('extensions:updated', refreshExtList);
      window.removeEventListener('storage', refreshExtList);
      window.removeEventListener('storage', refreshCount);
    };
  }, []);

  const renderOnline = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center gap-3 px-4 h-11 border-b border-line-subtle bg-surface flex-shrink-0 min-w-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted shrink-0">{t('Fontes')}</span>
        <div role="tablist" aria-label={t('Fontes')} className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 min-w-0">
          <SourceChip active={effectiveSource === 'mangadex'} onClick={() => setSource('mangadex')}>
            MangaDex
          </SourceChip>
          <SourceChip active={effectiveSource === 'nhentai'} onClick={() => setSource('nhentai')}>
            NHentai
          </SourceChip>
          <SourceChip active={effectiveSource === 'suwayomi'} onClick={() => setSource('suwayomi')}>
            <Server size={12} className="opacity-70" />
            <span>Suwayomi</span>
          </SourceChip>
          {installedExtensions.map((ext) => (
            <SourceChip key={ext.pkg} active={effectiveSource === ext.pkg || effectiveSource === ext.name} onClick={() => setSource(ext.pkg)}>
              <Puzzle size={12} className="opacity-70" />
              <span>{ext.name}</span>
              <span className="text-[10px] opacity-60 font-mono uppercase">{ext.lang}</span>
            </SourceChip>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {effectiveSource === 'mangadex' && (
          <MangaDex activeSubTab={activeSubTab} subTabs={subTabs} onOpenSubTab={(sub) => onOpenSubTab?.(sub)} />
        )}
        {effectiveSource === 'nhentai' && <NHentaiBrowser onOpenTab={onOpenTab || (() => {})} />}
        {effectiveSource === 'suwayomi' && <SuwayomiBrowser onOpenTab={onOpenTab || (() => {})} />}
        {activeExtension && effectiveSource !== 'mangadex' && effectiveSource !== 'nhentai' && effectiveSource !== 'suwayomi' && (
          <ExtensionCatalogView key={activeExtension.pkg || activeExtension.name} extension={activeExtension} onOpenTab={onOpenTab} />
        )}
      </div>
    </div>
  );

  const goLibrary = () => onChangeView('library');
  const goExplore = () => onChangeView('online');

  const renderView = (v: SectionView) => {
    switch (v) {
      case 'library':
        return (
          <div className="flex flex-col h-full min-h-0">
            <ContinueReading onOpenTab={onOpenTab} />
            <div className="flex-1 min-h-0">
              <MihonLibrary
                source="manga"
                onOpenTab={onOpenTab}
                onGoToBackup={() => setBackupMode('import')}
                onGoToExplore={goExplore}
                onGoToRepos={() => onChangeView('repos')}
              />
            </div>
          </div>
        );
      case 'online':
        return renderOnline();
      case 'updates':
        return (
          <UpdatesView
            source="manga"
            onOpenTab={onOpenTab}
            onGoToLibrary={goLibrary}
            onBack={goLibrary}
            backLabel={t('Biblioteca')}
            autoCheckToken={updateToken}
          />
        );
      case 'history':
        return <HistoryView source="manga" onOpenTab={onOpenTab} onBack={goLibrary} backLabel={t('Biblioteca')} />;
      case 'extensions':
        return (
          <ExtensionsHub
            type="manga"
            tab={view === 'repos' ? 'repos' : 'installed'}
            onChangeTab={(tab) => onChangeView(tab === 'repos' ? 'repos' : 'extensions')}
            onBack={goExplore}
            backLabel={t('Explorar')}
            onOpenTab={onOpenTab}
            onBrowseExtension={(ext) => {
              setSource(ext.pkg);
              goExplore();
            }}
          />
        );
      case 'local':
        return <LocalExplorer mediaType="image" onOpenTab={onOpenTab || (() => {})} />;
      default:
        return null;
    }
  };

  const group: SectionGroup = viewGroup(view);
  // Extensões e Repositórios dividem a mesma tela (abas internas)
  const keepKey: SectionView = view === 'repos' ? 'extensions' : view === 'backup' ? 'online' : view;

  const actions =
    group === 'library' ? (
      <>
        <SectionAction
          icon={<History size={14} />}
          label={t('Histórico')}
          active={view === 'history'}
          onClick={() => onChangeView(view === 'history' ? 'library' : 'history')}
        />
        <DonateAction label={t('Doar')} title={t('Apoie o Tomodachi Player')} onClick={openDonate} />
        <SectionAction
          primary
          icon={<RefreshCw size={14} />}
          label={t('Atualizar')}
          title={t('Procurar capítulos novos nas obras da biblioteca')}
          badge={unseen}
          onClick={() => {
            setUpdateToken(Date.now());
            onChangeView('updates');
          }}
        />
      </>
    ) : group === 'explore' ? (
      <>
        <SectionAction
          icon={<Puzzle size={14} />}
          label={t('Extensões')}
          active={view === 'extensions' || view === 'repos'}
          onClick={() => onChangeView(view === 'extensions' || view === 'repos' ? 'online' : 'extensions')}
        />
        <DonateAction label={t('Doar')} title={t('Apoie o Tomodachi Player')} onClick={openDonate} />
        <SectionAction icon={<ArchiveRestore size={14} />} label={t('Backup')} active={!!backupMode} onClick={() => setBackupMode('menu')} />
      </>
    ) : (
      <DonateAction label={t('Doar')} title={t('Apoie o Tomodachi Player')} onClick={openDonate} />
    );

  return (
    <div className="h-full w-full bg-surface text-fg-2 select-none overflow-hidden flex flex-col">
      <SectionTabBar
        section={LABELS.mangas}
        sectionIcon={<BookOpen size={15} />}
        active={group}
        onSelect={(g) => onChangeView(g === 'library' ? 'library' : g === 'explore' ? 'online' : 'local')}
        tabs={[
          { id: 'library', label: t('Biblioteca'), icon: <Library size={15} />, count: mangaCount },
          { id: 'explore', label: t('Explorar'), icon: <Compass size={15} /> },
          { id: 'local', label: t('Local'), icon: <FolderOpen size={15} /> },
        ]}
        actions={actions}
      />
      <div className="flex-1 min-h-0 relative">
        <KeepAliveViews active={keepKey} render={renderView} />
      </div>
      <BackupModal source="manga" mode={backupMode} onChangeMode={setBackupMode} onViewLibrary={goLibrary} onOpenTab={onOpenTab} />
    </div>
  );
};
