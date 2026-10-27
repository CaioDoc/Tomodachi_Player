import { createContext, useContext } from 'react';

/**
 * Indica se a aba que contém o componente está visível.
 *
 * Todas as abas permanecem montadas (para preservar estado), então atalhos de
 * teclado, reprodução de vídeo e outros efeitos globais devem consultar este
 * contexto para agir somente na aba ativa.
 */
export const TabActiveContext = createContext<boolean>(true);

export const useIsTabActive = (): boolean => useContext(TabActiveContext);

/**
 * Retorna true se o evento de teclado veio de um campo de digitação,
 * para que atalhos de uma única tecla não interfiram ao escrever.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'input') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['range', 'checkbox', 'radio', 'button', 'submit', 'reset', 'color', 'file'].includes(type);
  }
  return tag === 'textarea' || tag === 'select' || el.isContentEditable;
}
