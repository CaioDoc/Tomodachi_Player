import React, { useState, useEffect } from 'react';
import { Flame, Loader2, AlertCircle } from 'lucide-react';
import { MangaReader } from './MangaReader';
import { getGalleryDetails } from '../api/nhentai';
import type { GalleryItem } from '../types';
import { t } from '../i18n';

interface NHentaiReaderProps {
  gallery?: any;
}

export interface NHPage {
  index: number;
  url: string;
  name: string;
}

export const NHentaiReader: React.FC<NHentaiReaderProps> = ({ gallery: initialGallery }) => {
  const [gallery, setGallery] = useState<any>(initialGallery);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);


  // If initialGallery is just an ID or missing media_id/images.pages, load full details
  useEffect(() => {
    if (!initialGallery) return;
    setGallery(initialGallery);

    const hasMediaId = Boolean(initialGallery.media_id);
    const hasPages = Boolean(
      (initialGallery.images && Array.isArray(initialGallery.images.pages) && initialGallery.images.pages.length > 0) ||
      (Array.isArray(initialGallery.pages) && initialGallery.pages.length > 0)
    );

    if ((!hasMediaId || !hasPages) && initialGallery.id) {
      setLoading(true);
      getGalleryDetails(initialGallery.id)
        .then((full) => {
          setGallery(full);
        })
        .catch((err: any) => {
          setError(err?.message || t('Erro ao carregar detalhes completos da obra'));
        })
        .finally(() => {
          setLoading(false);
        });
    }
  }, [initialGallery]);

  // Build pages list
  const pages: NHPage[] = React.useMemo(() => {
    if (!gallery) return [];

    // Check if gallery.pages has pre-formed URLs
    if (Array.isArray(gallery.pages) && gallery.pages.length > 0 && typeof gallery.pages[0]?.url === 'string') {
      return gallery.pages;
    }

    const mediaId = gallery.media_id || '';
    const rawPages = gallery.images?.pages || gallery.pages;

    if (Array.isArray(rawPages) && rawPages.length > 0) {
      return rawPages.map((p: any, idx: number) => {
        let ext = 'jpg';
        if (p?.t === 'p') ext = 'png';
        else if (p?.t === 'w') ext = 'webp';
        else if (p?.t === 'j') ext = 'jpg';
        else if (typeof p === 'string') {
          const match = p.match(/\.(jpg|jpeg|png|webp)$/i);
          if (match) ext = match[1].toLowerCase();
        }

        const url = p?.path
          ? (p.path.startsWith('http') ? p.path : `https://i.nhentai.net/${p.path}`)
          : `https://i.nhentai.net/galleries/${mediaId}/${idx + 1}.${ext}`;

        return {
          index: idx,
          url,
          name: t('Página {n}', { n: idx + 1 })
        };
      });
    }

    // Fallback if only num_pages and media_id are available
    const numPages = gallery.num_pages || gallery.pages?.length || 0;
    if (numPages > 0 && mediaId) {
      return Array.from({ length: numPages }, (_, idx) => ({
        index: idx,
        url: `https://i.nhentai.net/galleries/${mediaId}/${idx + 1}.webp`,
        name: t('Página {n}', { n: idx + 1 })
      }));
    }

    return [];
  }, [gallery]);

  const title = 
    gallery?.title?.pretty || 
    gallery?.title?.english || 
    gallery?.english_title || 
    (gallery?.id ? t('Obra #{id}', { id: gallery.id }) : t('Leitor NHentai'));

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-canvas text-fg-muted gap-3">
        <Loader2 size={36} className="animate-spin text-rose-400" />
        <span className="text-xs">{t('Carregando obra da NHentai v2...')}</span>
      </div>
    );
  }

  if (error || !gallery) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-canvas text-fg-muted p-6 text-center gap-3">
        <AlertCircle size={36} className="text-rose-400" />
        <h3 className="text-sm font-semibold text-fg">{t('Não foi possível abrir a obra')}</h3>
        <p className="text-xs max-w-md font-mono text-rose-300/80">{error || t('Objeto de galeria ausente ou inválido.')}</p>
      </div>
    );
  }

  return (
    <MangaReader
      key={`${gallery?.id || 'g'}-${pages.length}-${pages[0]?.url || ''}`}
      title={title}
      pages={pages}
      initialPageIndex={0}
      icon={<Flame size={16} className="text-rose-400" />}
      externalUrl={gallery?.id ? `https://nhentai.net/g/${gallery.id}/` : undefined}
    />
  );
};
