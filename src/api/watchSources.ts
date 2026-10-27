// src/api/watchSources.ts
// "Fontes" de uma obra, de onde quer que ela venha (AniList, extensões, Nuvio, biblioteca):
//  - Extensões: procura o título nas extensões de anime e lista os episódios do site;
//  - Plugins (Nuvio): acha a obra no catálogo (Cinemeta) e roda os plugins/addons.

import { getAnimeSources, type InstalledExtension } from './extensionRegistry';
import { fetchChapterList } from './chapterList';
import { fetchJson, nuvioCatalog, nuvioMeta, type NuvioMeta, type NuvioMetaPreview, type NuvioType } from './nuvio';

export const WATCH_SOURCES_EVENT = 'tomodachi:watch-sources';

export interface WatchRequest {
  title: string;
  altTitles?: string[];
  year?: number;
  kind: 'movie' | 'series';
  /** Número do episódio (absoluto, como no AniList) */
  episode?: number;
  /** Quando já se sabe (obras do Nuvio) */
  season?: number;
  imdbId?: string;
  tmdbId?: string;
  /** Addon de onde vêm os detalhes (IDs que não são do IMDb, ex.: kitsu:…) */
  addonUrl?: string;
  cover?: string;
  /** URL do episódio na biblioteca (para marcar como visto) */
  episodeUrl?: string;
  /** Obra de origem (para o "Continuar assistindo") */
  workUrl?: string;
  /** URL de cada episódio por número (para trocar de episódio no painel e marcar o certo) */
  episodeUrls?: Record<string, string>;
  /** Extensão de onde a obra veio (aparece primeiro, sem precisar buscar) */
  preferred?: { extName: string; url?: string };
  /** Aba inicial */
  tab?: 'extensions' | 'plugins';
}

/** Abre o painel lateral de fontes */
export function openWatchSources(req: WatchRequest) {
  window.dispatchEvent(new CustomEvent(WATCH_SOURCES_EVENT, { detail: req }));
}

/* ───────────── semelhança de títulos ───────────── */

/** Palavras que os sites colocam no título mas não fazem parte do nome da obra */
const NOISE = new Set(['dublado', 'dublada', 'legendado', 'legendada', 'dub', 'sub', 'dual', 'audio', 'tv', 'hd', 'fhd', 'online', 'completo', 'todos', 'episodios', 'episodes', 'anime', 'assistir', 'the', 'a', 'o', 'of', 'no', 'wo', 'e', 'and']);

const ORDINAL_WORDS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, final: 99 };

/** Número da temporada escrito no título (2nd Season, Season 2, 2ª Temporada, Part 2, título terminando em 2…) */
export function seasonOf(raw: string): number | null {
  const s = String(raw || '').toLowerCase();
  const m =
    s.match(/(\d+)\s*(?:st|nd|rd|th)\s+(?:season|part|cour)/) ||
    s.match(/(?:season|temporada|part|parte|cour)\s*(\d+)/) ||
    s.match(/(\d+)\s*[ªaº°]?\s*temporada/) ||
    s.match(/\bs(\d{1,2})\b/);
  if (m) return Number(m[1]);
  const w = s.match(/\b(first|second|third|fourth|fifth|sixth|final)\s+season/);
  if (w) return ORDINAL_WORDS[w[1]];
  const roman = s.match(/\s(ii|iii|iv|v)$/);
  if (roman) return { ii: 2, iii: 3, iv: 4, v: 5 }[roman[1]] || null;
  const tail = s.replace(/\(.*?\)|\[.*?\]/g, '').trim().match(/[a-z]\s+(\d{1,2})$/);
  return tail ? Number(tail[1]) : null;
}

export const normTitle = (s: string) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\((?:tv|dub|dublado|legendado|sub)\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Só as palavras que importam (sem "dublado", marcas de temporada etc.) */
function coreWords(raw: string): string[] {
  const n = normTitle(
    String(raw || '')
      .replace(/\b\d+\s*(?:st|nd|rd|th)\s+(?:season|part|cour)\b/gi, ' ')
      .replace(/\b(?:season|temporada|part|parte|cour)\s*\d+\b/gi, ' ')
      .replace(/\b\d+\s*[ªaº°]?\s*temporada\b/gi, ' ')
      .replace(/\b(?:first|second|third|fourth|fifth|sixth|final)\s+season\b/gi, ' ')
  );
  return n.split(' ').filter((w) => w && !NOISE.has(w));
}

/** 0..1 — palavras em comum (sem ruído) + bônus para início igual; penaliza temporada diferente */
export function titleScore(a: string, b: string): number {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const ca = coreWords(a);
  const cb = coreWords(b);
  const wa = new Set(ca.length ? ca : x.split(' '));
  const wb = new Set(cb.length ? cb : y.split(' '));
  let inter = 0;
  wa.forEach((w) => wb.has(w) && inter++);
  let score = inter / (wa.size + wb.size - inter);
  const ja = [...wa].join(' ');
  const jb = [...wb].join(' ');
  if (ja && ja === jb) score = Math.max(score, 0.9);
  else if (ja && jb && (ja.startsWith(jb) || jb.startsWith(ja))) score += 0.25;
  const sa = seasonOf(a);
  const sb = seasonOf(b);
  if (sa != null && sb != null && sa !== sb) score -= 0.35;
  else if ((sa != null && sa > 1 && sb == null) || (sb != null && sb > 1 && sa == null)) score -= 0.12;
  else if (sa != null && sa === sb && sa > 1) score += 0.05;
  return Math.max(0, Math.min(0.99, score));
}

const bestScore = (titles: string[], candidate: string) => Math.max(0, ...titles.map((tt) => titleScore(tt, candidate)));

/** Versão "limpa" do título para buscar em sites (sem Dublado, (TV), [..], pontuação) */
export function cleanSearchTitle(raw: string): string {
  return String(raw || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/\b(dublado|dublada|legendado|legendada|dual\s*[aá]udio|completo|todos os epis[oó]dios|online|hd)\b/gi, ' ')
    .replace(/[|•·]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Consultas a tentar, da mais exata para a mais curta */
export function searchQueries(req: Pick<WatchRequest, 'title' | 'altTitles'>, max = 6): string[] {
  const out: string[] = [];
  const push = (q?: string) => {
    const v = String(q || '').trim();
    if (v.length < 2) return;
    if (out.some((o) => normTitle(o) === normTitle(v))) return;
    out.push(v);
  };
  const all = [req.title, ...(req.altTitles || [])];
  for (const tt of all) {
    const c = cleanSearchTitle(tt);
    push(c);
    push(tt);
    // Sem a parte depois de ":" / " - " (subtítulo)
    const base = c.split(/\s*[:–—]\s*|\s+-\s+/)[0];
    push(base);
    // Sem a marca de temporada ("Jujutsu Kaisen 2nd Season" → "Jujutsu Kaisen")
    push(coreWords(c).join(' '));
  }
  return out.slice(0, max);
}

/* ───────────── AniList: nomes alternativos ───────────── */

interface AniListTitles {
  titles: string[];
  year?: number;
  format?: string;
}
const aniCache = new Map<string, Promise<AniListTitles | null>>();

/** Procura a obra no AniList e devolve os nomes (inglês, romaji, nativo, sinônimos) */
export function aniListTitles(title: string): Promise<AniListTitles | null> {
  const key = normTitle(title);
  if (!key) return Promise.resolve(null);
  const hit = aniCache.get(key);
  if (hit) return hit;
  const run = (async () => {
    const query = `query ($s: String) { Page(perPage: 6) { media(search: $s, type: ANIME) { title { romaji english native } synonyms seasonYear format } } }`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { s: cleanSearchTitle(title) } }),
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const list: any[] = (await res.json())?.data?.Page?.media || [];
      let best: { m: any; score: number } | null = null;
      for (const m of list) {
        const names = [m.title?.english, m.title?.romaji, m.title?.native, ...(m.synonyms || [])].filter(Boolean);
        const score = Math.max(0, ...names.map((n: string) => titleScore(title, n)));
        if (!best || score > best.score) best = { m, score };
      }
      if (!best || best.score < 0.45) return null;
      const m = best.m;
      return {
        titles: [m.title?.english, m.title?.romaji, ...(m.synonyms || []).filter((x: string) => /^[\x00-\x7F]+$/.test(x)).slice(0, 3)].filter(Boolean),
        year: m.seasonYear || undefined,
        format: m.format || undefined,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  })();
  aniCache.set(key, run);
  return run;
}

/** Completa o pedido com nomes alternativos e ano (ajuda a achar a obra em todas as fontes) */
export async function enrichWatchRequest(req: WatchRequest): Promise<WatchRequest> {
  if (req.imdbId) return req;
  const info = await aniListTitles(req.title);
  if (!info) return req;
  const alt = [...(req.altTitles || [])];
  for (const tt of info.titles) if (normTitle(tt) !== normTitle(req.title) && !alt.some((a) => normTitle(a) === normTitle(tt))) alt.push(tt);
  return {
    ...req,
    altTitles: alt,
    year: req.year || info.year,
    kind: req.kind === 'series' && info.format === 'MOVIE' && !req.episodeUrl ? 'movie' : req.kind,
  };
}

/* ───────────── Extensões ───────────── */

export interface ExtensionMatch {
  title: string;
  url: string;
  cover?: string;
  score: number;
}

export interface ExtensionEpisode {
  url: string;
  name: string;
  number: number;
}

export function animeExtensionsFor(req: WatchRequest): InstalledExtension[] {
  const all = getAnimeSources();
  if (!req.preferred) return all;
  const pref = req.preferred.extName.toLowerCase();
  return [...all.filter((e) => e.name.toLowerCase() === pref || e.sourceName?.toLowerCase() === pref), ...all.filter((e) => e.name.toLowerCase() !== pref && e.sourceName?.toLowerCase() !== pref)];
}

const baseUrlOf = (ext: InstalledExtension) => {
  const b = String(ext.baseUrl || '').trim();
  return b.startsWith('http') ? b : b ? `https://${b}` : '';
};

/** Procura a obra numa extensão (tenta o título completo, versões limpas e os nomes alternativos) */
export async function searchInExtension(ext: InstalledExtension, req: WatchRequest): Promise<ExtensionMatch[]> {
  const api = window.electronAPI;
  if (!api?.scrapeExtensionCatalog) return [];
  const titles = [req.title, ...(req.altTitles || [])].filter(Boolean);
  const queries = searchQueries(req, 7);
  const seen = new Map<string, ExtensionMatch>();
  let lastError: unknown = null;
  let anyOk = false;
  for (const query of queries) {
    try {
      const res = await api.scrapeExtensionCatalog({ baseUrl: baseUrlOf(ext), query, page: 1, sourceName: ext.sourceName || ext.name });
      if (res?.success) anyOk = true;
      for (const it of res?.success ? res.items || [] : []) {
        if (!it?.url || !it.title || seen.has(it.url)) continue;
        seen.set(it.url, { title: it.title, url: it.url, cover: it.cover, score: bestScore(titles, it.title) });
      }
    } catch (err) {
      lastError = err;
    }
    // Achou algo bem parecido: não precisa tentar as outras consultas
    if ([...seen.values()].some((m) => m.score >= 0.75)) break;
  }
  if (!anyOk && lastError) throw lastError;
  return [...seen.values()].filter((m) => m.score >= 0.2).sort((a, b) => b.score - a.score).slice(0, 6);
}

export async function extensionEpisodes(ext: InstalledExtension, url: string): Promise<ExtensionEpisode[]> {
  const list = await fetchChapterList(url, ext.sourceName || ext.name, url);
  return list
    .filter((c) => c?.url)
    .map((c, i) => ({ url: c.url, name: c.name || '', number: Number(c.number) || i + 1 }))
    .sort((a, b) => a.number - b.number);
}

/* ───────────── Plugins (Nuvio) ───────────── */

/** Acha a obra no catálogo de filmes e séries (Cinemeta) pelo título, nomes alternativos e ano */
export async function findCatalogMatches(req: WatchRequest): Promise<NuvioMetaPreview[]> {
  const type: NuvioType = req.kind === 'movie' ? 'movie' : 'series';
  if (req.imdbId) return [{ id: req.imdbId, type, name: req.title, poster: req.cover, addonUrl: req.addonUrl }];
  const titles = [req.title, ...(req.altTitles || [])].filter(Boolean);
  const queries = searchQueries(req, 7);
  const found = new Map<string, NuvioMetaPreview & { _score: number }>();
  const searchType = async (ty: NuvioType) => {
    for (const q of queries) {
      try {
        const list = await nuvioCatalog(ty, { search: q });
        for (const m of list) {
          const yearOk = req.year && m.year ? (String(m.year).includes(String(req.year)) ? 0.15 : -0.05) : 0;
          // A temporada pedida não muda a obra no catálogo (séries ficam numa entrada só)
          const score = Math.max(bestScore(titles, m.name), ...titles.map((tt) => (coreWords(tt).join(' ') === coreWords(m.name).join(' ') ? 0.9 : 0))) + yearOk;
          const prev = found.get(m.id);
          if (!prev || prev._score < score) found.set(m.id, { ...m, _score: score });
        }
      } catch {
        /* próxima consulta */
      }
      if ([...found.values()].some((m) => m._score >= 0.9)) return;
    }
  };
  await searchType(type);
  // Anime de "série" que no catálogo é filme (ou vice-versa)
  if (![...found.values()].some((m) => m._score >= 0.6)) await searchType(type === 'series' ? 'movie' : 'series');
  return [...found.values()]
    .filter((m) => m._score >= 0.3)
    .sort((a, b) => b._score - a._score)
    .slice(0, 8)
    .map(({ _score, ...m }) => m);
}

/** Converte "episódio N" (numeração absoluta) em temporada/episódio do catálogo */
export function mapEpisode(meta: NuvioMeta, req: WatchRequest): { season: number; episode: number } | null {
  if (meta.type === 'movie') return null;
  const eps = meta.episodes.filter((e) => e.season > 0);
  if (eps.length === 0) return null;
  if (req.season != null && req.episode != null && eps.some((e) => e.season === req.season && e.episode === req.episode)) {
    return { season: req.season, episode: req.episode };
  }
  const n = Math.max(1, req.episode || 1);
  // "Obra 2nd Season" (comum em sites e no AniList): episódio N da temporada 2 do catálogo
  const sn = req.season ?? seasonOf(req.title);
  if (sn != null && sn > 1) {
    const inSeason = eps.filter((e) => e.season === sn);
    if (inSeason.length && n <= inSeason.length) return { season: sn, episode: inSeason[n - 1].episode };
  }
  const e = eps[Math.min(eps.length - 1, n - 1)];
  return { season: e.season, episode: e.episode };
}

export { nuvioMeta };

/* ───────────── Kitsu (addons de anime que só aceitam IDs do Kitsu) ───────────── */

const kitsuCache = new Map<string, Promise<string | null>>();

/** Acha o ID do Kitsu da obra (cada temporada é uma entrada separada no Kitsu) */
export function kitsuIdFor(req: Pick<WatchRequest, 'title' | 'altTitles' | 'season' | 'kind'>): Promise<string | null> {
  const titles = [req.title, ...(req.altTitles || [])].filter(Boolean);
  const wantSeason = req.season && req.season > 1 ? req.season : null;
  const key = titles.map(normTitle).join('|') + '#' + (wantSeason || '');
  const hit = kitsuCache.get(key);
  if (hit) return hit;
  const run = (async () => {
    const queries = searchQueries({ title: wantSeason ? `${req.title} Season ${wantSeason}` : req.title, altTitles: req.altTitles }, 4);
    let best: { id: string; score: number } | null = null;
    for (const q of queries) {
      try {
        const data = await fetchJson<{ data?: any[] }>(`https://kitsu.io/api/edge/anime?filter[text]=${encodeURIComponent(q)}&page[limit]=8`);
        for (const it of data.data || []) {
          const at = it?.attributes || {};
          const names = [at.canonicalTitle, at.titles?.en, at.titles?.en_jp, at.titles?.en_us, ...(at.abbreviatedTitles || [])].filter(Boolean);
          const compare = wantSeason ? titles.map((tt) => `${tt} Season ${wantSeason}`) : titles;
          let score = Math.max(0, ...names.map((n: string) => bestScore(compare, n)));
          if (req.kind === 'movie' && at.subtype === 'movie') score += 0.05;
          if (req.kind === 'series' && at.subtype === 'movie') score -= 0.15;
          if (!best || score > best.score) best = { id: String(it.id), score };
        }
      } catch {
        /* próxima consulta */
      }
      if (best && best.score >= 0.85) break;
    }
    return best && best.score >= 0.5 ? best.id : null;
  })();
  kitsuCache.set(key, run);
  return run;
}
