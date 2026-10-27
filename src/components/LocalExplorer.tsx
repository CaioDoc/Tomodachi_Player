import React, { useState, useEffect } from 'react';
import { 
  Folder, 
  Film, 
  Image as ImageIcon, 
  FileArchive, 
  FileText, 
  FolderOpen, 
  ArrowUp, 
  RotateCw, 
  Grid, 
  List, 
  BookOpen, 
  Play, 
  ChevronRight,
  Database
} from 'lucide-react';
import type { LocalFileItem, TabType, MediaKind } from '../types';
import { toMediaUrl } from '../utils/mediaUrl';
import { useLocalFolders } from '../hooks/useLocalFolders';
import { FolderGrid } from './FolderGrid';
import { t, tn, tMaybe, locale } from '../i18n';

interface LocalExplorerProps {
  initialPath?: string;
  onOpenTab: (type: TabType, title: string, data?: any) => void;
  mediaType?: 'image' | 'video' | 'all';
}

export const LocalExplorer: React.FC<LocalExplorerProps> = ({
  initialPath = '',
  onOpenTab,
  mediaType = 'all'
}) => {
  const [currentPath, setCurrentPath] = useState<string>(initialPath);
  const [items, setItems] = useState<LocalFileItem[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [updating, setUpdating] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [folderCounts, setFolderCounts] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('manga_folder_counts');
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });
  const statusTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const hasAutoScannedRef = React.useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'folders' | 'images' | 'videos' | 'archives'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const kind: MediaKind = mediaType === 'video' ? 'video' : 'image';
  const { folders: savedFolders, addFolder, addFolders, removeFolder, setAllFolders } = useLocalFolders(kind);

  const loadDirectory = async (dirPath: string, isRefresh = false) => {
    if (!dirPath || !window.electronAPI) return;
    setLoading(true);
    setError(null);
    try {
      const res = await window.electronAPI.readDirectory(dirPath);
      if (res.success) {
        if (isRefresh) {
          const prevPaths = new Set(items.map((i) => i.path));
          const newItems = (res.items || []).filter((i) => !prevPaths.has(i.path));
          if (newItems.length > 0) {
            setUpdateStatus(tn(newItems.length, 'Pasta atualizada: {n} novo arquivo encontrado!', 'Pasta atualizada: {n} novos arquivos encontrados!'));
          } else {
            setUpdateStatus(tn(res.items.length, 'Pasta atualizada: tudo em dia ({n} item).', 'Pasta atualizada: tudo em dia ({n} itens).'));
          }
          setLastUpdated(new Date());
          if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
          statusTimeoutRef.current = setTimeout(() => setUpdateStatus(null), 4500);
        }
        setItems(res.items);
        setCurrentPath(dirPath);
      } else {
        setError(tMaybe(res.error) || t('Falha ao ler diretório'));
      }
    } catch (err: any) {
      setError(err.message || t('Erro ao carregar diretório'));
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateFolders = async (isAuto = false) => {
    if (!window.electronAPI) return;
    setUpdating(true);
    if (!isAuto) {
      setUpdateStatus(t('Verificando alterações e novos arquivos...'));
    }

    try {
      if (currentPath) {
        await loadDirectory(currentPath, !isAuto);
      } else {
        if (savedFolders.length === 0) {
          if (!isAuto) {
            setUpdateStatus(t('Nenhuma pasta adicionada para verificar.'));
          }
          setUpdating(false);
          return;
        }

        let totalNewFiles = 0;
        let totalItemsCount = 0;
        const newCounts: Record<string, number> = {};
        const oldCounts: Record<string, number> = { ...folderCounts };

        for (const fPath of savedFolders) {
          try {
            const res = await window.electronAPI.readDirectory(fPath);
            if (res.success && Array.isArray(res.items)) {
              const count = res.items.length;
              newCounts[fPath] = count;
              totalItemsCount += count;
              const prev = oldCounts[fPath];
              if (prev !== undefined && count > prev) {
                totalNewFiles += count - prev;
              }
            }
          } catch (e) {
            console.error('Erro ao verificar pasta:', fPath, e);
          }
        }

        setFolderCounts(newCounts);
        localStorage.setItem('manga_folder_counts', JSON.stringify(newCounts));
        setLastUpdated(new Date());

        if (totalNewFiles > 0) {
          setUpdateStatus(tn(totalNewFiles, 'Varredura concluída: {n} novo arquivo detectado nas pastas!', 'Varredura concluída: {n} novos arquivos detectados nas pastas!'));
        } else if (isAuto) {
          setUpdateStatus(t('Varredura inicial concluída: {folders} pasta(s) e {files} arquivos verificados.', { folders: savedFolders.length, files: totalItemsCount }));
        } else {
          setUpdateStatus(t('Pastas atualizadas: tudo em dia ({n} arquivos verificados).', { n: totalItemsCount }));
        }

        if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
        statusTimeoutRef.current = setTimeout(() => setUpdateStatus(null), 4500);
      }
    } catch (err: any) {
      console.error('Erro ao atualizar pastas:', err);
      setUpdateStatus(t('Erro ao atualizar pastas locais.'));
    } finally {
      setUpdating(false);
    }
  };

  useEffect(() => {
    if (initialPath) {
      loadDirectory(initialPath);
    }
  }, [initialPath]);

  // Varredura automática na primeira vez que acessar arquivos locais
  useEffect(() => {
    const sessionKey = `local_manga_first_scan_done_${kind}`;
    const alreadyScanned = sessionStorage.getItem(sessionKey);
    if (!hasAutoScannedRef.current && !alreadyScanned && (savedFolders.length > 0 || currentPath)) {
      hasAutoScannedRef.current = true;
      sessionStorage.setItem(sessionKey, 'true');
      handleUpdateFolders(true);
    }
  }, [savedFolders, currentPath, kind]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const handlePickFolder = async () => {
    const selectFn = window.api?.selectFolders || window.electronAPI?.selectFolders;
    const openSingleFn = window.electronAPI?.openFolderDialog;
    try {
      let chosen: string[] = [];
      if (selectFn) {
        chosen = await selectFn();
      } else if (openSingleFn) {
        const single = await openSingleFn();
        if (single) chosen = [single];
      }
      if (chosen && chosen.length > 0) {
        addFolders(chosen);
        // Permanece na raiz para exibir a pasta pai selecionada
        setCurrentPath('');
      }
    } catch (err) {
      console.error('Erro ao selecionar pasta:', err);
    }
  };

  const handleSelectMultipleFolders = async () => {
    const selectFn = window.api?.selectFolders || window.electronAPI?.selectFolders;
    const openSingleFn = window.electronAPI?.openFolderDialog;
    try {
      let chosen: string[] = [];
      if (selectFn) {
        chosen = await selectFn();
      } else if (openSingleFn) {
        const single = await openSingleFn();
        if (single) chosen = [single];
      }
      if (chosen && chosen.length > 0) {
        addFolders(chosen);
        if (!currentPath) {
          setCurrentPath('');
        }
      }
    } catch (err) {
      console.error('Erro ao selecionar pastas:', err);
    }
  };

  const handleSetCurrentFolderCover = async () => {
    if (!currentPath) return;
    const selectCover = window.api?.selectCoverImage || (window.electronAPI as any)?.selectCoverImage;
    const setCoverFn = window.api?.setFolderCover || (window.electronAPI as any)?.setFolderCover;
    if (!selectCover || !setCoverFn) return;
    try {
      const chosen = await selectCover();
      if (chosen) {
        const res = await setCoverFn(currentPath, chosen);
        if (res?.success) {
          loadDirectory(currentPath);
        }
      }
    } catch (err) {
      console.error('Erro ao definir capa da pasta atual:', err);
    }
  };

  const handleSetItemCover = async (e: React.MouseEvent, folderPath: string) => {
    e.stopPropagation();
    const selectCover = window.api?.selectCoverImage || (window.electronAPI as any)?.selectCoverImage;
    const setCoverFn = window.api?.setFolderCover || (window.electronAPI as any)?.setFolderCover;
    if (!selectCover || !setCoverFn) return;
    try {
      const chosen = await selectCover();
      if (chosen) {
        const res = await setCoverFn(folderPath, chosen);
        if (res?.success) {
          setItems((prev) =>
            prev.map((it) => (it.path === folderPath ? { ...it, coverPath: res.coverPath || chosen } : it))
          );
        }
      }
    } catch (err) {
      console.error('Erro ao definir capa do item:', err);
    }
  };

  const handleRemoveFolder = (folderPath: string) => {
    const next = removeFolder(folderPath);
    if (currentPath === folderPath || currentPath.startsWith(folderPath + '\\') || currentPath.startsWith(folderPath + '/')) {
      if (next.length > 0) {
        loadDirectory(next[0]);
      } else {
        setCurrentPath('');
        setItems([]);
      }
    }
  };

  const handleNavigateUp = () => {
    if (!currentPath) return;
    const normCurrent = currentPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const isRootFolder = savedFolders.some((f) => f.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === normCurrent.toLowerCase());
    if (isRootFolder) {
      setCurrentPath('');
      setItems([]);
      return;
    }
    const parts = normCurrent.split('/').filter(Boolean);
    if (parts.length <= 1) {
      setCurrentPath('');
      setItems([]);
      return;
    }
    parts.pop();
    let parent = parts.join('/');
    if (/^[A-Za-z]:$/.test(parts[0])) {
      parent = parts[0] + '/' + parts.slice(1).join('/');
    }
    loadDirectory(parent);
  };

  // Filter items
  const filteredItems = items.filter((item) => {
    if (mediaType === 'image' && item.isVideo) return false;
    if (mediaType === 'video' && (item.isImage || item.isArchive)) return false;

    if (filter === 'folders') return item.isDirectory;
    if (filter === 'images') return item.isImage;
    if (filter === 'videos') return item.isVideo;
    if (filter === 'archives') return item.isArchive;
    return true;
  });

  const imageFiles = items.filter((i) => i.isImage);
  const videoFiles = items.filter((i) => i.isVideo);

  // Handle clicking an item
  const handleItemClick = (item: LocalFileItem) => {
    if (item.isDirectory) {
      loadDirectory(item.path);
    } else if (item.isVideo) {
      onOpenTab('video-player', item.name, {
        filePath: item.path,
        path: item.path,
        title: item.name
      });
    } else if (item.isImage) {
      // Collect all images in this folder for the reader
      const pages = imageFiles.map((img, idx) => ({
        index: idx,
        url: toMediaUrl(img.path),
        name: img.name
      }));
      const clickedIndex = imageFiles.findIndex((img) => img.path === item.path);
      const folderName = currentPath.split(/[\\/]/).pop() || t('Mangá local');

      onOpenTab('manga-reader', `${folderName} (${imageFiles.length}p)`, {
        title: folderName,
        pages,
        initialPageIndex: Math.max(0, clickedIndex)
      });
    } else if (item.name.endsWith('.tachibk')) {
      onOpenTab('backup-viewer', item.name, {
        filePath: item.path
      });
    }
  };

  const handleReadFolderDirectly = async (folderItem: LocalFileItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.electronAPI) return;
    const res = await window.electronAPI.readDirectory(folderItem.path);
    if (res.success && res.items) {
      const imgs = res.items.filter((i) => i.isImage);
      if (imgs.length > 0) {
        const pages = imgs.map((img, idx) => ({
          index: idx,
          url: toMediaUrl(img.path),
          name: img.name
        }));
        onOpenTab('manga-reader', `${folderItem.name} (${imgs.length}p)`, {
          title: folderItem.name,
          pages,
          initialPageIndex: 0
        });
      }
    }
  };

  const handleOpenEntireFolderAsManga = () => {
    if (imageFiles.length === 0) return;
    const pages = imageFiles.map((img, idx) => ({
      index: idx,
      url: toMediaUrl(img.path),
      name: img.name
    }));
    const folderName = currentPath.split(/[\\/]/).pop() || t('Pasta de imagens');
    onOpenTab('manga-reader', `${folderName} (${pages.length}p)`, {
      title: folderName,
      pages,
      initialPageIndex: 0
    });
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  };

  // Render breadcrumbs
  const breadcrumbParts = currentPath ? currentPath.split(/[\\/]/).filter(Boolean) : [];

  return (
    <div className="flex flex-col h-full w-full bg-canvas select-none text-fg-2 overflow-hidden">
      {/* Top Header & Breadcrumbs */}
      <div className="p-2.5 bg-surface border-b border-line flex items-center justify-between gap-3 text-xs">
        {/* Navigation buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handlePickFolder}
            className="flex items-center gap-1.5 px-3 py-1 bg-subtle hover:bg-elevated text-fg rounded border border-line transition-colors"
            title={t('Escolher pasta do computador')}
          >
            <FolderOpen size={14} className="text-accent" />
            <span className="font-medium">{t('Abrir pasta')}</span>
          </button>

          <button
            type="button"
            onClick={handleSelectMultipleFolders}
            className="flex items-center gap-1.5 px-3 py-1 bg-subtle hover:bg-elevated text-fg-2 hover:text-white rounded border border-line transition-colors"
            title={t('Selecionar múltiplas pastas de mídia')}
          >
            <Folder size={14} className="text-purple-400" />
            <span className="font-medium">{t('Adicionar pastas')}</span>
          </button>

          <button
            type="button"
            onClick={handleNavigateUp}
            disabled={!currentPath}
            className="p-1.5 text-fg-muted hover:text-white hover:bg-subtle rounded disabled:opacity-40 transition-colors"
            title={t('Pasta acima')}
          >
            <ArrowUp size={16} />
          </button>

          <button
            type="button"
            onClick={() => handleUpdateFolders(false)}
            disabled={loading || updating}
            className="p-1.5 text-fg-muted hover:text-white hover:bg-subtle rounded disabled:opacity-40 transition-colors"
            title={t('Atualizar e verificar novos arquivos')}
          >
            <RotateCw size={14} className={(loading || updating) ? 'animate-spin text-accent' : ''} />
          </button>

          <button
            type="button"
            onClick={() => handleUpdateFolders(false)}
            disabled={loading || updating}
            className="flex items-center gap-1.5 px-3 py-1 bg-subtle hover:bg-elevated text-fg-2 hover:text-white rounded border border-line transition-colors"
            title={t('Verificar novos capítulos, imagens ou pastas')}
          >
            <RotateCw size={13} className={updating ? 'animate-spin text-accent' : 'text-emerald-400'} />
            <span className="font-medium">{updating ? t('Verificando...') : t('Atualizar')}</span>
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="flex-1 flex items-center gap-1 overflow-x-auto bg-canvas px-3 py-1 rounded border border-line text-xs scrollbar-none font-mono">
          {breadcrumbParts.length === 0 ? (
            <span className="text-fg-muted">{t('Nenhuma pasta selecionada')}</span>
          ) : (
            <>
              {savedFolders.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentPath('');
                      setItems([]);
                    }}
                    className="hover:underline text-accent font-semibold flex-shrink-0"
                    title={t('Voltar às pastas salvas')}
                  >
                    {t('Início')}
                  </button>
                  <ChevronRight size={12} className="text-line flex-shrink-0" />
                </>
              )}
              {breadcrumbParts.map((part, idx) => {
                const subPath = breadcrumbParts.slice(0, idx + 1).join('/');
                const isLast = idx === breadcrumbParts.length - 1;
                return (
                  <React.Fragment key={idx}>
                    <button
                      type="button"
                      onClick={() => loadDirectory(subPath)}
                      className={`hover:underline truncate max-w-[120px] ${
                        isLast ? 'text-fg font-semibold' : 'text-fg-muted'
                      }`}
                    >
                      {part}
                    </button>
                    {!isLast && <ChevronRight size={12} className="text-line flex-shrink-0" />}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </div>

        {/* Definir capa da pasta atual */}
        {currentPath && (
          <button
            type="button"
            onClick={handleSetCurrentFolderCover}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-subtle hover:bg-elevated text-accent hover:text-accent-hover rounded border border-line text-xs transition-colors flex-shrink-0"
            title={t('Escolher uma imagem como capa desta pasta')}
          >
            <ImageIcon size={13} />
            <span className="hidden sm:inline">{t('Definir capa')}</span>
          </button>
        )}

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-canvas p-1 rounded border border-line">
          <button
            type="button"
            onClick={() => setViewMode('grid')}
            className={`p-1 rounded ${viewMode === 'grid' ? 'bg-subtle text-accent' : 'text-fg-muted'}`}
            title={t('Visualização em grade')}
          >
            <Grid size={14} />
          </button>
          <button
            type="button"
            onClick={() => setViewMode('list')}
            className={`p-1 rounded ${viewMode === 'list' ? 'bg-subtle text-accent' : 'text-fg-muted'}`}
            title={t('Visualização em lista')}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {/* Banner de Status de Atualização / Scan */}
      {updateStatus && (
        <div className="px-3 py-1.5 bg-surface border-b border-line flex items-center justify-between text-xs text-blue-200">
          <div className="flex items-center gap-2">
            <RotateCw size={13} className={updating ? 'animate-spin text-accent' : 'text-emerald-400'} />
            <span>{updateStatus}</span>
          </div>
          <button
            type="button"
            onClick={() => setUpdateStatus(null)}
            aria-label={t('Fechar')}
            className="text-fg-muted hover:text-white px-1 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Filter and Quick Action Bar */}
      <div className="px-3 py-1.5 bg-surface/70 border-b border-line flex items-center justify-between text-xs">
        {/* Filters */}
        <div className="flex items-center gap-1">
          {(['all', 'folders', 'images', 'videos', 'archives'] as const)
            .filter((mode) => {
              if (mediaType === 'image' && mode === 'videos') return false;
              if (mediaType === 'video' && (mode === 'images' || mode === 'archives')) return false;
              return true;
            })
            .map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFilter(mode as any)}
              className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                filter === mode
                  ? 'bg-subtle text-accent border border-line'
                  : 'text-fg-muted hover:text-fg-2'
              }`}
            >
              {mode === 'all' && t('Todos ({n})', { n: filteredItems.length })}
              {mode === 'folders' && t('Pastas ({n})', { n: items.filter(i => i.isDirectory).length })}
              {mode === 'images' && t('Imagens ({n})', { n: imageFiles.length })}
              {mode === 'videos' && t('Vídeos ({n})', { n: videoFiles.length })}
              {mode === 'archives' && t('Backups/Zips ({n})', { n: items.filter(i => i.isArchive).length })}
            </button>
          ))}
        </div>

        {/* Quick launcher buttons if directory contains media */}
        <div className="flex items-center gap-2">
          {imageFiles.length > 0 && (
            <button
              type="button"
              onClick={handleOpenEntireFolderAsManga}
              className="flex items-center gap-1.5 px-2.5 py-0.5 bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 rounded border border-emerald-800 text-[11px] font-medium transition-colors"
            >
              <BookOpen size={12} />
              <span>{t('Ler pasta ({n} págs)', { n: imageFiles.length })}</span>
            </button>
          )}
        </div>
      </div>

      {/* Explorer Content Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {!currentPath ? (
          savedFolders.length > 0 ? (
            <div className="flex flex-col h-full overflow-y-auto">
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-line-subtle">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-fg">
                    {mediaType === 'image'
                      ? t('Minhas pastas de mangás & quadrinhos ({n})', { n: savedFolders.length })
                      : t('Minhas pastas de mídia ({n})', { n: savedFolders.length })}
                  </span>
                  {lastUpdated && (
                    <span className="text-[10px] text-fg-muted">
                      • {t('Atualizado às {time}', { time: lastUpdated.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleUpdateFolders(false)}
                    disabled={updating}
                    className="flex items-center gap-1.5 px-3 py-1 bg-subtle hover:bg-elevated text-emerald-400 hover:text-emerald-300 rounded border border-line text-xs transition-colors"
                    title={t('Escanear e verificar se há novidades nas pastas')}
                  >
                    <RotateCw size={13} className={updating ? 'animate-spin text-accent' : ''} />
                    <span>{updating ? t('Escaneando...') : t('Atualizar / Scan')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectMultipleFolders}
                    className="flex items-center gap-1.5 px-3 py-1 bg-subtle hover:bg-elevated text-accent hover:text-accent-hover rounded border border-line text-xs transition-colors"
                  >
                    <FolderOpen size={13} />
                    <span>{t('Adicionar pastas')}</span>
                  </button>
                </div>
              </div>

              <FolderGrid
                folders={savedFolders.map((fPath) => ({
                  path: fPath,
                  name: fPath.split(/[\\/]/).filter(Boolean).pop() || fPath,
                  count: folderCounts[fPath],
                }))}
                mediaType={mediaType === 'video' ? 'video' : 'image'}
                onOpen={(p) => loadDirectory(p)}
                onRemove={handleRemoveFolder}
                emptyText={t('Nenhuma pasta adicionada.')}
              />
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center p-8 text-fg-muted">
              <div className="w-16 h-16 rounded-full bg-surface border border-line flex items-center justify-center mb-3 text-blue-400">
                <FolderOpen size={32} />
              </div>
              <h3 className="text-base font-medium text-fg mb-1">{t('Nenhum diretório aberto')}</h3>
              <p className="text-xs max-w-sm mb-4">
                {mediaType === 'image'
                  ? t('Selecione uma pasta com seus mangás e quadrinhos locais (JPG, PNG, WebP) para começar.')
                  : mediaType === 'video'
                  ? t('Selecione uma pasta com seus vídeos e animações para começar.')
                  : t('Selecione uma pasta com vídeos, mangás (JPG, PNG, WebP) ou arquivos de backup (.tachibk) para começar.')}
              </p>
              <button
                type="button"
                onClick={handleSelectMultipleFolders}
                className="px-4 py-2 bg-subtle hover:bg-elevated text-fg rounded-md border border-line text-xs font-semibold flex items-center gap-2 shadow-sm transition-colors"
              >
                <FolderOpen size={16} className="text-accent" />
                <span>{t('Selecionar pastas')}</span>
              </button>
            </div>
          )
        ) : error ? (
          <div className="p-4 bg-red-950/30 border border-red-800 rounded-md text-red-300 text-xs">
            {error}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-fg-muted text-xs">
            {t('Nenhum item corresponde ao filtro atual.')}
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View */
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
            {filteredItems.map((item) => {
              return (
                <div
                  key={item.path}
                  onClick={() => handleItemClick(item)}
                  className="group flex flex-col bg-surface hover:bg-subtle border border-line hover:border-accent rounded-md p-2.5 cursor-pointer transition-all shadow-sm relative"
                >
                  {item.isDirectory && (
                    <button
                      type="button"
                      onClick={(e) => handleSetItemCover(e, item.path)}
                      className="absolute -top-1.5 -left-1.5 z-20 w-5 h-5 rounded-full bg-subtle hover:bg-elevated text-accent hover:text-accent-hover flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow border border-line"
                      title={t('Definir capa desta subpasta')}
                    >
                      <ImageIcon size={10} />
                    </button>
                  )}
                  <div className="w-full h-24 rounded bg-canvas flex items-center justify-center overflow-hidden mb-2 relative">
                    {item.isDirectory ? (
                      item.coverPath ? (
                        <div className="relative w-full h-full">
                          <img
                            src={toMediaUrl(item.coverPath)}
                            alt={item.name}
                            loading="lazy"
                            className="w-full h-full object-cover rounded group-hover:scale-105 transition-transform"
                          />
                          <div className="absolute top-1 left-1 bg-blue-600/80 backdrop-blur-sm p-1 rounded text-white shadow">
                            <Folder size={12} />
                          </div>
                          {item.imageCount !== undefined && item.imageCount > 0 && (
                            <div className="absolute bottom-1 right-1 bg-black/75 px-1.5 py-0.5 rounded text-[10px] font-mono text-white">
                              {item.imageCount} p
                            </div>
                          )}
                        </div>
                      ) : (
                        <Folder size={36} className="text-blue-400 group-hover:scale-110 transition-transform" />
                      )
                    ) : item.isImage ? (
                      <img
                        src={toMediaUrl(item.path)}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover rounded group-hover:scale-105 transition-transform"
                      />
                    ) : item.isVideo ? (
                      <Film size={34} className="text-purple-400 group-hover:scale-110 transition-transform" />
                    ) : item.isArchive ? (
                      item.name.endsWith('.tachibk') ? (
                        <Database size={34} className="text-cyan-400 group-hover:scale-110 transition-transform" />
                      ) : (
                        <FileArchive size={34} className="text-amber-400 group-hover:scale-110 transition-transform" />
                      )
                    ) : (
                      <FileText size={32} className="text-gray-400" />
                    )}

                    {item.isVideo && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Play size={24} className="text-white" />
                      </div>
                    )}

                    {item.isDirectory && item.imageCount !== undefined && item.imageCount > 0 && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={(e) => handleReadFolderDirectly(item, e)}
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold shadow-lg transition-transform hover:scale-105"
                          title={t('Ler obra completa')}
                        >
                          <BookOpen size={12} />
                          <span>{t('Ler')}</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <span className="text-xs font-medium text-fg truncate w-full" title={item.name}>
                    {item.name}
                  </span>
                  <span className="text-[10px] text-fg-muted font-mono mt-0.5">
                    {item.isDirectory 
                      ? (item.imageCount ? tn(item.imageCount, '{n} imagem', '{n} imagens') : t('Pasta')) 
                      : formatFileSize(item.size)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View */
          <div className="flex flex-col border border-line rounded-md overflow-hidden divide-y divide-line">
            {filteredItems.map((item) => (
              <div
                key={item.path}
                onClick={() => handleItemClick(item)}
                className="flex items-center justify-between px-3 py-2 bg-surface hover:bg-subtle cursor-pointer text-xs transition-colors"
              >
                <div className="flex items-center gap-3 truncate">
                  {item.isDirectory ? (
                    item.coverPath ? (
                      <img
                        src={toMediaUrl(item.coverPath)}
                        alt={item.name}
                        className="w-6 h-6 object-cover rounded flex-shrink-0"
                      />
                    ) : (
                      <Folder size={16} className="text-blue-400 flex-shrink-0" />
                    )
                  ) : item.isImage ? (
                    <img
                      src={toMediaUrl(item.path)}
                      alt={item.name}
                      className="w-6 h-6 object-cover rounded flex-shrink-0"
                    />
                  ) : item.isVideo ? (
                    <Film size={16} className="text-purple-400 flex-shrink-0" />
                  ) : item.isArchive ? (
                    <FileArchive size={16} className="text-amber-400 flex-shrink-0" />
                  ) : (
                    <FileText size={16} className="text-gray-400 flex-shrink-0" />
                  )}
                  <span className="text-fg font-medium truncate" title={item.name}>
                    {item.name}
                  </span>
                </div>

                <div className="flex items-center gap-4 text-[11px] font-mono text-fg-muted flex-shrink-0">
                  <span>{item.isDirectory ? t('Pasta') : formatFileSize(item.size)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
