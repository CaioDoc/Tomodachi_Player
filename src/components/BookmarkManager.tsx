// src/components/BookmarkManager.tsx
// Barra de favoritos (com pastas em menu) e gerenciador de favoritos com pastas/subpastas.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Folder,
  FolderOpen,
  FolderPlus,
  ChevronRight,
  ChevronLeft,
  X,
  Search,
  Plus,
  Upload,
  Download,
  Trash2,
  Pencil,
  ExternalLink,
  Bookmark,
  BookmarkCheck,
  Check,
  Home,
} from 'lucide-react';
import type { WebBookmark, WebBookmarkFolder } from '../types';
import { getFaviconUrl } from '../utils/bookmarkParser';
import {
  childrenOf,
  folderPath,
  folderDescendants,
  countInFolder,
  folderOptions,
  type BookmarkData,
  type BookmarkNode,
  type useBookmarks,
} from '../utils/bookmarkStore';
import { confirmDialog } from './Feedback';
import { t, tn } from '../i18n';

type Store = ReturnType<typeof useBookmarks>;

const Favicon: React.FC<{ b: WebBookmark; className?: string }> = ({ b, className = 'w-3.5 h-3.5' }) => (
  <img
    src={b.favicon || getFaviconUrl(b.url)}
    alt=""
    className={`${className} rounded-xs flex-shrink-0`}
    onError={(e) => ((e.target as HTMLElement).style.visibility = 'hidden')}
  />
);

/* ═════════════════════════ Barra de favoritos ═════════════════════════ */

interface MenuState {
  stack: string[]; // pastas abertas (última = atual)
  x: number;
  y: number;
}

export const BookmarkBar: React.FC<{
  store: Store;
  onOpen: (url: string) => void;
  onOpenManager: (folderId?: string) => void;
  trailing?: React.ReactNode;
}> = ({ store, onOpen, onOpenManager, trailing }) => {
  const { data } = store;
  const root = useMemo(() => childrenOf(data, undefined), [data]);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const LIMIT = 30;

  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const openFolderMenu = (folderId: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    if (menu && menu.stack[0] === folderId) {
      setMenu(null);
      return;
    }
    setMenu({ stack: [folderId], x: Math.min(r.left, window.innerWidth - 300), y: r.bottom + 4 });
  };

  const current = menu ? menu.stack[menu.stack.length - 1] : undefined;
  const currentFolder = current ? data.folders.find((f) => f.id === current) : undefined;
  const menuItems = current ? childrenOf(data, current) : [];

  return (
    <div className="flex items-center bg-surface border-b border-line-subtle px-2 py-1 gap-1.5 flex-shrink-0 text-xs">
      <div className="flex items-center gap-1 flex-1 overflow-x-auto scrollbar-none py-0.5">
        {root.length === 0 && <span className="text-[11px] text-fg-muted px-2">{t('Clique na estrela para salvar páginas aqui, ou importe seus favoritos.')}</span>}
        {root.slice(0, LIMIT).map((n) =>
          n.kind === 'folder' ? (
            <button
              key={n.item.id}
              type="button"
              onClick={(e) => openFolderMenu(n.item.id, e.currentTarget)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded border transition-all flex-shrink-0 max-w-[170px] text-left cursor-pointer ${
                menu?.stack[0] === n.item.id ? 'bg-subtle text-fg border-line' : 'text-fg-2 hover:text-fg hover:bg-subtle border-transparent'
              }`}
              title={n.item.title}
            >
              <Folder size={13} className="text-warning-fg flex-shrink-0" />
              <span className="truncate text-[11px] leading-tight">{n.item.title}</span>
            </button>
          ) : (
            <button
              key={n.item.id}
              type="button"
              onClick={() => onOpen(n.item.url)}
              onAuxClick={(e) => {
                if (e.button === 1) onOpen(n.item.url);
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-fg-2 hover:text-fg hover:bg-subtle border border-transparent hover:border-line transition-all flex-shrink-0 max-w-[160px] text-left cursor-pointer"
              title={`${n.item.title}\n${n.item.url}`}
            >
              <Favicon b={n.item} />
              <span className="truncate text-[11px] leading-tight">{n.item.title}</span>
            </button>
          )
        )}
        {root.length > LIMIT && (
          <button type="button" onClick={() => onOpenManager()} className="text-[11px] text-accent hover:underline px-2 py-1 flex-shrink-0">
            {t('+{n} mais…', { n: root.length - LIMIT })}
          </button>
        )}
      </div>
      {trailing}

      {menu && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} onContextMenu={() => setMenu(null)} aria-hidden />
          <div
            role="menu"
            className="fixed z-[61] w-72 max-h-[60vh] flex flex-col rounded-lg bg-elevated border border-line shadow-pop text-xs animate-tp-fade-in overflow-hidden"
            style={{ left: Math.max(8, menu.x), top: menu.y }}
          >
            <div className="flex items-center gap-1 px-2 py-1.5 border-b border-line-subtle">
              {menu.stack.length > 1 ? (
                <button
                  type="button"
                  onClick={() => setMenu({ ...menu, stack: menu.stack.slice(0, -1) })}
                  className="p-1 rounded hover:bg-subtle text-fg-muted hover:text-fg cursor-pointer"
                  title={t('Voltar')}
                >
                  <ChevronLeft size={14} />
                </button>
              ) : (
                <FolderOpen size={14} className="text-warning-fg mx-1" />
              )}
              <span className="flex-1 truncate font-semibold text-fg">{currentFolder?.title}</span>
              <button
                type="button"
                onClick={() => {
                  onOpenManager(current);
                  setMenu(null);
                }}
                className="px-1.5 py-0.5 rounded hover:bg-subtle text-[11px] text-fg-muted hover:text-fg cursor-pointer"
                title={t('Organizar esta pasta')}
              >
                {t('Organizar')}
              </button>
            </div>
            <div className="overflow-y-auto p-1">
              {menuItems.length === 0 ? (
                <div className="px-3 py-4 text-center text-fg-muted">{t('Pasta vazia')}</div>
              ) : (
                menuItems.map((n) =>
                  n.kind === 'folder' ? (
                    <button
                      key={n.item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => setMenu({ ...menu, stack: [...menu.stack, n.item.id] })}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-subtle text-left cursor-pointer"
                    >
                      <Folder size={14} className="text-warning-fg shrink-0" />
                      <span className="flex-1 truncate text-fg">{n.item.title}</span>
                      <ChevronRight size={13} className="text-fg-muted" />
                    </button>
                  ) : (
                    <button
                      key={n.item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        onOpen(n.item.url);
                        setMenu(null);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-subtle text-left cursor-pointer"
                      title={n.item.url}
                    >
                      <Favicon b={n.item} />
                      <span className="flex-1 truncate text-fg-2">{n.item.title}</span>
                    </button>
                  )
                )
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

/* ═════════════════════════ Seletor de pasta ═════════════════════════ */

export const FolderSelect: React.FC<{ data: BookmarkData; value?: string; exclude?: Set<string>; onChange: (id?: string) => void; className?: string }> = ({
  data,
  value,
  exclude,
  onChange,
  className = '',
}) => (
  <select
    value={value || ''}
    onChange={(e) => onChange(e.target.value || undefined)}
    className={`bg-surface border border-line focus:border-accent rounded px-2 py-1.5 text-xs text-fg outline-none ${className}`}
  >
    {folderOptions(data, exclude).map((o) => (
      <option key={o.id || 'root'} value={o.id || ''}>
        {'  '.repeat(o.depth)}
        {o.depth > 0 ? '📁 ' : ''}
        {o.id ? o.title : t(o.title)}
      </option>
    ))}
  </select>
);

/* ═════════════════════════ Gerenciador ═════════════════════════ */

export const BookmarkManagerModal: React.FC<{
  store: Store;
  initialFolder?: string;
  onClose: () => void;
  onOpen: (url: string) => void;
  onImport: () => void;
  onExport: () => void;
  notify: (msg: string) => void;
  /** Endereço/título da página atual (sugestão ao criar favorito) */
  currentPage?: { url: string; title: string };
}> = ({ store, initialFolder, onClose, onOpen, onImport, onExport, notify, currentPage }) => {
  const { data } = store;
  const [folderId, setFolderId] = useState<string | undefined>(initialFolder);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState<null | 'folder' | 'link'>(null);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [editParent, setEditParent] = useState<string | undefined>(undefined);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Pasta aberta foi apagada (ex.: em outra aba)
  useEffect(() => {
    if (folderId && !data.folders.some((f) => f.id === folderId)) setFolderId(undefined);
  }, [data, folderId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) setEditing(null);
      else if (creating) setCreating(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, creating, onClose]);

  const path = folderPath(data, folderId);
  const items: Array<BookmarkNode & { where?: string }> = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return childrenOf(data, folderId);
    const pathLabel = (pid?: string) => folderPath(data, pid).map((f) => f.title).join(' › ') || t('Barra de favoritos');
    return [
      ...data.folders.filter((f) => f.title.toLowerCase().includes(q)).map((f) => ({ kind: 'folder' as const, item: f, where: pathLabel(f.parentId) })),
      ...data.bookmarks
        .filter((b) => b.title.toLowerCase().includes(q) || b.url.toLowerCase().includes(q))
        .map((b) => ({ kind: 'link' as const, item: b, where: pathLabel(b.parentId) })),
    ];
  }, [data, folderId, query]);

  const startCreate = (kind: 'folder' | 'link') => {
    setCreating(kind);
    setEditing(null);
    setNewName(kind === 'link' && currentPage ? currentPage.title : '');
    setNewUrl(kind === 'link' && currentPage ? currentPage.url : '');
    setTimeout(() => nameRef.current?.focus(), 0);
  };

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (creating === 'folder') {
      const name = newName.trim() || t('Nova pasta');
      store.addFolder(name, folderId);
      notify(t('Pasta "{name}" criada', { name }));
    } else if (creating === 'link') {
      let url = newUrl.trim();
      if (!url) return;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      store.addLink(newName.trim() || url, url, folderId);
      notify(t('"{name}" adicionado aos favoritos', { name: newName.trim() || url }));
    }
    setCreating(null);
  };

  const startEdit = (n: BookmarkNode) => {
    setCreating(null);
    setEditing(n.item.id);
    setEditTitle(n.item.title);
    setEditUrl(n.kind === 'link' ? n.item.url : '');
    setEditParent(n.item.parentId || undefined);
  };

  const saveEdit = (n: BookmarkNode) => {
    if (n.kind === 'folder') {
      store.editFolder(n.item.id, { title: editTitle.trim() || n.item.title, parentId: editParent });
    } else {
      let url = editUrl.trim() || n.item.url;
      if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
      store.editLink(n.item.id, { title: editTitle.trim() || url, url, parentId: editParent });
    }
    setEditing(null);
  };

  const deleteNode = async (n: BookmarkNode) => {
    if (n.kind === 'link') {
      store.removeLink(n.item.id);
      notify(t('Favorito removido'));
      return;
    }
    const c = countInFolder(data, n.item.id);
    if (c.links + c.folders > 0) {
      const ok = await confirmDialog({
        title: t('Excluir a pasta "{name}"?', { name: n.item.title }),
        message: c.folders
          ? t('Ela contém {links} e {folders}, que também serão excluídos.', {
              links: tn(c.links, '{n} favorito', '{n} favoritos'),
              folders: tn(c.folders, '{n} subpasta', '{n} subpastas'),
            })
          : t('Ela contém {links}, que também serão excluídos.', { links: tn(c.links, '{n} favorito', '{n} favoritos') }),
        confirmLabel: t('Excluir pasta'),
        danger: true,
      });
      if (!ok) return;
    }
    store.removeFolder(n.item.id);
    notify(t('Pasta excluída'));
  };

  const clearAll = async () => {
    if (await confirmDialog({ title: t('Remover todos os favoritos e pastas?'), message: t('Essa ação não pode ser desfeita.'), confirmLabel: t('Remover tudo'), danger: true })) {
      store.commit({ bookmarks: [], folders: [] });
      setFolderId(undefined);
      notify(t('Todos os favoritos foram removidos.'));
    }
  };

  /* ── Arrastar e soltar para mover ── */
  const moveInto = (id: string, target?: string) => {
    if (data.folders.some((f) => f.id === id)) {
      if (target && folderDescendants(data, id).has(target)) return;
      store.editFolder(id, { parentId: target });
    } else {
      store.editLink(id, { parentId: target });
    }
    const name = target ? data.folders.find((f) => f.id === target)?.title : t('Barra de favoritos');
    notify(t('Movido para "{name}"', { name: name || '' }));
  };
  const dropProps = (target: string | undefined, key: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!dragId || dragId === target) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dropTarget !== key) setDropTarget(key);
    },
    onDragLeave: () => setDropTarget((t) => (t === key ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragId && dragId !== target) moveInto(dragId, target);
      setDragId(null);
      setDropTarget(null);
    },
  });

  const totalLinks = data.bookmarks.length;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface border border-line rounded-xl w-full max-w-3xl h-[82vh] flex flex-col shadow-2xl overflow-hidden animate-tp-fade-in"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t('Gerenciador de favoritos')}
      >
        {/* Cabeçalho */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-line bg-canvas">
          <div className="flex items-center gap-2.5">
            <BookmarkCheck size={20} className="text-warning-fg" />
            <div>
              <h2 className="text-sm font-semibold text-fg">{t('Favoritos')}</h2>
              <p className="text-xs text-fg-muted">
                {tn(totalLinks, '{n} favorito', '{n} favoritos')} · {tn(data.folders.length, '{n} pasta', '{n} pastas')}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-fg-muted hover:text-fg p-1.5 rounded-lg hover:bg-subtle transition-colors" title={t('Fechar (Esc)')}>
            <X size={18} />
          </button>
        </div>

        {/* Ferramentas */}
        <div className="px-4 py-3 border-b border-line flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('Pesquisar em todas as pastas…')}
              className="w-full bg-canvas border border-line focus:border-accent rounded-md pl-9 pr-8 py-1.5 text-xs text-fg outline-none placeholder-fg-muted"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg">
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => startCreate('folder')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-2 hover:text-fg border border-line rounded-md text-xs font-medium"
          >
            <FolderPlus size={13} className="text-warning-fg" /> {t('Nova pasta')}
          </button>
          <button
            type="button"
            onClick={() => startCreate('link')}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-2 hover:text-fg border border-line rounded-md text-xs font-medium"
          >
            <Plus size={13} className="text-accent" /> {t('Novo favorito')}
          </button>
          <button
            type="button"
            onClick={onImport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-success hover:bg-success-hover text-white rounded-md text-xs font-medium"
            title={t('Importar do Chrome, Edge, Firefox, Brave, Opera… (HTML ou JSON), mantendo as pastas')}
          >
            <Upload size={13} /> {t('Importar')}
          </button>
          <button
            type="button"
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-2 hover:text-fg border border-line rounded-md text-xs font-medium"
            title={t('Exportar como HTML (abre em qualquer navegador, com as pastas)')}
          >
            <Download size={13} /> {t('Exportar')}
          </button>
        </div>

        {/* Caminho da pasta atual (também aceita soltar itens) */}
        {!query && (
          <div className="px-4 py-2 border-b border-line-subtle flex items-center gap-1 text-xs overflow-x-auto scrollbar-none">
            <button
              type="button"
              onClick={() => setFolderId(undefined)}
              {...dropProps(undefined, 'crumb-root')}
              className={`flex items-center gap-1.5 px-2 py-1 rounded-md cursor-pointer shrink-0 ${
                dropTarget === 'crumb-root' ? 'bg-accent/20 text-fg' : !folderId ? 'text-fg font-semibold' : 'text-fg-muted hover:text-fg hover:bg-subtle'
              }`}
            >
              <Home size={13} /> {t('Barra de favoritos')}
            </button>
            {path.map((f, i) => (
              <React.Fragment key={f.id}>
                <ChevronRight size={13} className="text-fg-muted shrink-0" />
                <button
                  type="button"
                  onClick={() => setFolderId(f.id)}
                  {...dropProps(f.id, `crumb-${f.id}`)}
                  className={`px-2 py-1 rounded-md cursor-pointer shrink-0 max-w-[200px] truncate ${
                    dropTarget === `crumb-${f.id}` ? 'bg-accent/20 text-fg' : i === path.length - 1 ? 'text-fg font-semibold' : 'text-fg-muted hover:text-fg hover:bg-subtle'
                  }`}
                >
                  {f.title}
                </button>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Criar pasta / favorito */}
        {creating && (
          <form onSubmit={submitCreate} className="px-4 py-3 bg-canvas border-b border-line flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="flex-1">
              <label className="block text-[11px] text-fg-muted mb-1">{creating === 'folder' ? t('Nome da pasta') : t('Nome')}</label>
              <input
                ref={nameRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={creating === 'folder' ? t('Ex.: Mangás, Animes, Notícias…') : t('Ex.: AniList')}
                className="w-full bg-surface border border-line focus:border-accent rounded px-2.5 py-1.5 text-xs text-fg outline-none"
              />
            </div>
            {creating === 'link' && (
              <div className="flex-1">
                <label className="block text-[11px] text-fg-muted mb-1">{t('Endereço')}</label>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder={t('anilist.co ou https://…')}
                  required
                  className="w-full bg-surface border border-line focus:border-accent rounded px-2.5 py-1.5 text-xs text-fg outline-none"
                />
              </div>
            )}
            <div className="flex gap-2">
              <button type="submit" className="px-4 py-1.5 bg-accent hover:bg-accent-hover text-accent-fg rounded text-xs font-semibold">
                {path.length ? t('Criar em "{folder}"', { folder: path[path.length - 1].title }) : t('Criar')}
              </button>
              <button type="button" onClick={() => setCreating(null)} className="px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-muted hover:text-fg rounded text-xs">
                {t('Cancelar')}
              </button>
            </div>
          </form>
        )}

        {/* Lista */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 text-center text-fg-muted">
              {query ? <Search size={32} className="mb-2 opacity-30" /> : folderId ? <FolderOpen size={36} className="mb-2 opacity-30" /> : <Bookmark size={36} className="mb-2 opacity-30" />}
              <p className="text-sm font-medium">{query ? t('Nada encontrado') : folderId ? t('Pasta vazia') : t('Nenhum favorito ainda')}</p>
              {!query && (
                <p className="text-xs mt-1">
                  {folderId ? t('Crie favoritos ou subpastas aqui, ou arraste itens para esta pasta.') : t('Clique na estrela (☆) da barra de endereço ou importe os favoritos de outro navegador.')}
                </p>
              )}
            </div>
          ) : (
            items.map((n) => {
              const isEditing = editing === n.item.id;
              const isFolder = n.kind === 'folder';
              const counts = isFolder ? countInFolder(data, n.item.id) : null;
              if (isEditing) {
                return (
                  <form
                    key={n.item.id}
                    onSubmit={(e) => {
                      e.preventDefault();
                      saveEdit(n);
                    }}
                    className="p-3 rounded-lg bg-canvas border border-accent/50 flex flex-col gap-2"
                  >
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder={t('Nome')}
                        className="flex-1 bg-surface border border-line focus:border-accent rounded px-2.5 py-1.5 text-xs text-fg outline-none"
                      />
                      {!isFolder && (
                        <input
                          value={editUrl}
                          onChange={(e) => setEditUrl(e.target.value)}
                          placeholder={t('Endereço')}
                          className="flex-1 bg-surface border border-line focus:border-accent rounded px-2.5 py-1.5 text-xs text-fg outline-none font-mono"
                        />
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-fg-muted">{t('Pasta:')}</span>
                      <FolderSelect
                        data={data}
                        value={editParent}
                        exclude={isFolder ? folderDescendants(data, n.item.id) : undefined}
                        onChange={setEditParent}
                        className="flex-1 min-w-[180px]"
                      />
                      <button type="submit" className="px-3 py-1.5 bg-accent hover:bg-accent-hover text-accent-fg rounded text-xs font-semibold inline-flex items-center gap-1">
                        <Check size={13} /> {t('Salvar')}
                      </button>
                      <button type="button" onClick={() => setEditing(null)} className="px-3 py-1.5 bg-subtle hover:bg-elevated text-fg-muted rounded text-xs">
                        {t('Cancelar')}
                      </button>
                    </div>
                  </form>
                );
              }
              return (
                <div
                  key={n.item.id}
                  draggable
                  onDragStart={(e) => {
                    setDragId(n.item.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setDropTarget(null);
                  }}
                  {...(isFolder ? dropProps(n.item.id, `row-${n.item.id}`) : {})}
                  onClick={() => {
                    if (isFolder) {
                      setFolderId(n.item.id);
                      setQuery('');
                    } else {
                      onOpen((n.item as WebBookmark).url);
                      onClose();
                    }
                  }}
                  className={`group flex items-center gap-3 px-2.5 py-2 rounded-lg border transition-all cursor-pointer ${
                    dropTarget === `row-${n.item.id}`
                      ? 'bg-accent/15 border-accent'
                      : dragId === n.item.id
                        ? 'opacity-40 border-line-subtle'
                        : 'bg-canvas hover:bg-subtle border-line-subtle hover:border-line'
                  }`}
                >
                  <div className="w-7 h-7 rounded bg-surface border border-line flex items-center justify-center flex-shrink-0">
                    {isFolder ? <Folder size={15} className="text-warning-fg" /> : <Favicon b={n.item as WebBookmark} className="w-4 h-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-fg truncate group-hover:text-accent transition-colors">{n.item.title}</div>
                    <div className="text-[11px] text-fg-muted truncate mt-0.5">
                      {isFolder
                        ? `${tn(counts!.links, '{n} favorito', '{n} favoritos')}${counts!.folders ? ` · ${tn(counts!.folders, '{n} subpasta', '{n} subpastas')}` : ''}`
                        : <span className="font-mono">{(n.item as WebBookmark).url}</span>}
                      {n.where && <span className="ml-2 text-fg-muted/80">{t('em {where}', { where: n.where })}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex-shrink-0">
                    {!isFolder && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen((n.item as WebBookmark).url);
                          onClose();
                        }}
                        className="p-1.5 text-fg-muted hover:text-fg hover:bg-elevated rounded"
                        title={t('Abrir')}
                      >
                        <ExternalLink size={13} />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(n);
                      }}
                      className="p-1.5 text-fg-muted hover:text-fg hover:bg-elevated rounded"
                      title={isFolder ? t('Renomear / mover pasta') : t('Editar / mover')}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void deleteNode(n);
                      }}
                      className="p-1.5 text-fg-muted hover:text-danger hover:bg-danger/10 rounded"
                      title={isFolder ? t('Excluir pasta') : t('Excluir favorito')}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  {isFolder && <ChevronRight size={14} className="text-fg-muted shrink-0" />}
                </div>
              );
            })
          )}
        </div>

        {/* Rodapé */}
        <div className="flex items-center justify-between gap-4 px-5 py-2.5 border-t border-line bg-canvas text-[11px] text-fg-muted">
          <span>{t('Dica: arraste um item para uma pasta (ou para o caminho acima) para movê-lo. Os itens da raiz aparecem na barra de favoritos.')}</span>
          {(totalLinks > 0 || data.folders.length > 0) && (
            <button type="button" onClick={clearAll} className="text-danger hover:underline flex-shrink-0">
              {t('Limpar tudo')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export type { WebBookmarkFolder };
