// src/components/ActivityViews.tsx
// "Atualizações" (capítulos/episódios novos) e "Histórico" (continuar lendo/assistindo).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BellDot,
  History as HistoryIcon,
  RefreshCw,
  Loader2,
  Play,
  BookOpen,
  Film,
  Trash2,
  Search,
  X,
  CheckCheck,
  Square,
  Info,
} from 'lucide-react';
import { PageHeader } from './SectionChrome';
import { toast, confirmDialog } from './Feedback';
import { readLibrary } from '../utils/libraryStore';
import { getProgressMap, PROGRESS_EVENT, updateChapterProgress } from '../utils/progress';
import {
  getUpdates,
  getLastCheck,
  clearUpdates,
  removeUpdate,
  markUpdatesSeen,
  UPDATES_EVENT,
  type UpdateEntry,
} from '../utils/updates';
import { checkLibraryUpdates, type UpdateCheckProgress } from '../api/updateChecker';
import { openMangaChapter, openVideoEpisode, chapterDisplayName } from '../api/openChapter';
import { useIsTabActive } from '../context/TabContext';
import { LABELS } from '../constants/labels';
import { t, tn, tMaybe, locale } from '../i18n';

type Source = 'manga' | 'video';
type OpenTabFn = (type: any, title: string, data?: any) => void;

/* ─────────────────────────── Utilidades ─────────────────────────── */

const dayLabel = (ts: number) => {
  const d = new Date(ts);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return t('Hoje');
  if (diffDays === 1) return t('Ontem');
  if (diffDays < 7) return d.toLocaleDateString(locale, { weekday: 'long' }).replace(/^\w/, (c) => c.toUpperCase());
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'long', year: today.getFullYear() === d.getFullYear() ? undefined : 'numeric' });
};

const timeLabel = (ts: number) => new Date(ts).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

const relativeLabel = (ts: number) => {
  if (!ts) return t('nunca');
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return t('agora mesmo');
  if (mins < 60) return t('há {n} min', { n: mins });
  const h = Math.round(mins / 60);
  if (h < 24) return t('há {n} h', { n: h });
  return tn(Math.round(h / 24), 'há {n} dia', 'há {n} dias');
};

function groupByDay<T>(items: T[], getTime: (x: T) => number): Array<[string, T[]]> {
  const groups: Array<[string, T[]]> = [];
  for (const it of items) {
    const label = dayLabel(getTime(it));
    const last = groups[groups.length - 1];
    if (last && last[0] === label) last[1].push(it);
    else groups.push([label, [it]]);
  }
  return groups;
}

const Cover: React.FC<{ src?: string; kind: Source }> = ({ src, kind }) => {
  const [failed, setFailed] = useState(false);
  return (
    <div className="w-11 h-16 rounded-md overflow-hidden bg-subtle flex items-center justify-center shrink-0 ring-1 ring-line-subtle">
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" draggable={false} className="w-full h-full object-cover" onError={() => setFailed(true)} />
      ) : kind === 'manga' ? (
        <BookOpen size={16} className="text-fg-muted" />
      ) : (
        <Film size={16} className="text-fg-muted" />
      )}
    </div>
  );
};

const EmptyState: React.FC<{ icon: React.ReactNode; title: string; text: string; action?: React.ReactNode }> = ({ icon, title, text, action }) => (
  <div className="flex flex-col items-center justify-center text-center py-20 px-6 max-w-md mx-auto">
    <div className="w-14 h-14 rounded-2xl bg-subtle text-accent flex items-center justify-center mb-4">{icon}</div>
    <h3 className="text-[15px] font-semibold text-fg mb-1.5">{title}</h3>
    <p className="text-[13px] text-fg-muted leading-relaxed mb-5">{text}</p>
    {action}
  </div>
);

/* ─────────────────────────── Atualizações ─────────────────────────── */

export const UpdatesView: React.FC<{
  source: Source;
  onOpenTab?: OpenTabFn;
  onGoToLibrary?: () => void;
  /** Botão de voltar no cabeçalho */
  onBack?: () => void;
  backLabel?: string;
  /** Quando muda (e é > 0), inicia a verificação automaticamente */
  autoCheckToken?: number;
}> = ({ source, onOpenTab, onGoToLibrary, onBack, backLabel, autoCheckToken }) => {
  const isActive = useIsTabActive();
  const kind = source;
  const [updates, setUpdates] = useState<UpdateEntry[]>(() => getUpdates(source));
  const [progressMap, setProgressMap] = useState(() => getProgressMap(source));
  const [lastCheck, setLastCheckState] = useState(() => getLastCheck(source));
  const [checking, setChecking] = useState<UpdateCheckProgress | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [category, setCategory] = useState<string>('');
  const [openingUrl, setOpeningUrl] = useState<string | null>(null);
  const signalRef = useRef<{ cancelled: boolean }>({ cancelled: false });

  useEffect(() => {
    const refresh = () => {
      setUpdates(getUpdates(source));
      setLastCheckState(getLastCheck(source));
    };
    const onProgress = () => setProgressMap(getProgressMap(source));
    window.addEventListener(UPDATES_EVENT, refresh);
    window.addEventListener(PROGRESS_EVENT, onProgress);
    return () => {
      window.removeEventListener(UPDATES_EVENT, refresh);
      window.removeEventListener(PROGRESS_EVENT, onProgress);
    };
  }, [source]);

  // Ao abrir a tela, as novidades passam a contar como vistas (selo da barra lateral some)
  useEffect(() => {
    if (isActive && updates.length > 0) markUpdatesSeen(source);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, updates.length, source]);

  useEffect(() => {
    readLibrary(source).then((lib) => {
      const cats = new Set<string>();
      for (const it of lib.entries || []) for (const c of it?.categories || []) if (typeof c === 'string' && c.trim()) cats.add(c.trim());
      setCategories(Array.from(cats).sort((a, b) => a.localeCompare(b)));
    });
  }, [source, lastCheck]);

  const runCheck = useCallback(async () => {
    if (checking) return;
    signalRef.current = { cancelled: false };
    setChecking({ done: 0, total: 0, found: 0, failed: 0 });
    try {
      const result = await checkLibraryUpdates(source, {
        category: category || undefined,
        signal: signalRef.current,
        onProgress: (p) => setChecking({ ...p }),
      });
      if (signalRef.current.cancelled) {
        toast.info(t('Verificação cancelada'), t('{done} de {total} obras verificadas.', { done: result.done, total: result.total }));
      } else if (result.total === 0) {
        toast.info(t('Nada para verificar'), t('Nenhuma obra online na biblioteca (ou na categoria escolhida).'));
      } else if (result.found > 0) {
        toast.success(
          kind === 'manga'
            ? tn(result.found, '{n} capítulo novo!', '{n} capítulos novos!')
            : tn(result.found, '{n} episódio novo!', '{n} episódios novos!'),
          tn(result.total, '{n} obra verificada.', '{n} obras verificadas.')
        );
      } else {
        toast.info(t('Tudo em dia'), tn(result.total, '{n} obra verificada, nenhuma novidade.', '{n} obras verificadas, nenhuma novidade.'));
      }
      if (result.failed > 0) toast.warning(
          tn(result.failed, '{n} obra não pôde ser verificada', '{n} obras não puderam ser verificadas'),
          t('A fonte pode estar fora do ar ou ter mudado.')
        );
    } catch (err: any) {
      toast.error(t('Erro ao verificar atualizações'), String(err?.message || err));
    } finally {
      setChecking(null);
      setUpdates(getUpdates(source));
      setLastCheckState(getLastCheck(source));
    }
  }, [checking, source, category, kind]);

  // Botão "Atualizar" da Biblioteca: abre esta tela já verificando
  const runCheckRef = useRef(runCheck);
  runCheckRef.current = runCheck;
  const handledTokenRef = useRef(0);
  useEffect(() => {
    if (!autoCheckToken || autoCheckToken === handledTokenRef.current) return;
    handledTokenRef.current = autoCheckToken;
    void runCheckRef.current();
  }, [autoCheckToken]);

  const openEntry = async (entry: UpdateEntry) => {
    if (openingUrl) return;
    setOpeningUrl(entry.chapter.url);
    try {
      const lib = await readLibrary(source);
      const work = (lib.entries || []).find((it: any) => it?.url === entry.workUrl) || {
        url: entry.workUrl,
        title: entry.workTitle,
        sourceName: entry.sourceName,
        chapters: [entry.chapter],
      };
      if (kind === 'video') {
        openVideoEpisode(work, entry.chapter, onOpenTab);
      } else {
        const err = await openMangaChapter(work, entry.chapter, onOpenTab);
        if (err) toast.error(t('Não foi possível abrir o capítulo'), tMaybe(err));
      }
    } finally {
      setOpeningUrl(null);
    }
  };

  const groups = useMemo(() => groupByDay(updates, (u) => u.foundAt), [updates]);
  const pct = checking && checking.total > 0 ? Math.round((checking.done / checking.total) * 100) : 0;

  return (
    <div className="flex flex-col h-full min-h-0 bg-canvas">
      <PageHeader section={kind === 'manga' ? LABELS.mangas : LABELS.videos} title={t('Atualizações')} icon={<BellDot size={16} />} onBack={onBack} backLabel={backLabel}>
        <span className="text-[12px] text-fg-muted hidden md:inline">{t('Última verificação: {when}', { when: relativeLabel(lastCheck) })}</span>
        {categories.length > 0 && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            disabled={!!checking}
            className="h-8 bg-surface border border-line-subtle hover:border-line text-fg rounded-md px-2 text-[12.5px] outline-none cursor-pointer focus:border-accent"
            aria-label={t('Categoria a verificar')}
          >
            <option value="">{t('Todas as categorias')}</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c === 'Favoritos' ? t('Favoritos') : c}
              </option>
            ))}
          </select>
        )}
        {checking ? (
          <button
            type="button"
            onClick={() => {
              signalRef.current.cancelled = true;
            }}
            className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Square size={12} /> {t('Parar')}
          </button>
        ) : (
          <button
            type="button"
            onClick={runCheck}
            className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw size={13} /> {t('Verificar agora')}
          </button>
        )}
      </PageHeader>

      {checking && (
        <div className="px-4 py-2.5 border-b border-line-subtle bg-surface flex items-center gap-3 text-[12px] text-fg-2 flex-shrink-0">
          <Loader2 size={14} className="animate-spin text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="flex justify-between gap-2 mb-1">
              <span className="truncate">{checking.current ? t('Verificando: {name}', { name: checking.current }) : t('Preparando…')}</span>
              <span className="tabular-nums text-fg-muted shrink-0">
                {checking.done}/{checking.total} · {tn(checking.found, '{n} novo', '{n} novos')}
              </span>
            </div>
            <div className="h-1 rounded-full bg-line-subtle overflow-hidden">
              <div className="h-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {updates.length === 0 ? (
          <EmptyState
            icon={<BellDot size={26} />}
            title={t('Nenhuma novidade por enquanto')}
            text={
              kind === 'manga'
                ? t('Clique em "Verificar agora" para procurar capítulos novos das obras da sua biblioteca. As fontes são consultadas uma a uma, então pode levar alguns minutos.')
                : t('Clique em "Verificar agora" para procurar episódios novos das obras da sua biblioteca. As fontes são consultadas uma a uma, então pode levar alguns minutos.')
            }
            action={
              onGoToLibrary ? (
                <button type="button" onClick={onGoToLibrary} className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg text-xs font-medium cursor-pointer">
                  {t('Ir para a biblioteca')}
                </button>
              ) : undefined
            }
          />
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px] text-fg-muted">{tn(updates.length, '{n} novidade', '{n} novidades')}</span>
              <button
                type="button"
                onClick={async () => {
                  if (await confirmDialog({ title: t('Limpar a lista de atualizações?'), message: t('Os capítulos continuam na biblioteca; só esta lista é esvaziada.'), confirmLabel: t('Limpar') })) {
                    clearUpdates(source);
                  }
                }}
                className="text-[12px] text-fg-muted hover:text-fg inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 size={12} /> {t('Limpar lista')}
              </button>
            </div>
            {groups.map(([label, list]) => (
              <section key={label} className="mb-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted mb-1.5 px-1">{label}</h3>
                <div className="rounded-xl border border-line-subtle bg-surface divide-y divide-line-subtle overflow-hidden">
                  {list.map((u) => {
                    const read = !!progressMap[u.chapter.url]?.read;
                    const opening = openingUrl === u.chapter.url;
                    return (
                      <div key={u.chapter.url} className={`group flex items-center gap-3 px-3 py-2.5 hover:bg-subtle/50 transition-colors ${read ? 'opacity-55' : ''}`}>
                        <Cover src={u.cover} kind={kind} />
                        <button type="button" onClick={() => openEntry(u)} className="flex-1 min-w-0 text-left cursor-pointer">
                          <div className="text-[13px] font-medium text-fg truncate">{u.workTitle}</div>
                          <div className="text-[12px] text-fg-muted truncate">
                            {chapterDisplayName(u.chapter, kind)} · {u.sourceName || t('Fonte')} · {timeLabel(u.foundAt)}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {!read && (
                            <button
                              type="button"
                              title={kind === 'manga' ? t('Marcar como lido') : t('Marcar como visto')}
                              onClick={() => updateChapterProgress(source, { [u.chapter.url]: { read: true } })}
                              className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-elevated cursor-pointer opacity-0 group-hover:opacity-100"
                            >
                              <CheckCheck size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            title={t('Remover da lista')}
                            onClick={() => removeUpdate(source, u.chapter.url)}
                            className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-elevated cursor-pointer opacity-0 group-hover:opacity-100"
                          >
                            <X size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => openEntry(u)}
                            disabled={!!openingUrl}
                            className="h-7 px-2.5 rounded-md bg-subtle hover:bg-accent hover:text-accent-fg text-fg-2 text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {opening ? <Loader2 size={12} className="animate-spin" /> : <Play size={11} fill="currentColor" />}
                            {kind === 'manga' ? t('Ler') : t('Assistir')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ─────────────────────────── Histórico ─────────────────────────── */

interface HistoryRow {
  key: string;
  workUrl?: string;
  workTitle: string;
  cover?: string;
  chapter: { url: string; name?: string; number?: number; read?: boolean; lastPageRead?: number };
  at: number;
  /** Vídeo local fora da biblioteca */
  localPath?: string;
  positionLabel?: string;
}

const HIDDEN_KEY = (s: Source) => `tp_history_hidden_${s}`;
const readHidden = (s: Source): Record<string, number> => {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY(s)) || '{}') || {};
  } catch {
    return {};
  }
};

export const HistoryView: React.FC<{ source: Source; onOpenTab?: OpenTabFn; onBack?: () => void; backLabel?: string }> = ({
  source,
  onOpenTab,
  onBack,
  backLabel,
}) => {
  const kind = source;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [works, setWorks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [openingKey, setOpeningKey] = useState<string | null>(null);

  const build = useCallback(async () => {
    const lib = await readLibrary(source);
    const entries: any[] = lib.entries || [];
    const progress = getProgressMap(source);
    const hidden = readHidden(source);
    const out: HistoryRow[] = [];

    // Uma linha por obra: o capítulo/episódio mexido mais recentemente
    for (const item of entries) {
      let best: HistoryRow | null = null;
      for (const ch of item?.chapters || []) {
        const p = progress[ch.url];
        const at = p?.updatedAt || 0;
        if (!at) continue;
        if (!best || at > best.at) {
          best = {
            key: item.url,
            workUrl: item.url,
            workTitle: item.title,
            cover: item.cover,
            chapter: { url: ch.url, name: ch.name, number: ch.number, read: p?.read ?? ch.read, lastPageRead: p?.lastPageRead ?? ch.lastPageRead },
            at,
          };
        }
      }
      if (best && !(hidden[best.key] && hidden[best.key] >= best.at)) out.push(best);
    }

    // Vídeos locais assistidos (fora da biblioteca)
    if (source === 'video') {
      try {
        const pos = JSON.parse(localStorage.getItem('tp_video_positions') || '{}') || {};
        for (const [path, v] of Object.entries<any>(pos)) {
          if (!v?.at || out.some((r) => r.chapter.url === path)) continue;
          // Só arquivos do computador (links de streaming e episódios entram pela biblioteca / Continuar assistindo)
          if (!(/^[a-zA-Z]:[\\/]/.test(path) || path.startsWith('/') || path.startsWith('\\\\'))) continue;
          if (hidden[path] && hidden[path] >= v.at) continue;
          const name = path.split(/[\\/]/).pop() || path;
          const mins = Math.floor((v.t || 0) / 60);
          const secs = String(Math.floor((v.t || 0) % 60)).padStart(2, '0');
          out.push({
            key: path,
            workTitle: name.replace(/\.[^.]+$/, ''),
            chapter: { url: path, name },
            at: v.at,
            localPath: path,
            positionLabel: t('Parou em {time}', { time: `${mins}:${secs}` }),
          });
        }
      } catch {
        /* ignore */
      }
    }

    out.sort((a, b) => b.at - a.at);
    setWorks(entries);
    setRows(out);
    setLoading(false);
  }, [source]);

  useEffect(() => {
    build();
    const onChange = () => build();
    window.addEventListener(PROGRESS_EVENT, onChange);
    window.addEventListener(`${source}:library-updated`, onChange);
    window.addEventListener('backup:applied', onChange);
    return () => {
      window.removeEventListener(PROGRESS_EVENT, onChange);
      window.removeEventListener(`${source}:library-updated`, onChange);
      window.removeEventListener('backup:applied', onChange);
    };
  }, [build, source]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.workTitle.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  const groups = useMemo(() => groupByDay(filtered, (r) => r.at), [filtered]);

  const hideRow = (row: HistoryRow) => {
    const hidden = readHidden(source);
    hidden[row.key] = row.at;
    try {
      localStorage.setItem(HIDDEN_KEY(source), JSON.stringify(hidden));
    } catch {
      /* ignore */
    }
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  };

  // Continuar: se o capítulo foi concluído, abre o próximo
  const continueRow = async (row: HistoryRow) => {
    if (openingKey) return;
    if (row.localPath) {
      onOpenTab?.('video-player', row.workTitle, { filePath: row.localPath, title: row.workTitle, item: { path: row.localPath, name: row.workTitle } });
      return;
    }
    const work = works.find((w) => w?.url === row.workUrl);
    if (!work) return;
    const chapters = [...(work.chapters || [])].sort((a: any, b: any) => (a.number || 0) - (b.number || 0));
    let target = row.chapter;
    if (row.chapter.read) {
      const idx = chapters.findIndex((c: any) => c.url === row.chapter.url);
      if (idx >= 0 && idx < chapters.length - 1) target = chapters[idx + 1];
    }
    setOpeningKey(row.key);
    try {
      if (kind === 'video') openVideoEpisode(work, target, onOpenTab);
      else {
        const err = await openMangaChapter(work, target, onOpenTab);
        if (err) toast.error(t('Não foi possível abrir o capítulo'), tMaybe(err));
      }
    } finally {
      setOpeningKey(null);
    }
  };

  const openDetails = (row: HistoryRow) => {
    const work = works.find((w) => w?.url === row.workUrl);
    if (!work) return;
    if (kind === 'manga') onOpenTab?.('manga-detail', work.title, { manga: work, initialExtension: work.sourceName || work.source });
    else onOpenTab?.('anime-detail', work.title, { anime: work });
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-canvas">
      <PageHeader section={kind === 'manga' ? LABELS.mangas : LABELS.videos} title={t('Histórico')} icon={<HistoryIcon size={16} />} onBack={onBack} backLabel={backLabel}>
        <div className="relative w-64 max-w-full">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Buscar no histórico…')}
            className="w-full h-8 bg-canvas border border-line-subtle focus:border-accent rounded-md pl-8 pr-2 text-[12.5px] text-fg placeholder-fg-muted outline-none"
          />
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center py-20 text-fg-muted">
            <Loader2 size={22} className="animate-spin" />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<HistoryIcon size={26} />}
            title={t('Seu histórico está vazio')}
            text={
              kind === 'manga'
                ? t('Os capítulos que você ler aparecem aqui, com um atalho para continuar de onde parou.')
                : t('Os episódios que você assistir aparecem aqui, com um atalho para continuar de onde parou.')
            }
          />
        ) : filtered.length === 0 ? (
          <p className="text-center text-[13px] text-fg-muted py-16">{t('Nada encontrado para “{query}”.', { query })}</p>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-4">
            {groups.map(([label, list]) => (
              <section key={label} className="mb-5">
                <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted mb-1.5 px-1">{label}</h3>
                <div className="rounded-xl border border-line-subtle bg-surface divide-y divide-line-subtle overflow-hidden">
                  {list.map((r) => {
                    const status = r.positionLabel
                      ? r.positionLabel
                      : r.chapter.read
                      ? kind === 'manga'
                        ? t('Lido')
                        : t('Visto')
                      : (r.chapter.lastPageRead || 0) > 1
                      ? t('Página {n}', { n: r.chapter.lastPageRead || 0 })
                      : t('Em andamento');
                    return (
                      <div key={r.key} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-subtle/50 transition-colors">
                        <Cover src={r.cover} kind={kind} />
                        <button type="button" onClick={() => continueRow(r)} className="flex-1 min-w-0 text-left cursor-pointer">
                          <div className="text-[13px] font-medium text-fg truncate">{r.workTitle}</div>
                          <div className="text-[12px] text-fg-muted truncate">
                            {r.localPath ? t('Arquivo local') : chapterDisplayName(r.chapter, kind)} · {status} · {timeLabel(r.at)}
                          </div>
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          {r.workUrl && (
                            <button
                              type="button"
                              title={t('Detalhes da obra')}
                              onClick={() => openDetails(r)}
                              className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-elevated cursor-pointer opacity-0 group-hover:opacity-100"
                            >
                              <Info size={14} />
                            </button>
                          )}
                          <button
                            type="button"
                            title={t('Remover do histórico')}
                            onClick={() => hideRow(r)}
                            className="p-1.5 rounded-md text-fg-muted hover:text-fg hover:bg-elevated cursor-pointer opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => continueRow(r)}
                            disabled={!!openingKey}
                            className="h-7 px-2.5 rounded-md bg-subtle hover:bg-accent hover:text-accent-fg text-fg-2 text-[12px] font-medium inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            {openingKey === r.key ? <Loader2 size={12} className="animate-spin" /> : <Play size={11} fill="currentColor" />}
                            {t('Continuar')}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
