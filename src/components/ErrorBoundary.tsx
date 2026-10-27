import React from 'react';
import { AlertTriangle, RotateCcw, Copy } from 'lucide-react';
import { t } from '../i18n';

interface ErrorBoundaryProps {
  /** Nome exibido na mensagem (ex.: título da aba) */
  label?: string;
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  resetKey: number;
}

/**
 * Isola falhas de renderização: se uma tela quebrar, apenas ela mostra o erro
 * (com opção de recarregar) e o restante do app continua funcionando.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[Tomodachi] Erro em "${this.props.label || 'tela'}":`, error, info?.componentStack);
    try {
      window.electronAPI?.logError?.({
        level: 'error',
        message: `Tela "${this.props.label || '?'}": ${error?.message || String(error)}`,
        stack: `${error?.stack || ''}\n${info?.componentStack || ''}`,
      });
    } catch {
      /* ignore */
    }
  }

  private reset = () => {
    this.setState((s) => ({ error: null, resetKey: s.resetKey + 1 }));
  };

  private copy = () => {
    const { error } = this.state;
    if (!error) return;
    const text = `${error.name}: ${error.message}\n${error.stack || ''}`;
    try {
      navigator.clipboard?.writeText(text);
    } catch {
      /* ignore */
    }
  };

  render() {
    const { error, resetKey } = this.state;
    if (error) {
      return (
        <div className="h-full w-full flex items-center justify-center p-8 bg-canvas">
          <div className="max-w-md w-full rounded-xl border border-line-subtle bg-surface p-6 text-center">
            <div className="mx-auto w-12 h-12 rounded-xl bg-warning/15 text-warning-fg flex items-center justify-center mb-4">
              <AlertTriangle size={24} />
            </div>
            <h2 className="text-[15px] font-semibold text-fg mb-1">{t('Algo deu errado nesta tela')}</h2>
            <p className="text-[13px] text-fg-muted mb-4 leading-relaxed">
              {this.props.label ? <>{t('A aba')} <strong className="text-fg-2">{this.props.label}</strong> {t('encontrou um erro.')} </> : null}
              {t('As outras abas continuam funcionando normalmente.')}
            </p>
            <pre className="text-left text-[11px] text-danger-fg/90 bg-canvas border border-line-subtle rounded-md p-2.5 mb-4 max-h-28 overflow-auto whitespace-pre-wrap break-words">
              {error.message || String(error)}
            </pre>
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={this.reset}
                className="h-8 px-4 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw size={13} /> {t('Recarregar tela')}
              </button>
              <button
                type="button"
                onClick={this.copy}
                className="h-8 px-3 rounded-md bg-subtle hover:bg-elevated text-fg-2 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Copy size={13} /> {t('Copiar detalhes')}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return <React.Fragment key={resetKey}>{this.props.children}</React.Fragment>;
  }
}
