// src/components/WelcomeDialog.tsx
// Tela de boas-vindas exibida no primeiro uso (biblioteca vazia).

import React from 'react';
import { ArchiveRestore, FolderOpen, Compass, X, Search, Clapperboard } from 'lucide-react';
import { APP_NAME } from '../constants/labels';
import { t } from '../i18n';
import { LanguagePicker } from './LanguagePicker';

interface WelcomeDialogProps {
  onClose: () => void;
  onImportBackup: () => void;
  onLocalFolder: () => void;
  onExplore: () => void;
  onWatch?: () => void;
}

const Option: React.FC<{ icon: React.ReactNode; title: string; text: string; onClick: () => void }> = ({ icon, title, text, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-full flex items-start gap-3 p-3.5 rounded-xl border border-line-subtle bg-canvas hover:border-accent/60 hover:bg-accent/5 text-left transition-colors cursor-pointer"
  >
    <span className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">{icon}</span>
    <span className="min-w-0">
      <span className="block text-[13.5px] font-semibold text-fg">{title}</span>
      <span className="block text-[12px] text-fg-muted mt-0.5 leading-snug">{text}</span>
    </span>
  </button>
);

export const WelcomeDialog: React.FC<WelcomeDialogProps> = ({ onClose, onImportBackup, onLocalFolder, onExplore, onWatch }) => (
  <div className="fixed inset-0 z-[140] bg-black/60 flex items-center justify-center p-4 animate-tp-fade-in">
    <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="relative w-full max-w-md rounded-2xl bg-surface border border-line shadow-pop p-6 animate-tp-zoom-in">
      <button type="button" onClick={onClose} className="absolute top-3 right-3 p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer" aria-label={t('Fechar')}>
        <X size={16} />
      </button>
      <div className="flex flex-col items-center text-center mb-5">
        <img src="./icon.png" alt="" className="w-20 h-20 mb-3" draggable={false} />
        <h2 id="welcome-title" className="text-[18px] font-semibold text-fg">
          {t('Bem-vindo ao {name}!', { name: APP_NAME })}
        </h2>
        <p className="text-[13px] text-fg-muted mt-1">{t('Como você quer começar?')}</p>
        <div className="mt-3">
          <LanguagePicker compact ask={false} />
        </div>
      </div>
      <div className="space-y-2">
        <Option icon={<ArchiveRestore size={18} />} title={t('Importar backup do Mihon / Aniyomi')} text={t('Traga sua biblioteca, capítulos lidos e categorias (.tachibk).')} onClick={onImportBackup} />
        <Option icon={<FolderOpen size={18} />} title={t('Abrir uma pasta do computador')} text={t('Leia mangás e quadrinhos que você já tem salvos.')} onClick={onLocalFolder} />
        <Option icon={<Compass size={18} />} title={t('Explorar o catálogo online')} text={t('Descubra obras no MangaDex e em outras fontes.')} onClick={onExplore} />
        {onWatch && (
          <Option icon={<Clapperboard size={18} />} title={t('Assistir animes, séries e filmes')} text={t('Descubra obras e adicione suas fontes (extensões, plugins ou addons).')} onClick={onWatch} />
        )}
      </div>
      <p className="text-[11.5px] text-fg-muted text-center mt-5 inline-flex items-center justify-center gap-1 w-full">
        <Search size={11} /> {t('Dica:')} <kbd className="border border-line rounded px-1">Ctrl+K</kbd> {t('abre a busca global a qualquer momento.')}
      </p>
    </div>
  </div>
);
