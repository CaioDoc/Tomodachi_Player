// src/components/OnlineSubtitlesDialog.tsx
// "Buscar legendas online" no player: OpenSubtitles + addons de legenda, sem baixar arquivo.

import React, { useEffect, useMemo, useState } from 'react';
import { X, Search, Loader2, Subtitles, AlertTriangle, Check } from 'lucide-react';
import { searchOnlineSubtitles, fetchSubtitleText, LANG_GROUPS, langName, parseMediaName, type OnlineSubtitle } from '../api/onlineSubtitles';
import { lang as uiLang, t, tn } from '../i18n';

const LANG_KEY = 'tp_online_subs_lang';

export const OnlineSubtitlesDialog: React.FC<{
  /** Título da aba / nome do arquivo */
  name: string;
  stremio?: { type: 'movie' | 'series'; id: string };
  onClose: () => void;
  /** Recebe o texto da legenda escolhida */
  onLoad: (text: string, label: string, url: string) => boolean;
}> = ({ name, stremio, onClose, onLoad }) => {
  const initial = useMemo(() => parseMediaName(name), [name]);
  const [title, setTitle] = useState(initial.title);
  const [season, setSeason] = useState(initial.season != null ? String(initial.season) : '');
  const [episode, setEpisode] = useState(initial.episode != null ? String(initial.episode) : '');
  const [langFilter, setLangFilter] = useState<string>(() => {
    try {
      return localStorage.getItem(LANG_KEY) || (uiLang.startsWith('pt') ? 'pt' : uiLang.startsWith('es') ? 'es' : 'en');
    } catch {
      return 'pt';
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<OnlineSubtitle[] | null>(null);
  const [matchName, setMatchName] = useState<string | null>(null);
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  const search = async (useStremio = false) => {
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await searchOnlineSubtitles({
        title: title.trim(),
        season: season ? Number(season) : episode ? 1 : undefined,
        episode: episode ? Number(episode) : undefined,
        year: initial.year,
        stremioId: useStremio ? stremio?.id : undefined,
        type: useStremio ? stremio?.type : undefined,
      });
      setMatchName(res.match ? `${res.match.name}${res.match.year ? ` (${res.match.year})` : ''}` : null);
      if (!res.match && !useStremio) setError(t('Não encontrei “{title}” no catálogo. Ajuste o título e tente de novo.', { title: title.trim() }));
      setResults(res.subtitles);
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  // Busca automática ao abrir
  useEffect(() => {
    if (stremio?.id) void search(true);
    else if (initial.title) void search(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LANG_KEY, langFilter);
    } catch {
      /* ignore */
    }
  }, [langFilter]);

  const filtered = useMemo(() => {
    const list = results || [];
    if (langFilter === 'all') return list;
    const codes = LANG_GROUPS[langFilter] || [];
    return list.filter((s) => codes.includes(s.lang.toLowerCase()));
  }, [results, langFilter]);

  const pick = async (s: OnlineSubtitle, idx: number) => {
    setLoadingUrl(s.url);
    setError(null);
    try {
      const text = await fetchSubtitleText(s.url);
      const ok = onLoad(text, `${s.label} · ${s.source} #${idx + 1}`, s.url);
      if (ok) setLoadedUrl(s.url);
      else setError(t('Essa legenda veio vazia ou num formato que não consegui ler. Tente outra.'));
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setLoadingUrl(null);
    }
  };

  const input = 'h-8 bg-canvas border border-line-subtle focus:border-accent rounded-md px-2.5 text-[12.5px] text-fg outline-none';

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={t('Legendas online')} className="w-full max-w-lg max-h-[80%] flex flex-col rounded-xl bg-surface border border-line shadow-pop overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-line-subtle">
          <Subtitles size={16} className="text-accent" />
          <h2 className="text-[14px] font-semibold text-fg flex-1">{t('Legendas online')}</h2>
          <button type="button" onClick={onClose} className="p-1 rounded text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer" aria-label={t('Fechar')}>
            <X size={16} />
          </button>
        </div>

        <form
          className="px-4 py-3 space-y-2 border-b border-line-subtle"
          onSubmit={(e) => {
            e.preventDefault();
            void search(false);
          }}
        >
          <div className="flex gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Título do filme ou série')} className={`${input} flex-1 min-w-0`} />
            <input value={season} onChange={(e) => setSeason(e.target.value.replace(/\D/g, ''))} placeholder={t('Temp.')} aria-label={t('Temporada')} className={`${input} w-14`} />
            <input value={episode} onChange={(e) => setEpisode(e.target.value.replace(/\D/g, ''))} placeholder={t('Ep.')} aria-label={t('Episódio')} className={`${input} w-14`} />
            <button type="submit" disabled={loading || !title.trim()} className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50">
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
              {t('Buscar')}
            </button>
          </div>
          <div className="flex items-center gap-2 text-[11.5px] text-fg-muted">
            <span>{t('Idioma:')}</span>
            {(
              [
                ['pt', t('Português')],
                ['en', 'English'],
                ['es', 'Español'],
                ['all', t('Todos')],
              ] as [string, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setLangFilter(id)}
                className={`h-6 px-2 rounded-full border cursor-pointer ${langFilter === id ? 'bg-accent/15 border-accent/50 text-fg' : 'border-line-subtle hover:text-fg'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {matchName && <p className="text-[11px] text-fg-muted">{t('Resultado para: {name}', { name: matchName })}</p>}
        </form>

        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-3 flex items-start gap-2 text-[12px] text-warning-fg bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          {loading ? (
            <div className="p-6 flex items-center justify-center gap-2 text-[12.5px] text-fg-muted">
              <Loader2 size={14} className="animate-spin" /> {t('Procurando legendas…')}
            </div>
          ) : results && filtered.length === 0 ? (
            <div className="p-6 text-center text-[12.5px] text-fg-muted">
              {results.length > 0
                ? tn(results.length, 'Nenhuma neste idioma ({n} em outros idiomas).', 'Nenhuma neste idioma ({n} em outros idiomas).')
                : t('Nenhuma legenda encontrada.')}
            </div>
          ) : (
            <div className="divide-y divide-line-subtle">
              {filtered.slice(0, 60).map((s, i) => (
                <button
                  key={s.url}
                  type="button"
                  onClick={() => void pick(s, i)}
                  disabled={!!loadingUrl}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-subtle/60 cursor-pointer disabled:cursor-wait"
                >
                  <span className="w-20 shrink-0 text-[11px] font-semibold text-fg truncate">{langName(s.lang)}</span>
                  <span className="flex-1 min-w-0 text-[12px] text-fg-2 truncate">
                    {s.source} #{i + 1}
                  </span>
                  {loadingUrl === s.url ? (
                    <Loader2 size={13} className="animate-spin text-fg-muted" />
                  ) : loadedUrl === s.url ? (
                    <Check size={14} className="text-success" />
                  ) : (
                    <span className="text-[11px] text-accent">{t('Usar')}</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-line-subtle text-[10.5px] text-fg-muted">
          {t('Legendas do OpenSubtitles e dos addons de legenda instalados na aba Nuvio. Se a sincronia não bater, experimente outra opção.')}
        </div>
      </div>
    </div>
  );
};
