// src/utils/continueWatching.ts
// "Continuar assistindo": guarda o último ponto de cada obra e como reabrir o mesmo vídeo
// (mesmo link/fonte), para retomar com um clique.

import { isIncognito } from './incognito';
export const CONTINUE_EVENT = 'tomodachi:continue-changed';
const KEY = 'tp_continue_watching';
const MAX = 40;

export interface ResumeEntry {
  /** Episódio (URL estável do episódio) ou caminho do arquivo */
  key: string;
  /** Título mostrado no player (ex.: "Frieren - T1 E3") */
  title: string;
  workTitle?: string;
  workUrl?: string;
  cover?: string;
  /** Segundos assistidos e duração */
  t: number;
  d: number;
  at: number;
  /** Dados para reabrir a aba do player */
  play: Record<string, any>;
}

function read(): ResumeEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(v) ? v.filter((e) => e && typeof e.key === 'string' && e.play) : [];
  } catch {
    return [];
  }
}

function write(list: ResumeEntry[], notify = true) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* cota: tenta sem os dados mais pesados */
    try {
      localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX).map((e) => ({ ...e, play: { ...e.play, episodeContext: undefined, subtitles: undefined } }))));
    } catch {
      /* ignore */
    }
  }
  if (notify) {
    try {
      window.dispatchEvent(new CustomEvent(CONTINUE_EVENT));
    } catch {
      /* ignore */
    }
  }
}

/** Grava/atualiza o ponto de um episódio (uma entrada por obra: o episódio mais recente) */
export function recordResume(e: Omit<ResumeEntry, 'at'>, notify = false) {
  if (!e.key || !isFinite(e.t) || isIncognito('video')) return;
  const list = read().filter((x) => x.key !== e.key && !(e.workUrl && x.workUrl === e.workUrl));
  // Quase no fim: tira da lista (o episódio foi concluído)
  if (e.d > 0 && e.t > e.d - 20) {
    write(list, true);
    return;
  }
  if (e.t < 5) return;
  const wasThere = read().some((x) => x.key === e.key);
  list.unshift({ ...e, t: Math.floor(e.t), d: Math.floor(e.d || 0), at: Date.now() });
  write(list, notify || !wasThere);
}

export function removeResume(key: string) {
  write(read().filter((x) => x.key !== key));
}

export function getResume(key: string): ResumeEntry | null {
  return read().find((x) => x.key === key) || null;
}

/** Itens para "Continuar assistindo" (mais recentes primeiro, até 60 dias) */
export function listResume(limit = 20): ResumeEntry[] {
  const cutoff = Date.now() - 60 * 86400000;
  return read()
    .filter((e) => e.at >= cutoff && e.t >= 5)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

export const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
};
