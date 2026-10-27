// src/i18n/index.ts
// Tradução da interface (Português do Brasil, English, Español).
//
// Estilo "gettext": o próprio texto em português é a chave.
//   t('Biblioteca')                    → "Library" / "Biblioteca"
//   t('{n} capítulos', { n: 12 })      → "12 chapters" / "12 capítulos"
// Textos sem tradução aparecem em português (nunca quebra a interface).
// Trocar de idioma recarrega a interface (as abas abertas são restauradas).

import { DICTIONARY } from './dictionary';

export type Lang = 'pt-BR' | 'en' | 'es';

export const LANGUAGES: Array<{ id: Lang; label: string; flag: string }> = [
  { id: 'pt-BR', label: 'Português (Brasil)', flag: '🇧🇷' },
  { id: 'en', label: 'English', flag: '🇺🇸' },
  { id: 'es', label: 'Español', flag: '🇪🇸' },
];

const STORAGE_KEY = 'tp_language';

function detectLanguage(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'pt-BR' || saved === 'en' || saved === 'es') return saved;
  } catch {
    /* ignore */
  }
  return 'pt-BR';
}

/** Idioma ativo (fixo durante a sessão; trocar recarrega a interface). */
export const lang: Lang = detectLanguage();

/** Locale para datas e números (Intl / toLocaleString). */
export const locale = lang === 'en' ? 'en-US' : lang === 'es' ? 'es-ES' : 'pt-BR';

const column: 0 | 1 | null = lang === 'en' ? 0 : lang === 'es' ? 1 : null;

const interpolate = (s: string, vars?: Record<string, string | number>) =>
  vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;

/** Traduz um texto escrito em português. */
export function t(pt: string, vars?: Record<string, string | number>): string {
  if (column !== null) {
    const entry = DICTIONARY[pt];
    if (entry && entry[column]) return interpolate(entry[column], vars);
  }
  return interpolate(pt, vars);
}

/** Singular/plural: tn(n, '{n} capítulo', '{n} capítulos') */
export function tn(n: number, one: string, many: string, vars?: Record<string, string | number>): string {
  return t(n === 1 ? one : many, { n, ...(vars || {}) });
}

/** Traduz mensagens que podem vir prontas (ex.: erros do processo principal). */
export function tMaybe(text: string | undefined | null): string {
  if (!text) return '';
  return column !== null && DICTIONARY[text]?.[column] ? DICTIONARY[text][column] : text;
}

export function setLanguage(next: Lang) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  window.location.reload();
}

try {
  document.documentElement.lang = lang;
} catch {
  /* ignore */
}
