// src/api/onlineSubtitles.ts
// Legendas online, sem precisar baixar arquivo: OpenSubtitles (pelo addon público do Stremio,
// sem chave) + addons de legenda que o usuário instalou na aba Nuvio.

import { fetchJson, nuvioCatalog, fetchAddonSubtitles, type NuvioMetaPreview } from './nuvio';
import { normTitle, titleScore } from './watchSources';

const OPENSUBTITLES = 'https://opensubtitles-v3.strem.io';

export interface OnlineSubtitle {
  url: string;
  lang: string;
  label: string;
  source: string;
}

export interface ParsedName {
  title: string;
  season?: number;
  episode?: number;
  year?: number;
}

/** Extrai título, temporada/episódio e ano de um nome de arquivo ou título de aba */
export function parseMediaName(raw: string): ParsedName {
  let s = String(raw || '')
    .split(/[\\/]/)
    .pop()!
    .replace(/\.(mkv|mp4|avi|webm|m4v|mov|ts|m2ts)$/i, '');
  let season: number | undefined;
  let episode: number | undefined;
  const se = s.match(/\bS(\d{1,2})\s*E(\d{1,3})\b/i) || s.match(/\b(\d{1,2})x(\d{1,3})\b/);
  if (se) {
    season = Number(se[1]);
    episode = Number(se[2]);
    s = s.slice(0, se.index);
  } else {
    const ep = s.match(/(?:\bT(\d{1,2})\s*)?\b(?:E|Ep\.?|Episódio|Episodio|Episode)\s*(\d{1,4})\b/i) || s.match(/\s-\s(\d{1,4})(?:\s|$|v\d)/);
    if (ep) {
      if (ep.length === 3) {
        season = ep[1] ? Number(ep[1]) : undefined;
        episode = Number(ep[2]);
      } else episode = Number(ep[1]);
      s = s.slice(0, ep.index);
    }
  }
  const year = s.match(/\b(19[5-9]\d|20[0-4]\d)\b/);
  if (year) s = s.slice(0, year.index);
  const title = s
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[._]+/g, ' ')
    .replace(/\b(1080p|720p|2160p|480p|x264|x265|hevc|web-?dl|bluray|webrip|dual|dublado|legendado|multi)\b.*$/i, '')
    .replace(/\s+-\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { title, season, episode, year: year ? Number(year[1]) : undefined };
}

const LANG_NAMES: Record<string, string> = {
  pob: 'Português (BR)',
  pb: 'Português (BR)',
  'pt-br': 'Português (BR)',
  por: 'Português',
  pt: 'Português',
  eng: 'English',
  en: 'English',
  spa: 'Español',
  es: 'Español',
  spn: 'Español (LatAm)',
  fre: 'Français',
  fra: 'Français',
  ger: 'Deutsch',
  deu: 'Deutsch',
  ita: 'Italiano',
  jpn: '日本語',
  ara: 'العربية',
  rus: 'Русский',
  tur: 'Türkçe',
  pol: 'Polski',
  dut: 'Nederlands',
  chi: '中文',
  zho: '中文',
  kor: '한국어',
};

export const langName = (code: string) => LANG_NAMES[String(code || '').toLowerCase()] || String(code || '?').toUpperCase();

/** Códigos aceitos para cada idioma da interface */
export const LANG_GROUPS: Record<string, string[]> = {
  pt: ['pob', 'pb', 'pt-br', 'por', 'pt'],
  en: ['eng', 'en'],
  es: ['spa', 'spn', 'es', 'es-419'],
};

/** Acha o ID do IMDb pelo título (Cinemeta) */
export async function resolveImdb(q: ParsedName): Promise<NuvioMetaPreview | null> {
  const type = q.season != null || q.episode != null ? 'series' : 'movie';
  const tryTypes: ('series' | 'movie')[] = type === 'series' ? ['series'] : ['movie', 'series'];
  let best: { m: NuvioMetaPreview; score: number } | null = null;
  for (const ty of tryTypes) {
    try {
      const list = await nuvioCatalog(ty, { search: q.title });
      for (const m of list.slice(0, 10)) {
        let score = titleScore(q.title, m.name);
        if (q.year && m.year) score += String(m.year).includes(String(q.year)) ? 0.15 : -0.1;
        if (!best || score > best.score) best = { m, score };
      }
    } catch {
      /* tenta o próximo */
    }
    if (best && best.score >= 0.9) break;
  }
  return best && best.score >= 0.3 ? best.m : null;
}

/** Busca legendas: OpenSubtitles + addons de legenda instalados */
export async function searchOnlineSubtitles(
  q: ParsedName & { imdbId?: string; stremioId?: string; type?: 'movie' | 'series' }
): Promise<{ match: NuvioMetaPreview | null; subtitles: OnlineSubtitle[] }> {
  let match: NuvioMetaPreview | null = null;
  let id = q.stremioId || '';
  let type: 'movie' | 'series' = q.type || (q.season != null || q.episode != null ? 'series' : 'movie');
  if (!id) {
    if (q.imdbId) {
      match = { id: q.imdbId, type, name: q.title };
    } else {
      match = await resolveImdb(q);
      if (!match) return { match: null, subtitles: [] };
      type = match.type;
    }
    id = type === 'series' ? `${match.id}:${q.season ?? 1}:${q.episode ?? 1}` : match.id;
  }

  const out: OnlineSubtitle[] = [];
  try {
    const data = await fetchJson<{ subtitles?: any[] }>(`${OPENSUBTITLES}/subtitles/${type}/${encodeURIComponent(id)}.json`);
    for (const s of data.subtitles || []) {
      if (s && typeof s.url === 'string') out.push({ url: s.url, lang: String(s.lang || ''), label: langName(s.lang), source: 'OpenSubtitles' });
    }
  } catch {
    /* segue com os addons */
  }
  try {
    for (const s of await fetchAddonSubtitles(type, id)) {
      if (!out.some((o) => o.url === s.url)) out.push({ url: s.url, lang: String(s.language || ''), label: langName(s.language || ''), source: (s.name || '').split('·').pop()?.trim() || 'Addon' });
    }
  } catch {
    /* ignore */
  }
  return { match, subtitles: out };
}

/** Baixa o texto da legenda (sem CORS, pelo processo principal) */
export async function fetchSubtitleText(url: string): Promise<string> {
  const api = window.electronAPI;
  if (api?.nuvioFetchText) {
    const res = await api.nuvioFetchText(url);
    if (!res?.success || typeof res.text !== 'string') throw new Error(res?.error || 'HTTP error');
    return res.text;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

export { normTitle };
