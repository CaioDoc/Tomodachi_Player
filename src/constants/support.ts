// src/constants/support.ts
// Links do banner de apoio (Configurações) e do botão "Doar" no topo das seções.
//
//  SUPPORT_URL → seu checkout (Lemon Squeezy ou Paddle). Sem link, "Doar" abre o banner nas Configurações.
//  GITHUB_URL  → página do projeto no GitHub. Sem link, o botão "Ver no GitHub" não aparece.

export const SUPPORT_URL = '';
export const GITHUB_URL = 'https://github.com/CaioDoc/Tomodachi_Player';

/** Abre um link no navegador do sistema */
export function openExternalUrl(url: string) {
  if (!url) return;
  const api = (window as any).electronAPI;
  if (api?.openExternal) void api.openExternal(url);
  else window.open(url, '_blank', 'noopener');
}

/** Evento para o banner mostrar o slide de doação */
export const SUPPORT_FOCUS_EVENT = 'tomodachi:support-focus';

/** Botão "Doar": abre o checkout; sem link configurado, leva ao banner nas Configurações */
export function openDonate() {
  if (SUPPORT_URL) {
    openExternalUrl(SUPPORT_URL);
    return;
  }
  try {
    sessionStorage.setItem('tp_support_focus', '1');
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new CustomEvent('tomodachi:navigate', { detail: { type: 'settings-repos', section: 'appearance' } }));
  window.dispatchEvent(new CustomEvent(SUPPORT_FOCUS_EVENT));
}
