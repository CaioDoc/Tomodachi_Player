// src/components/FavoriteTagModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  Heart, 
  Tag, 
  Plus, 
  Check, 
  X, 
  Trash2, 
  BookOpen, 
  Film,
  Sparkles,
  BookmarkCheck,
  AlertCircle
} from 'lucide-react';
import type { LibraryItem } from './MihonLibrary';
import { updateLibrary } from '../utils/libraryStore';
import { t, tn, tMaybe } from '../i18n';
import { toast } from './Feedback';

interface FavoriteTagModalProps {
  isOpen: boolean;
  onClose: () => void;
  manga: {
    title: string;
    url: string;
    cover?: string;
    source?: string;
    sourceName?: string;
    categories?: string[];
    favorite?: boolean;
    author?: string;
    description?: string;
    genres?: string[];
    chapters?: any[];
    status?: number;
  } | null;
  onSaved?: (updatedManga: LibraryItem) => void;
  source?: 'manga' | 'video';
  /** Tags indicadas para a obra (as que já existem vêm marcadas; as novas aparecem como sugestão) */
  suggestedTags?: string[];
  /** Favoritar várias obras de uma vez (as tags escolhidas são somadas às que cada obra já tem) */
  bulk?: Array<NonNullable<FavoriteTagModalProps['manga']>>;
  onBulkSaved?: (count: number) => void;
}

const DEFAULT_MANGA_CATEGORIES = ['Favoritos'];
const DEFAULT_VIDEO_CATEGORIES = ['Favoritos'];

export const EXCLUDED_LIBRARY_CATEGORIES = new Set([
  'todos',
  'todas',
  'completos',
  'planejo ler',
  'planejo assistir',
  'recomendados',
  'recomentados',
]);

export const FavoriteTagModal: React.FC<FavoriteTagModalProps> = ({
  isOpen,
  onClose,
  manga,
  onSaved,
  source = 'manga',
  suggestedTags,
  bulk,
  onBulkSaved,
}) => {
  const isBulk = !!bulk && bulk.length > 0;
  if (isBulk && !manga) manga = bulk![0];
  const isVideo = source === 'video';
  const categoriesKey = isVideo ? 'video_categories' : 'manga_categories';
  const libraryKey = isVideo ? 'video_library' : 'manga_library';
  const defaultCategories = isVideo ? DEFAULT_VIDEO_CATEGORIES : DEFAULT_MANGA_CATEGORIES;

  const [isFavorite, setIsFavorite] = useState<boolean>(true);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [tagError, setTagError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  // Load existing categories and item's current tags
  useEffect(() => {
    if (!isOpen || !manga) return;

    // 1. Load user's global categories
    let savedCats: string[] = [];
    try {
      const raw = localStorage.getItem(categoriesKey);
      if (raw) savedCats = JSON.parse(raw);
    } catch {}

    // Combine with defaults and tags present in current library (filtering excluded)
    let combined = Array.from(new Set([...defaultCategories, ...savedCats]))
      .filter((c) => c && !EXCLUDED_LIBRARY_CATEGORIES.has(c.toLowerCase().trim()));

    try {
      const libRaw = localStorage.getItem(libraryKey);
      if (libRaw) {
        const lib: LibraryItem[] = JSON.parse(libRaw);
        for (const item of lib) {
          if (Array.isArray(item.categories)) {
            for (const c of item.categories) {
              if (c && !combined.includes(c) && !EXCLUDED_LIBRARY_CATEGORIES.has(c.toLowerCase().trim())) {
                combined.push(c);
              }
            }
          }
        }
      }
    } catch {}

    setAllCategories(combined);
    try {
      localStorage.setItem(categoriesKey, JSON.stringify(combined));
    } catch {}

    // 2. Set current item's tags (obra nova: já marca as tags indicadas que o usuário tem)
    const existingSuggested = (suggestedTags || [])
      .map((sug) => combined.find((c) => c.toLowerCase() === sug.toLowerCase()))
      .filter((c): c is string => !!c);
    const initialTags = isBulk
      ? ['Favoritos']
      : manga.categories && manga.categories.length > 0
      ? manga.categories.filter((c) => !EXCLUDED_LIBRARY_CATEGORIES.has(c.toLowerCase().trim()))
      : Array.from(new Set(['Favoritos', ...existingSuggested]));
    setSelectedTags(initialTags);
    setIsFavorite(isBulk ? true : manga.favorite ?? true);
    setNewTagInput('');
    setTagError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, manga, isBulk, categoriesKey, libraryKey, defaultCategories]);

  if (!isOpen || !manga) return null;

  const handleToggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags((prev) => prev.filter((x) => x !== tag));
    } else {
      setSelectedTags((prev) => [...prev, tag]);
    }
  };

  const handleCreateNewTag = (e: React.FormEvent) => {
    e.preventDefault();
    const tag = newTagInput.trim();
    if (!tag) return;

    if (allCategories.some((c) => c.toLowerCase() === tag.toLowerCase())) {
      setTagError(t('Esta tag já existe.'));
      if (!selectedTags.some((c) => c.toLowerCase() === tag.toLowerCase())) {
        setSelectedTags((prev) => [...prev, tag]);
      }
      setNewTagInput('');
      return;
    }

    const updatedAll = [...allCategories, tag];
    setAllCategories(updatedAll);
    setSelectedTags((prev) => [...prev, tag]);
    setNewTagInput('');
    setTagError(null);

    // Persist new tag to categories
    try {
      localStorage.setItem(categoriesKey, JSON.stringify(updatedAll));
    } catch {}
  };

  const sameWork = (it: LibraryItem, m: NonNullable<FavoriteTagModalProps['manga']>) =>
    it.url === m.url || (String(it.title || '').toLowerCase() === m.title.toLowerCase() && (it.sourceName || it.source) === (m.sourceName || m.source));

  const handleSaveBulk = async () => {
    setSaving(true);
    try {
      const tags = selectedTags.length > 0 ? selectedTags : ['Favoritos'];
      await updateLibrary(
        source,
        (library: LibraryItem[]) => {
          const next = [...library];
          const added: LibraryItem[] = [];
          for (const m of bulk || []) {
            const idx = next.findIndex((it) => sameWork(it, m));
            if (idx >= 0) {
              const prev = next[idx];
              next[idx] = {
                ...prev,
                favorite: true,
                categories: Array.from(new Set([...(prev.categories || []), ...tags])),
                cover: prev.cover || m.cover || '',
              };
            } else {
              added.push({
                ...(m as any),
                source: m.source || (isVideo ? 'anilist' : 'extension'),
                sourceName: m.sourceName || m.source || (isVideo ? 'Vídeos & Animations' : 'Extensão'),
                author: m.author || '',
                description: m.description || '',
                genres: m.genres || [],
                status: m.status ?? 1,
                cover: m.cover || '',
                dateAdded: Date.now(),
                favorite: true,
                categories: tags,
                chapters: m.chapters || [],
                totalChapters: m.chapters?.length || 0,
                readChapters: 0,
              } as LibraryItem);
            }
          }
          return [...added, ...next];
        },
        { categories: allCategories }
      );
      try {
        localStorage.setItem(categoriesKey, JSON.stringify(allCategories));
      } catch {}
      window.dispatchEvent(new CustomEvent('backup:applied', { detail: { source } }));
      window.dispatchEvent(new CustomEvent(`${source}:library-updated`));
      toast.success(tn(bulk?.length || 0, '{n} obra favoritada', '{n} obras favoritadas'));
      onBulkSaved?.(bulk?.length || 0);
      onClose();
    } catch (err) {
      console.error('Erro ao favoritar em lote:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (isBulk) return handleSaveBulk();
    setSaving(true);
    try {
      const updatedTags = selectedTags.length > 0 ? selectedTags : ['Favoritos'];
      let targetItem: LibraryItem | null = null;
      // Lê e grava a biblioteca COMPLETA (capítulos, progresso) — o localStorage guarda só um resumo
      await updateLibrary(
        source,
        (library: LibraryItem[]) => {
          const existingIdx = library.findIndex(
            (it) => it.url === manga.url || (String(it.title || '').toLowerCase() === manga.title.toLowerCase() && (it.sourceName || it.source) === (manga.sourceName || manga.source))
          );
          const prev = existingIdx >= 0 ? library[existingIdx] : null;
          targetItem = prev
            ? {
                ...prev,
                favorite: isFavorite,
                categories: updatedTags,
                cover: manga.cover || prev.cover,
                title: manga.title || prev.title,
                sourceName: manga.sourceName || prev.sourceName || manga.source || (isVideo ? 'Anime' : 'Manga'),
                chapters: prev.chapters && prev.chapters.length ? prev.chapters : manga.chapters || [],
              }
            : ({
                ...(manga as any),
                source: manga.source || (isVideo ? 'anilist' : 'extension'),
                sourceName: manga.sourceName || manga.source || (isVideo ? 'Vídeos & Animations' : 'Extensão'),
                url: manga.url,
                title: manga.title,
                author: manga.author || '',
                description: manga.description || '',
                genres: manga.genres || [],
                status: manga.status ?? 1,
                cover: manga.cover || '',
                dateAdded: Date.now(),
                favorite: isFavorite,
                categories: updatedTags,
                chapters: manga.chapters || [],
                totalChapters: manga.chapters?.length || 0,
                readChapters: 0,
              } as LibraryItem);
          const next = [...library];
          if (existingIdx >= 0) next[existingIdx] = targetItem!;
          else next.unshift(targetItem!);
          return next;
        },
        { categories: allCategories }
      );

      try {
        localStorage.setItem(categoriesKey, JSON.stringify(allCategories));
      } catch {}

      window.dispatchEvent(new CustomEvent('backup:applied', { detail: { source } }));
      window.dispatchEvent(new CustomEvent(`${source}:library-updated`, { detail: targetItem }));

      if (targetItem) onSaved?.(targetItem);
      onClose();
    } catch (err) {
      console.error('Erro ao salvar favorito:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveFavorite = async () => {
    setSaving(true);
    try {
      let updated: LibraryItem | null = null;
      await updateLibrary(
        source,
        (library: LibraryItem[]) =>
          library.map((it) => {
            const same = it.url === manga.url || (String(it.title || '').toLowerCase() === manga.title.toLowerCase() && (it.sourceName || it.source) === (manga.sourceName || manga.source));
            if (!same) return it;
            updated = { ...it, favorite: false, categories: (it.categories || []).filter((c) => c !== 'Favoritos') };
            return updated;
          }),
        { categories: allCategories }
      );
      if (updated) {
        window.dispatchEvent(new CustomEvent('backup:applied', { detail: { source } }));
        window.dispatchEvent(new CustomEvent(`${source}:library-updated`, { detail: updated }));
        onSaved?.(updated);
      }
      onClose();
    } catch (err) {
      console.error('Erro ao desfavoritar:', err);
    } finally {
      setSaving(false);
    }
  };

  // Tags indicadas que o usuário ainda não tem
  const newSuggestions = (suggestedTags || []).filter((sug) => !allCategories.some((c) => c.toLowerCase() === sug.toLowerCase()));
  const addSuggestion = (tag: string) => {
    const updatedAll = [...allCategories, tag];
    setAllCategories(updatedAll);
    setSelectedTags((prev) => (prev.includes(tag) ? prev : [...prev, tag]));
    try {
      localStorage.setItem(categoriesKey, JSON.stringify(updatedAll));
    } catch {}
  };

  const sourceLabel = tMaybe(manga.sourceName || manga.source || (isVideo ? 'Vídeos & Animations' : 'Extensão'));

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[99999] animate-in fade-in duration-150 select-none">
      <div className="bg-surface border border-line rounded-xl max-w-md w-full overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 bg-canvas border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-rose-950/60 border border-rose-800/80 text-rose-400">
              <Heart size={16} fill={isFavorite ? 'currentColor' : 'none'} />
            </div>
            <span className="font-semibold text-sm text-fg">
              {isBulk
                ? tn(bulk!.length, 'Favoritar {n} obra', 'Favoritar {n} obras')
                : isVideo
                  ? t('Favoritar Vídeo / Anime & Tags')
                  : t('Favoritar Obra & Tags')}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('Fechar')}
            className="text-fg-muted hover:text-white p-1 rounded hover:bg-subtle transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs text-fg-2 overflow-y-auto max-h-[75vh]">
          {isBulk ? (
            <div className="flex items-center gap-3 p-3 bg-canvas border border-line rounded-lg">
              <div className="flex -space-x-4 shrink-0">
                {bulk!.slice(0, 5).map((m, i) => (
                  <div key={m.url + i} className="w-10 h-14 rounded bg-subtle border-2 border-canvas overflow-hidden shadow" style={{ zIndex: 5 - i }}>
                    {m.cover ? <img src={m.cover} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')} /> : null}
                  </div>
                ))}
              </div>
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-fg">{tn(bulk!.length, '{n} obra marcada', '{n} obras marcadas')}</h4>
                <p className="text-[11px] text-fg-muted line-clamp-2 mt-0.5" title={bulk!.map((m) => m.title).join(', ')}>
                  {bulk!.map((m) => m.title).join(', ')}
                </p>
              </div>
            </div>
          ) : (
          <div className="flex items-center gap-3 p-3 bg-canvas border border-line rounded-lg">
            <div className="w-12 h-16 rounded bg-subtle border border-line overflow-hidden shrink-0 flex items-center justify-center">
              {manga.cover ? (
                <img
                  src={manga.cover}
                  alt={manga.title}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : isVideo ? (
                <Film size={20} className="text-fg-muted" />
              ) : (
                <BookOpen size={20} className="text-fg-muted" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-semibold text-fg truncate" title={manga.title}>
                {manga.title}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-2 py-0.5 rounded bg-rose-950/70 border border-rose-800 text-[10px] text-rose-300 font-medium">
                  {sourceLabel}
                </span>
                <span className="text-[10px] text-fg-muted">
                  {manga.chapters?.length
                    ? (isVideo ? t('{n} eps', { n: manga.chapters.length }) : t('{n} caps', { n: manga.chapters.length }))
                    : t('Obra online')}
                </span>
              </div>
            </div>
          </div>

          )}

          {/* Favorite Toggle Checkbox */}
          {!isBulk && (
          <div
            onClick={() => setIsFavorite(!isFavorite)}
            className="flex items-center justify-between p-3 bg-canvas hover:bg-subtle/50 border border-line rounded-lg cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <div className={`p-1.5 rounded-full ${isFavorite ? 'bg-rose-600 text-white' : 'bg-subtle text-fg-muted'}`}>
                <Heart size={14} fill={isFavorite ? 'currentColor' : 'none'} />
              </div>
              <div>
                <div className="font-semibold text-xs text-fg">
                  {t('Salvar na Minha Biblioteca')}
                </div>
                <div className="text-[11px] text-fg-muted">
                  {isFavorite ? t('Obra marcada como favorita na biblioteca') : t('Remover do status de favorito')}
                </div>
              </div>
            </div>
            <div className={`w-5 h-5 rounded flex items-center justify-center border ${isFavorite ? 'bg-rose-600 border-rose-500 text-white' : 'border-line bg-canvas'}`}>
              {isFavorite && <Check size={13} strokeWidth={3} />}
            </div>
          </div>
          )}

          {/* Tags / Categories Selection */}
          <div className="space-y-2">
            <label className="text-[11px] font-semibold text-fg-muted flex items-center gap-1.5">
              <Tag size={12} className="text-accent" />
              <span>{t('Inserir nas Tags / Categorias da Biblioteca:')}</span>
            </label>

            <div className="flex flex-wrap gap-1.5 p-3 bg-canvas border border-line rounded-lg min-h-[70px]">
              {allCategories.map((cat) => {
                const selected = selectedTags.includes(cat);
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => handleToggleTag(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-all border cursor-pointer ${
                      selected
                        ? 'bg-accent border-accent-hover text-accent-fg shadow-xs'
                        : 'bg-subtle border-line text-fg-2 hover:bg-elevated'
                    }`}
                  >
                    {selected && <Check size={11} strokeWidth={3} />}
                    <span>{cat === 'Favoritos' ? t('Favoritos') : cat}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {newSuggestions.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-[11px] text-fg-muted flex items-center gap-1.5">
                <Sparkles size={12} className="text-accent" />
                {t('Tags indicadas para esta obra:')}
              </label>
              <div className="flex flex-wrap gap-1.5">
                {newSuggestions.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addSuggestion(tag)}
                    className="px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1 border border-dashed border-accent/60 text-fg-2 hover:bg-accent/10 hover:text-fg transition-colors cursor-pointer"
                  >
                    <Plus size={11} /> {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Create New Tag */}
          <form onSubmit={handleCreateNewTag} className="space-y-1.5">
            <label className="text-[11px] text-fg-muted block">
              {t('Criar nova tag personalizada:')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => {
                  setNewTagInput(e.target.value);
                  setTagError(null);
                }}
                placeholder={isVideo ? t('Ex: Favoritos VIP, Isekai, Animes da Temporada...') : t('Ex: Favoritos VIP, Shounen, Para Ler...')}
                className="flex-1 bg-canvas border border-line focus:border-accent rounded-md px-3 py-1.5 text-xs text-fg outline-none transition-colors"
              />
              <button
                type="submit"
                disabled={!newTagInput.trim()}
                className="px-3 py-1.5 bg-success hover:bg-success-hover text-white rounded-md text-xs font-semibold flex items-center gap-1 transition-colors disabled:opacity-40 cursor-pointer shadow-xs"
              >
                <Plus size={13} />
                <span>{t('Adicionar Tag')}</span>
              </button>
            </div>
            {tagError && (
              <span className="text-[11px] text-amber-400 block">{tagError}</span>
            )}
          </form>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-canvas border-t border-line flex items-center justify-between">
          {manga.favorite && !isBulk ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleRemoveFavorite}
              className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 hover:text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Trash2 size={13} />
              <span>{t('Remover Favorito')}</span>
            </button>
          ) : (
            <div />
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 bg-subtle hover:bg-elevated text-white rounded-md text-xs font-medium transition-colors cursor-pointer"
            >
              {t('Cancelar')}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-md text-xs font-bold flex items-center gap-1.5 transition-all shadow-md hover:scale-105 active:scale-95 cursor-pointer"
            >
              <BookmarkCheck size={14} />
              <span>{isBulk ? tn(bulk!.length, 'Favoritar {n} obra', 'Favoritar {n} obras') : t('Salvar Favorito')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
