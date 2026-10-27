import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { 
  Film, 
  Search, 
  RotateCw, 
  FolderPlus, 
  Play, 
  ArrowLeft, 
  ArrowUp,
  ExternalLink, 
  Loader2, 
  HardDrive,
  Folder,
  Image as ImageIcon,
  ChevronRight,
  Trash2,
  FolderCheck
} from 'lucide-react';
import { useLocalFolders } from '../hooks/useLocalFolders';
import { FolderGrid, type FolderItem } from './FolderGrid';
import { VideoPlayer } from './VideoPlayer';
import type { VideoItem, TabType, LocalFileItem } from '../types';
import { LABELS } from '../constants/labels';
import { toMediaUrl } from '../utils/mediaUrl';
import { t, tn, tMaybe, locale } from '../i18n';

interface LocalVideoLibraryProps {
  onOpenTab?: (typeOrTab: TabType | any, title?: string, data?: any) => void;
}

export const LocalVideoLibrary: React.FC<LocalVideoLibraryProps> = ({ onOpenTab }) => {
  const { folders, addFolders, removeFolder, setAllFolders } = useLocalFolders('video');
  const [currentPath, setCurrentPath] = useState<string>('');
  const [currentItems, setCurrentItems] = useState<LocalFileItem[]>([]);
  const [loadingDir, setLoadingDir] = useState(false);
  const [dirError, setDirError] = useState<string | null>(null);

  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [query, setQuery] = useState('');
  const [selectedExt, setSelectedExt] = useState<string>('all');
  const [scanning, setScanning] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const statusTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  const hasAutoScannedRef = React.useRef(false);
  const [selected, setSelected] = useState<VideoItem | null>(null);
  const [commonRoot, setCommonRoot] = useState<string | null>(null);

  // Carrega conteúdo de uma pasta específica no estilo Windows Explorer
  const loadDirectory = useCallback(async (dirPath: string, isRefresh = false) => {
    if (!dirPath) {
      setCurrentPath('');
      setCurrentItems([]);
      return;
    }
    const readDir = window.electronAPI?.readDirectory || (window.api as any)?.readDirectory;
    if (!readDir) {
      setDirError(t('API de leitura de diretório não disponível.'));
      return;
    }

    setLoadingDir(true);
    setDirError(null);
    try {
      const res = await readDir(dirPath);
      if (res.success && Array.isArray(res.items)) {
        if (isRefresh) {
          const prevPaths = new Set(currentItems.map((i) => i.path));
          const newItems = (res.items || []).filter((i: LocalFileItem) => !prevPaths.has(i.path));
          if (newItems.length > 0) {
            setUpdateStatus(tn(newItems.length, 'Pasta atualizada: {n} novo arquivo encontrado!', 'Pasta atualizada: {n} novos arquivos encontrados!'));
          } else {
            setUpdateStatus(tn(res.items.length, 'Pasta atualizada: tudo em dia ({n} item).', 'Pasta atualizada: tudo em dia ({n} itens).'));
          }
          setLastUpdated(new Date());
          if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
          statusTimeoutRef.current = setTimeout(() => setUpdateStatus(null), 4500);
        }
        setCurrentItems(res.items);
        setCurrentPath(dirPath);
      } else {
        setDirError(tMaybe(res.error) || t('Não foi possível ler o conteúdo da pasta.'));
      }
    } catch (err: any) {
      setDirError(tMaybe(err.message) || t('Erro ao carregar diretório.'));
    } finally {
      setLoadingDir(false);
    }
  }, [currentItems]);

  // Varredura recursiva de vídeos para busca global e atualização
  const scan = useCallback(async (targetFolders: string[] = folders, options: { isManual?: boolean; isAuto?: boolean } = {}) => {
    if (!targetFolders.length) {
      setVideos([]);
      return;
    }
    setScanning(true);
    if (options.isManual) {
      setUpdateStatus(t('Verificando alterações e novos vídeos...'));
    }
    try {
      const scanFn = window.api?.scanVideos || window.electronAPI?.scanVideos;
      if (scanFn) {
        const found = await scanFn(targetFolders);
        let prevPaths: string[] = [];
        try {
          const prevPathsRaw = localStorage.getItem('video_known_paths');
          if (prevPathsRaw) prevPaths = JSON.parse(prevPathsRaw);
        } catch {}

        const prevSet = new Set(prevPaths);
        const newlyFound = (found || []).filter((v) => !prevSet.has(v.path));

        const allPaths = (found || []).map((v) => v.path);
        localStorage.setItem('video_known_paths', JSON.stringify(allPaths));

        setVideos(found || []);
        setLastUpdated(new Date());

        if (options.isManual || options.isAuto) {
          if (newlyFound.length > 0 && prevPaths.length > 0) {
            setUpdateStatus(tn(newlyFound.length, 'Scan concluído: {n} novo vídeo detectado!', 'Scan concluído: {n} novos vídeos detectados!'));
          } else if (options.isAuto) {
            setUpdateStatus(tn((found || []).length, 'Varredura inicial concluída: {n} vídeo indexado.', 'Varredura inicial concluída: {n} vídeos indexados.'));
          } else {
            setUpdateStatus(tn((found || []).length, 'Pastas atualizadas: tudo em dia ({n} vídeo no total).', 'Pastas atualizadas: tudo em dia ({n} vídeos no total).'));
          }
          if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
          statusTimeoutRef.current = setTimeout(() => setUpdateStatus(null), 4500);
        }
      }
    } catch (err) {
      console.error('Erro ao indexar vídeos:', err);
      setUpdateStatus(t('Erro ao verificar pastas de vídeos.'));
    } finally {
      setScanning(false);
    }
  }, [folders]);

  // Varredura automática na primeira vez que acessar os vídeos locais
  useEffect(() => {
    const sessionKey = 'local_videos_first_scan_done';
    const alreadyScanned = sessionStorage.getItem(sessionKey);
    if (!hasAutoScannedRef.current && !alreadyScanned && folders.length > 0) {
      hasAutoScannedRef.current = true;
      sessionStorage.setItem(sessionKey, 'true');
      scan(folders, { isAuto: true });
    } else {
      scan(folders);
    }
  }, [folders, scan]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  const handleAddFolders = async () => {
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
        // Permanece na raiz da biblioteca para que o usuário veja a pasta pai adicionada
        setCurrentPath('');
      }
    } catch (err) {
      console.error('Erro ao selecionar pastas:', err);
    }
  };

  const handleRemoveFolder = (pathToRemove: string) => {
    removeFolder(pathToRemove);
    setVideos((prev) => prev.filter((v) => v.rootPath !== pathToRemove && !v.path.startsWith(pathToRemove)));
    if (selected && (selected.rootPath === pathToRemove || selected.path.startsWith(pathToRemove))) {
      setSelected(null);
    }
    if (currentPath === pathToRemove || currentPath.startsWith(pathToRemove)) {
      setCurrentPath('');
      setCurrentItems([]);
    }
  };

  const handleConsolidateRoot = () => {
    if (!commonRoot) return;
    setAllFolders([commonRoot]);
    setCommonRoot(null);
    loadDirectory(commonRoot);
  };

  const handleClearAllFolders = () => {
    setAllFolders([]);
    setCommonRoot(null);
    setCurrentPath('');
    setCurrentItems([]);
    setVideos([]);
  };

  const handleNavigateUp = () => {
    if (!currentPath) return;
    const normCurrent = currentPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const isRootFolder = folders.some((f) => f.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() === normCurrent.toLowerCase());
    if (isRootFolder) {
      setCurrentPath('');
      setCurrentItems([]);
      return;
    }
    const parts = normCurrent.split('/').filter(Boolean);
    if (parts.length <= 1) {
      setCurrentPath('');
      setCurrentItems([]);
      return;
    }
    parts.pop();
    let parent = parts.join('/');
    if (/^[A-Za-z]:$/.test(parts[0])) {
      parent = parts[0] + '/' + parts.slice(1).join('/');
    }
    loadDirectory(parent);
  };

  // Define capa para a pasta aberta atualmente
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

  // Define capa para uma subpasta exibida
  const handleSetSubfolderCover = async (e: React.MouseEvent, subfolderPath: string) => {
    e.stopPropagation();
    const selectCover = window.api?.selectCoverImage || (window.electronAPI as any)?.selectCoverImage;
    const setCoverFn = window.api?.setFolderCover || (window.electronAPI as any)?.setFolderCover;
    if (!selectCover || !setCoverFn) return;
    try {
      const chosen = await selectCover();
      if (chosen) {
        const res = await setCoverFn(subfolderPath, chosen);
        if (res?.success) {
          setCurrentItems((prev) =>
            prev.map((it) => (it.path === subfolderPath ? { ...it, coverPath: res.coverPath || chosen } : it))
          );
        }
      }
    } catch (err) {
      console.error('Erro ao definir capa da subpasta:', err);
    }
  };

  // Divide itens da pasta atual em subpastas e vídeos
  const currentSubfolders = useMemo(() => {
    return currentItems.filter((i) => i.isDirectory);
  }, [currentItems]);

  const currentVideos = useMemo(() => {
    const vids = currentItems.filter((i) => i.isVideo);
    if (selectedExt === 'all') return vids;
    return vids.filter((v) => v.ext.toLowerCase() === selectedExt.toLowerCase());
  }, [currentItems, selectedExt]);

  const availableExtensions = useMemo(() => {
    const exts = new Set<string>();
    currentItems.filter((i) => i.isVideo).forEach((v) => {
      if (v.ext) exts.add(v.ext.toLowerCase());
    });
    return Array.from(exts).sort();
  }, [currentItems]);

  // Resultados da busca global
  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return videos.filter((v) =>
      v.name.toLowerCase().includes(q) || v.path.toLowerCase().includes(q)
    );
  }, [videos, query]);

  // Itens de pasta para o FolderGrid na visão raiz
  const rootFolderItems = useMemo<FolderItem[]>(() => {
    return folders.map((f) => {
      const count = videos.filter((v) => v.rootPath === f || (!v.rootPath && v.path.startsWith(f))).length;
      const name = f.split(/[\\/]/).filter(Boolean).pop() || f;
      return {
        path: f,
        name,
        count,
      };
    });
  }, [folders, videos]);

  const breadcrumbParts = currentPath ? currentPath.split(/[\\/]/).filter(Boolean) : [];

  if (selected) {
    return (
      <div className="flex flex-col h-full w-full bg-canvas text-fg-2 overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-surface border-b border-line text-xs z-10">
          <button
            type="button"
            onClick={() => setSelected(null)}
            className="flex items-center gap-1.5 text-accent hover:text-accent-hover px-2 py-1 rounded bg-subtle hover:bg-elevated border border-line transition-colors"
          >
            <ArrowLeft size={14} />
            <span className="font-medium">{t('Voltar à pasta')}</span>
          </button>

          <span className="text-xs text-fg-muted font-mono truncate max-w-md" title={selected.path}>
            {selected.name}
          </span>

          {onOpenTab && (
            <button
              type="button"
              onClick={() => {
                onOpenTab('video-player', selected.name, {
                  filePath: selected.path,
                  title: selected.name,
                  item: selected
                });
              }}
              className="flex items-center gap-1 text-xs text-fg-muted hover:text-white px-2 py-1 rounded border border-line hover:bg-subtle transition-colors"
              title={t('Abrir em uma nova aba dedicada')}
            >
              <ExternalLink size={13} />
              <span>{t('Abrir em aba')}</span>
            </button>
          )}
        </div>

        <div className="flex-1 overflow-hidden relative">
          <VideoPlayer video={selected} item={selected} onClose={() => setSelected(null)} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-canvas text-fg-2 select-none overflow-hidden">
      {/* Barra Superior de Ações e Busca */}
      <div className="p-2.5 bg-surface border-b border-line flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded bg-purple-950/60 border border-purple-800/80 text-purple-400">
            <Film size={16} />
          </div>
          <div>
            <h3 className="font-semibold text-fg text-sm leading-none">{LABELS.videos}</h3>
            <span className="text-[10px] text-fg-muted font-mono">
              {tn(folders.length, '{n} pasta raiz indexada', '{n} pastas raiz indexadas')}
            </span>
          </div>
        </div>

        {/* Campo de Busca */}
        <div className="flex-1 max-w-md relative">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Buscar vídeos por nome ou arquivo...')}
            className="w-full bg-canvas border border-line focus:border-accent rounded-md pl-8 pr-3 py-1.5 text-xs text-fg outline-none transition-colors"
          />
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
        </div>

        {/* Botões de Ação */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddFolders}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-2 hover:text-white rounded border border-line transition-colors"
            title={t('Adicionar pastas de vídeos')}
          >
            <FolderPlus size={14} className="text-accent" />
            <span>{t('Adicionar Pastas')}</span>
          </button>

          <button
            type="button"
            onClick={() => scan(folders, { isManual: true })}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-subtle hover:bg-elevated text-white rounded border border-line disabled:opacity-50 transition-colors"
            title={t('Atualizar e verificar novos vídeos nas pastas')}
          >
            <RotateCw size={14} className={scanning ? 'animate-spin text-accent' : 'text-emerald-400'} />
            <span>{scanning ? t('Verificando...') : t('Atualizar Pastas')}</span>
          </button>
        </div>
      </div>

      {/* Banner de Status de Atualização / Scan */}
      {updateStatus && (
        <div className="px-3 py-1.5 bg-surface border-b border-line flex items-center justify-between text-xs text-blue-200">
          <div className="flex items-center gap-2">
            <RotateCw size={12} className={scanning ? 'animate-spin text-accent' : 'text-emerald-400'} />
            <span>{updateStatus}</span>
          </div>
          <button
            type="button"
            onClick={() => setUpdateStatus(null)}
            className="text-fg-muted hover:text-white px-1 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Banner de Consolidação de Raiz Comum (caso existam 190 subpastas antigas) */}
      {commonRoot && folders.length > 5 && !currentPath && (
        <div className="px-4 py-2 bg-blue-950/40 border-b border-blue-800/60 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-blue-200">
            <FolderCheck size={16} className="text-accent flex-shrink-0" />
            <span>
              {t('Detectamos que suas')} <strong>{folders.length}</strong> {t('pastas pertencem à raiz')}{' '}
              <strong className="text-white font-mono bg-blue-900/60 px-1.5 py-0.5 rounded">{commonRoot}</strong>.{' '}
              {t('Deseja consolidar para navegar por subpastas como no Windows?')}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={handleConsolidateRoot}
              className="px-2.5 py-1 bg-accent hover:bg-accent-hover text-canvas font-semibold rounded transition-colors text-xs shadow-sm"
            >
              {t('Consolidar na Raiz')}
            </button>
            <button
              type="button"
              onClick={handleClearAllFolders}
              className="px-2.5 py-1 bg-subtle hover:bg-red-900/50 text-fg-muted hover:text-red-300 rounded border border-line transition-colors text-xs flex items-center gap-1"
              title={t('Limpar todas as pastas para adicionar do zero')}
            >
              <Trash2 size={12} />
              <span>{t('Limpar Todas')}</span>
            </button>
            <button
              type="button"
              onClick={() => setCommonRoot(null)}
              className="text-fg-muted hover:text-white px-1 text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Barra de Navegação Estilo Windows Explorer (Breadcrumbs e Controles da Pasta Atual) */}
      {currentPath && (
        <div className="px-3 py-1.5 bg-surface border-b border-line flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={handleNavigateUp}
              className="p-1.5 text-fg-muted hover:text-white hover:bg-subtle rounded transition-colors border border-line"
              title={t('Pasta Acima (Nível Superior)')}
            >
              <ArrowUp size={14} />
            </button>
            <button
              type="button"
              onClick={() => loadDirectory(currentPath, true)}
              disabled={loadingDir}
              className="p-1.5 text-fg-muted hover:text-white hover:bg-subtle rounded disabled:opacity-40 transition-colors border border-line"
              title={t('Atualizar pasta e verificar se há novos arquivos')}
            >
              <RotateCw size={14} className={loadingDir ? 'animate-spin text-accent' : ''} />
            </button>
          </div>

          {/* Breadcrumbs de Navegação */}
          <div className="flex-1 flex items-center gap-1 overflow-x-auto bg-canvas px-3 py-1 rounded border border-line text-xs font-mono scrollbar-none">
            <button
              type="button"
              onClick={() => {
                setCurrentPath('');
                setCurrentItems([]);
              }}
              className="hover:underline text-accent font-semibold flex-shrink-0"
              title={t('Voltar ao início da biblioteca')}
            >
              {t('Início')}
            </button>
            <ChevronRight size={12} className="text-line flex-shrink-0" />

            {breadcrumbParts.map((part, idx) => {
              const subPath = breadcrumbParts.slice(0, idx + 1).join('/');
              const isLast = idx === breadcrumbParts.length - 1;
              return (
                <React.Fragment key={subPath + idx}>
                  <button
                    type="button"
                    onClick={() => loadDirectory(subPath)}
                    className={`hover:underline truncate max-w-[140px] ${
                      isLast ? 'text-fg font-semibold' : 'text-fg-muted'
                    }`}
                    title={subPath}
                  >
                    {part}
                  </button>
                  {!isLast && <ChevronRight size={12} className="text-line flex-shrink-0" />}
                </React.Fragment>
              );
            })}
          </div>

          {/* Botão para Definir Imagem de Capa para a Pasta Atual */}
          <button
            type="button"
            onClick={handleSetCurrentFolderCover}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-subtle hover:bg-elevated text-accent hover:text-accent-hover rounded border border-line text-xs transition-colors flex-shrink-0"
            title={t('Escolher uma imagem do computador como capa desta pasta')}
          >
            <ImageIcon size={13} />
            <span>{t('Definir Capa')}</span>
          </button>
        </div>
      )}

      {/* Barra de Filtro de Extensão quando navegando na pasta */}
      {currentPath && availableExtensions.length > 1 && (
        <div className="px-3 py-1 bg-surface border-b border-line-subtle flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-[10px] uppercase font-bold text-fg-muted mr-1">{t('Formato:')}</span>
          <button
            type="button"
            onClick={() => setSelectedExt('all')}
            className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
              selectedExt === 'all'
                ? 'bg-subtle text-accent border-accent'
                : 'bg-canvas text-fg-muted border-line hover:text-white'
            }`}
          >
            {t('Todos ({n})', { n: currentItems.filter((i) => i.isVideo).length })}
          </button>
          {availableExtensions.map((ext) => {
            const count = currentItems.filter((i) => i.isVideo && i.ext.toLowerCase() === ext).length;
            return (
              <button
                key={ext}
                type="button"
                onClick={() => setSelectedExt(ext)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  selectedExt === ext
                    ? 'bg-subtle text-accent border-accent'
                    : 'bg-canvas text-fg-muted border-line hover:text-white'
                }`}
              >
                {ext.toUpperCase().replace('.', '')} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Conteúdo Principal */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Caso de Busca Ativa */}
        {query.trim().length > 0 ? (
          <div>
            <div className="flex items-center justify-between text-xs text-fg-muted mb-3 pb-2 border-b border-line-subtle">
              <span>
                {tn(searchResults.length, 'Resultados para "{query}" ({n} encontrado)', 'Resultados para "{query}" ({n} encontrados)', { query })}
              </span>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-accent hover:underline"
              >
                {t('Limpar busca')}
              </button>
            </div>

            {searchResults.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center text-fg-muted text-xs">
                {t('Nenhum vídeo encontrado para "{query}".', { query })}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {searchResults.map((v) => {
                  const mb = (v.size / (1024 * 1024)).toFixed(1);
                  return (
                    <div
                      key={v.path}
                      onClick={() => setSelected(v)}
                      className="group flex flex-col bg-surface hover:bg-subtle border border-line hover:border-accent rounded-md p-3 cursor-pointer transition-all shadow-sm relative text-left"
                    >
                      <div className="w-full h-28 rounded bg-canvas flex items-center justify-center overflow-hidden mb-2.5 relative border border-line-subtle">
                        {v.coverPath ? (
                          <img
                            src={toMediaUrl(v.coverPath)}
                            alt={v.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <Film size={36} className="text-purple-400 group-hover:scale-110 transition-transform" />
                        )}
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <div className="w-10 h-10 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow">
                            <Play size={18} className="ml-0.5" />
                          </div>
                        </div>
                        <div className="absolute top-1.5 right-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[10px] font-mono text-purple-300 uppercase">
                          {v.ext.replace('.', '')}
                        </div>
                      </div>

                      <h4 className="text-xs font-semibold text-fg truncate w-full" title={v.name}>
                        {v.name}
                      </h4>
                      <p className="text-[11px] text-fg-muted truncate mt-0.5" title={v.path}>
                        {v.path}
                      </p>

                      <div className="flex items-center justify-between text-[10px] text-accent font-mono mt-2 pt-2 border-t border-line-subtle">
                        <span>{mb} MB</span>
                        {onOpenTab && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenTab('video-player', v.name, {
                                filePath: v.path,
                                title: v.name,
                                item: v
                              });
                            }}
                            className="hover:text-white transition-colors"
                            title={t('Abrir em aba')}
                          >
                            <ExternalLink size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : !currentPath ? (
          /* Visão Raiz: Nenhuma pasta ou Grid das Pastas Principais Adicionadas */
          folders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-72 text-center text-fg-muted p-6">
              <div className="w-16 h-16 rounded-full bg-surface border border-line flex items-center justify-center mb-3 text-purple-400">
                <HardDrive size={32} />
              </div>
              <h3 className="text-base font-semibold text-fg mb-1">{t('Nenhuma pasta de vídeos adicionada')}</h3>
              <p className="text-xs max-w-sm mb-4">
                {t('Selecione a pasta do seu computador onde estão seus vídeos ou animes. Você poderá navegar por subpastas como no Windows Explorer.')}
              </p>
              <button
                type="button"
                onClick={handleAddFolders}
                className="flex items-center gap-2 px-4 py-2 bg-purple-900/40 hover:bg-purple-800/60 text-purple-200 rounded-md border border-purple-700 text-xs font-semibold transition-colors shadow-sm"
              >
                <FolderPlus size={16} />
                <span>{t('Selecionar Pasta de Vídeos')}</span>
              </button>
            </div>
          ) : (
            <div>
              <div className="flex items-center justify-between pb-2 mb-3 border-b border-line-subtle">
                <div className="flex items-center gap-2 text-xs">
                  <span className="font-semibold text-fg">
                    {t('Pastas Raiz ({n})', { n: folders.length })}
                  </span>
                  {lastUpdated && (
                    <span className="text-[10px] text-fg-muted">
                      • {t('Atualizado às {time}', { time: lastUpdated.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' }) })}
                    </span>
                  )}
                  <span className="text-fg-muted hidden sm:inline">•</span>
                  <span className="text-fg-muted hidden sm:inline">
                    {t('Clique em uma pasta para navegar em suas subpastas')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => scan(folders, { isManual: true })}
                    disabled={scanning}
                    className="flex items-center gap-1.5 px-3 py-1 bg-subtle hover:bg-elevated text-emerald-400 hover:text-emerald-300 rounded border border-line text-xs transition-colors"
                    title={t('Escanear e verificar se há novos vídeos nas pastas')}
                  >
                    <RotateCw size={13} className={scanning ? 'animate-spin text-accent' : ''} />
                    <span>{scanning ? t('Escaneando...') : t('Atualizar / Scan')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAllFolders}
                    className="text-xs text-fg-muted hover:text-red-400 transition-colors flex items-center gap-1 px-2 py-1 rounded hover:bg-subtle"
                    title={t('Remover todas as pastas salvas da lista')}
                  >
                    <Trash2 size={12} />
                    <span>{t('Limpar todas')}</span>
                  </button>
                </div>
              </div>

              <FolderGrid
                folders={rootFolderItems}
                mediaType="video"
                onOpen={(p) => loadDirectory(p)}
                onRemove={handleRemoveFolder}
                emptyText={t('Nenhuma pasta de vídeo adicionada.')}
              />
            </div>
          )
        ) : loadingDir ? (
          <div className="flex flex-col items-center justify-center h-64 text-fg-muted gap-3">
            <Loader2 size={32} className="animate-spin text-accent" />
            <span className="text-xs">{t('Carregando conteúdo da pasta...')}</span>
          </div>
        ) : dirError ? (
          <div className="p-4 bg-red-950/30 border border-red-800 rounded-md text-red-300 text-xs flex flex-col gap-2">
            <span>{dirError}</span>
            <button
              type="button"
              onClick={() => {
                setCurrentPath('');
                setCurrentItems([]);
              }}
              className="self-start text-accent hover:underline"
            >
              {t('Voltar ao Início')}
            </button>
          </div>
        ) : (
          /* Navegação Hierárquica da Pasta Atual (Subpastas + Vídeos) */
          <div className="flex flex-col gap-6">
            {/* Seção de Subpastas */}
            {currentSubfolders.length > 0 && (
              <div>
                <div className="flex items-center gap-2 pb-2 mb-3 border-b border-line-subtle text-xs">
                  <Folder size={14} className="text-accent" />
                  <span className="font-semibold text-fg">
                    {t('Subpastas ({n})', { n: currentSubfolders.length })}
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                  {currentSubfolders.map((sub) => (
                    <div
                      key={sub.path}
                      onClick={() => loadDirectory(sub.path)}
                      className="group relative flex flex-col items-center bg-surface hover:bg-subtle border border-line hover:border-accent rounded-lg p-2.5 cursor-pointer transition-all shadow-sm"
                    >
                      {/* Botão de definir capa para a subpasta no hover */}
                      <button
                        type="button"
                        onClick={(e) => handleSetSubfolderCover(e, sub.path)}
                        className="absolute -top-2 -left-2 z-20 w-6 h-6 rounded-full bg-subtle hover:bg-elevated text-accent hover:text-accent-hover
                                   flex items-center justify-center opacity-0 group-hover:opacity-100
                                   transition-opacity shadow border border-line"
                        title={t('Definir imagem de capa para esta subpasta')}
                      >
                        <ImageIcon size={12} />
                      </button>

                      <div className="w-full aspect-[3/4] rounded-md overflow-hidden bg-canvas flex items-center justify-center relative border border-line-subtle mb-2">
                        {sub.coverPath ? (
                          <img
                            src={toMediaUrl(sub.coverPath)}
                            alt={sub.name}
                            loading="lazy"
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <Folder size={44} className="text-purple-400 group-hover:scale-105 transition-transform" />
                        )}

                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-2">
                          <span
                            onClick={(e) => handleSetSubfolderCover(e, sub.path)}
                            className="text-[10px] font-medium bg-surface/90 hover:bg-subtle text-accent hover:text-accent-hover px-2 py-0.5 rounded border border-line shadow flex items-center gap-1"
                          >
                            <ImageIcon size={10} />
                            <span>{t('Capa')}</span>
                          </span>
                        </div>
                      </div>

                      <span className="text-xs text-fg font-medium text-center truncate w-full group-hover:text-accent transition-colors" title={sub.name}>
                        {sub.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Seção de Arquivos de Vídeo */}
            {currentVideos.length > 0 && (
              <div>
                <div className="flex items-center gap-2 pb-2 mb-3 border-b border-line-subtle text-xs">
                  <Film size={14} className="text-purple-400" />
                  <span className="font-semibold text-fg">
                    {t('Vídeos ({n})', { n: currentVideos.length })}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                  {currentVideos.map((item) => {
                    const videoItem: VideoItem = {
                      name: item.name,
                      path: item.path,
                      size: item.size,
                      mtime: item.mtime,
                      ext: item.ext,
                      coverPath: item.coverPath,
                      rootPath: currentPath,
                    };
                    const mb = (item.size / (1024 * 1024)).toFixed(1);

                    return (
                      <div
                        key={item.path}
                        onClick={() => setSelected(videoItem)}
                        className="group flex flex-col bg-surface hover:bg-subtle border border-line hover:border-accent rounded-md p-3 cursor-pointer transition-all shadow-sm relative text-left"
                      >
                        <div className="w-full h-28 rounded bg-canvas flex items-center justify-center overflow-hidden mb-2.5 relative border border-line-subtle">
                          {item.coverPath ? (
                            <img
                              src={toMediaUrl(item.coverPath)}
                              alt={item.name}
                              loading="lazy"
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <Film size={36} className="text-purple-400 group-hover:scale-110 transition-transform" />
                          )}
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-10 h-10 rounded-full bg-purple-600/90 text-white flex items-center justify-center shadow">
                              <Play size={18} className="ml-0.5" />
                            </div>
                          </div>
                          <div className="absolute top-1.5 right-1.5 bg-black/70 px-1.5 py-0.5 rounded text-[10px] font-mono text-purple-300 uppercase">
                            {item.ext.replace('.', '')}
                          </div>
                        </div>

                        <h4 className="text-xs font-semibold text-fg truncate w-full" title={item.name}>
                          {item.name}
                        </h4>

                        <div className="flex items-center justify-between text-[10px] text-accent font-mono mt-2 pt-2 border-t border-line-subtle">
                          <span>{mb} MB</span>
                          {onOpenTab && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenTab('video-player', item.name, {
                                  filePath: item.path,
                                  title: item.name,
                                  item: videoItem
                                });
                              }}
                              className="hover:text-white transition-colors"
                              title={t('Abrir em aba dedicada')}
                            >
                              <ExternalLink size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Mensagem se não houver subpastas nem vídeos na pasta atual */}
            {currentSubfolders.length === 0 && currentVideos.length === 0 && (
              <div className="flex flex-col items-center justify-center h-48 text-center text-fg-muted text-xs">
                <span>{t('Esta pasta não contém vídeos ou subpastas compatíveis.')}</span>
                <button
                  type="button"
                  onClick={handleNavigateUp}
                  className="mt-3 text-accent hover:underline"
                >
                  {t('Voltar à pasta anterior')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
