import React, { useEffect, useState } from 'react';
import { Folder, Film, X, Loader2, Image as ImageIcon } from 'lucide-react';
import { t, tn } from '../i18n';

export interface FolderItem {
  path: string;
  name: string;
  count?: number;
  coverPath?: string | null;
}

interface FolderGridProps {
  folders: FolderItem[];
  onRemove?: (path: string) => void;
  onOpen: (path: string) => void; // abrir a pasta (mangá/vídeo)
  emptyText?: string;
  mediaType?: 'image' | 'video';
  onCoverChange?: (path: string, newCover: string) => void;
}

export function FolderCard({
  item,
  onRemove,
  onOpen,
  mediaType = 'image',
  onCoverChange,
}: {
  item: FolderItem;
  onRemove?: (p: string) => void;
  onOpen: (p: string) => void;
  mediaType?: 'image' | 'video';
  onCoverChange?: (path: string, newCover: string) => void;
}) {
  const [cover, setCover] = useState<string | null>(item.coverPath || null);
  const [loading, setLoading] = useState(!item.coverPath);

  useEffect(() => {
    let active = true;
    if (item.coverPath) {
      setCover(item.coverPath);
      setLoading(false);
      return;
    }
    setLoading(true);
    const getFirstImage = window.api?.getFirstImage || window.electronAPI?.getFirstImage;
    if (getFirstImage) {
      getFirstImage(item.path)
        .then((img: string | null) => {
          if (active) {
            setCover(img);
            setLoading(false);
          }
        })
        .catch(() => {
          if (active) {
            setCover(null);
            setLoading(false);
          }
        });
    } else {
      setLoading(false);
    }
    return () => {
      active = false;
    };
  }, [item.path, item.coverPath]);

  const handleSetCover = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const selectCover = window.api?.selectCoverImage || window.electronAPI?.selectCoverImage;
    const setCoverFn = window.api?.setFolderCover || window.electronAPI?.setFolderCover;
    if (!selectCover || !setCoverFn) return;
    try {
      const chosen = await selectCover();
      if (chosen) {
        setLoading(true);
        const res = await setCoverFn(item.path, chosen);
        if (res.success && res.coverPath) {
          setCover(res.coverPath);
          onCoverChange?.(item.path, res.coverPath);
        }
        setLoading(false);
      }
    } catch (err) {
      console.error('Erro ao definir capa:', err);
      setLoading(false);
    }
  };

  const getFileUrl = (p: string) => {
    if (window.api?.toMediaUrl) return window.api.toMediaUrl(p);
    if (window.electronAPI?.toMediaUrl) return window.electronAPI.toMediaUrl(p);
    if (window.api?.fileUrl) return window.api.fileUrl(p);
    const normalized = p.replace(/\\/g, '/').replace(/^\/+/, '');
    const encoded = normalized
      .split('/')
      .map((seg, idx) => {
        if (idx === 0 && /^[A-Za-z]:$/.test(seg)) return seg;
        return encodeURIComponent(seg);
      })
      .join('/');
    return `media-file:///${encoded}`;
  };

  return (
    <div className="group relative w-36 sm:w-40 flex flex-col items-center">
      {/* Botão Alterar Capa — canto superior esquerdo no hover */}
      <button
        type="button"
        onClick={handleSetCover}
        className="absolute -top-2 -left-2 z-20 w-6 h-6 rounded-full bg-subtle hover:bg-elevated text-accent hover:text-accent-hover
                   flex items-center justify-center opacity-0 group-hover:opacity-100
                   transition-opacity shadow cursor-pointer border border-line"
        title={t('Definir imagem de capa para esta pasta')}
      >
        <ImageIcon size={12} strokeWidth={2} />
      </button>

      {/* Botão X — visível no hover se onRemove estiver definido */}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.path);
          }}
          className="absolute -top-2 -right-2 z-20 w-6 h-6 rounded-full bg-danger-fg hover:bg-danger text-white
                     flex items-center justify-center opacity-0 group-hover:opacity-100
                     transition-opacity shadow cursor-pointer border border-danger-fg/50"
          title={t('Remover pasta da biblioteca')}
        >
          <X size={13} strokeWidth={2.5} />
        </button>
      )}

      {/* Capa / ícone */}
      <button
        type="button"
        onClick={() => onOpen(item.path)}
        className="w-full aspect-[3/4] rounded-lg overflow-hidden border border-line
                   bg-surface flex items-center justify-center hover:border-accent hover:shadow-lg
                   transition-all relative cursor-pointer group-hover:scale-[1.02]"
      >
        {loading ? (
          <Loader2 size={22} className="text-fg-muted animate-spin" />
        ) : cover ? (
          <img
            src={getFileUrl(cover)}
            alt={item.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              console.warn('[FolderCard cover error]:', cover, getFileUrl(cover));
              (e.target as HTMLElement).style.display = 'none';
              setCover(null);
            }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 p-3 text-center">
            {mediaType === 'video' ? (
              <Film size={46} className="text-purple-400" />
            ) : (
              <Folder size={46} className="text-accent" />
            )}
          </div>
        )}

        {/* Overlay sutil ao passar o mouse com botão Alterar Capa */}
        <div className="absolute inset-0 bg-accent/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none flex flex-col justify-end p-2">
          <span
            onClick={handleSetCover}
            className="pointer-events-auto self-center text-[10px] font-medium bg-surface/90 hover:bg-subtle text-accent hover:text-accent-hover px-2 py-0.5 rounded border border-line shadow cursor-pointer flex items-center gap-1 transition-colors"
            title={t('Escolher uma imagem como capa')}
          >
            <ImageIcon size={11} />
            <span>{t('Alterar Capa')}</span>
          </span>
        </div>
      </button>

      {/* Nome + contagem */}
      <div className="mt-2 text-center w-full px-1">
        <div
          className="text-xs text-fg font-medium truncate hover:text-accent transition-colors cursor-pointer"
          title={item.name}
          onClick={() => onOpen(item.path)}
        >
          {item.name}
        </div>
        {item.count !== undefined && (
          <div className="text-[10px] text-fg-muted font-mono mt-0.5">
            {item.count > 0
              ? (mediaType === 'video'
                ? tn(item.count, '{n} vídeo', '{n} vídeos')
                : tn(item.count, '{n} item', '{n} itens'))
              : tn(0, '{n} item', '{n} itens')}
          </div>
        )}
      </div>
    </div>
  );
}

export function FolderGrid({
  folders,
  onRemove,
  onOpen,
  emptyText,
  mediaType = 'image',
  onCoverChange,
}: FolderGridProps) {
  if (folders.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-fg-muted text-xs p-6 text-center">
        <Folder size={40} className="text-line mb-3" />
        <p>{emptyText ?? t('Nenhuma pasta adicionada. Clique em Adicionar Pasta.')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 p-4">
      {folders.map((f) => (
        <FolderCard
          key={f.path}
          item={f}
          onRemove={onRemove}
          onOpen={onOpen}
          mediaType={mediaType}
          onCoverChange={onCoverChange}
        />
      ))}
    </div>
  );
}
