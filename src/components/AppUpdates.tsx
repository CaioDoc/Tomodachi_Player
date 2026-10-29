// src/components/AppUpdates.tsx
// Atualização automática do app: cartão nas Configurações + aviso flutuante quando há versão nova.

import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, RefreshCw, RotateCcw, Sparkles, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { APP_VERSION } from '../constants/labels';
import { locale, t } from '../i18n';

export interface UpdateState {
  status: 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
  mode: 'installer' | 'portable' | 'manual';
  auto: boolean;
  current: string;
  version?: string;
  percent?: number;
  releaseUrl?: string;
  notes?: string;
  error?: string;
  checkedAt?: number;
}

const api = () => (window as any).electronAPI as
  | {
      updaterGetState?: () => Promise<UpdateState>;
      updaterSetAuto?: (auto: boolean) => Promise<UpdateState>;
      updaterCheck?: () => Promise<UpdateState>;
      updaterDownload?: () => Promise<UpdateState>;
      updaterInstall?: () => Promise<{ success: boolean }>;
      updaterOpenReleases?: () => Promise<void>;
      onUpdaterState?: (cb: (s: UpdateState) => void) => () => void;
    }
  | undefined;

export function useUpdater(): [UpdateState | null, React.Dispatch<React.SetStateAction<UpdateState | null>>] {
  const [state, setState] = useState<UpdateState | null>(null);
  useEffect(() => {
    const a = api();
    if (!a?.updaterGetState) return;
    void a.updaterGetState().then(setState).catch(() => {});
    const off = a.onUpdaterState?.((s) => setState(s));
    return () => {
      if (typeof off === 'function') off();
    };
  }, []);
  return [state, setState];
}

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button
    type="button"
    role="switch"
    aria-checked={on}
    aria-label={label}
    onClick={() => onChange(!on)}
    className={`relative w-10 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${on ? 'bg-accent' : 'bg-subtle border border-line'}`}
  >
    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);

function statusLine(s: UpdateState): { icon: React.ReactNode; text: string } {
  switch (s.status) {
    case 'checking':
      return { icon: <Loader2 size={14} className="animate-spin text-accent" />, text: t('Procurando atualizações…') };
    case 'available':
      return { icon: <Sparkles size={14} className="text-accent" />, text: t('Versão {v} disponível', { v: s.version || '' }) };
    case 'downloading':
      return { icon: <Loader2 size={14} className="animate-spin text-accent" />, text: t('Baixando a versão {v}… {p}%', { v: s.version || '', p: s.percent ?? 0 }) };
    case 'downloaded':
      return { icon: <CheckCircle2 size={14} className="text-success-fg" />, text: t('Versão {v} pronta para instalar', { v: s.version || '' }) };
    case 'up-to-date':
      return { icon: <CheckCircle2 size={14} className="text-success-fg" />, text: t('Você está na versão mais recente') };
    case 'error':
      return { icon: <AlertTriangle size={14} className="text-warning-fg" />, text: t('Não foi possível verificar agora') };
    default:
      return { icon: <RefreshCw size={14} className="text-fg-muted" />, text: t('Ainda não verificado') };
  }
}

/** Cartão "Atualizações" nas Configurações → Sistema */
export const AppUpdatesCard: React.FC = () => {
  const [s, setS] = useUpdater();
  const a = api();

  if (!a?.updaterGetState || !s) {
    return (
      <div className="p-5 bg-surface rounded-lg border border-line shadow-sm">
        <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
          <RefreshCw size={16} /> {t('Atualizações')}
        </h2>
        <p className="text-xs text-fg-muted mt-2">{t('Versão {v}', { v: APP_VERSION })}</p>
      </div>
    );
  }

  const line = statusLine(s);
  const busy = s.status === 'checking' || s.status === 'downloading';
  const canInstall = s.mode === 'installer';

  return (
    <div className="p-5 bg-surface rounded-lg border border-line space-y-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <RefreshCw size={16} /> {t('Atualizações')}
          </h2>
          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
            {canInstall
              ? t('Com a opção ligada, o app baixa as versões novas sozinho e instala quando você fechar. Você não precisa mais entrar no site para atualizar.')
              : s.mode === 'portable'
                ? t('A versão portátil não se atualiza sozinha: o app avisa quando houver versão nova e abre a página de download. Use o instalador para atualizar automaticamente.')
                : t('Esta cópia não foi instalada pelo instalador: o app só avisa quando houver versão nova.')}
          </p>
        </div>
        <div className="flex items-center gap-2 pt-0.5">
          <span className="text-xs text-fg-2">{t('Atualizar automaticamente')}</span>
          <Toggle
            on={s.auto}
            label={t('Atualizar automaticamente')}
            onChange={async (v) => {
              setS({ ...s, auto: v });
              const next = await a.updaterSetAuto?.(v);
              if (next) setS(next);
            }}
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 p-3 rounded-md bg-canvas border border-line">
        <div className="flex items-center gap-2 text-xs text-fg-2 flex-1 min-w-[220px]">
          {line.icon}
          <span>{line.text}</span>
          {s.checkedAt && s.status !== 'checking' ? (
            <span className="text-fg-muted">· {new Date(s.checkedAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}</span>
          ) : null}
        </div>
        <span className="text-[11px] text-fg-muted font-mono">v{s.current}</span>
        {s.status === 'downloaded' ? (
          <button
            type="button"
            onClick={() => void a.updaterInstall?.()}
            className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw size={13} /> {t('Reiniciar e atualizar')}
          </button>
        ) : s.status === 'available' ? (
          <button
            type="button"
            onClick={() => void a.updaterDownload?.()}
            className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            {canInstall ? <Download size={13} /> : <ExternalLink size={13} />} {canInstall ? t('Baixar agora') : t('Abrir página de download')}
          </button>
        ) : (
          <button
            type="button"
            disabled={busy}
            onClick={async () => {
              const next = await a.updaterCheck?.();
              if (next) setS(next);
            }}
            className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated border border-line text-xs text-fg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-default"
          >
            <RefreshCw size={13} className={busy ? 'animate-spin' : ''} /> {t('Procurar atualizações')}
          </button>
        )}
      </div>

      {s.status === 'downloading' && (
        <div className="h-1.5 rounded-full bg-subtle overflow-hidden" aria-hidden>
          <div className="h-full bg-accent transition-all" style={{ width: `${s.percent ?? 0}%` }} />
        </div>
      )}
      {s.status === 'error' && s.error && <p className="text-[11px] text-fg-muted break-all">{s.error}</p>}
      <button type="button" onClick={() => void a.updaterOpenReleases?.()} className="text-[11.5px] text-accent hover:underline inline-flex items-center gap-1 cursor-pointer">
        <ExternalLink size={11} /> {t('Ver novidades de cada versão')}
      </button>
    </div>
  );
};

const DISMISS_KEY = 'tp_update_notice_dismissed';

/** Aviso flutuante: versão nova pronta (instalador) ou disponível (portátil) */
export const UpdateNotice: React.FC = () => {
  const [s] = useUpdater();
  const [dismissed, setDismissed] = useState<string>(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) || '';
    } catch {
      return '';
    }
  });
  if (!s || !s.version) return null;
  const ready = s.status === 'downloaded';
  const manualAvailable = s.status === 'available' && s.mode !== 'installer';
  const askDownload = s.status === 'available' && s.mode === 'installer' && !s.auto;
  if (!ready && !manualAvailable && !askDownload) return null;
  const key = `${s.status}:${s.version}`;
  if (dismissed === key) return null;
  const a = api();
  const close = () => {
    setDismissed(key);
    try {
      localStorage.setItem(DISMISS_KEY, key);
    } catch {
      /* ignore */
    }
  };

  return (
    <div role="status" className="fixed bottom-5 right-5 z-[9500] w-[320px] rounded-xl border border-line bg-elevated shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <button type="button" onClick={close} aria-label={t('Fechar')} className="absolute top-2 right-2 p-1 rounded text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer">
        <X size={14} />
      </button>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-fg pr-6">
        <Sparkles size={15} className="text-accent" />
        {ready ? t('Atualização pronta') : t('Nova versão disponível')}
      </div>
      <p className="text-[12px] text-fg-muted mt-1 leading-relaxed">
        {ready
          ? t('A versão {v} já foi baixada. Ela é instalada quando você fechar o app, ou agora mesmo:', { v: s.version })
          : t('A versão {v} do Tomodachi Player saiu.', { v: s.version })}
      </p>
      <div className="flex items-center gap-2 mt-3">
        {ready ? (
          <button type="button" onClick={() => void a?.updaterInstall?.()} className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
            <RotateCcw size={13} /> {t('Reiniciar e atualizar')}
          </button>
        ) : (
          <button type="button" onClick={() => void a?.updaterDownload?.()} className="h-8 px-3 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer">
            {askDownload ? <Download size={13} /> : <ExternalLink size={13} />} {askDownload ? t('Baixar agora') : t('Baixar')}
          </button>
        )}
        <button type="button" onClick={close} className="h-8 px-3 rounded-md text-xs text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer">
          {t('Depois')}
        </button>
      </div>
    </div>
  );
};

const LAST_VERSION_KEY = 'tp_last_version';

/** Depois de uma atualização: "Atualizado para a versão X" com link para as novidades */
export const UpdatedNotice: React.FC = () => {
  const [prev] = useState<string | null>(() => {
    try {
      const p = localStorage.getItem(LAST_VERSION_KEY);
      localStorage.setItem(LAST_VERSION_KEY, APP_VERSION);
      return p && p !== APP_VERSION ? p : null;
    } catch {
      return null;
    }
  });
  const [open, setOpen] = useState(!!prev);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => setOpen(false), 15000);
    return () => window.clearTimeout(id);
  }, [open]);
  if (!open || !prev) return null;
  const url = `https://github.com/CaioDoc/Tomodachi_Player/releases/tag/v${APP_VERSION}`;
  return (
    <div role="status" className="fixed bottom-5 right-5 z-[9400] w-[300px] rounded-xl border border-line bg-elevated shadow-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <button type="button" onClick={() => setOpen(false)} aria-label={t('Fechar')} className="absolute top-2 right-2 p-1 rounded text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer">
        <X size={14} />
      </button>
      <div className="flex items-center gap-2 text-[13px] font-semibold text-fg pr-6">
        <CheckCircle2 size={15} className="text-success-fg" />
        {t('Atualizado para a versão {v}', { v: APP_VERSION })}
      </div>
      <button
        type="button"
        onClick={() => {
          const a = (window as any).electronAPI;
          if (a?.openExternal) void a.openExternal(url);
          else window.open(url, '_blank', 'noopener');
          setOpen(false);
        }}
        className="mt-2 text-[12px] text-accent hover:underline inline-flex items-center gap-1 cursor-pointer"
      >
        <ExternalLink size={12} /> {t('Ver o que mudou')}
      </button>
    </div>
  );
};
