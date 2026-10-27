// src/components/SeekBar.tsx
// Barra de progresso do player com prévia da cena ao passar o mouse.
//
// Prévia:
//  - "video": vídeos com busca nativa (MP4/WebM locais, streams diretos) — usa um segundo
//    <video> mudo, só para mostrar o quadro do ponto apontado.
//  - "ffmpeg": vídeos convertidos em tempo real (MKV, HLS…) — pede ao FFmpeg uma miniatura
//    do instante (com cache por trechos de alguns segundos).

import React, { useCallback, useEffect, useRef, useState } from 'react';

export type SeekPreviewSource =
  | { mode: 'video'; src: string }
  | { mode: 'ffmpeg'; input: string; referer?: string }
  | null;

interface SeekBarProps {
  currentTime: number;
  duration: number;
  onSeekInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
  /** Chamado ao soltar a barra (fim do arraste) */
  onSeekCommit?: (time: number) => void;
  preview: SeekPreviewSource;
  formatTime: (s: number) => string;
  ariaLabel?: string;
}

const PREVIEW_W = 192;
const PREVIEW_H = 108;

// Cache global de miniaturas do FFmpeg (sobrevive à troca de episódio)
const thumbCache = new Map<string, string>();
const remember = (key: string, url: string) => {
  thumbCache.set(key, url);
  if (thumbCache.size > 400) thumbCache.delete(thumbCache.keys().next().value as string);
};

export const SeekBar: React.FC<SeekBarProps> = ({ currentTime, duration, onSeekInput, onSeekCommit, preview, formatTime, ariaLabel }) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; width: number; time: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const max = duration > 0 ? duration : 100;
  const pct = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  const updateHover = useCallback(
    (clientX: number) => {
      const el = wrapRef.current;
      if (!el || !(duration > 0)) return;
      const rect = el.getBoundingClientRect();
      const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
      setHover({ x, width: rect.width, time: (x / rect.width) * duration });
    },
    [duration]
  );

  /* ── Prévia por <video> auxiliar ── */
  const pvRef = useRef<HTMLVideoElement>(null);
  const pvSeeking = useRef(false);
  const pvPending = useRef<number | null>(null);
  const [pvReady, setPvReady] = useState(false);
  const videoSrc = preview?.mode === 'video' ? preview.src : '';
  // Só carrega o vídeo auxiliar depois do primeiro hover
  const [pvArmed, setPvArmed] = useState(false);
  useEffect(() => {
    setPvReady(false);
    setPvArmed(false);
  }, [videoSrc]);

  const pvSeek = useCallback((time: number) => {
    const v = pvRef.current;
    if (!v) return;
    if (pvSeeking.current || v.readyState < 1) {
      pvPending.current = time;
      return;
    }
    pvSeeking.current = true;
    try {
      v.currentTime = time;
    } catch {
      pvSeeking.current = false;
    }
  }, []);

  const onPvSeeked = () => {
    pvSeeking.current = false;
    setPvReady(true);
    const next = pvPending.current;
    pvPending.current = null;
    if (next != null && pvRef.current && Math.abs(pvRef.current.currentTime - next) > 0.5) pvSeek(next);
  };

  /* ── Prévia pelo FFmpeg ── */
  const [thumb, setThumb] = useState<{ key: string; url: string } | null>(null);
  const reqRef = useRef<{ busy: boolean; next: { key: string; time: number } | null }>({ busy: false, next: null });
  const ffInput = preview?.mode === 'ffmpeg' ? preview.input : '';
  const ffReferer = preview?.mode === 'ffmpeg' ? preview.referer : undefined;
  const bucketSize = duration > 1800 ? 10 : 5;
  const timerRef = useRef<number | null>(null);

  const fetchThumb = useCallback(
    async (key: string, time: number) => {
      const api = window.electronAPI;
      if (!api?.videoThumbnail || !ffInput) return;
      const state = reqRef.current;
      if (state.busy) {
        state.next = { key, time };
        return;
      }
      state.busy = true;
      try {
        const res = await api.videoThumbnail({ input: ffInput, time, referer: ffReferer, width: PREVIEW_W * 2 });
        if (res?.success && res.dataUrl) {
          remember(key, res.dataUrl);
          setThumb((cur) => (cur && cur.key !== key && hoverKeyRef.current !== key ? cur : { key, url: res.dataUrl! }));
        }
      } catch {
        /* sem prévia */
      } finally {
        state.busy = false;
        const next = state.next;
        state.next = null;
        if (next && !thumbCache.has(next.key)) void fetchThumb(next.key, next.time);
        else if (next && thumbCache.has(next.key)) setThumb({ key: next.key, url: thumbCache.get(next.key)! });
      }
    },
    [ffInput, ffReferer]
  );

  const hoverKeyRef = useRef<string>('');
  const hoverTime = hover?.time ?? -1;

  useEffect(() => {
    if (hoverTime < 0 || !preview) return;
    if (preview.mode === 'video') {
      if (!pvArmed) setPvArmed(true);
      pvSeek(hoverTime);
      return;
    }
    const bucket = Math.floor(hoverTime / bucketSize) * bucketSize + Math.min(2, bucketSize / 2);
    const key = `${ffInput}|${bucket}`;
    hoverKeyRef.current = key;
    const cached = thumbCache.get(key);
    if (cached) {
      setThumb({ key, url: cached });
      return;
    }
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => void fetchThumb(key, bucket), 140);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoverTime, preview?.mode, ffInput, videoSrc, bucketSize]);

  // Arraste: a prévia acompanha o ponteiro
  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent) => updateHover(e.clientX);
    const up = () => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [dragging, updateHover]);

  const showTip = !!hover && duration > 0;
  const tipW = preview ? PREVIEW_W : 64;
  const tipLeft = hover ? Math.min(Math.max(hover.x, tipW / 2), Math.max(tipW / 2, hover.width - tipW / 2)) : 0;
  const ffThumb = preview?.mode === 'ffmpeg' && thumb ? thumb.url : null;

  return (
    <div
      ref={wrapRef}
      className="group/seek relative flex-1 h-5 flex items-center"
      onMouseMove={(e) => updateHover(e.clientX)}
      onMouseEnter={(e) => updateHover(e.clientX)}
      onMouseLeave={() => {
        if (!dragging) setHover(null);
      }}
    >
      {/* Trilha */}
      <div className="absolute inset-x-0 h-1.5 group-hover/seek:h-2 transition-[height] rounded-full bg-elevated overflow-hidden pointer-events-none">
        {hover && duration > 0 && (
          <div className="absolute inset-y-0 left-0 bg-fg/15" style={{ width: `${(hover.x / hover.width) * 100}%` }} />
        )}
        <div className="absolute inset-y-0 left-0 bg-accent" style={{ width: `${pct}%` }} />
      </div>
      <div
        className="absolute w-3.5 h-3.5 -ml-[7px] rounded-full bg-accent shadow ring-2 ring-surface pointer-events-none scale-0 group-hover/seek:scale-100 transition-transform"
        style={{ left: `${pct}%` }}
        aria-hidden="true"
      />

      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={Math.min(currentTime, max)}
        aria-label={ariaLabel}
        onChange={onSeekInput}
        onPointerDown={(e) => {
          setDragging(true);
          updateHover(e.clientX);
        }}
        onPointerUp={(e) => {
          setDragging(false);
          onSeekCommit?.(Number((e.target as HTMLInputElement).value));
        }}
        onKeyUp={(e) => onSeekCommit?.(Number((e.target as HTMLInputElement).value))}
        className="tp-seek absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      />

      {/* Prévia */}
      {showTip && (
        <div
          className="absolute bottom-full mb-3 -translate-x-1/2 pointer-events-none z-30 flex flex-col items-center gap-1 animate-tp-fade-in"
          style={{ left: tipLeft }}
        >
          {preview && (
            <div
              className="relative rounded-md overflow-hidden border border-line bg-black shadow-pop"
              style={{ width: PREVIEW_W, height: PREVIEW_H }}
            >
              {preview.mode === 'video' && pvArmed && (
                <video
                  key={videoSrc}
                  ref={pvRef}
                  src={videoSrc}
                  muted
                  playsInline
                  preload="auto"
                  onLoadedMetadata={() => {
                    const t = pvPending.current ?? hover?.time ?? 0;
                    pvPending.current = null;
                    pvSeek(t);
                  }}
                  onSeeked={onPvSeeked}
                  className={`w-full h-full object-contain transition-opacity ${pvReady ? 'opacity-100' : 'opacity-0'}`}
                />
              )}
              {ffThumb && <img src={ffThumb} alt="" className="w-full h-full object-contain" draggable={false} />}
              {((preview.mode === 'video' && !pvReady) || (preview.mode === 'ffmpeg' && !ffThumb)) && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="w-5 h-5 rounded-full border-2 border-white/25 border-t-white/80 animate-spin" />
                </div>
              )}
            </div>
          )}
          <span className="px-1.5 py-0.5 rounded bg-black/85 text-white text-[11px] font-mono tabular-nums">{formatTime(hover!.time)}</span>
        </div>
      )}
    </div>
  );
};
