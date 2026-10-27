// src/components/NuvioView.tsx
// Aba "Nuvio" em Animes & Vídeos: catálogo (Cinemeta) + gerenciador de plugins.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Search,
  Loader2,
  Plug,
  Plus,
  Trash2,
  RefreshCw,
  Star,
  Heart,
  Film,
  Tv,
  Sparkles,
  AlertTriangle,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  X,
  FileJson,
  Puzzle,
  Copy,
  HelpCircle,
  ChevronUp,
  Globe,
} from 'lucide-react';
import {
  NUVIO_EVENT,
  NUVIO_GENRES,
  addonCatalogs,
  fetchAddonCatalog,
  importNuvioJson,
  installFromLink,
  refreshStremioAddons,
  removeStremioAddon,
  setStremioAddonEnabled,
  getNuvioState,
  isScraperEnabled,
  nuvioCatalog,
  nuvioWorkUrl,
  refreshNuvioRepos,
  removeNuvioRepo,
  setNuvioEnabled,
  setRepoScrapersEnabled,
  setScraperEnabled,
  scraperSupported,
  type NuvioMetaPreview,
  type NuvioRepo,
  type StremioAddon,
  type NuvioType,
} from '../api/nuvio';
import { readLibrary } from '../utils/libraryStore';
import { toast, confirmDialog } from './Feedback';
import { t, tn } from '../i18n';
import type { TabType } from '../types';

type OpenTabFn = (typeOrTab: TabType | any, title?: string, data?: any) => void;
type Panel = 'catalog' | 'plugins';
type Kind = 'series' | 'movie' | 'anime';

const PANEL_KEY = 'tp_nuvio_panel';
const KIND_KEY = 'tp_nuvio_kind';

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string; small?: boolean }> = ({ on, onChange, label, small }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    title={label}
    onClick={() => onChange(!on)}
    className={`relative shrink-0 rounded-full transition-colors cursor-pointer ${small ? 'w-8 h-[18px]' : 'w-9 h-5'} ${on ? 'bg-accent' : 'bg-line'}`}
  >
    <span
      className={`absolute top-0.5 rounded-full bg-white shadow transition-all ${small ? 'w-3.5 h-3.5' : 'w-4 h-4'} ${
        on ? (small ? 'left-[15px]' : 'left-[18px]') : 'left-0.5'
      }`}
    />
  </button>
);

/* ───────────────────────── Plugins ───────────────────────── */

const PluginsPanel: React.FC = () => {
  const [state, setState] = useState(getNuvioState);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const on = () => setState(getNuvioState());
    window.addEventListener(NUVIO_EVENT, on);
    return () => window.removeEventListener(NUVIO_EVENT, on);
  }, []);

  const fileRef = useRef<HTMLInputElement>(null);

  const add = async () => {
    const v = input.trim();
    if (!v || adding) return;
    setAdding(true);
    setError(null);
    try {
      const r = await installFromLink(v);
      setInput('');
      if (r.kind === 'repo') {
        setOpen((o) => ({ ...o, [r.repo.url]: true }));
        toast.success(t('Repositório instalado'), tn(r.repo.scrapers.length, '{n} plugin', '{n} plugins') + ` · ${r.repo.name}`);
      } else {
        toast.success(t('Addon instalado'), `${r.addon.name}${r.addon.version ? ' v' + r.addon.version : ''}`);
      }
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setAdding(false);
    }
  };

  const importFile = async (file: File) => {
    setAdding(true);
    setError(null);
    try {
      const r = await importNuvioJson(await file.text());
      if (r.addons || r.repos) {
        toast.success(
          t('Importação concluída'),
          [r.addons ? tn(r.addons, '{n} addon', '{n} addons') : '', r.repos ? tn(r.repos, '{n} repositório', '{n} repositórios') : ''].filter(Boolean).join(' · ')
        );
      }
      if (r.failed.length) setError(r.failed.join('\n'));
      else if (!r.addons && !r.repos) setError(t('Nada para importar neste arquivo.'));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setAdding(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const removeAddon = async (a: StremioAddon) => {
    const ok = await confirmDialog({
      title: t('Remover o addon {name}?', { name: a.name }),
      message: t('Ele deixa de ser usado no catálogo e nas fontes. As obras da biblioteca continuam lá.'),
      confirmLabel: t('Remover'),
      danger: true,
    });
    if (ok) removeStremioAddon(a.url);
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      const [r, a] = await Promise.all([refreshNuvioRepos(), refreshStremioAddons()]);
      r.failed += a.failed;
      if (r.failed) toast.warning(tn(r.failed, '{n} repositório não respondeu', '{n} repositórios não responderam'));
      else toast.success(t('Repositórios atualizados'));
    } finally {
      setRefreshing(false);
    }
  };

  const remove = async (repo: NuvioRepo) => {
    const ok = await confirmDialog({
      title: t('Remover o repositório {name}?', { name: repo.name }),
      message: t('Os plugins dele deixam de ser usados. As obras da biblioteca continuam lá.'),
      confirmLabel: t('Remover'),
      danger: true,
    });
    if (ok) removeNuvioRepo(repo.url);
  };

  const totalOn = state.repos.reduce((n, r) => n + r.scrapers.filter((s) => isScraperEnabled(state, r, s)).length, 0);

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-5 space-y-4">
        <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-lg bg-accent/15 text-accent flex items-center justify-center shrink-0">
              <Plug size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-fg">{t('Adicionar plugins e addons')}</h2>
              <p className="text-[12px] text-fg-muted mt-0.5 leading-relaxed">
                {t('Cole o link do manifest.json: repositórios de plugins do Nuvio e addons do Stremio (inclusive links stremio://). O tipo é detectado sozinho. Também dá para importar um arquivo .json com uma lista de addons.')}
              </p>
            </div>
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
              placeholder="https://raw.githubusercontent.com/…/manifest.json"
              spellCheck={false}
              className="flex-1 min-w-0 h-9 bg-canvas border border-line focus:border-accent rounded-md px-3 text-[12.5px] text-fg outline-none"
            />
            <button
              type="submit"
              disabled={adding || !input.trim()}
              className="h-9 px-4 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12.5px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-default"
            >
              {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              {t('Instalar')}
            </button>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={adding}
              title={t('Importar arquivo .json (lista de addons ou manifesto)')}
              className="h-9 px-3 rounded-md bg-subtle hover:bg-elevated border border-line text-[12.5px] text-fg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileJson size={14} /> {t('Importar .json')}
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
              <span className="min-w-0 break-words whitespace-pre-line">{error}</span>
            </div>
          )}
          <div className="flex items-start gap-2 text-[11.5px] text-fg-muted">
            <ShieldCheck size={13} className="shrink-0 mt-0.5 text-success" />
            <span>
              {t('Os plugins são feitos pela comunidade. Aqui eles rodam isolados, sem acesso aos seus arquivos; só buscam os links dos vídeos. Instale apenas repositórios em que você confia.')}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-[12.5px] text-fg-2 cursor-pointer select-none">
            <Toggle on={state.enabled} onChange={setNuvioEnabled} label={t('Usar plugins')} />
            {t('Usar plugins')}
          </label>
          <span className="text-[12px] text-fg-muted">
            {tn(state.repos.length, '{n} repositório', '{n} repositórios')} · {tn(totalOn, '{n} plugin ativo', '{n} plugins ativos')} ·{' '}
            {tn(state.addons.length, '{n} addon', '{n} addons')}
          </span>
          {(state.repos.length > 0 || state.addons.length > 0) && (
            <button
              type="button"
              onClick={refresh}
              disabled={refreshing}
              className="ml-auto h-8 px-3 rounded-md bg-subtle hover:bg-elevated border border-line-subtle text-[12px] text-fg-2 hover:text-fg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              {t('Atualizar repositórios')}
            </button>
          )}
        </div>

        {state.addons.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted flex items-center gap-1.5">
              <Puzzle size={12} /> {t('Addons do Stremio')}
            </h3>
            <div className={`rounded-xl border border-line bg-surface divide-y divide-line-subtle overflow-hidden ${state.enabled ? '' : 'opacity-60'}`}>
              {state.addons.map((a) => (
                <div key={a.url} className="flex items-center gap-3 px-4 py-3">
                  <span className="w-9 h-9 rounded-md bg-canvas border border-line-subtle overflow-hidden flex items-center justify-center shrink-0">
                    {a.logo ? (
                      <img src={a.logo} alt="" className="w-full h-full object-contain" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
                    ) : (
                      <Puzzle size={15} className="text-fg-muted" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[13px] font-semibold text-fg truncate">{a.name}</span>
                      {a.version && <span className="text-[10.5px] text-fg-muted">v{a.version}</span>}
                      {a.error && (
                        <span className="text-[10.5px] text-warning-fg inline-flex items-center gap-0.5" title={a.error}>
                          <AlertTriangle size={11} /> {t('Erro ao atualizar')}
                        </span>
                      )}
                    </div>
                    {a.description && <div className="text-[11.5px] text-fg-muted truncate" title={a.description}>{a.description}</div>}
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[10.5px] text-fg-muted">
                      {a.resources.map((r) => (
                        <span key={r.name} className="px-1.5 rounded bg-subtle">
                          {r.name === 'stream' ? t('fontes') : r.name === 'catalog' ? t('catálogo') : r.name === 'meta' ? t('detalhes') : r.name === 'subtitles' ? t('legendas') : r.name}
                        </span>
                      ))}
                      {a.types.length ? <span>· {a.types.join(', ')}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(a.url);
                      toast.info(t('Link copiado'));
                    }}
                    title={t('Copiar link do addon')}
                    aria-label={t('Copiar link do addon')}
                    className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer"
                  >
                    <Copy size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void removeAddon(a)}
                    title={t('Remover addon')}
                    aria-label={t('Remover addon')}
                    className="p-1.5 rounded-md text-fg-muted hover:text-danger-fg hover:bg-danger/10 cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                  <Toggle small on={a.enabled} onChange={(v) => setStremioAddonEnabled(a.url, v)} label={a.enabled ? t('Desativar {name}', { name: a.name }) : t('Ativar {name}', { name: a.name })} />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-fg-muted">{t('Links de torrent dos addons tocam direto no app. A velocidade depende de quantas pessoas compartilham o arquivo (seeders).')}</p>
          </div>
        )}

        {state.repos.length > 0 && (
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted flex items-center gap-1.5">
            <Plug size={12} /> {t('Plugins do Nuvio')}
          </h3>
        )}

        {state.repos.length === 0 && state.addons.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line p-8 text-center">
            <Plug size={26} className="mx-auto text-fg-muted mb-2" />
            <p className="text-sm font-semibold text-fg">{t('Nenhum plugin ou addon instalado')}</p>
            <p className="text-[12px] text-fg-muted mt-1 max-w-md mx-auto">
              {t('Sem plugins você ainda navega pelo catálogo e favorita obras, mas não há fontes para assistir.')}
            </p>
          </div>
        ) : (
          state.repos.map((repo) => {
            const on = repo.scrapers.filter((s) => isScraperEnabled(state, repo, s)).length;
            const expanded = open[repo.url] ?? false;
            return (
              <div key={repo.url} className={`rounded-xl border border-line bg-surface overflow-hidden ${state.enabled ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [repo.url]: !expanded }))}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                    aria-expanded={expanded}
                  >
                    {expanded ? <ChevronDown size={15} className="text-fg-muted shrink-0" /> : <ChevronRight size={15} className="text-fg-muted shrink-0" />}
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-semibold text-fg truncate">
                        {repo.name}
                        {repo.version && <span className="ml-1.5 text-[11px] font-normal text-fg-muted">v{repo.version}</span>}
                      </span>
                      <span className="block text-[11.5px] text-fg-muted truncate">
                        {repo.author ? `${repo.author} · ` : ''}
                        {t('{on} de {total} ativos', { on, total: repo.scrapers.length })}
                      </span>
                    </span>
                  </button>
                  {repo.error && (
                    <span className="text-[11px] text-warning-fg inline-flex items-center gap-1" title={repo.error}>
                      <AlertTriangle size={12} /> {t('Erro ao atualizar')}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setRepoScrapersEnabled(repo.url, on < repo.scrapers.length)}
                    className="h-7 px-2.5 rounded-md text-[11.5px] text-fg-2 hover:text-fg bg-subtle hover:bg-elevated border border-line-subtle cursor-pointer"
                  >
                    {on < repo.scrapers.length ? t('Ativar todos') : t('Desativar todos')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(repo)}
                    title={t('Remover repositório')}
                    aria-label={t('Remover repositório')}
                    className="p-1.5 rounded-md text-fg-muted hover:text-danger-fg hover:bg-danger/10 cursor-pointer"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {expanded && (
                  <div className="border-t border-line-subtle divide-y divide-line-subtle">
                    {repo.scrapers.map((s) => {
                      const enabled = isScraperEnabled(state, repo, s);
                      return (
                        <div key={s.id} className="flex items-center gap-3 px-4 py-2.5">
                          <span className="w-8 h-8 rounded-md bg-canvas border border-line-subtle overflow-hidden flex items-center justify-center shrink-0">
                            {s.logo ? (
                              <img src={s.logo} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
                            ) : (
                              <Plug size={14} className="text-fg-muted" />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[13px] font-medium text-fg truncate">{s.name}</span>
                              {s.version && <span className="text-[10.5px] text-fg-muted">v{s.version}</span>}
                              {!scraperSupported(s) && (
                                <span className="text-[10px] px-1.5 rounded bg-danger/15 text-danger-fg" title={t('O player do Tomodachi não toca os formatos deste plugin')}>
                                  {t('formato sem suporte')}
                                </span>
                              )}
                              {s.limited && (
                                <span className="text-[10px] px-1.5 rounded bg-warning/15 text-warning-fg" title={t('O autor marcou este plugin como limitado')}>
                                  {t('limitado')}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap text-[10.5px] text-fg-muted">
                              {s.supportedTypes.map((ty) => (
                                <span key={ty} className="px-1.5 rounded bg-subtle">
                                  {ty === 'movie' ? t('Filmes') : ty === 'tv' ? t('Séries') : ty}
                                </span>
                              ))}
                              {s.contentLanguage?.length ? <span className="uppercase">{s.contentLanguage.join(' · ')}</span> : null}
                              {s.formats?.length ? <span className="font-mono">{s.formats.join('/')}</span> : null}
                              {s.author && <span className="truncate">· {s.author}</span>}
                            </div>
                          </div>
                          <Toggle small on={enabled} onChange={(v) => setScraperEnabled(repo.url, s.id, v)} label={enabled ? t('Desativar {name}', { name: s.name }) : t('Ativar {name}', { name: s.name })} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {state.repos.length > 0 && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={async () => {
                await window.electronAPI?.nuvioClearCache?.();
                toast.info(t('Cache dos plugins limpo'), t('O código será baixado de novo na próxima busca.'));
              }}
              className="text-[11.5px] text-fg-muted hover:text-fg underline-offset-2 hover:underline cursor-pointer"
            >
              {t('Limpar cache dos plugins')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ───────────────────────── Catálogo ───────────────────────── */

export const Catalog: React.FC<{
  onOpenTab?: OpenTabFn;
  onGoToPlugins?: () => void;
  /** Dentro do Descobrir: tipo, catálogo e busca vêm de fora */
  embedded?: { kind?: Kind; sourceKey?: string; query: string };
  /** Onde colocar os botões Atualizar / Webview (barra do Descobrir) */
  actionsTarget?: HTMLElement | null;
}> = ({ onOpenTab, onGoToPlugins, embedded, actionsTarget }) => {
  const [kindState, setKindState] = useState<Kind>(() => {
    try {
      const k = localStorage.getItem(KIND_KEY);
      return k === 'movie' || k === 'anime' ? k : 'series';
    } catch {
      return 'series';
    }
  });
  const kind: Kind = embedded?.kind || kindState;
  const [genre, setGenre] = useState('');
  const [query, setQuery] = useState('');
  const [submittedState, setSubmitted] = useState('');
  const submitted = embedded ? embedded.query : submittedState;
  const [items, setItems] = useState<NuvioMetaPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inLibrary, setInLibrary] = useState<Set<string>>(new Set());
  const [pluginCount, setPluginCount] = useState(() => getNuvioState().repos.length + getNuvioState().addons.length);
  // Fonte do catálogo: Cinemeta ou um catálogo de addon do Stremio
  const [catalogs, setCatalogs] = useState(addonCatalogs);
  const [sourceKeyState, setSourceKey] = useState<string>(() => {
    try {
      return localStorage.getItem('tp_nuvio_catalog') || 'cinemeta';
    } catch {
      return 'cinemeta';
    }
  });
  const sourceKey = embedded ? embedded.sourceKey || 'cinemeta' : sourceKeyState;
  const addonRef = sourceKey === 'cinemeta' ? null : catalogs.find((c) => c.key === sourceKey) || null;
  const chooseSource = (key: string) => {
    setSourceKey(key);
    setGenre('');
    try {
      localStorage.setItem('tp_nuvio_catalog', key);
    } catch {
      /* ignore */
    }
  };
  const reqId = useRef(0);

  const setKind = (k: Kind) => {
    setKindState(k);
    setGenre('');
    try {
      localStorage.setItem(KIND_KEY, k);
    } catch {
      /* ignore */
    }
  };

  const type: NuvioType = kind === 'movie' ? 'movie' : 'series';
  const effectiveGenre = kind === 'anime' ? 'Animation' : genre;

  const load = useCallback(
    async (reset: boolean) => {
      const id = ++reqId.current;
      setLoading(true);
      setError(null);
      try {
        const skip = reset ? 0 : items.length;
        const list = addonRef
          ? await fetchAddonCatalog(addonRef, { search: submitted, genre: genre || undefined, skip })
          : await nuvioCatalog(type, { search: submitted, genre: effectiveGenre || undefined, skip });
        if (id !== reqId.current) return;
        setItems((prev) => {
          const base = reset ? [] : prev;
          const seen = new Set(base.map((x) => x.id));
          return [...base, ...list.filter((x) => !seen.has(x.id))];
        });
        setMore(!submitted && list.length > 0);
      } catch (err: any) {
        if (id === reqId.current) setError(String(err?.message || err));
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, submitted, effectiveGenre, items.length, addonRef?.key, genre]
  );

  useEffect(() => {
    setItems([]);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, submitted, effectiveGenre, addonRef?.key, genre]);

  useEffect(() => {
    const refresh = () =>
      readLibrary('video').then((lib) => setInLibrary(new Set((lib.entries || []).filter((e: any) => String(e?.url).startsWith('nuvio:')).map((e: any) => e.url))));
    refresh();
    const onPlugins = () => {
      const st = getNuvioState();
      setPluginCount(st.repos.length + st.addons.length);
      setCatalogs(addonCatalogs());
    };
    window.addEventListener('video:library-updated', refresh);
    window.addEventListener('backup:applied', refresh);
    window.addEventListener(NUVIO_EVENT, onPlugins);
    return () => {
      window.removeEventListener('video:library-updated', refresh);
      window.removeEventListener('backup:applied', refresh);
      window.removeEventListener(NUVIO_EVENT, onPlugins);
    };
  }, []);

  const open = (m: NuvioMetaPreview) => {
    onOpenTab?.('anime-detail', m.name, {
      anime: { url: nuvioWorkUrl(m.type, m.id), title: m.name, cover: m.poster, source: 'nuvio', sourceName: 'Nuvio', addonUrl: m.addonUrl },
    });
  };

  const kinds: [Kind, string, React.ReactNode][] = [
    ['series', t('Séries'), <Tv key="s" size={13} />],
    ['movie', t('Filmes'), <Film key="m" size={13} />],
    ['anime', t('Animes'), <Sparkles key="a" size={13} />],
  ];

  const actionButtons = (
    <>
      <button
        type="button"
        disabled={loading}
        onClick={() => {
          setItems([]);
          void load(true);
        }}
        className="h-9 px-3 rounded-lg border bg-subtle hover:bg-elevated border-line text-fg-2 hover:text-fg text-[12px] font-medium flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-60"
        title={t('Recarregar o catálogo e as capas')}
      >
        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">{t('Atualizar Capas')}</span>
      </button>
      <button
        type="button"
        onClick={() => {
          const url = submitted ? `https://www.imdb.com/find/?q=${encodeURIComponent(submitted)}` : kind === 'movie' ? 'https://www.imdb.com/chart/moviemeter/' : 'https://www.imdb.com/chart/tvmeter/';
          onOpenTab?.('webview', 'Webview IMDb', { url, initialUrl: url });
        }}
        className="h-9 px-3 rounded-lg bg-subtle hover:bg-elevated border border-line text-fg-2 hover:text-fg text-[12px] font-medium flex items-center gap-1.5 shrink-0 cursor-pointer"
        title={t('Abrir navegador Webview integrado')}
      >
        <Globe size={13} className="text-accent" />
        <span className="hidden sm:inline">Webview</span>
      </button>
    </>
  );

  const genreVisible = (addonRef ? !!addonRef.genres?.length : kind !== 'anime') && !submitted;

  return (
    <div className="flex flex-col h-full min-h-0">
      {actionsTarget && createPortal(actionButtons, actionsTarget)}
      {(!embedded || genreVisible) && (
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line-subtle bg-surface flex-wrap">
        {!embedded && catalogs.length > 0 && (
          <select
            value={addonRef ? addonRef.key : 'cinemeta'}
            onChange={(e) => chooseSource(e.target.value)}
            aria-label={t('Catálogo')}
            className="h-8 max-w-[260px] bg-canvas border border-line-subtle rounded-md px-2 text-[12.5px] text-fg outline-none cursor-pointer"
          >
            <option value="cinemeta">Cinemeta</option>
            {catalogs.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        )}
        {!embedded && !addonRef && (
        <div role="tablist" className="inline-flex p-0.5 rounded-lg bg-canvas border border-line-subtle">
          {kinds.map(([k, label, icon]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={kind === k}
              onClick={() => setKind(k)}
              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12.5px] cursor-pointer ${
                kind === k ? 'bg-surface text-fg font-semibold shadow-sm' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <span className={kind === k ? 'text-accent' : ''}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
        )}
        {!embedded && (!addonRef || addonRef.searchable) && (
        <form
          className="relative flex-1 min-w-[200px] max-w-md"
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(query.trim());
          }}
        >
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              if (!e.target.value.trim() && submitted) setSubmitted('');
            }}
            placeholder={addonRef ? t('Buscar neste catálogo…') : kind === 'movie' ? t('Buscar filmes…') : kind === 'anime' ? t('Buscar animes…') : t('Buscar séries…')}
            className="w-full h-8 bg-canvas border border-line-subtle focus:border-accent rounded-md pl-8 pr-8 text-[12.5px] text-fg outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setSubmitted('');
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg cursor-pointer"
              aria-label={t('Limpar busca')}
            >
              <X size={13} />
            </button>
          )}
        </form>
        )}
        {genreVisible && (
          <select
            value={genre}
            onChange={(e) => setGenre(e.target.value)}
            aria-label={t('Gênero')}
            className="h-8 bg-canvas border border-line-subtle rounded-md px-2 text-[12.5px] text-fg outline-none cursor-pointer"
          >
            <option value="">{addonRef ? t('Todos') : t('Populares')}</option>
            {(addonRef?.genres || NUVIO_GENRES).map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {!embedded && pluginCount === 0 && onGoToPlugins && (
          <div className="mx-4 mt-4 flex items-center gap-3 rounded-lg border border-accent/30 bg-accent/10 px-3 py-2.5 text-[12.5px] text-fg-2">
            <Plug size={15} className="text-accent shrink-0" />
            <span className="flex-1">{t('Instale um repositório de plugins para ter fontes de vídeo. O catálogo e os favoritos já funcionam.')}</span>
            <button type="button" onClick={onGoToPlugins} className="h-7 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold cursor-pointer shrink-0">
              {t('Adicionar plugins')}
            </button>
          </div>
        )}

        {error && items.length === 0 ? (
          <div className="p-10 text-center">
            <AlertTriangle size={24} className="mx-auto text-warning-fg mb-2" />
            <p className="text-sm text-fg">{t('Não foi possível carregar o catálogo')}</p>
            <p className="text-[12px] text-fg-muted mt-1">{error}</p>
            <button type="button" onClick={() => void load(true)} className="mt-3 h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-[12px] text-fg cursor-pointer">
              {t('Tentar de novo')}
            </button>
          </div>
        ) : (
          <div className="p-4 grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
            {items.map((m) => (
              <button key={m.id} type="button" onClick={() => open(m)} className="group text-left cursor-pointer focus-visible:outline-none" title={m.name}>
                <div className="relative aspect-[2/3] rounded-lg overflow-hidden bg-subtle border border-line-subtle group-hover:border-accent/60 group-focus-visible:ring-2 group-focus-visible:ring-accent/60 transition-colors">
                  {m.poster ? (
                    <img src={m.poster} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-fg-muted">
                      <Clapperboard size={26} />
                    </div>
                  )}
                  {m.imdbRating && (
                    <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/70 text-[10.5px] text-white inline-flex items-center gap-0.5 tabular-nums">
                      <Star size={10} className="text-yellow-400" fill="currentColor" /> {m.imdbRating}
                    </span>
                  )}
                  {inLibrary.has(nuvioWorkUrl(m.type, m.id)) && (
                    <span className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-rose-600 text-white flex items-center justify-center shadow" title={t('Na biblioteca')}>
                      <Heart size={12} fill="currentColor" />
                    </span>
                  )}
                </div>
                <div className="mt-1.5 text-[12.5px] font-medium text-fg truncate group-hover:text-accent">{m.name}</div>
                <div className="text-[11px] text-fg-muted truncate">{m.year || '—'}</div>
              </button>
            ))}
            {loading &&
              Array.from({ length: items.length ? 6 : 18 }).map((_, i) => (
                <div key={`sk-${i}`}>
                  <div className="aspect-[2/3] rounded-lg bg-subtle animate-pulse" />
                  <div className="mt-1.5 h-3 w-3/4 rounded bg-subtle animate-pulse" />
                </div>
              ))}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div className="p-10 text-center text-[13px] text-fg-muted">{submitted ? t('Nada encontrado para "{q}"', { q: submitted }) : t('Nada por aqui')}</div>
        )}

        {!loading && more && items.length > 0 && (
          <div className="flex justify-center pb-6">
            <button type="button" onClick={() => void load(false)} className="h-9 px-5 rounded-md bg-subtle hover:bg-elevated border border-line-subtle text-[12.5px] text-fg cursor-pointer">
              {t('Carregar mais')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ───────────────────────── Ajuda ───────────────────────── */

const HELP_KEY = 'tp_nuvio_help_seen';

export const NuvioHelp: React.FC<{ onClose: () => void; onGoToPlugins: () => void }> = ({ onClose, onGoToPlugins }) => {
  const points: [string, string][] = [
    [t('O que é'), t('O Nuvio é um app de filmes, séries e animes que busca links de vídeo usando plugins da comunidade. Aqui você usa os mesmos plugins — e também addons do Stremio — com a interface do Tomodachi Player.')],
    [t('Plugins x addons'), t('Plugins do Nuvio são scripts que rodam no seu computador e só procuram links. Addons do Stremio rodam num servidor e podem trazer links, catálogos, detalhes e legendas. Os dois são instalados colando o link do manifest.json em Plugins.')],
    [t('Sem plugins não há vídeo'), t('O catálogo e os favoritos funcionam sozinhos, mas para assistir você precisa de pelo menos um plugin ou addon que forneça fontes.')],
    [t('Torrents'), t('Links de torrent (como os do Torrentio) tocam direto no app: o Tomodachi baixa só o trecho que você está assistindo e apaga tudo ao fechar o app. A velocidade depende dos seeders — se um link demorar, tente outro com mais seeders. Com um serviço de debrid (Real-Debrid, AllDebrid…) configurado no addon, os links viram diretos e começam mais rápido.')],
    [t('Pode demorar um pouco'), t('Cada plugin consulta sites diferentes; alguns levam alguns segundos e outros falham. Os links aparecem conforme chegam. Links HLS (.m3u8) são convertidos pelo FFmpeg e podem levar alguns segundos para começar.')],
    [t('Quando um plugin falha'), t('Sites mudam com frequência e os plugins quebram. Use “Atualizar repositórios”, tente outro plugin ou outro repositório. “Demorou demais” significa que o site não respondeu a tempo.')],
    [t('Animes'), t('Para animes, além do catálogo “Animes” (Cinemeta), instale um addon de catálogo de anime (ex.: Kitsu) e escolha-o no seletor de catálogo.')],
    [t('Favoritos e biblioteca'), t('Ao favoritar, a obra entra na sua Biblioteca com as tags que você escolher (o app sugere algumas). “Atualizar” na Biblioteca encontra episódios novos.')],
    [t('Segurança'), t('Plugins e addons são feitos pela comunidade. Os plugins rodam isolados, sem acesso aos seus arquivos. Instale apenas repositórios em que você confia.')],
  ];
  return (
    <div className="border-b border-line-subtle bg-surface/70 flex-shrink-0 max-h-[46vh] overflow-y-auto">
      <div className="max-w-5xl mx-auto px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <HelpCircle size={16} className="text-accent" />
          <h2 className="text-[14px] font-semibold text-fg">{t('Como funciona o Nuvio no Tomodachi')}</h2>
          <button type="button" onClick={onGoToPlugins} className="ml-auto h-7 px-3 rounded-md bg-accent text-accent-fg text-[12px] font-semibold cursor-pointer">
            {t('Adicionar plugins')}
          </button>
          <button type="button" onClick={onClose} className="h-7 px-2 rounded-md text-fg-muted hover:text-fg hover:bg-subtle text-[12px] inline-flex items-center gap-1 cursor-pointer">
            <ChevronUp size={14} /> {t('Fechar')}
          </button>
        </div>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {points.map(([title, text]) => (
            <div key={title} className="rounded-lg border border-line-subtle bg-canvas p-3">
              <div className="text-[12.5px] font-semibold text-fg">{title}</div>
              <p className="text-[11.5px] text-fg-muted mt-1 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ───────────────────────── Aba ───────────────────────── */

export const NuvioView: React.FC<{ onOpenTab?: OpenTabFn }> = ({ onOpenTab }) => {
  const [panel, setPanelState] = useState<Panel>(() => {
    try {
      return localStorage.getItem(PANEL_KEY) === 'plugins' ? 'plugins' : 'catalog';
    } catch {
      return 'catalog';
    }
  });
  const [state, setState] = useState(getNuvioState);
  useEffect(() => {
    const on = () => setState(getNuvioState());
    window.addEventListener(NUVIO_EVENT, on);
    return () => window.removeEventListener(NUVIO_EVENT, on);
  }, []);
  const setPanel = (p: Panel) => {
    setPanelState(p);
    try {
      localStorage.setItem(PANEL_KEY, p);
    } catch {
      /* ignore */
    }
  };
  const active = useMemo(
    () => state.repos.reduce((n, r) => n + r.scrapers.filter((s) => isScraperEnabled(state, r, s)).length, 0) + state.addons.filter((a) => a.enabled).length,
    [state]
  );
  // Ajuda: abre sozinha na primeira visita (sem nada instalado)
  const [helpOpen, setHelpOpen] = useState(() => {
    try {
      return !localStorage.getItem(HELP_KEY) && getNuvioState().repos.length === 0 && getNuvioState().addons.length === 0;
    } catch {
      return false;
    }
  });
  const closeHelp = () => {
    setHelpOpen(false);
    try {
      localStorage.setItem(HELP_KEY, '1');
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-canvas">
      <div className="flex items-center gap-3 px-4 h-11 border-b border-line-subtle bg-surface flex-shrink-0">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Nuvio</span>
        <div role="tablist" className="inline-flex p-0.5 rounded-lg bg-canvas border border-line-subtle">
          {(
            [
              ['catalog', t('Catálogo')],
              ['plugins', t('Plugins')],
            ] as [Panel, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={panel === id}
              onClick={() => setPanel(id)}
              className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12.5px] cursor-pointer ${
                panel === id ? 'bg-surface text-fg font-semibold shadow-sm' : 'text-fg-muted hover:text-fg'
              }`}
            >
              {label}
              {id === 'plugins' && (
                <span className={`text-[10.5px] px-1.5 rounded tabular-nums font-normal ${active > 0 && state.enabled ? 'bg-accent/20 text-fg' : 'bg-subtle text-fg-muted'}`}>{active}</span>
              )}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => (helpOpen ? closeHelp() : setHelpOpen(true))}
          aria-expanded={helpOpen}
          className={`ml-auto h-7 px-2.5 rounded-md text-[12px] inline-flex items-center gap-1.5 cursor-pointer border ${
            helpOpen ? 'bg-accent/15 border-accent/40 text-fg' : 'border-line-subtle text-fg-muted hover:text-fg hover:bg-subtle'
          }`}
        >
          <HelpCircle size={14} /> {t('Como funciona?')}
        </button>
      </div>
      {helpOpen && (
        <NuvioHelp
          onClose={closeHelp}
          onGoToPlugins={() => {
            setPanel('plugins');
            closeHelp();
          }}
        />
      )}
      <div className="flex-1 min-h-0 relative">
        <div className={`absolute inset-0 ${panel === 'catalog' ? 'flex flex-col' : 'hidden'}`}>
          <Catalog onOpenTab={onOpenTab} onGoToPlugins={() => setPanel('plugins')} />
        </div>
        {panel === 'plugins' && (
          <div className="absolute inset-0">
            <PluginsPanel />
          </div>
        )}
      </div>
    </div>
  );
};
