import React from 'react';
import { Folder, X } from 'lucide-react';
import { t } from '../i18n';

export interface FolderChipProps {
  path: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
  onRemove: (p: string) => void;
}

export const FolderChip: React.FC<FolderChipProps> = ({
  path,
  count,
  active = false,
  onClick,
  onRemove
}) => {
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;

  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 pl-3 pr-1.5 py-1 rounded-full border transition-colors cursor-pointer select-none ${
        active
          ? 'bg-subtle border-accent text-accent'
          : 'bg-surface border-line text-fg-2 hover:border-accent/60 hover:text-white'
      }`}
      title={path}
    >
      <Folder size={13} className={`${active ? 'text-accent' : 'text-fg-muted'} shrink-0`} />
      <span className="text-xs text-fg truncate max-w-[180px] font-medium">{name}</span>
      {count !== undefined && (
        <span className="text-[10px] text-fg-muted tabular-nums bg-canvas px-1.5 py-0.2 rounded-full border border-line">
          {count}
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(path);
        }}
        title={t('Remover pasta {name}', { name })}
        aria-label={t('Remover pasta {name}', { name })}
        className="grid place-items-center w-5 h-5 rounded-full text-fg-muted hover:text-white hover:bg-danger-fg transition-colors ml-0.5"
      >
        <X size={12} />
      </button>
    </div>
  );
};
