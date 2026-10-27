import React, { useEffect, useState, useCallback } from 'react';
import { Plus, RefreshCw, Trash2, ExternalLink, AlertTriangle, Check, Download, Compass, CheckCheck, Puzzle } from 'lucide-react';
import type { RepoType, TabType } from '../types';
import { loadRepos, saveRepos, readCache, writeCache, clearRepoCache } from '../api/reposStore';
import { loadRepoIndex, validateRepo, type RepoExtension } from '../api/repositories';
import type { RepoEntry } from '../api/defaultRepos';
import {
  getInstalledExtensions,
  installExtension,
  removeExtension,
  resolveSourceBaseUrl,
  type InstalledExtension,
} from '../api/extensionRegistry';
import { t, tn, tMaybe } from '../i18n';

export function ReposPanel({ 
  type, 
  onOpenTab,
  onGoToExtensions,
}: { 
  type: RepoType; 
  onOpenTab?: (type: TabType | any, title: string, data?: any) => void;
  onGoToExtensions?: () => void;
}) {
  const [repos, setRepos] = useState<RepoEntry[]>(() => loadRepos(type));
  const [ext, setExt] = useState<Record<string, RepoExtension[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [status, setStatus] = useState('');
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [installed, setInstalled] = useState<InstalledExtension[]>(() => getInstalledExtensions(type));

  useEffect(() => {
    const updateInstalled = () => setInstalled(getInstalledExtensions(type));
    window.addEventListener('extensions:updated', updateInstalled);
    window.addEventListener('storage', updateInstalled);
    return () => {
      window.removeEventListener('extensions:updated', updateInstalled);
      window.removeEventListener('storage', updateInstalled);
    };
  }, [type]);

  const fetchAll = useCallback(async (force = false) => {
    setLoading(true);
    const nextExt: Record<string, RepoExtension[]> = {};
    const nextErr: Record<string, string> = {};

    await Promise.all(repos.map(async (r) => {
      if (!force) {
        const cached = readCache(type, r.url);
        if (cached) {
          nextExt[r.url] = cached as RepoExtension[];
          return;
        }
      }
      try {
        const list = await loadRepoIndex(r.url);
        nextExt[r.url] = list;
        writeCache(type, r.url, list);
      } catch (e) {
        nextErr[r.url] = e instanceof Error ? e.message : t('Falha ao carregar');
      }
    }));

    setExt(nextExt);
    setErrors(nextErr);
    setLoading(false);
  }, [repos, type]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const add = async () => {
    const raw = input.trim();
    if (!raw) return;

    // auto-prefixo e validação de formato
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    try {
      new URL(url);
    } catch {
      setStatus(`❌ ${t('URL inválida. Ex.: https://exemplo.com/index.min.json')}`);
      return;
    }

    // dedupe com feedback (nada de no-op silencioso)
    const norm = (u: string) => u.replace(/\/+$/, '');
    if (repos.some((r) => norm(r.url) === norm(url))) {
      setStatus(`⚠️ ${t('Este repositório já está na lista.')}`);
      return;
    }

    const host = new URL(url).hostname.replace(/^www\./, '');

    // 1) ADICIONA IMEDIATAMENTE (não espera rede)
    const next = [...repos, { label: host, url }];
    setRepos(next);
    saveRepos(type, next);
    setInput('');
    setStatus(`✅ ${t('Repositório adicionado. Carregando extensões...')}`);

    // 2) VALIDA/CARREGA EM BACKGROUND
    setAdding(true);
    try {
      const list = await loadRepoIndex(url);
      writeCache(type, url, list);
      setExt((p) => ({ ...p, [url]: list }));
      setErrors((p) => {
        const c = { ...p };
        delete c[url];
        return c;
      });

      const withCount = next.map((r) =>
        r.url === url ? { ...r, label: `${host} (${list.length})` } : r
      );
      setRepos(withCount);
      saveRepos(type, withCount);
      setStatus(`✅ ${t('{n} extensões carregadas de {host}.', { n: list.length, host })}`);
    } catch (e) {
      setErrors((p) => ({ ...p, [url]: e instanceof Error ? e.message : t('Falha ao carregar') }));
      setStatus(`⚠️ ${t('Adicionado, mas não consegui ler o índice. Confira a URL.')}`);
    } finally {
      setAdding(false);
    }
  };

  const remove = (url: string) => {
    const next = repos.filter((r) => r.url !== url);
    setRepos(next);
    saveRepos(type, next);
    clearRepoCache(type, url);
    setExt((p) => {
      const c = { ...p };
      delete c[url];
      return c;
    });
    setErrors((p) => {
      const c = { ...p };
      delete c[url];
      return c;
    });
  };

  const all = Object.values(ext).flat().filter((e) => {
    const q = query.trim().toLowerCase();
    return !q || e.name.toLowerCase().includes(q) || e.lang.toLowerCase().includes(q);
  });

  return (
    <div className="flex flex-col h-full bg-canvas">
      <div className="p-4 border-b border-line bg-surface space-y-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder={type === 'manga' ? t('URL do repositório (Mihon: .json ou .pb)') : t('URL do repositório (Aniyomi: .json ou .pb)')}
            className="flex-1 bg-canvas border border-line rounded px-3 py-2 text-sm text-fg outline-none focus:border-accent"
          />
          <button
            type="button"
            onClick={add}
            disabled={adding}
            className="px-3 py-2 rounded bg-success hover:bg-success-hover text-white text-sm flex items-center gap-1 disabled:opacity-50 transition-colors"
          >
            <Plus size={16} /> {t('Adicionar')}
          </button>
          <button
            type="button"
            onClick={() => fetchAll(true)}
            disabled={loading}
            title={t('Atualizar todos')}
            className="px-3 py-2 rounded border border-line text-fg-muted hover:text-fg hover:bg-subtle disabled:opacity-50 transition-colors"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
          {onGoToExtensions && (
            <button
              type="button"
              onClick={onGoToExtensions}
              className="px-3 py-2 rounded bg-subtle hover:bg-elevated text-fg border border-line text-sm flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
              title={t('Ir para a aba Extensões Instaladas')}
            >
              <Puzzle size={15} className="text-accent" />
              <span>{t('Extensões ({n})', { n: installed.length })}</span>
            </button>
          )}
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Buscar extensão por nome ou idioma...')}
          className="w-full bg-canvas border border-line rounded px-3 py-2 text-sm text-fg outline-none focus:border-accent"
        />
      </div>

      {status && (
        <div className="px-4 py-2 text-sm text-fg bg-[#1f2937] border-b border-line flex items-center justify-between">
          <span>{status}</span>
          <button
            type="button"
            onClick={() => setStatus('')}
            className="text-xs text-fg-muted hover:text-fg ml-2 font-mono"
            title={t('Fechar aviso')}
          >
            ✕
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {repos.map((r) => (
          <div key={r.url} className="border border-line rounded bg-surface">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-line">
              {errors[r.url] ? (
                <AlertTriangle size={14} className="text-warning shrink-0" />
              ) : (
                <Check size={14} className="text-success-fg shrink-0" />
              )}
              <span className="text-sm font-medium text-fg truncate flex-1" title={r.url}>
                {r.label}
              </span>
              <span className="text-[11px] text-fg-muted tabular-nums">
                {ext[r.url]?.length ?? 0}
              </span>
              <a
                href={r.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => {
                  if (window.electronAPI?.openExternal) {
                    e.preventDefault();
                    window.electronAPI.openExternal(e.currentTarget.href);
                  }
                }}
                className="text-fg-muted hover:text-accent transition-colors"
                title={t('Abrir URL do repositório')}
              >
                <ExternalLink size={14} />
              </a>
              <button
                onClick={() => remove(r.url)}
                title={t('Remover repositório')}
                className="grid place-items-center w-6 h-6 rounded text-fg-muted hover:text-white hover:bg-danger-fg transition-colors"
              >
                <Trash2 size={13} />
              </button>
            </div>

            {errors[r.url] ? (
              <p className="px-3 py-3 text-xs text-warning">{tMaybe(errors[r.url])}</p>
            ) : (
              <ul className="divide-y divide-line-subtle max-h-56 overflow-y-auto">
                {(ext[r.url] ?? [])
                  .filter((e) => {
                    const q = query.trim().toLowerCase();
                    return !q || e.name.toLowerCase().includes(q) || e.lang.toLowerCase().includes(q);
                  })
                  .map((e) => {
                    const isInstalled = installed.some(
                      (ins) => (e.pkg && ins.pkg === e.pkg) || ins.name.toLowerCase() === e.name.toLowerCase()
                    );
                    const sourceName = e.sources?.[0]?.name || e.name;
                    const domain = e.baseUrl || resolveSourceBaseUrl(sourceName) || (isInstalled ? installed.find(ins => (e.pkg && ins.pkg === e.pkg) || ins.name.toLowerCase() === e.name.toLowerCase())?.baseUrl : null);
                    const targetUrl = domain ? (domain.startsWith('http') ? domain : `https://${domain}`) : null;

                    return (
                      <li key={`${r.url}-${e.pkg || e.name}`} className="flex items-center gap-2 px-3 py-2 hover:bg-subtle/40 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm text-fg font-medium truncate">{e.name}</span>
                            {e.nsfw && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-danger-fg/[0.13] text-danger-fg border border-danger-fg/[0.27]">
                                NSFW
                              </span>
                            )}
                          </div>
                          {domain && (
                            <span className="text-[10px] text-cyan-400 font-mono block truncate">
                              {domain}
                            </span>
                          )}
                        </div>

                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-elevated text-fg-muted">
                          {e.lang}
                        </span>
                        <span className="text-[10px] text-fg-muted tabular-nums">{e.version}</span>

                        {/* Botão Navegar */}
                        {onOpenTab && (
                          <button
                            type="button"
                            onClick={() => onOpenTab('extension-catalog', e.name, { extension: e })}
                            title={t('Navegar no catálogo nativo de {name}', { name: e.name })}
                            className="px-2 py-1 rounded bg-accent/[0.13] hover:bg-accent text-accent hover:text-white text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0"
                          >
                            <Compass size={12} />
                            <span>{t('Navegar')}</span>
                          </button>
                        )}

                        {/* Botão Instalar / Instalada */}
                        {isInstalled ? (
                          <button
                            type="button"
                            onClick={() => removeExtension(e.pkg || e.name)}
                            title={t('Clique para desinstalar')}
                            className="px-2 py-1 rounded bg-success/[0.13] hover:bg-danger/[0.13] text-success-fg hover:text-danger-fg border border-success/[0.27] hover:border-danger/[0.27] text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0"
                          >
                            <CheckCheck size={12} />
                            <span>{t('Instalada')}</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              const srcName = e.sources?.[0]?.name || e.name;
                              const dom = e.baseUrl || resolveSourceBaseUrl(srcName) || '';
                              installExtension({
                                pkg: e.pkg || e.name,
                                name: e.name,
                                sourceName: srcName,
                                lang: e.lang || 'all',
                                baseUrl: dom,
                                repoUrl: r.url,
                                installedAt: Date.now(),
                                type,
                              });
                            }}
                            title={t('Instalar extensão para associar com obras do backup')}
                            className="px-2 py-1 rounded bg-subtle hover:bg-success text-fg-2 hover:text-white border border-line hover:border-transparent text-[11px] font-medium flex items-center gap-1 transition-colors shrink-0"
                          >
                            <Download size={12} />
                            <span>{t('Instalar')}</span>
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            )}
          </div>
        ))}

        <p className="text-xs text-fg-muted pt-1 flex items-center gap-2">
          <span>{t('{n} extensões disponíveis nos {repos} repositórios.', { n: all.length, repos: repos.length })}</span>
          {installed.length > 0 && (
            <span className="text-success-fg font-medium">• {tn(installed.length, '{n} instalada', '{n} instaladas')}</span>
          )}
        </p>
      </div>
    </div>
  );
}
