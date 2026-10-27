// src/components/VideosSection.tsx
// Animes & Vídeos: Biblioteca · Descobrir · Fontes · Local.
// Extensões (estilo Aniyomi), plugins (Nuvio) e addons (Stremio) ficam todos em "Fontes";
// "Descobrir" tem uma busca e os catálogos; "Assistir" procura em todas as fontes de uma vez.

import React, { useState, useEffect } from 'react';
import { LocalVideoLibrary } from './LocalVideoLibrary';
import { BackupModal, type BackupModalMode } from './BackupModal';
import { MihonLibrary } from './MihonLibrary';
import { DiscoverView } from './DiscoverView';
import { SourcesManager } from './SourcesManager';
import { ContinueWatching } from './ContinueWatching';
import { KeepAliveViews, SectionTabBar, SectionAction, type SectionGroup, DonateAction } from './SectionChrome';
import { openDonate } from '../constants/support';
import { UpdatesView, HistoryView } from './ActivityViews';
import { Compass, Library, FolderOpen, RefreshCw, History, ArchiveRestore, Clapperboard, Puzzle } from 'lucide-react';
import { getUnseenCount, UPDATES_EVENT } from '../utils/updates';
import { NUVIO_EVENT } from '../api/nuvio';
import { videoSourceCounts } from '../api/sources';
import type { TabType } from '../types';
import { LABELS, videoViewGroup, type SectionView } from '../constants/labels';
import { t } from '../i18n';

interface VideosSectionProps {
  onOpenTab?: (typeOrTab: TabType | any, title?: string, data?: any) => void;
  view: SectionView;
  onChangeView: (view: SectionView) => void;
}

/** Telas guardadas vivas (para não perder a rolagem/busca ao trocar de aba) */
type Keep = 'library' | 'online' | 'sources' | 'updates' | 'history' | 'local';

export const VideosSection: React.FC<VideosSectionProps> = ({ onOpenTab, view, onChangeView }) => {
  const [animeCount, setAnimeCount] = useState<number>(0);
  const [sourceCount, setSourceCount] = useState(() => videoSourceCounts().total);
  const [backupMode, setBackupMode] = useState<BackupModalMode | null>(null);
  const [updateToken, setUpdateToken] = useState(0);
  const [unseen, setUnseen] = useState(() => getUnseenCount('video'));

  useEffect(() => {
    const refresh = () => setUnseen(getUnseenCount('video'));
    window.addEventListener(UPDATES_EVENT, refresh);
    return () => window.removeEventListener(UPDATES_EVENT, refresh);
  }, []);

  // "Backup" deixou de ser uma tela: links antigos abrem o modal
  useEffect(() => {
    if (view === 'backup') {
      setBackupMode('import');
      onChangeView('library');
    }
  }, [view, onChangeView]);

  useEffect(() => {
    const refreshSources = () => setSourceCount(videoSourceCounts().total);
    const refreshCount = async () => {
      if (window.electronAPI?.loadLibrary) {
        try {
          const res = await window.electronAPI.loadLibrary('video');
          if (res.success && Array.isArray(res.data?.entries) && res.data.entries.length > 0) {
            setAnimeCount(res.data.entries.length);
            return;
          }
        } catch {
          /* ignore */
        }
      }
      try {
        const raw = localStorage.getItem('video_library');
        const parsed = raw ? JSON.parse(raw) : [];
        setAnimeCount(Array.isArray(parsed) ? parsed.length : 0);
      } catch {
        setAnimeCount(0);
      }
    };

    refreshCount();
    const onApplied = (e: any) => {
      if (!e?.detail || e.detail.source === 'video') refreshCount();
    };

    window.addEventListener('backup:applied', onApplied);
    window.addEventListener('video:library-updated', refreshCount);
    window.addEventListener('extensions:updated', refreshSources);
    window.addEventListener(NUVIO_EVENT, refreshSources);
    window.addEventListener('storage', refreshCount);
    return () => {
      window.removeEventListener('backup:applied', onApplied);
      window.removeEventListener('video:library-updated', refreshCount);
      window.removeEventListener('extensions:updated', refreshSources);
      window.removeEventListener(NUVIO_EVENT, refreshSources);
      window.removeEventListener('storage', refreshCount);
    };
  }, []);

  const goLibrary = () => onChangeView('library');
  const goExplore = () => onChangeView('online');
  const goSources = () => onChangeView('extensions');

  const group = videoViewGroup(view);
  const keepKey: Keep =
    group === 'sources' ? 'sources' : view === 'updates' ? 'updates' : view === 'history' ? 'history' : group === 'local' ? 'local' : group === 'library' ? 'library' : 'online';

  const renderView = (v: Keep) => {
    switch (v) {
      case 'library':
        return (
          <div className="flex flex-col h-full min-h-0">
            <ContinueWatching onOpenTab={onOpenTab} />
            <div className="flex-1 min-h-0">
              <MihonLibrary source="video" onOpenTab={onOpenTab} onGoToBackup={() => setBackupMode('import')} onGoToExplore={goExplore} />
            </div>
          </div>
        );
      case 'online':
        return <DiscoverView onOpenTab={onOpenTab} onGoToSources={goSources} />;
      case 'sources':
        return (
          <SourcesManager onOpenTab={onOpenTab} />
        );
      case 'updates':
        return <UpdatesView source="video" onOpenTab={onOpenTab} onGoToLibrary={goLibrary} onBack={goLibrary} backLabel={t('Biblioteca')} autoCheckToken={updateToken} />;
      case 'history':
        return <HistoryView source="video" onOpenTab={onOpenTab} onBack={goLibrary} backLabel={t('Biblioteca')} />;
      case 'local':
        return <LocalVideoLibrary onOpenTab={onOpenTab} />;
      default:
        return null;
    }
  };

  const actions =
    group === 'library' ? (
      <>
        <SectionAction icon={<History size={14} />} label={t('Histórico')} active={view === 'history'} onClick={() => onChangeView(view === 'history' ? 'library' : 'history')} />
        <SectionAction icon={<ArchiveRestore size={14} />} label={t('Backup')} active={!!backupMode} onClick={() => setBackupMode('menu')} />
        <SectionAction
          primary
          icon={<RefreshCw size={14} />}
          label={t('Atualizar')}
          title={t('Procurar episódios novos nas obras da biblioteca')}
          badge={unseen}
          onClick={() => {
            setUpdateToken(Date.now());
            onChangeView('updates');
          }}
        />
      </>
    ) : group === 'explore' || group === 'sources' ? (
      <DonateAction label={t('Doar')} title={t('Apoie o Tomodachi Player')} onClick={openDonate} />
    ) : null;

  return (
    <div className="h-full w-full bg-surface text-fg-2 select-none overflow-hidden flex flex-col">
      <SectionTabBar
        section={LABELS.videos}
        sectionIcon={<Clapperboard size={15} />}
        active={group as SectionGroup}
        onSelect={(g) => onChangeView(g === 'library' ? 'library' : g === 'explore' ? 'online' : g === 'sources' ? 'extensions' : 'local')}
        tabs={[
          { id: 'library', label: t('Biblioteca'), icon: <Library size={15} />, count: animeCount },
          { id: 'explore', label: t('Descobrir'), icon: <Compass size={15} /> },
          { id: 'sources', label: t('Fontes'), icon: <Puzzle size={15} />, count: sourceCount },
          { id: 'local', label: t('Local'), icon: <FolderOpen size={15} /> },
        ]}
        actions={actions}
      />
      <div className="flex-1 min-h-0 relative">
        <KeepAliveViews active={keepKey} render={renderView} />
      </div>
      <BackupModal source="video" mode={backupMode} onChangeMode={setBackupMode} onViewLibrary={goLibrary} onOpenTab={onOpenTab} />
    </div>
  );
};
