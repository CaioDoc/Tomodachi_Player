// src/components/StreamRunList.tsx
// Lista de links encontrados pelos plugins/addons. Mostra só links que o player toca;
// plugins sem resultado ficam resumidos numa linha.

import React, { useState } from 'react';
import { Play, Loader2, Plug, ChevronDown, ChevronRight, Subtitles } from 'lucide-react';
import { isHlsStream, isTorrentStream, qualityRank, type ScraperRun, type NuvioStream } from '../api/nuvio';
import { t, tn } from '../i18n';

const formatLabel = (s: NuvioStream) =>
  isTorrentStream(s) ? 'TORRENT' : isHlsStream(s) ? 'HLS' : (s.url.split('?')[0].match(/\.(mp4|mkv|webm|m4v|avi|mov)$/i)?.[1] || 'video').toUpperCase();

export const StreamRunList: React.FC<{
  runs: ScraperRun[];
  searching: boolean;
  onPlay: (stream: NuvioStream, run: ScraperRun) => void;
}> = ({ runs, searching, onPlay }) => {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const withLinks = runs.filter((r) => r.streams.length > 0);
  const running = runs.filter((r) => r.status === 'running');
  const empty = runs.filter((r) => r.status !== 'running' && r.streams.length === 0);
  const total = withLinks.reduce((n, r) => n + r.streams.length, 0);

  return (
    <div className="divide-y divide-line-subtle">
      {withLinks.map((run) => {
        const streams = [...run.streams].sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
        const isCollapsed = collapsed[run.key] ?? false;
        return (
          <div key={run.key}>
            <button
              type="button"
              onClick={() => setCollapsed((c) => ({ ...c, [run.key]: !isCollapsed }))}
              className="w-full flex items-center gap-2 px-4 py-2 text-left bg-canvas/50 cursor-pointer"
            >
              {isCollapsed ? <ChevronRight size={13} className="text-fg-muted" /> : <ChevronDown size={13} className="text-fg-muted" />}
              {run.scraper.logo ? (
                <img src={run.scraper.logo} alt="" className="w-4 h-4 rounded object-cover" referrerPolicy="no-referrer" onError={(e) => ((e.target as HTMLElement).style.display = 'none')} />
              ) : (
                <Plug size={13} className="text-fg-muted" />
              )}
              <span className="text-[12.5px] font-medium text-fg truncate">{run.scraper.name}</span>
              {run.kind === 'addon' && <span className="text-[9.5px] uppercase tracking-wide px-1 rounded bg-subtle text-fg-muted shrink-0">addon</span>}
              <span className="ml-auto text-[11px] text-fg-muted shrink-0">{tn(run.streams.length, '{n} link', '{n} links')}</span>
            </button>
            {!isCollapsed &&
              streams.map((s, i) => (
                <div key={`${run.key}-${i}`} className="group flex items-center gap-3 px-4 py-2 hover:bg-subtle/60">
                  <span className="w-14 shrink-0 text-center text-[10.5px] font-semibold px-1 py-0.5 rounded bg-accent/15 text-fg tabular-nums">{s.quality || '—'}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] text-fg truncate" title={s.title || s.name}>
                      {s.title || s.name || run.scraper.name}
                    </div>
                    <div className="text-[10.5px] text-fg-muted flex items-center gap-1.5">
                      <span className="font-mono">{formatLabel(s)}</span>
                      {s.size && <span>· {s.size}</span>}
                      {s.subtitles?.length ? (
                        <span className="inline-flex items-center gap-0.5">
                          · <Subtitles size={10} /> {s.subtitles.length}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onPlay(s, run)}
                    className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                  >
                    <Play size={12} fill="currentColor" /> {t('Assistir')}
                  </button>
                </div>
              ))}
          </div>
        );
      })}

      {running.length > 0 && (
        <div className="px-4 py-2.5 flex items-center gap-2 text-[12px] text-fg-muted">
          <Loader2 size={13} className="animate-spin shrink-0" />
          <span className="truncate">
            {t('Buscando em {names}…', { names: running.map((r) => r.scraper.name).slice(0, 4).join(', ') + (running.length > 4 ? ` +${running.length - 4}` : '') })}
          </span>
        </div>
      )}

      {!searching && empty.length > 0 && total > 0 && (
        <div
          className="px-4 py-2 text-[11px] text-fg-muted"
          title={empty.map((r) => `${r.scraper.name}: ${r.status === 'error' ? r.error || t('falhou') : t('nada encontrado')}`).join('\n')}
        >
          {tn(empty.length, '{n} fonte sem links compatíveis', '{n} fontes sem links compatíveis')}
        </div>
      )}

      {!searching && total === 0 && (
        <div className="p-5 text-center text-[12.5px] text-fg-muted" title={empty.map((r) => `${r.scraper.name}: ${r.status === 'error' ? r.error || '' : t('nada encontrado')}`).join('\n')}>
          {t('Nenhum link compatível encontrado. Tente outro episódio, outras fontes ou atualize os repositórios.')}
        </div>
      )}
    </div>
  );
};
