// src/components/BackupPanel.tsx
import React, { useState } from 'react';
import { toast, confirmDialog } from './Feedback';
import { readBackupFile } from '../api/backup/decode';
import { normalize, NormalizedBackup, MangaEntry } from '../api/backup/mapper';
import { applyBackup, applyFullAniyomiBackup } from '../api/backup/apply';
import { t, tn } from '../i18n';
import { 
  Database, 
  Upload, 
  CheckCircle2, 
  AlertCircle, 
  BookOpen, 
  Film, 
  Layers, 
  Check,
  Sparkles,
  ExternalLink 
} from 'lucide-react';

export interface BackupPanelProps {
  source: 'manga' | 'video';
  onOpenTab?: any;
  onViewLibrary?: () => void;
}

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="bg-surface border border-line rounded-md p-3 text-left shadow-xs">
    <div className="text-base text-fg font-semibold tabular-nums">{value}</div>
    <div className="text-[11px] text-fg-muted">{label}</div>
  </div>
);

export function BackupPanel({ source, onViewLibrary }: BackupPanelProps) {
  const [backup, setBackup] = useState<NormalizedBackup | null>(null);
  const [status, setStatus] = useState<string>('');
  const [appliedMsg, setAppliedMsg] = useState<string>('');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'manga' | 'anime'>('all');
  const [isApplying, setIsApplying] = useState(false);

  const handleFile = async (file: File) => {
    setStatus(t('Lendo e descompactando backup...'));
    setAppliedMsg('');
    try {
      const { bytes, isJson } = await readBackupFile(file);
      if (isJson) { 
        setStatus(t('Backup em formato JSON legado — suporte limitado.')); 
        return; 
      }

      const norm = normalize(bytes);

      setStatus(
        t('Backup decodificado com sucesso ({app}) | Mangás: {manga} | Animes: {anime} | Campos: [{fields}]', {
          app: norm.app.toUpperCase(),
          manga: norm.manga.length,
          anime: norm.anime.length,
          fields: norm.detectedFields.join(', '),
        })
      );

      setBackup(norm);
      // Ajusta o filtro de pré-visualização padrão
      if (source === 'video' && norm.anime.length > 0) {
        setPreviewFilter('anime');
      } else if (source === 'manga' && norm.manga.length > 0) {
        setPreviewFilter('manga');
      } else {
        setPreviewFilter('all');
      }
    } catch (e: any) {
      setStatus(t('Falha ao decodificar arquivo: {error}', { error: String(e?.message || e) }));
    }
  };

  const handleApplySingle = async (targetSource: 'manga' | 'video') => {
    if (!backup) return;
    setIsApplying(true);
    try {
      await applyBackup(backup, targetSource);
      const count = targetSource === 'manga' ? backup.manga.length : backup.anime.length;
      setAppliedMsg(
        targetSource === 'manga'
          ? tn(count, 'Sucesso! {n} mangá aplicado à biblioteca.', 'Sucesso! {n} mangás aplicados à biblioteca.')
          : tn(count, 'Sucesso! {n} anime aplicado à biblioteca.', 'Sucesso! {n} animes aplicados à biblioteca.')
      );
    } catch (err: any) {
      toast.error(t('Erro ao aplicar backup'), String(err?.message || err));
    } finally {
      setIsApplying(false);
    }
  };

  const handleApplyBoth = async () => {
    if (!backup) return;
    setIsApplying(true);
    try {
      const res = await applyFullAniyomiBackup(backup);
      setAppliedMsg(t('Sucesso duplo! {manga} mangás aplicados à biblioteca de mangás e {anime} animes aplicados à biblioteca de vídeos.', { manga: res.mangaCount, anime: res.animeCount }));
    } catch (err: any) {
      toast.error(t('Erro ao aplicar backup completo'), String(err?.message || err));
    } finally {
      setIsApplying(false);
    }
  };

  const isManga = source === 'manga';

  const rows: MangaEntry[] = backup
    ? previewFilter === 'manga'
      ? backup.manga
      : previewFilter === 'anime'
      ? backup.anime
      : [...backup.manga, ...backup.anime]
    : [];

  return (
    <div className="p-5 overflow-y-auto h-full w-full bg-canvas text-fg-2 select-none">
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Header card */}
        <div className="bg-surface border border-line rounded-lg p-5 shadow-xs">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-md bg-subtle border border-line text-fg">
              <Database size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-fg">
                {isManga ? t('Backup Mihon / Tachiyomi / Aniyomi') : t('Backup Aniyomi (Vídeos & Animes)')}
              </h2>
              <p className="text-xs text-fg-muted">
                {t('Importa biblioteca, capítulos/episódios lidos, categorias, histórico e extensões do arquivo')} <code>.tachibk</code>{' '}
                {t('ou')} <code>.proto.gz</code>.
              </p>
            </div>
          </div>

          <div className="mt-4">
            <label className="inline-flex items-center gap-2 px-4 py-2 bg-subtle hover:bg-elevated text-fg border border-line rounded-md text-xs font-medium cursor-pointer transition-colors shadow-xs focus-within:ring-1 focus-within:ring-neutral-400">
              <Upload size={14} className="text-fg" />
              <span>{backup ? t('Trocar Arquivo de Backup') : t('Selecionar Arquivo .tachibk')}</span>
              <input
                type="file"
                accept=".tachibk,.zip,.proto.gz,.proto,*/*"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="hidden"
              />
            </label>
          </div>

          {status && (
            <div className="mt-3 text-xs text-fg-2 bg-surface border border-line p-2.5 rounded-md flex items-center gap-2">
              <AlertCircle size={14} className="text-fg shrink-0" />
              <span>{status}</span>
            </div>
          )}

          {appliedMsg && (
            <div className="mt-3 flex flex-col gap-2">
              <div className="text-xs text-success-fg bg-[#1b2f21] border border-success-hover/50 p-2.5 rounded-md flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="shrink-0" />
                  <span className="font-medium">{appliedMsg}</span>
                </div>
                {onViewLibrary && (
                  <button
                    type="button"
                    onClick={onViewLibrary}
                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-success hover:bg-success-hover text-white rounded-md font-semibold text-xs transition-colors cursor-pointer shrink-0"
                  >
                    <span>{t('Abrir Minha Biblioteca')}</span>
                    <span>→</span>
                  </button>
                )}
              </div>
              <div className="text-[11px] text-fg-muted bg-canvas border border-line p-2 rounded-md">
                💡 <span className="text-fg font-semibold">{t('Onde encontrar suas obras:')}</span>{' '}
                {t('As obras importadas foram fundidas na aba')}{' '}
                <strong className="text-fg">"{t('Minha Biblioteca')}"</strong> {t('sem apagar suas obras existentes.')}
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid & Action Controls */}
        {backup && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label={t('Mangás Detectados')} value={backup.manga.length} />
              <Stat label={t('Animes Detectados')} value={backup.anime.length} />
              <Stat label={t('Capítulos/Episódios')} value={backup.stats.chapters} />
              <Stat label={t('Itens Lidos/Vistos')} value={backup.stats.readEntries} />
              <Stat label={t('Categorias')} value={backup.stats.categories} />
              <Stat label={t('Histórico')} value={backup.stats.history} />
              <Stat label={t('Monitoramento (MAL/AL)')} value={backup.stats.tracking} />
              <Stat label={t('Extensões')} value={backup.stats.extensions} />
            </div>

            {/* Smart Application Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              {/* Botão de Aplicação Dupla se houver ambos */}
              {backup.manga.length > 0 && backup.anime.length > 0 && (
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={handleApplyBoth}
                  className="px-4 py-2 rounded-md bg-success hover:bg-success-hover text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  title={t('Aplica os mangás à seção de Mangás e os animes à seção de Vídeos simultaneamente')}
                >
                  <Sparkles size={14} />
                  <span>{t('Aplicar Tudo ({manga} Mangás + {anime} Animes)', { manga: backup.manga.length, anime: backup.anime.length })}</span>
                </button>
              )}

              {/* Botão de Aplicação de Mangás se houver */}
              {backup.manga.length > 0 && (
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={() => handleApplySingle('manga')}
                  className="px-3.5 py-2 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium border border-line shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <BookOpen size={14} />
                  <span>{t('Aplicar {n} Mangás à Biblioteca', { n: backup.manga.length })}</span>
                </button>
              )}

              {/* Botão de Aplicação de Animes se houver */}
              {backup.anime.length > 0 && (
                <button
                  type="button"
                  disabled={isApplying}
                  onClick={() => handleApplySingle('video')}
                  className="px-3.5 py-2 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium border border-line shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Film size={14} />
                  <span>{t('Aplicar {n} Animes à Biblioteca', { n: backup.anime.length })}</span>
                </button>
              )}

              {onViewLibrary && (
                <button
                  type="button"
                  onClick={onViewLibrary}
                  className="px-3.5 py-2 rounded-md bg-surface hover:bg-subtle text-fg-muted hover:text-fg text-xs font-medium border border-line transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <span>{t('Ver Minha Biblioteca')}</span>
                </button>
              )}
            </div>

            {/* Content Preview & Type Filter Switcher */}
            {rows.length > 0 && (
              <div className="border border-line rounded-lg overflow-hidden bg-surface shadow-xs">
                <div className="px-4 py-2.5 border-b border-line bg-canvas flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-fg">
                      {t('Pré-visualização de Conteúdo ({n})', { n: rows.length })}
                    </span>
                    <span className="text-[10px] bg-subtle text-fg-muted px-1.5 py-0.5 rounded font-mono border border-line">
                      {t('Origem: {app}', { app: backup.app.toUpperCase() })}
                    </span>
                  </div>

                  {/* Filter tabs: All, Manga, Anime */}
                  {backup.manga.length > 0 && backup.anime.length > 0 && (
                    <div className="flex items-center bg-surface p-0.5 rounded-md border border-line text-xs">
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('all')}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          previewFilter === 'all' 
                            ? 'bg-subtle text-fg' 
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {t('Todos ({n})', { n: backup.manga.length + backup.anime.length })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('manga')}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          previewFilter === 'manga' 
                            ? 'bg-subtle text-fg' 
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {t('Mangás ({n})', { n: backup.manga.length })}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewFilter('anime')}
                        className={`px-2.5 py-0.5 rounded text-[11px] font-medium transition-colors ${
                          previewFilter === 'anime' 
                            ? 'bg-subtle text-fg' 
                            : 'text-fg-muted hover:text-fg'
                        }`}
                      >
                        {t('Animes ({n})', { n: backup.anime.length })}
                      </button>
                    </div>
                  )}
                </div>

                <div className="divide-y divide-line-subtle max-h-80 overflow-y-auto">
                  {rows.slice(0, 100).map((item, idx) => {
                    const readCount = item.chapters.filter((c) => c.read).length;
                    return (
                      <div key={`${item.url}-${idx}`} className="px-4 py-2 flex items-center justify-between hover:bg-subtle/50 text-xs">
                        <div className="flex items-center gap-3 truncate mr-3">
                          {item.cover ? (
                            <img src={item.cover} alt={item.title} referrerPolicy="no-referrer" className="w-8 h-11 object-cover rounded bg-canvas shrink-0" onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }} />
                          ) : (
                            <div className="w-8 h-11 rounded bg-canvas border border-line flex items-center justify-center shrink-0 text-fg-muted">
                              {isManga ? <BookOpen size={14} /> : <Film size={14} />}
                            </div>
                          )}
                          <div className="truncate flex-1 min-w-0">
                            <h4 className="text-fg font-medium truncate">{item.title}</h4>
                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-fg-muted truncate">
                              {item.author ? (
                                <span className="truncate text-fg-2">{item.author}</span>
                              ) : (
                                <span className="italic text-fg-muted">{t('Autor não informado')}</span>
                              )}
                              {item.categories && item.categories.length > 0 && (
                                <>
                                  <span className="text-fg-muted">•</span>
                                  <div className="flex items-center gap-1 truncate">
                                    {item.categories.slice(0, 3).map((cat, ci) => (
                                      <span
                                        key={ci}
                                        className="bg-subtle px-1.5 py-0.2 rounded text-[10px] text-fg-muted font-mono border border-line"
                                      >
                                        {cat}
                                      </span>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0 text-[11px] text-fg-muted font-mono">
                          <span>{t('{read}/{total} lidos', { read: readCount, total: item.chapters.length })}</span>
                          {item.favorite && <span className="text-rose-400">♥</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
