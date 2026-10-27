// src/components/SourcesManager.tsx
// Animes & Vídeos → Fontes: um lugar só para extensões (sites, estilo Aniyomi),
// plugins do Nuvio e addons do Stremio. Cola qualquer link e o app descobre o tipo.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Loader2,
  FileJson,
  AlertTriangle,
  CheckCircle2,
  Globe,
  Plug,
  Package,
  Trash2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Compass,
  Search,
  Download,
  ShieldCheck,
  Copy,
  X,
  Sparkles,
} from 'lucide-react';
import {
  NUVIO_EVENT,
  getNuvioState,
  importNuvioJson,
  isScraperEnabled,
  removeNuvioRepo,
  removeStremioAddon,
  setRepoScrapersEnabled,
  setScraperEnabled,
  setStremioAddonEnabled,
  setNuvioEnabled,
  scraperSupported,
  type NuvioRepo,
  type StremioAddon,
} from '../api/nuvio';
import { addAnySource, availableAnimeExtensions, installAnimeExtension, refreshAllVideoSources, removeAnimeExtRepo } from '../api/sources';
import { getInstalledExtensions, removeExtension, type InstalledExtension } from '../api/extensionRegistry';
import { loadRepos } from '../api/reposStore';
import type { RepoExtension } from '../api/repositories';
import { Toggle } from './NuvioView';
import { toast, confirmDialog } from './Feedback';
import { t, tn } from '../i18n';

type Filter = 'all' | 'ext' | 'plugin' | 'addon';

const KIND_STYLE: Record<Exclude<Filter, 'all'>, { label: () => string; cls: string; icon: React.ReactNode }> = {
  ext: { label: () => t('Extensão'), cls: 'bg-sky-500/15 text-sky-300', icon: <Globe size={15} /> },
  plugin: { label: () => t('Plugin'), cls: 'bg-violet-500/15 text-violet-300', icon: <Plug size={15} /> },
  addon: { label: () => t('Addon'), cls: 'bg-amber-500/15 text-amber-300', icon: <Package size={15} /> },
};

const KindBadge: React.FC<{ kind: Exclude<Filter, 'all'> }> = ({ kind }) => (
  <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-px rounded ${KIND_STYLE[kind].cls}`}>{KIND_STYLE[kind].label()}</span>
);

const IconBox: React.FC<{ src?: string; kind: Exclude<Filter, 'all'> }> = ({ src, kind }) => {
  const [broken, setBroken] = useState(false);
  return (
    <span className="w-10 h-10 rounded-lg bg-canvas border border-line-subtle overflow-hidden flex items-center justify-center shrink-0 text-fg-muted">
      {src && !broken ? <img src={src} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" onError={() => setBroken(true)} /> : KIND_STYLE[kind].icon}
    </span>
  );
};

const IconBtn: React.FC<{ title: string; onClick: () => void; danger?: boolean; children: React.ReactNode }> = ({ title, onClick, danger, children }) => (
  <button
    type="button"
    onClick={onClick}
    title={title}
    aria-label={title}
    className={`p-1.5 rounded-md text-fg-muted cursor-pointer shrink-0 ${danger ? 'hover:text-danger-fg hover:bg-danger/10' : 'hover:text-fg hover:bg-subtle'}`}
  >
    {children}
  </button>
);

/* ───────────────────────── Adicionar ───────────────────────── */

const AddSource: React.FC = () => {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const add = async () => {
    const v = input.trim();
    if (!v || busy) return;
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const r = await addAnySource(v);
      setInput('');
      if (r.kind === 'ext-repo') setDone(t('Repositório de extensões adicionado: {n} extensões disponíveis. Escolha quais instalar logo abaixo.', { n: r.count }));
      else if (r.kind === 'repo') setDone(t('Plugins do Nuvio instalados: {name} ({n}).', { name: r.repo.name, n: r.repo.scrapers.length }));
      else setDone(t('Addon instalado: {name}.', { name: r.addon.name }));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  const importFile = async (file: File) => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setNuvioEnabled(true);
      const r = await importNuvioJson(await file.text());
      if (r.addons || r.repos) setDone([r.addons ? tn(r.addons, '{n} addon', '{n} addons') : '', r.repos ? tn(r.repos, '{n} repositório', '{n} repositórios') : ''].filter(Boolean).join(' · '));
      if (r.failed.length) setError(r.failed.join('\n'));
      else if (!r.addons && !r.repos) setError(t('Nada para importar neste arquivo.'));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const kinds: [Exclude<Filter, 'all'>, string, string][] = [
    ['ext', t('Extensões'), t('Sites de anime, como no Aniyomi. Link do repositório (index.min.json ou .pb).')],
    ['plugin', t('Plugins'), t('Scripts do Nuvio que acham links de filmes, séries e animes. Link do manifest.json.')],
    ['addon', t('Addons'), t('Addons do Stremio (ex.: Torrentio). Link do manifest.json ou stremio://.')],
  ];

  return (
    <section className="rounded-xl border border-line bg-surface overflow-hidden">
      <div className="p-5 space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-fg">{t('Adicionar fonte')}</h2>
          <p className="text-[12.5px] text-fg-muted mt-0.5">{t('Cole o link de qualquer extensão, plugin ou addon. O Tomodachi descobre o tipo sozinho.')}</p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://…/index.min.json  ·  https://…/manifest.json  ·  stremio://…"
            spellCheck={false}
            aria-label={t('Link da fonte')}
            className="flex-1 min-w-0 h-10 bg-canvas border border-line focus:border-accent rounded-lg px-3 text-[13px] text-fg outline-none"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="h-10 px-4 rounded-lg bg-accent hover:bg-accent-hover text-accent-fg text-[13px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            {t('Adicionar')}
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            title={t('Importar arquivo .json (lista de addons ou manifesto)')}
            className="h-10 px-3 rounded-lg bg-subtle hover:bg-elevated border border-line text-[12.5px] text-fg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <FileJson size={15} /> <span className="hidden sm:inline">{t('Importar .json')}</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
            }}
          />
        </form>
        {error && (
          <div className="flex items-start gap-2 text-[12px] text-danger-fg bg-danger/10 border border-danger/30 rounded-lg px-3 py-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span className="min-w-0 break-words whitespace-pre-line flex-1">{error}</span>
            <button type="button" onClick={() => setError(null)} className="shrink-0 cursor-pointer" aria-label={t('Fechar')}>
              <X size={13} />
            </button>
          </div>
        )}
        {done && (
          <div className="flex items-start gap-2 text-[12px] text-success-fg bg-success/10 border border-success/30 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
            <span className="min-w-0 flex-1">{done}</span>
            <button type="button" onClick={() => setDone(null)} className="shrink-0 cursor-pointer" aria-label={t('Fechar')}>
              <X size={13} />
            </button>
          </div>
        )}
      </div>
      <div className="grid sm:grid-cols-3 border-t border-line-subtle bg-canvas/40">
        {kinds.map(([k, title, text], i) => (
          <div key={k} className={`p-4 flex gap-3 ${i > 0 ? 'sm:border-l border-t sm:border-t-0 border-line-subtle' : ''}`}>
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${KIND_STYLE[k].cls}`}>{KIND_STYLE[k].icon}</span>
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-fg">{title}</div>
              <p className="text-[11.5px] text-fg-muted leading-relaxed mt-0.5">{text}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-2.5 border-t border-line-subtle text-[11.5px] text-fg-muted flex items-center gap-2">
        <Sparkles size={13} className="text-accent shrink-0" />
        {t('Não importa o tipo: ao clicar em Assistir, o app procura em todas as fontes ligadas e junta os links numa lista só.')}
      </div>
    </section>
  );
};

/* ───────────────────────── Linhas ───────────────────────── */

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

const BrowseBtn: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated border border-line-subtle text-[12px] text-fg inline-flex items-center gap-1.5 cursor-pointer shrink-0"
    title={t('Navegar pelo catálogo desta fonte')}
  >
    <Compass size={13} /> {t('Navegar')}
  </button>
);

const ExtensionRow: React.FC<{ ext: InstalledExtension; onBrowse: (ext: InstalledExtension) => void }> = ({ ext, onBrowse }) => {
  const domain = String(ext.baseUrl || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <IconBox kind="ext" src={ext.icon} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-fg truncate">{ext.name}</span>
          <KindBadge kind="ext" />
        </div>
        <div className="text-[11.5px] text-fg-muted truncate">
          {[domain, ext.lang?.toUpperCase(), ext.version ? `v${ext.version}` : ''].filter(Boolean).join(' · ')}
        </div>
      </div>
      <BrowseBtn onClick={() => onBrowse(ext)} />
      <IconBtn
        danger
        title={t('Remover extensão')}
        onClick={async () => {
          if (await confirmDialog({ title: t('Remover a extensão {name}?', { name: ext.name }), message: t('As obras da biblioteca continuam lá.'), confirmLabel: t('Remover'), danger: true }))
            removeExtension(ext.pkg);
        }}
      >
        <Trash2 size={15} />
      </IconBtn>
    </div>
  );
};

const PluginRepoRow: React.FC<{ repo: NuvioRepo; state: ReturnType<typeof getNuvioState>; onOpenTab?: OpenTabFn }> = ({ repo, state, onOpenTab }) => {
  const [open, setOpen] = useState(false);
  const on = repo.scrapers.filter((s) => isScraperEnabled(state, repo, s)).length;
  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3">
        <IconBox kind="plugin" src={repo.scrapers.find((s) => s.logo)?.logo} />
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="min-w-0 flex-1 text-left cursor-pointer">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] font-semibold text-fg truncate">{repo.name}</span>
            <KindBadge kind="plugin" />
            {repo.error && (
              <span className="text-[10.5px] text-warning-fg inline-flex items-center gap-0.5" title={repo.error}>
                <AlertTriangle size={11} /> {t('Erro ao atualizar')}
              </span>
            )}
          </div>
          <div className="text-[11.5px] text-fg-muted truncate inline-flex items-center gap-1">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
            {t('{on} de {total} ativos', { on, total: repo.scrapers.length })}
            {repo.author ? ` · ${repo.author}` : ''}
          </div>
        </button>
        <BrowseBtn onClick={() => onOpenTab?.('source-browse', repo.name, { target: { kind: 'plugin', url: repo.url, name: repo.name } })} />
        <Toggle on={on > 0} onChange={(v) => setRepoScrapersEnabled(repo.url, v)} label={on > 0 ? t('Desativar {name}', { name: repo.name }) : t('Ativar {name}', { name: repo.name })} />
        <IconBtn
          danger
          title={t('Remover')}
          onClick={async () => {
            if (await confirmDialog({ title: t('Remover {name}?', { name: repo.name }), message: t('Os plugins dele deixam de ser usados. As obras da biblioteca continuam lá.'), confirmLabel: t('Remover'), danger: true }))
              removeNuvioRepo(repo.url);
          }}
        >
          <Trash2 size={15} />
        </IconBtn>
      </div>
      {open && (
        <div className="ml-[68px] mr-4 mb-3 rounded-lg border border-line-subtle divide-y divide-line-subtle overflow-hidden">
          {repo.scrapers.map((s) => {
            const enabled = isScraperEnabled(state, repo, s);
            const unsupported = !scraperSupported(s);
            return (
              <div key={s.id} className="flex items-center gap-2.5 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="text-[12.5px] text-fg truncate block">
                    {s.name}
                    {unsupported && <span className="ml-1.5 text-[10px] px-1 rounded bg-danger/15 text-danger-fg">{t('formato sem suporte')}</span>}
                  </span>
                  <span className="text-[10.5px] text-fg-muted">
                    {s.supportedTypes.map((ty) => (ty === 'movie' ? t('Filmes') : ty === 'tv' ? t('Séries') : ty)).join(' · ')}
                    {s.contentLanguage?.length ? ` · ${s.contentLanguage.join('/').toUpperCase()}` : ''}
                  </span>
                </span>
                <Toggle small on={enabled} onChange={(v) => setScraperEnabled(repo.url, s.id, v)} label={enabled ? t('Desativar {name}', { name: s.name }) : t('Ativar {name}', { name: s.name })} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const AddonRow: React.FC<{ addon: StremioAddon; onOpenTab?: OpenTabFn }> = ({ addon: a, onOpenTab }) => {
  const res = a.resources.map((r) => (r.name === 'stream' ? t('links') : r.name === 'catalog' ? t('catálogo') : r.name === 'meta' ? t('detalhes') : r.name === 'subtitles' ? t('legendas') : r.name));
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <IconBox kind="addon" src={a.logo} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[13px] font-semibold text-fg truncate">{a.name}</span>
          <KindBadge kind="addon" />
          {a.error && (
            <span className="text-[10.5px] text-warning-fg inline-flex items-center gap-0.5" title={a.error}>
              <AlertTriangle size={11} /> {t('Erro ao atualizar')}
            </span>
          )}
        </div>
        <div className="text-[11.5px] text-fg-muted truncate" title={a.description}>
          {res.join(' · ')}
          {a.version ? ` · v${a.version}` : ''}
        </div>
      </div>
      <BrowseBtn onClick={() => onOpenTab?.('source-browse', a.name, { target: { kind: 'addon', url: a.url, name: a.name } })} />
      <IconBtn
        title={t('Copiar link do addon')}
        onClick={() => {
          void navigator.clipboard?.writeText(a.url);
          toast.info(t('Link copiado'));
        }}
      >
        <Copy size={14} />
      </IconBtn>
      <Toggle on={a.enabled} onChange={(v) => setStremioAddonEnabled(a.url, v)} label={a.enabled ? t('Desativar {name}', { name: a.name }) : t('Ativar {name}', { name: a.name })} />
      <IconBtn
        danger
        title={t('Remover')}
        onClick={async () => {
          if (await confirmDialog({ title: t('Remover {name}?', { name: a.name }), message: t('Ele deixa de ser usado no catálogo e nas fontes. As obras da biblioteca continuam lá.'), confirmLabel: t('Remover'), danger: true }))
            removeStremioAddon(a.url);
        }}
      >
        <Trash2 size={15} />
      </IconBtn>
    </div>
  );
};

/* ───────────────────────── Extensões para instalar ───────────────────────── */

const AvailableExtensions: React.FC<{ installed: InstalledExtension[] }> = ({ installed }) => {
  const [repos, setRepos] = useState(() => loadRepos('anime'));
  const [items, setItems] = useState<{ repoUrl: string; repoLabel: string; ext: RepoExtension }[] | null>(null);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(true);

  const load = useCallback(async (force = false) => {
    setItems(null);
    setRepos(loadRepos('anime'));
    setItems(await availableAnimeExtensions(force));
  }, []);

  useEffect(() => {
    void load();
    const on = () => {
      const next = loadRepos('anime');
      setRepos((prev) => {
        if (prev.length !== next.length || prev.some((r, i) => r.url !== next[i]?.url)) void load();
        return next;
      });
    };
    window.addEventListener('extensions:updated', on);
    return () => window.removeEventListener('extensions:updated', on);
  }, [load]);

  const isInstalled = (e: RepoExtension) => installed.some((i) => (e.pkg && i.pkg === e.pkg) || i.name.toLowerCase() === e.name.replace(/^Aniyomi:\s*/i, '').toLowerCase());
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter(({ ext }) => !isInstalled(ext) && (!q || ext.name.toLowerCase().includes(q) || ext.lang.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, query, installed]);

  if (repos.length === 0) return null;

  return (
    <section className="rounded-xl border border-line bg-surface overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center gap-2 px-4 py-3 text-left cursor-pointer" aria-expanded={open}>
        {open ? <ChevronDown size={15} className="text-fg-muted" /> : <ChevronRight size={15} className="text-fg-muted" />}
        <h3 className="text-[13.5px] font-semibold text-fg">{t('Extensões para instalar')}</h3>
        <span className="text-[11.5px] text-fg-muted">{items ? tn(available.length, '{n} disponível', '{n} disponíveis') : t('Carregando…')}</span>
      </button>
      {open && (
        <>
          <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('Filtrar por nome ou idioma (ex.: pt-BR)')}
                className="w-full h-8 bg-canvas border border-line-subtle focus:border-accent rounded-md pl-8 pr-2 text-[12.5px] text-fg outline-none"
              />
            </div>
            <span className="text-[11px] text-fg-muted">{t('Repositórios:')}</span>
            {repos.map((r) => (
              <span key={r.url} className="inline-flex items-center gap-1 h-7 pl-2.5 pr-1 rounded-full bg-subtle border border-line-subtle text-[11.5px] text-fg-2" title={r.url}>
                {r.label}
                <button
                  type="button"
                  onClick={async () => {
                    if (await confirmDialog({ title: t('Remover o repositório {name}?', { name: r.label }), message: t('As extensões já instaladas continuam funcionando.'), confirmLabel: t('Remover'), danger: true }))
                      removeAnimeExtRepo(r.url);
                  }}
                  className="p-0.5 rounded-full hover:bg-danger/20 hover:text-danger-fg cursor-pointer"
                  aria-label={t('Remover o repositório {name}?', { name: r.label })}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
          <div className="border-t border-line-subtle max-h-[340px] overflow-y-auto divide-y divide-line-subtle">
            {!items ? (
              <div className="p-5 flex items-center justify-center gap-2 text-[12.5px] text-fg-muted">
                <Loader2 size={14} className="animate-spin" /> {t('Carregando extensões…')}
              </div>
            ) : available.length === 0 ? (
              <div className="p-5 text-center text-[12.5px] text-fg-muted">{query ? t('Nada encontrado') : t('Todas as extensões destes repositórios já estão instaladas.')}</div>
            ) : (
              available.slice(0, 200).map(({ ext, repoUrl }) => (
                <div key={`${repoUrl}#${ext.pkg || ext.name}`} className="flex items-center gap-3 px-4 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="text-[12.5px] text-fg truncate block">
                      {ext.name.replace(/^Aniyomi:\s*/i, '')}
                      {ext.nsfw && <span className="ml-1.5 text-[9.5px] px-1 rounded bg-danger/15 text-danger-fg">18+</span>}
                    </span>
                    <span className="text-[10.5px] text-fg-muted font-mono">{[ext.lang, ext.versionName || ext.version].filter(Boolean).join(' · ')}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const inst = installAnimeExtension(ext, repoUrl);
                      toast.success(t('Extensão instalada'), inst.name);
                    }}
                    className="h-7 px-2.5 rounded-md bg-subtle hover:bg-accent hover:text-accent-fg border border-line-subtle text-[11.5px] text-fg inline-flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    <Download size={12} /> {t('Instalar')}
                  </button>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </section>
  );
};

/* ───────────────────────── Tela ───────────────────────── */

export const SourcesManager: React.FC<{ onOpenTab?: OpenTabFn }> = ({ onOpenTab }) => {
  const onBrowseExtension = (ext: InstalledExtension) => onOpenTab?.('extension-catalog', ext.name, { extension: ext, mediaType: 'video' });
  const [state, setState] = useState(getNuvioState);
  const [installed, setInstalled] = useState(() => getInstalledExtensions('anime'));
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    // O interruptor geral saiu da interface: fontes instaladas ficam sempre disponíveis
    if (!getNuvioState().enabled) setNuvioEnabled(true);
    const onNuvio = () => setState(getNuvioState());
    const onExt = () => setInstalled(getInstalledExtensions('anime'));
    window.addEventListener(NUVIO_EVENT, onNuvio);
    window.addEventListener('extensions:updated', onExt);
    window.addEventListener('storage', onExt);
    return () => {
      window.removeEventListener(NUVIO_EVENT, onNuvio);
      window.removeEventListener('extensions:updated', onExt);
      window.removeEventListener('storage', onExt);
    };
  }, []);

  const counts = { ext: installed.length, plugin: state.repos.length, addon: state.addons.length };
  const total = counts.ext + counts.plugin + counts.addon;

  const refresh = async () => {
    setRefreshing(true);
    try {
      const r = await refreshAllVideoSources();
      if (r.failed) toast.warning(tn(r.failed, '{n} fonte não respondeu', '{n} fontes não responderam'));
      else toast.success(t('Fontes atualizadas'));
    } finally {
      setRefreshing(false);
    }
  };

  const chips: [Filter, string, number][] = [
    ['all', t('Todas'), total],
    ['ext', t('Extensões'), counts.ext],
    ['plugin', t('Plugins'), counts.plugin],
    ['addon', t('Addons'), counts.addon],
  ];

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="max-w-5xl mx-auto p-5 space-y-5">
        <AddSource />

        <section className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-[14px] font-semibold text-fg mr-1">{t('Suas fontes')}</h2>
            <div role="tablist" className="flex items-center gap-1">
              {chips.map(([id, label, n]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={filter === id}
                  onClick={() => setFilter(id)}
                  className={`h-7 px-2.5 rounded-full text-[12px] border inline-flex items-center gap-1.5 cursor-pointer ${
                    filter === id ? 'bg-accent/15 border-accent/50 text-fg font-semibold' : 'border-line-subtle text-fg-muted hover:text-fg hover:bg-subtle'
                  }`}
                >
                  {label}
                  <span className="text-[10.5px] tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
            {total > 0 && (
              <button
                type="button"
                onClick={refresh}
                disabled={refreshing}
                className="ml-auto h-8 px-3 rounded-md bg-subtle hover:bg-elevated border border-line-subtle text-[12px] text-fg-2 hover:text-fg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
                {t('Atualizar tudo')}
              </button>
            )}
          </div>

          {total === 0 ? (
            <div className="rounded-xl border border-dashed border-line p-8 text-center">
              <p className="text-[13.5px] font-semibold text-fg">{t('Nenhuma fonte ainda')}</p>
              <p className="text-[12.5px] text-fg-muted mt-1 max-w-md mx-auto">
                {t('Você já pode explorar o catálogo e favoritar obras. Para assistir, cole acima o link de uma extensão, plugin ou addon.')}
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-line bg-surface divide-y divide-line-subtle overflow-hidden">
              {(filter === 'all' || filter === 'ext') && installed.map((e) => <ExtensionRow key={e.pkg} ext={e} onBrowse={onBrowseExtension} />)}
              {(filter === 'all' || filter === 'plugin') && state.repos.map((r) => <PluginRepoRow key={r.url} repo={r} state={state} onOpenTab={onOpenTab} />)}
              {(filter === 'all' || filter === 'addon') && state.addons.map((a) => <AddonRow key={a.url} addon={a} onOpenTab={onOpenTab} />)}
              {filter !== 'all' && counts[filter] === 0 && <div className="p-6 text-center text-[12.5px] text-fg-muted">{t('Nada deste tipo instalado.')}</div>}
            </div>
          )}
        </section>

        <AvailableExtensions installed={installed} />

        <div className="flex items-start gap-2 text-[11.5px] text-fg-muted pb-4">
          <ShieldCheck size={14} className="shrink-0 mt-0.5 text-success" />
          <span className="flex-1">
            {t('Fontes são feitas pela comunidade. Plugins rodam isolados, sem acesso aos seus arquivos. Links de torrent tocam direto no app (a velocidade depende dos seeders). Instale apenas o que você confia.')}
          </span>
          {state.repos.length > 0 && (
            <button
              type="button"
              onClick={async () => {
                await window.electronAPI?.nuvioClearCache?.();
                toast.info(t('Cache dos plugins limpo'), t('O código será baixado de novo na próxima busca.'));
              }}
              className="shrink-0 hover:text-fg hover:underline underline-offset-2 cursor-pointer"
            >
              {t('Limpar cache dos plugins')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
