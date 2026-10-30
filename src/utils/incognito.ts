// src/utils/incognito.ts
// Modo anônimo: enquanto ligado, o que é assistido/lido naquela seção não fica salvo
// (posição do vídeo, "Continuar assistindo/lendo", histórico, episódios/capítulos vistos e AniList).
// Vale até fechar o app (fica na sessionStorage), como a janela anônima de um navegador.

import { useEffect, useState } from 'react';
import type { ProgressSource } from './progress';

export const INCOGNITO_EVENT = 'tomodachi:incognito-changed';
const key = (source: ProgressSource) => `tp_incognito_${source}`;

export function isIncognito(source: ProgressSource): boolean {
  try {
    return sessionStorage.getItem(key(source)) === '1';
  } catch {
    return false;
  }
}

export function setIncognito(source: ProgressSource, on: boolean) {
  try {
    if (on) sessionStorage.setItem(key(source), '1');
    else sessionStorage.removeItem(key(source));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(INCOGNITO_EVENT, { detail: { source, on } }));
  } catch {
    /* ignore */
  }
}

export function useIncognito(source: ProgressSource): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(() => isIncognito(source));
  useEffect(() => {
    const sync = () => setOn(isIncognito(source));
    window.addEventListener(INCOGNITO_EVENT, sync);
    return () => window.removeEventListener(INCOGNITO_EVENT, sync);
  }, [source]);
  return [on, (v: boolean) => setIncognito(source, v)];
}
