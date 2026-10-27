// src/components/SuwayomiBrowser.tsx
// Catálogo e gerenciador de extensões via Suwayomi-Server (extensões reais do Mihon).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Server,
  Search,
  Loader2,
  RefreshCw,
  Download,
  Trash2,
  ArrowUpCircle,
  Settings2,
  ExternalLink,
  Flame,
  Clock,
  Plug,
  CheckCircle2,
  AlertCircle,
  FolderOpen,
  Puzzle,
  BookOpen,
} from 'lucide-react';
import { toast, confirmDialog } from './Feedback';
import { SuwayomiSetupPanel as SettingsPanel } from './SuwayomiSetup';
import { useIsTabActive } from '../context/TabContext';
import {
  getSuwayomiConfig,
  saveSuwayomiConfig,
  testConnection,
  ensureServerRunning,
  listSources,
  browseSource,
  listExtensions,
  changeExtension,
  addExtensionRepo,
  suwaMangaToLibraryItem,
  SUWAYOMI_EVENT,
  DEFAULT_SUWAYOMI_URL,
  SUWAYOMI_DOWNLOAD_URL,
  type SuwayomiConfig,
  type SuwaSource,
  type SuwaManga,
  type SuwaExtension,
} from '../api/suwayomi';
import { loadRepos } from '../api/reposStore';
import { t, tn } from '../i18n';

type OpenTabFn = (type: any, title: string, data?: any) => void;
type Panel = 'catalog' | 'extensions' | 'settings';

const LAST_SOURCE_KEY = 'tp_suwayomi_last_source';
const LANG_KEY = 'tp_suwayomi_lang';

const langLabel = (l: string) =>
  ({ all: t('Todas'), 'pt-BR': t('Português (BR)'), pt: t('Português'), en: t('Inglês'), es: t('Espanhol'), 'es-419': t('Espanhol (LatAm)'), ja: t('Japonês'), fr: t('Francês'), id: t('Indonésio'), ko: t('Coreano'), zh: t('Chinês'), ru: t('Russo'), it: t('Italiano'), de: t('Alemão'), vi: t('Vietnamita'), ar: t('Árabe'), tr: t('Turco'), localsourcelang: t('Local') } as Record<string, string>)[l] || l.toUpperCase();

const openExternal = (url: string) => {
  if (window.electronAPI?.openExternal) window.electronAPI.openExternal(url);
};

/* ─────────────────────────── Extensões ─────────────────────────── */

const ExtensionsPanel: React.FC<{ onChanged: () => void }> = ({ onChanged }) => {
  const [exts, setExts] = useState<SuwaExtension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [lang, setLang] = useState<string>(() => localStorage.getItem(LANG_KEY) || 'pt-BR');
  const [busy, setBusy] = useState<string | null>(null);
  const [showNsfw, setShowNsfw] = useState(false);

  const load = useCallback(async (refresh: boolean) => {
    setLoading(true);
    setError(null);
    try {
      setExts(await listExtensions(refresh));
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(true);
  }, [load]);

  const langs = useMemo(() => Array.from(new Set(exts.map((e) => e.lang))).sort(), [exts]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exts
      .filter((e) => (showNsfw ? true : !e.isNsfw))
      .filter((e) => lang === 'all' || e.lang === lang || e.lang === 'all' || e.isInstalled)
      .filter((e) => !q || e.name.toLowerCase().includes(q))
      .sort((a, b) => Number(b.isInstalled) - Number(a.isInstalled) || Number(b.hasUpdate) - Number(a.hasUpdate) || a.name.localeCompare(b.name));
  }, [exts, query, lang, showNsfw]);

  const act = async (e: SuwaExtension, action: 'install' | 'update' | 'uninstall') => {
    if (action === 'uninstall' && !(await confirmDialog({ title: t('Remover {name}?', { name: e.name }), confirmLabel: t('Remover'), danger: true }))) return;
    setBusy(e.pkgName);
    try {
      await changeExtension(e.pkgName, action);
      toast.success(action === 'install' ? t('{name} instalada', { name: e.name }) : action === 'update' ? t('{name} atualizada', { name: e.name }) : t('{name} removida', { name: e.name }));
      await load(false);
      onChanged();
    } catch (err: any) {
      toast.error(action === 'uninstall' ? t('Não foi possível remover {name}', { name: e.name }) : t('Não foi possível instalar {name}', { name: e.name }), err?.message || String(err));
    } finally {
      setBusy(null);
    }
  };

  const importRepos = async () => {
    const repos = loadRepos('manga');
    if (repos.length === 0) {
      toast.info(t('Nenhum repositório de mangá configurado no Tomodachi'));
      return;
    }
    let ok = 0;
    let lastErr = '';
    for (const r of repos) {
      try {
        await addExtensionRepo(r.url);
        ok++;
      } catch (err: any) {
        lastErr = err?.message || String(err);
      }
    }
    if (ok > 0) {
      toast.success(tn(ok, '{n} repositório adicionado ao Suwayomi', '{n} repositórios adicionados ao Suwayomi'));
      load(true);
    } else {
      toast.error(t('Não foi possível adicionar os repositórios'), t('{error}. Adicione pela interface web do Suwayomi (Configurações → Navegar → Repositórios de extensões).', { error: lastErr }));
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line-subtle bg-canvas flex-shrink-0">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Buscar extensão…')} className="w-full h-8 bg-surface border border-line-subtle focus:border-accent rounded-md pl-8 pr-2 text-[12.5px] text-fg outline-none" />
        </div>
        <select
          value={lang}
          onChange={(e) => {
            setLang(e.target.value);
            try {
              localStorage.setItem(LANG_KEY, e.target.value);
            } catch {
              /* ignore */
            }
          }}
          className="h-8 bg-surface border border-line-subtle text-fg rounded-md px-2 text-[12.5px] outline-none cursor-pointer"
        >
          <option value="all">{t('Todos os idiomas')}</option>
          {langs.map((l) => (
            <option key={l} value={l}>
              {langLabel(l)}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1.5 text-[12px] text-fg-muted cursor-pointer select-none">
          <input type="checkbox" checked={showNsfw} onChange={(e) => setShowNsfw(e.target.checked)} /> +18
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={importRepos} className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium cursor-pointer" title={t('Envia ao Suwayomi os repositórios configurados no Tomodachi')}>
            {t('Usar meus repositórios')}
          </button>
          <button type="button" onClick={() => load(true)} disabled={loading} className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> {t('Atualizar')}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center px-6">
            <AlertCircle size={26} className="text-danger-fg" />
            <p className="text-[13px] text-fg-2 max-w-md">{error}</p>
          </div>
        ) : loading && exts.length === 0 ? (
          <div className="flex justify-center py-16 text-fg-muted">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 px-6 text-[13px] text-fg-muted max-w-md mx-auto">
            {t('Nenhuma extensão encontrada. Se a lista estiver vazia, o Suwayomi ainda não tem repositórios: clique em')}{' '}
            <strong className="text-fg-2">“{t('Usar meus repositórios')}”</strong>.
          </div>
        ) : (
          <div className="max-w-4xl mx-auto p-4">
            <div className="rounded-xl border border-line-subtle bg-surface divide-y divide-line-subtle overflow-hidden">
              {filtered.map((e) => (
                <div key={e.pkgName} className="flex items-center gap-3 px-3 py-2.5">
                  {e.iconUrl ? (
                    <img src={e.iconUrl} alt="" className="w-9 h-9 rounded-lg bg-subtle shrink-0" onError={(ev) => (ev.currentTarget.style.visibility = 'hidden')} />
                  ) : (
                    <div className="w-9 h-9 rounded-lg bg-subtle shrink-0 flex items-center justify-center text-fg-muted">
                      <Puzzle size={16} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium text-fg truncate flex items-center gap-1.5">
                      {e.name}
                      {e.isNsfw && <span className="text-[10px] px-1 rounded bg-rose-500/15 text-rose-300">18+</span>}
                      {e.isObsolete && <span className="text-[10px] px-1 rounded bg-warning/15 text-warning-fg">{t('obsoleta')}</span>}
                    </div>
                    <div className="text-[11.5px] text-fg-muted">
                      {langLabel(e.lang)} · v{e.versionName}
                    </div>
                  </div>
                  {busy === e.pkgName ? (
                    <Loader2 size={16} className="animate-spin text-accent" />
                  ) : e.isInstalled ? (
                    <div className="flex items-center gap-1">
                      {e.hasUpdate && (
                        <button type="button" onClick={() => act(e, 'update')} className="h-7 px-2.5 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12px] font-semibold inline-flex items-center gap-1 cursor-pointer">
                          <ArrowUpCircle size={12} /> {t('Atualizar')}
                        </button>
                      )}
                      <button type="button" onClick={() => act(e, 'uninstall')} className="p-1.5 rounded-md text-fg-muted hover:text-danger-fg hover:bg-elevated cursor-pointer" title={t('Remover')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => act(e, 'install')} className="h-7 px-2.5 rounded-md bg-subtle hover:bg-accent hover:text-accent-fg text-fg-2 text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer">
                      <Download size={12} /> {t('Instalar')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────── Catálogo ─────────────────────────── */

const CatalogPanel: React.FC<{ onOpenTab?: OpenTabFn; sourcesVersion: number; onGoToExtensions: () => void }> = ({ onOpenTab, sourcesVersion, onGoToExtensions }) => {
  const [sources, setSources] = useState<SuwaSource[]>([]);
  const [sourceId, setSourceId] = useState<string>(() => localStorage.getItem(LAST_SOURCE_KEY) || '');
  const [mode, setMode] = useState<'POPULAR' | 'LATEST' | 'SEARCH'>('POPULAR');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [mangas, setMangas] = useState<SuwaManga[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingSources, setLoadingSources] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    setLoadingSources(true);
    listSources()
      .then((list) => {
        setSources(list);
        setError(null);
        if (list.length > 0 && !list.some((s) => s.id === sourceId)) setSourceId(list[0].id);
      })
      .catch((err) => setError(err?.message || String(err)))
      .finally(() => setLoadingSources(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourcesVersion]);

  const source = sources.find((s) => s.id === sourceId);

  const load = useCallback(
    async (p: number, append: boolean) => {
      if (!sourceId) return;
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const r = await browseSource(sourceId, mode, p, submitted);
        if (id !== reqId.current) return;
        setMangas((prev) => (append ? [...prev, ...r.mangas.filter((m) => !prev.some((x) => x.id === m.id))] : r.mangas));
        setHasNext(r.hasNextPage);
        setPage(p);
      } catch (err: any) {
        if (id === reqId.current) setError(err?.message || String(err));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [sourceId, mode, submitted]
  );

  useEffect(() => {
    if (!sourceId) return;
    try {
      localStorage.setItem(LAST_SOURCE_KEY, sourceId);
    } catch {
      /* ignore */
    }
    setMangas([]);
    load(1, false);
  }, [sourceId, mode, submitted, load]);

  const openManga = (m: SuwaManga) => {
    const item = suwaMangaToLibraryItem(m, source?.displayName);
    onOpenTab?.('manga-detail', m.title, { manga: item, initialExtension: item.sourceName });
  };

  const byLang = useMemo(() => {
    const groups: Record<string, SuwaSource[]> = {};
    for (const s of sources) (groups[s.lang] = groups[s.lang] || []).push(s);
    return Object.entries(groups).sort(([a], [b]) => (a === 'pt-BR' ? -1 : b === 'pt-BR' ? 1 : a.localeCompare(b)));
  }, [sources]);

  if (!loadingSources && sources.length === 0 && !error) {
    return (
      <div className="flex flex-col items-center text-center py-20 px-6 max-w-md mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-subtle text-accent flex items-center justify-center mb-4">
          <Puzzle size={26} />
        </div>
        <h3 className="text-[15px] font-semibold text-fg mb-1.5">{t('Nenhuma fonte instalada no Suwayomi')}</h3>
        <p className="text-[13px] text-fg-muted mb-5">{t('Instale extensões (ex.: MangaDex, fontes em português) para navegar pelos catálogos.')}</p>
        <button type="button" onClick={onGoToExtensions} className="h-9 px-4 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-[13px] font-semibold cursor-pointer">
          {t('Instalar extensões')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-line-subtle bg-canvas flex-shrink-0">
        <select
          value={sourceId}
          onChange={(e) => {
            setSourceId(e.target.value);
            setMode('POPULAR');
            setSubmitted('');
            setQuery('');
          }}
          className="h-8 max-w-[260px] bg-surface border border-line-subtle text-fg rounded-md px-2 text-[12.5px] outline-none cursor-pointer"
          aria-label={t('Fonte')}
        >
          {byLang.map(([lang, list]) => (
            <optgroup key={lang} label={langLabel(lang)}>
              {list.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-line-subtle bg-surface">
          <button type="button" onClick={() => { setMode('POPULAR'); setSubmitted(''); }} className={`h-7 px-2.5 rounded text-[12px] inline-flex items-center gap-1 cursor-pointer ${mode === 'POPULAR' ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg'}`}>
            <Flame size={12} /> {t('Populares')}
          </button>
          {source?.supportsLatest && (
            <button type="button" onClick={() => { setMode('LATEST'); setSubmitted(''); }} className={`h-7 px-2.5 rounded text-[12px] inline-flex items-center gap-1 cursor-pointer ${mode === 'LATEST' ? 'bg-accent/15 text-accent' : 'text-fg-muted hover:text-fg'}`}>
              <Clock size={12} /> {t('Recentes')}
            </button>
          )}
        </div>

        <form
          className="relative flex-1 min-w-[200px] max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            const q = query.trim();
            if (!q) return;
            setMode('SEARCH');
            setSubmitted(q);
          }}
        >
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={source ? t('Buscar em {source}… (Enter)', { source: source.displayName }) : t('Buscar…')} className="w-full h-8 bg-surface border border-line-subtle focus:border-accent rounded-md pl-8 pr-2 text-[12.5px] text-fg outline-none" />
        </form>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AlertCircle size={26} className="text-danger-fg" />
            <p className="text-[13px] text-fg-2 max-w-md">{error}</p>
            <button type="button" onClick={() => load(1, false)} className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium cursor-pointer">
              {t('Tentar novamente')}
            </button>
          </div>
        ) : (
          <>
            <div className="grid gap-x-4 gap-y-5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
              {mangas.map((m) => (
                <button key={m.id} type="button" onClick={() => openManga(m)} className="group text-left cursor-pointer focus-visible:outline-none" title={m.title}>
                  <div className="aspect-[2/3] rounded-lg overflow-hidden bg-subtle ring-1 ring-line-subtle group-hover:ring-accent/60 relative">
                    {m.thumbnailUrl ? (
                      <img src={m.thumbnailUrl} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" onError={(e) => (e.currentTarget.style.visibility = 'hidden')} />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-fg-muted">
                        <BookOpen size={22} />
                      </div>
                    )}
                    {m.inLibrary && <span className="absolute top-1.5 left-1.5 px-1.5 h-5 inline-flex items-center rounded-md bg-accent text-accent-fg text-[10.5px] font-semibold">{t('Na biblioteca')}</span>}
                  </div>
                  <div className="pt-2 text-[12.5px] font-medium text-fg line-clamp-2 leading-snug group-hover:text-accent">{m.title}</div>
                </button>
              ))}
              {loading &&
                Array.from({ length: mangas.length === 0 ? 12 : 6 }).map((_, i) => (
                  <div key={`sk-${i}`} className="animate-pulse">
                    <div className="aspect-[2/3] rounded-lg bg-subtle" />
                    <div className="h-3 mt-2 rounded bg-subtle w-4/5" />
                  </div>
                ))}
            </div>
            {!loading && mangas.length === 0 && sourceId && <p className="text-center text-[13px] text-fg-muted py-12">{t('Nada encontrado nesta fonte.')}</p>}
            {!loading && hasNext && (
              <div className="flex justify-center mt-6">
                <button type="button" onClick={() => load(page + 1, true)} className="h-9 px-5 rounded-lg bg-subtle hover:bg-elevated text-fg text-[13px] font-medium cursor-pointer">
                  {t('Carregar mais')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────── Componente principal ─────────────────────────── */

export const SuwayomiBrowser: React.FC<{ onOpenTab?: OpenTabFn }> = ({ onOpenTab }) => {
  const isActive = useIsTabActive();
  const [configured, setConfigured] = useState(() => !!getSuwayomiConfig());
  const [panel, setPanel] = useState<Panel>(() => (getSuwayomiConfig() ? 'catalog' : 'settings'));
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [sourcesVersion, setSourcesVersion] = useState(0);

  const check = useCallback(async (tryStart = false) => {
    const cfg = getSuwayomiConfig();
    if (!cfg) return;
    setStatus('checking');
    const ok = tryStart ? await ensureServerRunning() : await testConnection(cfg).then(() => true, () => false);
    setStatus(ok ? 'online' : 'offline');
  }, []);

  useEffect(() => {
    const onChange = () => {
      const has = !!getSuwayomiConfig();
      setConfigured(has);
      if (has) check(false);
    };
    window.addEventListener(SUWAYOMI_EVENT, onChange);
    return () => window.removeEventListener(SUWAYOMI_EVENT, onChange);
  }, [check]);

  useEffect(() => {
    if (configured && isActive && status === 'checking') check(!!getSuwayomiConfig()?.exePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [configured, isActive]);

  const tabs: Array<[Panel, string, React.ReactNode]> = [
    ['catalog', t('Catálogo'), <BookOpen key="c" size={13} />],
    ['extensions', t('Extensões'), <Puzzle key="e" size={13} />],
    ['settings', t('Conexão'), <Settings2 key="s" size={13} />],
  ];

  return (
    <div className="flex flex-col h-full min-h-0 bg-canvas">
      <div className="flex items-center gap-2 px-4 h-11 border-b border-line-subtle bg-surface flex-shrink-0">
        <Server size={15} className="text-accent" />
        <span className="text-[13px] font-semibold text-fg">Suwayomi</span>
        {configured && (
          <span className={`text-[11px] inline-flex items-center gap-1 ml-1 ${status === 'online' ? 'text-success-fg' : status === 'offline' ? 'text-danger-fg' : 'text-fg-muted'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${status === 'online' ? 'bg-success-fg' : status === 'offline' ? 'bg-danger-fg' : 'bg-fg-muted animate-pulse'}`} />
            {status === 'online' ? t('conectado') : status === 'offline' ? t('desconectado') : t('verificando…')}
          </span>
        )}
        {configured && (
          <div className="ml-4 flex items-center gap-0.5" role="tablist">
            {tabs.map(([key, label, icon]) => (
              <button key={key} type="button" role="tab" aria-selected={panel === key} onClick={() => setPanel(key)} className={`h-7 px-2.5 rounded-md text-[12px] inline-flex items-center gap-1.5 cursor-pointer ${panel === key ? 'bg-accent/15 text-fg' : 'text-fg-muted hover:text-fg hover:bg-subtle'}`}>
                {icon}
                {label}
              </button>
            ))}
          </div>
        )}
        {configured && status === 'offline' && (
          <button type="button" onClick={() => check(true)} className="ml-auto h-7 px-2.5 rounded-md bg-subtle hover:bg-elevated text-fg text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer">
            <RefreshCw size={12} /> {getSuwayomiConfig()?.exePath ? t('Iniciar servidor') : t('Reconectar')}
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {!configured || panel === 'settings' ? (
          <div className="h-full overflow-y-auto">
            <SettingsPanel
              firstRun={!configured}
              onSaved={() => {
                const has = !!getSuwayomiConfig();
                setConfigured(has);
                setPanel(has ? 'catalog' : 'settings');
                setSourcesVersion((v) => v + 1);
                if (has) check(true);
              }}
            />
          </div>
        ) : status === 'offline' ? (
          <div className="flex flex-col items-center text-center py-20 px-6 max-w-md mx-auto">
            <AlertCircle size={28} className="text-danger-fg mb-3" />
            <h3 className="text-[15px] font-semibold text-fg mb-1.5">{t('Servidor Suwayomi fora do ar')}</h3>
            <p className="text-[13px] text-fg-muted mb-5">
              {t('Abra o Suwayomi (ou configure o executável em “Conexão” para o app iniciá-lo sozinho) e tente de novo.')}
            </p>
            <button type="button" onClick={() => check(true)} className="h-9 px-4 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-[13px] font-semibold cursor-pointer">
              {t('Tentar novamente')}
            </button>
          </div>
        ) : panel === 'extensions' ? (
          <ExtensionsPanel onChanged={() => setSourcesVersion((v) => v + 1)} />
        ) : (
          <CatalogPanel onOpenTab={onOpenTab} sourcesVersion={sourcesVersion} onGoToExtensions={() => setPanel('extensions')} />
        )}
      </div>
    </div>
  );
};
