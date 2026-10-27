import React, { useState, useEffect } from 'react';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { APP_NAME, APP_VERSION } from '../constants/labels';
import { t } from '../i18n';

interface TitleBarProps {
  /** Barra de abas renderizada dentro da barra de título (estilo navegador) */
  children?: React.ReactNode;
}

/** Logo do app (public/icon.png — o mesmo desenho do ícone do executável). */
export const AppLogo: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <img src={size <= 32 ? "./icon-small.png" : "./icon.png"} width={size} height={size} alt="" aria-hidden="true" draggable={false} className="select-none" />
);

const formatCount = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export const TitleBar: React.FC<TitleBarProps> = ({ children }) => {
  const [adblockEnabled, setAdblockEnabled] = useState(true);
  const [blockedCount, setBlockedCount] = useState(0);

  useEffect(() => {
    window.electronAPI
      ?.getAdblockStatus?.()
      .then((res) => {
        if (res) {
          setAdblockEnabled(res.enabled);
          setBlockedCount(res.blockedCount);
        }
      })
      .catch(() => {});

    const unsub = window.electronAPI?.onAdblockCountUpdated?.((count) => setBlockedCount(count));
    // Mantém sincronizado com o botão do navegador integrado
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d && typeof d.enabled === 'boolean') setAdblockEnabled(d.enabled);
    };
    window.addEventListener('tomodachi:adblock-changed', onChanged);
    return () => {
      if (typeof unsub === 'function') unsub();
      window.removeEventListener('tomodachi:adblock-changed', onChanged);
    };
  }, []);

  const handleToggleAdblock = async () => {
    if (!window.electronAPI?.toggleAdblock) return;
    try {
      const res = await window.electronAPI.toggleAdblock();
      setAdblockEnabled(res.enabled);
      setBlockedCount(res.blockedCount);
      window.dispatchEvent(new CustomEvent('tomodachi:adblock-changed', { detail: res }));
    } catch (err) {
      console.error('Erro ao alternar adblock:', err);
    }
  };

  return (
    <header className="app-drag-region h-9 bg-canvas flex items-stretch select-none flex-shrink-0 relative">
      {/* Linha inferior por trás das abas (a aba ativa "abre" sobre ela) */}
      <div className="absolute inset-x-0 bottom-0 h-px bg-line-subtle pointer-events-none" aria-hidden="true" />

      <div className="flex items-center gap-2 pl-3 pr-3 shrink-0" title={`${APP_NAME} v${APP_VERSION}`}>
        <AppLogo size={22} />
        <span className="hidden md:inline font-semibold text-[12.5px] tracking-tight text-fg">{APP_NAME}</span>
      </div>

      {/* Abas */}
      <div className="flex-1 min-w-0 flex items-end relative z-[1]">{children}</div>

      {/* Ações da direita (fora da área dos botões nativos da janela) */}
      <div className="flex items-center gap-1.5 pl-3 shrink-0 app-no-drag">
        <button
          type="button"
          onClick={handleToggleAdblock}
          className={`h-6 px-2 rounded-md text-[11px] font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
            adblockEnabled
              ? 'text-emerald-400 hover:bg-emerald-500/10'
              : 'text-fg-muted hover:bg-subtle hover:text-rose-300'
          }`}
          title={
            adblockEnabled
              ? t('Bloqueador de anúncios ativo — {n} itens bloqueados. Clique para pausar.', { n: blockedCount })
              : t('Bloqueador de anúncios pausado. Clique para ativar.')
          }
          aria-pressed={adblockEnabled}
        >
          {adblockEnabled ? <ShieldCheck size={13} /> : <ShieldOff size={13} />}
          <span className="tabular-nums">{adblockEnabled ? formatCount(blockedCount) : t('Off')}</span>
        </button>
      </div>

      {/* Espaço reservado para os botões nativos (minimizar/maximizar/fechar) */}
      <div className="w-[140px] shrink-0" aria-hidden="true" />
    </header>
  );
};
