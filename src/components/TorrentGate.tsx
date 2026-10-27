// src/components/TorrentGate.tsx
// Aba do player para links de torrent: pede ao motor de torrent do app para preparar
// o arquivo (metadados + peers) e, quando o vídeo começa a chegar, entrega a URL local
// ao player. Enquanto assiste, mostra peers e velocidade num selo discreto.

import React, { useEffect, useRef, useState } from 'react';
import { Loader2, Magnet, AlertTriangle, RotateCw, Users, ArrowDown } from 'lucide-react';
import { torrentHashOf } from '../api/nuvio';
import { t } from '../i18n';

export interface TorrentRequest {
  magnet: string;
  fileIdx?: number | null;
  sources?: string[];
  filename?: string;
  label?: string;
}

/** Quantas abas usam cada torrent */
const mounted = new Map<string, number>();

const fmtSpeed = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB/s` : `${Math.round(b / 1024)} KB/s`);

export const TorrentGate: React.FC<{
  torrent: TorrentRequest;
  title: string;
  children: (url: string, name: string) => React.ReactNode;
}> = ({ torrent, title, children }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [stats, setStats] = useState<{ peers: number; speed: number; progress: number } | null>(null);
  const hash = torrentHashOf(torrent.magnet);
  const hashRef = useRef(hash);
  hashRef.current = hash;

  // Prepara o torrent
  useEffect(() => {
    let alive = true;
    setError(null);
    setUrl(null);
    setElapsed(0);
    const api = window.electronAPI;
    if (!api?.torrentStart) {
      setError(t('Disponível apenas no aplicativo para Windows'));
      return;
    }
    const started = Date.now();
    const tick = setInterval(() => alive && setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    api
      .torrentStart({ magnet: torrent.magnet, fileIdx: torrent.fileIdx ?? null, sources: torrent.sources, filename: torrent.filename })
      .then((res) => {
        if (!alive) return;
        if (res?.success && res.url) {
          setUrl(res.url);
          setName(res.name || '');
        } else setError(res?.error || t('Não foi possível abrir o torrent'));
      })
      .catch((err) => alive && setError(String(err?.message || err)))
      .finally(() => clearInterval(tick));
    return () => {
      alive = false;
      clearInterval(tick);
    };
  }, [torrent.magnet, torrent.fileIdx, attempt]);

  // Peers e velocidade (a cada 2 s)
  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.torrentStatus || !hash) return;
    let alive = true;
    const poll = async () => {
      try {
        const s = await api.torrentStatus(hash);
        if (alive && s?.success) setStats({ peers: s.numPeers || 0, speed: s.downloadSpeed || 0, progress: s.progress || 0 });
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = setInterval(poll, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [hash, url]);

  // Fechou a aba: para o torrent (libera banda e disco), se nenhuma outra aba o usa
  useEffect(() => {
    const h = hashRef.current;
    if (!h) return;
    mounted.set(h, (mounted.get(h) || 0) + 1);
    return () => {
      mounted.set(h, (mounted.get(h) || 1) - 1);
      setTimeout(() => {
        if (!mounted.get(h)) void window.electronAPI?.torrentStop?.(h);
      }, 3000);
    };
  }, []);

  if (url) {
    return (
      <div className="relative w-full h-full">
        {children(url, name)}
        {stats && stats.progress < 0.999 && (
          <div
            style={{ top: 56 }}
            className="absolute right-3 z-30 pointer-events-none flex items-center gap-2 px-2 py-1 rounded-md bg-black/60 text-white/85 text-[10.5px] tabular-nums"
            title={t('Torrent: peers conectados e velocidade de download')}
          >
            <Magnet size={11} />
            <span className="inline-flex items-center gap-0.5">
              <Users size={10} /> {stats.peers}
            </span>
            <span className="inline-flex items-center gap-0.5">
              <ArrowDown size={10} /> {fmtSpeed(stats.speed)}
            </span>
            <span>{Math.floor(stats.progress * 100)}%</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="w-full h-full flex items-center justify-center bg-black text-white/90 p-6">
      <div className="max-w-md w-full text-center space-y-3">
        <Magnet size={28} className="mx-auto text-accent" />
        <h2 className="text-[15px] font-semibold truncate" title={title}>
          {title}
        </h2>
        {torrent.label && <p className="text-[11.5px] text-white/50 truncate">{torrent.label}</p>}
        {error ? (
          <>
            <div className="flex items-start gap-2 text-left text-[12.5px] text-warning-fg bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
            <p className="text-[11.5px] text-white/50">{t('Torrents com poucos seeders podem demorar ou não abrir. Tente de novo ou escolha outro link.')}</p>
            <button
              type="button"
              onClick={() => setAttempt((n) => n + 1)}
              className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-[12px] font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RotateCw size={13} /> {t('Tentar de novo')}
            </button>
          </>
        ) : (
          <>
            <div className="flex items-center justify-center gap-2 text-[12.5px] text-white/70">
              <Loader2 size={14} className="animate-spin" />
              {stats && stats.peers > 0 ? t('Conectado a {n} peers, preparando o vídeo…', { n: stats.peers }) : t('Procurando peers do torrent…')}
            </div>
            <p className="text-[11px] text-white/40 tabular-nums">
              {elapsed}s{stats && stats.speed > 0 ? ` · ${fmtSpeed(stats.speed)}` : ''}
            </p>
            {elapsed >= 20 && <p className="text-[11.5px] text-white/50">{t('Está demorando: o torrent pode ter poucos seeders. Você pode esperar mais um pouco ou voltar e escolher outro link.')}</p>}
          </>
        )}
      </div>
    </div>
  );
};
