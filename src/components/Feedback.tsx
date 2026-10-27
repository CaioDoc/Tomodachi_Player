import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X, AlertTriangle } from 'lucide-react';
import { t } from '../i18n';

/* ─────────────────────────────────────────────────────────────────────────────
 * Avisos (toasts) e diálogos de confirmação do app.
 * Substituem alert()/confirm() nativos, que travam a janela e destoam do tema.
 *
 *   toast.success('Salvo!')         toast.error('Falhou', 'detalhes')
 *   if (await confirmDialog({ title: 'Remover?', danger: true })) { ... }
 * ──────────────────────────────────────────────────────────────────────────── */

type ToastKind = 'success' | 'error' | 'info' | 'warning';

interface ToastItem {
  id: number;
  kind: ToastKind;
  title: string;
  detail?: string;
}

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

const TOAST_EVENT = 'tomodachi:toast';
const CONFIRM_EVENT = 'tomodachi:confirm';

let toastSeq = 0;

const emitToast = (kind: ToastKind, title: string, detail?: string) => {
  try {
    window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: { id: ++toastSeq, kind, title, detail } }));
  } catch {
    /* ignore */
  }
};

export const toast = {
  success: (title: string, detail?: string) => emitToast('success', title, detail),
  error: (title: string, detail?: string) => emitToast('error', title, detail),
  info: (title: string, detail?: string) => emitToast('info', title, detail),
  warning: (title: string, detail?: string) => emitToast('warning', title, detail),
};

/** Abre um diálogo de confirmação e resolve com true/false. */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    let handled = false;
    const done = (v: boolean) => {
      if (handled) return;
      handled = true;
      resolve(v);
    };
    window.dispatchEvent(new CustomEvent(CONFIRM_EVENT, { detail: { ...opts, resolve: done } }));
    // Se nenhum host estiver montado (não deveria acontecer), cai no confirm nativo
    window.setTimeout(() => {
      if (!(window as any).__tpConfirmHost) done(window.confirm(opts.message ? `${opts.title}\n\n${opts.message}` : opts.title));
    }, 0);
  });
}

const ICONS: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 size={16} className="text-success-fg" />,
  error: <AlertCircle size={16} className="text-danger-fg" />,
  info: <Info size={16} className="text-accent" />,
  warning: <AlertTriangle size={16} className="text-warning-fg" />,
};

/** Monte uma única vez na raiz do app. */
export const FeedbackHost: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (window as any).__tpConfirmHost = true;
    const onToast = (e: Event) => {
      const item = (e as CustomEvent<ToastItem>).detail;
      if (!item) return;
      setToasts((prev) => [...prev.slice(-3), item]);
      const ttl = item.kind === 'error' ? 7000 : 4000;
      window.setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== item.id)), ttl);
    };
    const onConfirm = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d) setConfirmState(d);
    };
    window.addEventListener(TOAST_EVENT, onToast);
    window.addEventListener(CONFIRM_EVENT, onConfirm);
    return () => {
      (window as any).__tpConfirmHost = false;
      window.removeEventListener(TOAST_EVENT, onToast);
      window.removeEventListener(CONFIRM_EVENT, onConfirm);
    };
  }, []);

  useEffect(() => {
    if (!confirmState) return;
    confirmBtnRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmState]);

  const close = (v: boolean) => {
    confirmState?.resolve(v);
    setConfirmState(null);
  };

  return (
    <>
      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-[200] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)] pointer-events-none" aria-live="polite">
        {toasts.map((item) => (
          <div
            key={item.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg bg-surface border border-line px-3 py-2.5 shadow-pop animate-tp-slide-up"
          >
            <span className="mt-0.5 shrink-0">{ICONS[item.kind]}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] font-medium text-fg leading-snug">{item.title}</div>
              {item.detail && <div className="text-[11.5px] text-fg-muted mt-0.5 break-words leading-snug">{item.detail}</div>}
            </div>
            <button
              type="button"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== item.id))}
              className="p-0.5 rounded text-fg-muted hover:text-fg hover:bg-subtle cursor-pointer shrink-0"
              aria-label={t('Fechar aviso')}
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      {/* Confirmação */}
      {confirmState && (
        <div
          className="fixed inset-0 z-[210] bg-black/60 backdrop-blur-[2px] flex items-center justify-center p-4 animate-tp-fade-in"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close(false);
          }}
        >
          <div role="alertdialog" aria-modal="true" className="w-full max-w-sm rounded-xl bg-surface border border-line shadow-pop p-5 animate-tp-zoom-in">
            <div className="flex items-start gap-3">
              <span className={`mt-0.5 shrink-0 ${confirmState.danger ? 'text-danger-fg' : 'text-accent'}`}>
                {confirmState.danger ? <AlertTriangle size={20} /> : <Info size={20} />}
              </span>
              <div className="min-w-0">
                <h2 className="text-[14px] font-semibold text-fg">{confirmState.title}</h2>
                {confirmState.message && <p className="text-[12.5px] text-fg-muted mt-1.5 leading-relaxed whitespace-pre-line">{confirmState.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => close(false)}
                className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg-2 text-xs font-medium cursor-pointer"
              >
                {confirmState.cancelLabel || t('Cancelar')}
              </button>
              <button
                ref={confirmBtnRef}
                type="button"
                onClick={() => close(true)}
                className={`h-8 px-4 rounded-md text-xs font-semibold cursor-pointer ${
                  confirmState.danger ? 'bg-danger hover:bg-danger-fg text-white' : 'bg-accent hover:bg-accent-hover text-accent-fg'
                }`}
              >
                {confirmState.confirmLabel || t('Confirmar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
