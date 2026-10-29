// src/constants/labels.ts
import { t } from '../i18n';
export const APP_NAME = 'Tomodachi Player';
export const APP_VERSION = '1.6.2-beta';

export const LABELS = {
  mangas: t('Mangás & Comics'),
  videos: t('Animes & Vídeos'),
} as const;

export type SectionView = 'library' | 'updates' | 'history' | 'online' | 'extensions' | 'repos' | 'local' | 'backup' | 'nuvio';

/** Aba interna (Biblioteca · Explorar · Local) a que cada visão pertence */
export function viewGroup(view: SectionView): 'library' | 'explore' | 'local' | 'nuvio' {
  if (view === 'library' || view === 'updates' || view === 'history') return 'library';
  if (view === 'local') return 'local';
  if (view === 'nuvio') return 'nuvio';
  return 'explore';
}

/** Animes & Vídeos: Biblioteca · Descobrir · Fontes · Local */
export function videoViewGroup(view: SectionView): 'library' | 'explore' | 'local' | 'sources' {
  if (view === 'library' || view === 'updates' || view === 'history') return 'library';
  if (view === 'local') return 'local';
  if (view === 'extensions' || view === 'repos' || view === 'nuvio') return 'sources';
  return 'explore';
}

export const SECTION_VIEW_LABELS: Record<'manga' | 'video', Record<SectionView, string>> = {
  manga: {
    library: t('Biblioteca'),
    updates: t('Atualizações'),
    history: t('Histórico'),
    online: t('Explorar'),
    extensions: t('Extensões'),
    repos: t('Repositórios'),
    local: t('Pasta local'),
    backup: t('Backup Mihon'),
    nuvio: 'Nuvio',
  },
  video: {
    library: t('Biblioteca'),
    updates: t('Atualizações'),
    history: t('Histórico'),
    online: t('Descobrir'),
    extensions: t('Fontes'),
    repos: t('Fontes'),
    local: t('Pasta local'),
    backup: t('Backup Aniyomi'),
    nuvio: t('Fontes'),
  },
};

/** Status de publicação/exibição no padrão Mihon/Aniyomi. */
export function workStatusLabel(status?: number): string {
  switch (status) {
    case 1:
      return t('Em lançamento');
    case 2:
      return t('Concluído');
    case 3:
      return t('Licenciado');
    case 4:
      return t('Publicação encerrada');
    case 5:
      return t('Cancelado');
    case 6:
      return t('Em hiato');
    default:
      return t('Status desconhecido');
  }
}
