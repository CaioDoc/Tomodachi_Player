// src/components/AniListPanel.tsx
// Conta do AniList (Configurações) e vínculo de cada obra (telas de detalhes).

import React, { useEffect, useState } from 'react';
import { Loader2, LogOut, RefreshCw, Link2, Search, X, CheckCircle2, AlertCircle, ExternalLink, Ban } from 'lucide-react';
import {
  ANILIST_EVENT,
  getAniListState,
  getAniListLog,
  loginAniList,
  logoutAniList,
  setAniListSyncEnabled,
  getLinkedMedia,
  setLinkedMedia,
  searchAniList,
  syncWork,
  type AniListMedia,
} from '../api/anilistSync';
import { toast } from './Feedback';
import type { ProgressSource } from '../utils/progress';
import { t, tn, tMaybe } from '../i18n';

const useAniListVersion = () => {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener(ANILIST_EVENT, on);
    return () => window.removeEventListener(ANILIST_EVENT, on);
  }, []);
  return v;
};

const timeAgo = (at: number) => {
  const m = Math.round((Date.now() - at) / 60000);
  if (m < 1) return t('agora');
  if (m < 60) return t('há {n} min', { n: m });
  const h = Math.round(m / 60);
  return h < 24 ? t('há {n} h', { n: h }) : t('há {n} d', { n: Math.round(h / 24) });
};

/* ───────────── Configurações → Contas ───────────── */

export const AniListAccountCard: React.FC = () => {
  useAniListVersion();
  const state = getAniListState();
  const log = getAniListLog().slice(0, 6);
  const [busy, setBusy] = useState(false);

  const login = async () => {
    setBusy(true);
    try {
      const user = await loginAniList();
      toast.success(t('AniList conectado'), t('Olá, {name}! O progresso será sincronizado automaticamente.', { name: user.name }));
    } catch (err: any) {
      if (!/fechada|cancelad/i.test(String(err?.message))) toast.error(t('Não foi possível entrar no AniList'), tMaybe(err?.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-5 bg-surface rounded-lg border border-line space-y-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="w-[18px] h-[18px] rounded bg-[#02a9ff] text-white text-[10px] font-black flex items-center justify-center">A</span>
          <h2 className="text-sm font-semibold text-fg">AniList</h2>
        </div>
        {state && (
          <span className="flex items-center gap-1 text-xs text-success-fg font-medium">
            <CheckCircle2 size={14} /> {t('Conectado')}
          </span>
        )}
      </div>

      {!state ? (
        <>
          <p className="text-xs text-fg-muted leading-relaxed">
            {t(
              'Conecte sua conta para que os capítulos lidos e os episódios assistidos no Tomodachi sejam atualizados na sua lista do AniList automaticamente. O progresso só avança: nada é apagado da sua lista.'
            )}
          </p>
          <button
            type="button"
            onClick={login}
            disabled={busy}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold text-white bg-[#02a9ff] hover:brightness-110 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
            {busy ? t('Aguardando o login…') : t('Entrar com AniList')}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-3">
            {state.user.avatar ? (
              <img src={state.user.avatar} alt="" className="w-10 h-10 rounded-full object-cover bg-subtle" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-subtle" />
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-fg truncate">{state.user.name}</div>
              <a
                href={`https://anilist.co/user/${encodeURIComponent(state.user.name)}/`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-accent hover:underline inline-flex items-center gap-1"
              >
                {t('Ver perfil')} <ExternalLink size={10} />
              </a>
            </div>
            <button
              type="button"
              onClick={() => void logoutAniList()}
              className="px-3 py-1.5 bg-subtle hover:bg-elevated rounded-md text-xs text-fg-2 border border-line flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut size={13} /> {t('Sair')}
            </button>
          </div>

          <label className="flex items-center gap-2 text-xs text-fg-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={state.enabled}
              onChange={(e) => setAniListSyncEnabled(e.target.checked)}
              className="accent-[rgb(var(--c-accent))]"
            />
            {t('Atualizar meu progresso no AniList automaticamente ao ler/assistir')}
          </label>

          {log.length > 0 && (
            <div className="rounded-md border border-line-subtle bg-canvas divide-y divide-line-subtle">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-fg-muted font-semibold">{t('Últimas sincronizações')}</div>
              {log.map((l, i) => (
                <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-[11px]">
                  {l.ok ? <CheckCircle2 size={12} className="text-success shrink-0" /> : <AlertCircle size={12} className="text-warning shrink-0" />}
                  <span className="flex-1 truncate text-fg-2">
                    {l.title}
                    {l.ok ? <span className="text-fg-muted"> → {l.progress}</span> : <span className="text-fg-muted"> — {tMaybe(l.message)}</span>}
                  </span>
                  <span className="text-fg-muted shrink-0">{timeAgo(l.at)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ───────────── Telas de detalhes: vínculo da obra ───────────── */

export const AniListLink: React.FC<{ source: ProgressSource; workUrl: string; title: string; inLibrary?: boolean }> = ({ source, workUrl, title, inLibrary = true }) => {
  useAniListVersion();
  const state = getAniListState();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(title);
  const [results, setResults] = useState<AniListMedia[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [syncing, setSyncing] = useState(false);

  if (!state || !workUrl) return null;
  const linked = getLinkedMedia(source, workUrl);

  const doSearch = async (q = query) => {
    setSearching(true);
    try {
      setResults(await searchAniList(source, q));
    } catch (err: any) {
      toast.error(t('Busca no AniList falhou'), tMaybe(err?.message));
      setResults([]);
    } finally {
      setSearching(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);
    const msg = await syncWork(source, workUrl, { force: true });
    setSyncing(false);
    if (/^Atualizado|Já atualizado/.test(msg)) toast.success('AniList', tMaybe(msg));
    else toast.info('AniList', tMaybe(msg));
  };

  return (
    <>
      <div className="inline-flex items-center gap-1 rounded-lg border border-line bg-subtle/60 text-xs h-9 pl-2.5 pr-1">
        <span className="w-4 h-4 rounded-sm bg-[#02a9ff] text-white text-[9px] font-black flex items-center justify-center shrink-0">A</span>
        {linked === null ? (
          <span className="text-fg-muted px-1">{t('Não sincroniza')}</span>
        ) : linked ? (
          <a href={linked.siteUrl || `https://anilist.co/${source === 'manga' ? 'manga' : 'anime'}/${linked.id}`} target="_blank" rel="noreferrer" className="text-fg-2 hover:text-accent max-w-[180px] truncate px-1" title={t('Vinculado a: {title}', { title: linked.title })}>
            {linked.title}
          </a>
        ) : (
          <span className="text-fg-muted px-1">{t('Vínculo automático')}</span>
        )}
        {inLibrary && linked !== null && (
          <button type="button" onClick={syncNow} disabled={syncing} className="p-1.5 rounded-md hover:bg-elevated text-fg-muted hover:text-fg cursor-pointer" title={t('Sincronizar agora')}>
            {syncing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setOpen(true);
            setQuery(title);
            void doSearch(title);
          }}
          className="px-2 py-1 rounded-md hover:bg-elevated text-fg-muted hover:text-fg cursor-pointer"
        >
          {t('Trocar')}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[80] bg-black/60 flex items-center justify-center p-4 animate-tp-fade-in" onClick={() => setOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-surface border border-line shadow-pop flex flex-col max-h-[80vh]" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={t('Vincular ao AniList')}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-line">
              <h3 className="text-sm font-semibold text-fg flex-1">{t('Vincular ao AniList')}</h3>
              <button type="button" onClick={() => setOpen(false)} className="p-1 rounded hover:bg-subtle text-fg-muted cursor-pointer" aria-label={t('Fechar')}>
                <X size={16} />
              </button>
            </div>
            <form
              className="p-3 border-b border-line-subtle"
              onSubmit={(e) => {
                e.preventDefault();
                void doSearch();
              }}
            >
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-md bg-canvas border border-line text-sm text-fg focus:outline-none focus:border-accent"
                />
              </div>
            </form>
            <div className="overflow-y-auto p-2 flex-1">
              {searching ? (
                <div className="py-10 flex justify-center text-fg-muted">
                  <Loader2 className="animate-spin" />
                </div>
              ) : results && results.length === 0 ? (
                <div className="py-8 text-center text-xs text-fg-muted">{t('Nada encontrado. Tente outro título (ex.: o nome em japonês romanizado).')}</div>
              ) : (
                results?.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setLinkedMedia(source, workUrl, m);
                      setOpen(false);
                      toast.success(t('Vinculado'), m.title);
                    }}
                    className={`w-full flex items-center gap-3 p-2 rounded-lg hover:bg-subtle text-left cursor-pointer ${linked?.id === m.id ? 'bg-accent/10' : ''}`}
                  >
                    {m.cover ? <img src={m.cover} alt="" className="w-9 h-12 rounded object-cover bg-subtle shrink-0" /> : <div className="w-9 h-12 rounded bg-subtle shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] text-fg truncate">{m.title}</div>
                      <div className="text-[11px] text-fg-muted">
                        {m.total ? (source === 'manga' ? tn(m.total, '{n} capítulo', '{n} capítulos') : tn(m.total, '{n} episódio', '{n} episódios')) : t('Em andamento')} · #{m.id}
                      </div>
                    </div>
                    {linked?.id === m.id && <CheckCircle2 size={15} className="text-accent shrink-0" />}
                  </button>
                ))
              )}
            </div>
            <div className="px-4 py-2.5 border-t border-line flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setLinkedMedia(source, workUrl, null);
                  setOpen(false);
                }}
                className="text-xs text-fg-muted hover:text-fg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Ban size={13} /> {t('Não sincronizar esta obra')}
              </button>
              {linked !== undefined && (
                <button
                  type="button"
                  onClick={() => {
                    setLinkedMedia(source, workUrl, undefined);
                    setOpen(false);
                  }}
                  className="text-xs text-fg-muted hover:text-fg cursor-pointer"
                >
                  {t('Voltar ao automático')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
