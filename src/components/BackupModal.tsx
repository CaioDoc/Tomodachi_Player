// src/components/BackupModal.tsx
// Modal de Backup (aba Explorar): Importar Backup / Exportar Backup (.tachibk).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArchiveRestore, Download, Upload, X, ArrowLeft, Loader2, CheckCircle2, FileArchive, AlertTriangle } from 'lucide-react';
import { BackupPanel } from './BackupPanel';
import { toast } from './Feedback';
import { buildBackupFile, collectBackupData, backupFileName, saveBackupFile, type ExportStats } from '../api/backup/encode';
import { t } from '../i18n';

export type BackupModalMode = 'menu' | 'import' | 'export';

interface BackupModalProps {
  source: 'manga' | 'video';
  mode: BackupModalMode | null;
  onChangeMode: (mode: BackupModalMode | null) => void;
  onViewLibrary: () => void;
  onOpenTab?: any;
}

const OptionCard: React.FC<{ icon: React.ReactNode; title: string; text: string; onClick: () => void; autoFocus?: boolean }> = ({
  icon,
  title,
  text,
  onClick,
  autoFocus,
}) => (
  <button
    type="button"
    onClick={onClick}
    autoFocus={autoFocus}
    className="group flex-1 min-w-[200px] text-left p-4 rounded-xl border border-line bg-canvas hover:border-accent/60 hover:bg-subtle/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
  >
    <span className="w-10 h-10 rounded-lg bg-accent/15 text-accent flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">{icon}</span>
    <span className="block text-[14px] font-semibold text-fg">{title}</span>
    <span className="block text-[12px] text-fg-muted mt-1 leading-relaxed">{text}</span>
  </button>
);

const ExportPane: React.FC<{ source: 'manga' | 'video' }> = ({ source }) => {
  const [stats, setStats] = useState<ExportStats | null>(null);
  const [busy, setBusy] = useState(false);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isManga = source === 'manga';

  useEffect(() => {
    let alive = true;
    collectBackupData(source)
      .then((r) => alive && setStats(r.stats))
      .catch((e) => alive && setError(String(e?.message || e)));
    return () => {
      alive = false;
    };
  }, [source]);

  const doExport = async () => {
    setBusy(true);
    setError(null);
    try {
      const { bytes, stats: s } = await buildBackupFile(source);
      setStats(s);
      const path = await saveBackupFile(bytes, backupFileName(source));
      if (path) {
        setSavedPath(path);
        toast.success(t('Backup exportado'), path);
      }
    } catch (e: any) {
      const msg = String(e?.message || e);
      setError(msg);
      toast.error(t('Não foi possível exportar o backup'), msg);
    } finally {
      setBusy(false);
    }
  };

  const items: [string, number][] = stats
    ? [
        [isManga ? t('Mangás') : t('Animes'), stats.works],
        [isManga ? t('Capítulos') : t('Episódios'), stats.chapters],
        [isManga ? t('Lidos') : t('Assistidos'), stats.read],
        [t('Categorias'), stats.categories],
      ]
    : [];

  return (
    <div className="p-5 space-y-4 overflow-y-auto">
      <p className="text-[12.5px] text-fg-muted leading-relaxed">
        {isManga
          ? t('Gera um arquivo .tachibk com a sua biblioteca de mangás: obras, categorias, capítulos lidos, marcadores, página em que parou e histórico. Pode ser importado no Mihon/Tachiyomi ou de volta aqui.')
          : t('Gera um arquivo .tachibk com a sua biblioteca de animes: obras, categorias, episódios assistidos, marcadores, ponto em que parou e histórico. Pode ser importado no Aniyomi ou de volta aqui.')}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {stats
          ? items.map(([label, value]) => (
              <div key={label} className="rounded-lg border border-line bg-canvas p-3">
                <div className="text-base font-semibold text-fg tabular-nums">{value}</div>
                <div className="text-[11px] text-fg-muted">{label}</div>
              </div>
            ))
          : Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-[58px] rounded-lg border border-line bg-canvas animate-pulse" />)}
      </div>

      {stats && stats.works === 0 && (
        <div className="flex items-start gap-2 text-[12px] text-warning-fg bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{t('Sua biblioteca está vazia — o backup não terá obras.')}</span>
        </div>
      )}

      {savedPath && (
        <div className="flex items-start gap-2 text-[12px] text-fg-2 bg-success/10 border border-success/30 rounded-lg px-3 py-2">
          <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-success" />
          <span className="min-w-0 break-all">{t('Salvo em {path}', { path: savedPath })}</span>
        </div>
      )}
      {error && !savedPath && (
        <div className="flex items-start gap-2 text-[12px] text-danger-fg bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span className="min-w-0 break-all">{error}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[11px] text-fg-muted inline-flex items-center gap-1.5">
          <FileArchive size={13} /> {backupFileName(source)}
        </span>
        <button
          type="button"
          onClick={doExport}
          disabled={busy || !stats}
          className="h-9 px-4 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12.5px] font-semibold inline-flex items-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-default"
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
          {t('Salvar arquivo .tachibk')}
        </button>
      </div>
    </div>
  );
};

export const BackupModal: React.FC<BackupModalProps> = ({ source, mode, onChangeMode, onViewLibrary, onOpenTab }) => {
  useEffect(() => {
    if (!mode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onChangeMode(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [mode, onChangeMode]);

  if (!mode) return null;
  const close = () => onChangeMode(null);
  const isManga = source === 'manga';
  const title =
    mode === 'import' ? t('Importar Backup') : mode === 'export' ? t('Exportar Backup') : t('Backup');

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/70 backdrop-blur-[2px] flex items-center justify-center p-4 animate-tp-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-surface border border-line rounded-xl w-full shadow-2xl overflow-hidden flex flex-col animate-tp-zoom-in ${
          mode === 'import' ? 'max-w-4xl h-[86vh]' : 'max-w-xl max-h-[86vh]'
        }`}
      >
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-line bg-canvas flex-shrink-0">
          {mode !== 'menu' && (
            <button
              type="button"
              onClick={() => onChangeMode('menu')}
              className="p-1 -ml-1 rounded-md text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer"
              title={t('Voltar')}
              aria-label={t('Voltar')}
            >
              <ArrowLeft size={16} />
            </button>
          )}
          <ArchiveRestore size={18} className="text-accent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-fg">{title}</h2>
            <p className="text-[11.5px] text-fg-muted truncate">
              {isManga ? t('Mihon / Tachiyomi (.tachibk)') : t('Aniyomi (.tachibk)')}
            </p>
          </div>
          <button type="button" onClick={close} className="p-1.5 rounded-lg text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer" title={t('Fechar (Esc)')}>
            <X size={18} />
          </button>
        </div>

        {mode === 'menu' && (
          <div className="p-5 flex flex-wrap gap-3">
            <OptionCard
              autoFocus
              icon={<Upload size={20} />}
              title={t('Importar Backup')}
              text={
                isManga
                  ? t('Traga a biblioteca, o progresso e as categorias de um backup do Mihon, Tachiyomi ou Aniyomi.')
                  : t('Traga a biblioteca, o progresso e as categorias de um backup do Aniyomi.')
              }
              onClick={() => onChangeMode('import')}
            />
            <OptionCard
              icon={<Download size={20} />}
              title={t('Exportar Backup')}
              text={
                isManga
                  ? t('Salve sua biblioteca de mangás em um arquivo .tachibk para guardar ou levar ao Mihon.')
                  : t('Salve sua biblioteca de animes em um arquivo .tachibk para guardar ou levar ao Aniyomi.')
              }
              onClick={() => onChangeMode('export')}
            />
          </div>
        )}

        {mode === 'import' && (
          <div className="flex-1 min-h-0">
            <BackupPanel
              source={source}
              onOpenTab={onOpenTab}
              onViewLibrary={() => {
                close();
                onViewLibrary();
              }}
            />
          </div>
        )}

        {mode === 'export' && <ExportPane source={source} />}
      </div>
    </div>,
    document.body
  );
};

