// src/components/ExtensionAutoUpdateCard.tsx
// Configurações → Repositórios de Extensões: atualização automática das extensões.

import React, { useEffect, useState } from 'react';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle, BookOpen, Film, Server } from 'lucide-react';
import {
  EXT_AUTOUPDATE_EVENT,
  getExtAutoUpdateState,
  runExtensionUpdates,
  setExtAutoUpdateEnabled,
  type ExtUpdateChange,
} from '../api/extensionAutoUpdate';
import { t, tn, locale } from '../i18n';

const KIND_ICON: Record<ExtUpdateChange['kind'], React.ReactNode> = {
  manga: <BookOpen size={12} />,
  anime: <Film size={12} />,
  suwayomi: <Server size={12} />,
};

export const ExtensionAutoUpdateCard: React.FC = () => {
  const [state, setState] = useState(getExtAutoUpdateState);

  useEffect(() => {
    const on = () => setState(getExtAutoUpdateState());
    window.addEventListener(EXT_AUTOUPDATE_EVENT, on);
    return () => window.removeEventListener(EXT_AUTOUPDATE_EVENT, on);
  }, []);

  const changes = state.lastChanges || [];
  const errors = state.lastErrors || [];

  return (
    <div className="p-4 bg-surface rounded-lg border border-line shadow-sm">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-[260px]">
          <h2 className="text-sm font-semibold text-fg flex items-center gap-2">
            <RefreshCw size={15} className="text-accent" />
            {t('Atualizar extensões automaticamente')}
          </h2>
          <p className="text-xs text-fg-muted mt-1 leading-relaxed">
            {t('Ao abrir o app, as extensões de mangá e de anime são conferidas nos repositórios e atualizadas (versão e endereço do site). Extensões do Suwayomi com atualização também são instaladas.')}
          </p>
          <p className="text-[11px] text-fg-muted mt-2">
            {state.running
              ? t('Verificando agora…')
              : state.lastRun
                ? t('Última verificação: {date}', {
                    date: new Date(state.lastRun).toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
                  })
                : t('Ainda não verificado')}
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => void runExtensionUpdates()}
            disabled={!!state.running}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-subtle hover:bg-elevated border border-line text-xs text-fg-2 hover:text-fg disabled:opacity-60 cursor-pointer"
          >
            {state.running ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {t('Verificar agora')}
          </button>
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <span className="text-xs text-fg-2">{state.enabled ? t('Ativado') : t('Desativado')}</span>
            <button
              type="button"
              role="switch"
              aria-checked={state.enabled}
              aria-label={t('Atualizar extensões automaticamente')}
              onClick={() => setExtAutoUpdateEnabled(!state.enabled)}
              className={`relative w-9 h-5 rounded-full transition-colors cursor-pointer ${state.enabled ? 'bg-accent' : 'bg-line'}`}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${state.enabled ? 'left-[18px]' : 'left-0.5'}`} />
            </button>
          </label>
        </div>
      </div>

      {state.lastRun && !state.running && (
        <div className="mt-3 rounded-md border border-line-subtle bg-canvas divide-y divide-line-subtle text-[11px]">
          {changes.length === 0 ? (
            <div className="px-3 py-2 flex items-center gap-2 text-fg-muted">
              <CheckCircle2 size={12} className="text-success" />
              {state.checked
                ? tn(state.checked, '{n} extensão verificada — tudo atualizado', '{n} extensões verificadas — tudo atualizado')
                : t('Nenhuma extensão instalada para atualizar')}
            </div>
          ) : (
            changes.slice(0, 12).map((c, i) => (
              <div key={i} className="px-3 py-1.5 flex items-center gap-2 text-fg-2">
                <span className="text-fg-muted">{KIND_ICON[c.kind]}</span>
                <span className="font-medium text-fg truncate">{c.name}</span>
                <span className="text-fg-muted truncate">
                  {c.domain
                    ? t('novo endereço: {to}', { to: c.domain.to })
                    : c.from && c.to
                      ? `v${c.from} → v${c.to}`
                      : t('atualizada')}
                </span>
              </div>
            ))
          )}
          {errors.length > 0 && (
            <div className="px-3 py-1.5 flex items-start gap-2 text-warning-fg">
              <AlertTriangle size={12} className="shrink-0 mt-px" />
              <span className="truncate" title={errors.join('\n')}>
                {tn(errors.length, '{n} repositório não respondeu', '{n} repositórios não responderam')}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
