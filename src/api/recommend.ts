// src/api/recommend.ts
// "Talvez você goste": continuações e obras parecidas.
//  - Animes e mangás: AniList (relações oficiais: sequência, anterior, spin-off… + recomendações da comunidade).
//  - Séries e filmes: Cinemeta (mesma franquia pelo título + mesmos gêneros, ordenado por afinidade e nota).

import { norm } from '../utils/smartSearch';
import { nuvioCatalog, type NuvioMetaPreview, type NuvioType } from './nuvio';
import { t } from '../i18n';

export type RecReason = 'sequel' | 'prequel' | 'parent' | 'side' | 'spinoff' | 'alternative' | 'franchise' | 'recommended' | 'similar';

export interface RecItem {
  key: string;
  title: string;
  cover?: string;
  year?: number | string;
  score?: number; // 0–100
  reason: RecReason;
  /** Gêneros em comum (séries/filmes) */
  shared?: string[];
  /** AniList */
  anilist?: AniListRecMedia;
  /** Cinemeta */
  meta?: NuvioMetaPreview;
}

export interface AniListRecMedia {
  id: number;
  type: 'ANIME' | 'MANGA';
  format?: string;
  status?: string;
  seasonYear?: number;
  averageScore?: number;
  episodes?: number;
  chapters?: number;
  genres?: string[];
  description?: string;
  title: { romaji?: string; english?: string; native?: string };
  coverImage?: { large?: string; extraLarge?: string };
  bannerImage?: string;
}

export interface RecResult {
  items: RecItem[];
  /** Tags extras (AniList) para buscar obras parecidas */
  tags: string[];
  genres: string[];
}

export function reasonLabel(r: RecReason): string {
  switch (r) {
    case 'sequel':
      return t('Continuação');
    case 'prequel':
      return t('Anterior');
    case 'parent':
      return t('História principal');
    case 'side':
      return t('História paralela');
    case 'spinoff':
      return t('Spin-off');
    case 'alternative':
      return t('Outra versão');
    case 'franchise':
      return t('Mesma franquia');
    case 'recommended':
      return t('Recomendado');
    default:
      return t('Parecido');
  }
}

/* ───────────────────────── cache simples (sessão) ───────────────────────── */

const memo = new Map<string, Promise<RecResult>>();
function cached(key: string, fn: () => Promise<RecResult>): Promise<RecResult> {
  const hit = memo.get(key);
  if (hit) return hit;
  const p = fn().catch((err) => {
    memo.delete(key);
    throw err;
  });
  memo.set(key, p);
  return p;
}

/* ───────────────────────── AniList ───────────────────────── */

const MEDIA_FIELDS = `id type format status seasonYear averageScore episodes chapters genres isAdult description(asHtml:false)
  title { romaji english native } coverImage { large extraLarge } bannerImage`;

const REC_QUERY = `
query ($id: Int, $search: String, $type: MediaType) {
  Media(id: $id, search: $search, type: $type) {
    id seasonYear
    title { romaji english native }
    synonyms
    genres
    tags { name rank isMediaSpoiler isAdult }
    relations { edges { relationType(version: 2) node { ${MEDIA_FIELDS} } } }
    recommendations(sort: [RATING_DESC, ID], perPage: 24) { nodes { rating mediaRecommendation { ${MEDIA_FIELDS} } } }
  }
}`;

const BY_MAL_QUERY = `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { ${MEDIA_FIELDS} } }`;

/** A mesma obra no AniList a partir do ID do MyAnimeList (para abrir a página completa dela) */
export async function anilistAnimeByMalId(idMal: number): Promise<AniListRecMedia | null> {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: BY_MAL_QUERY, variables: { idMal } }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`AniList ${res.status}`);
  return (await res.json())?.data?.Media || null;
}

const RELATION_ORDER: Record<string, RecReason> = {
  SEQUEL: 'sequel',
  PREQUEL: 'prequel',
  PARENT: 'parent',
  SIDE_STORY: 'side',
  SPIN_OFF: 'spinoff',
  ALTERNATIVE: 'alternative',
};
const REASON_RANK: RecReason[] = ['sequel', 'prequel', 'parent', 'side', 'spinoff', 'alternative'];

const anilistTitle = (m: AniListRecMedia) => m.title.english || m.title.romaji || m.title.native || '';

/** O resultado da busca é mesmo a obra? (evita recomendar coisas de outra obra com nome parecido) */
function sameWork(found: any, title: string, altTitles: string[] = []): boolean {
  const wanted = [title, ...altTitles].map(norm).filter((x) => x.length >= 2);
  const names = [found?.title?.romaji, found?.title?.english, found?.title?.native, ...(found?.synonyms || [])].map((x) => norm(x || '')).filter(Boolean);
  return wanted.some((w) => names.some((n) => n === w || (w.length >= 5 && (n.includes(w) || w.includes(n)))));
}

export function anilistRecommendations(opts: {
  type: 'ANIME' | 'MANGA';
  id?: number;
  title?: string;
  altTitles?: string[];
}): Promise<RecResult> {
  const key = `al:${opts.type}:${opts.id || norm(opts.title || '')}`;
  return cached(key, async () => {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: REC_QUERY, variables: { id: opts.id, search: opts.id ? undefined : opts.title, type: opts.type } }),
    });
    if (!res.ok) throw new Error(`AniList ${res.status}`);
    const m = (await res.json())?.data?.Media;
    if (!m) return { items: [], tags: [], genres: [] };
    if (!opts.id && opts.title && !sameWork(m, opts.title, opts.altTitles)) return { items: [], tags: [], genres: [] };

    const items: RecItem[] = [];
    const seen = new Set<number>([m.id]);
    const push = (node: AniListRecMedia, reason: RecReason) => {
      if (!node || seen.has(node.id) || (node as any).isAdult || node.type !== opts.type) return;
      if (opts.type === 'MANGA' && node.format === 'NOVEL') return;
      seen.add(node.id);
      items.push({
        key: `al-${node.id}`,
        title: anilistTitle(node),
        cover: node.coverImage?.large || node.coverImage?.extraLarge,
        year: node.seasonYear,
        score: node.averageScore,
        reason,
        anilist: node,
      });
    };

    const rel = (m.relations?.edges || [])
      .map((e: any) => ({ reason: RELATION_ORDER[e?.relationType], node: e?.node }))
      .filter((x: any) => x.reason && x.node)
      .sort((a: any, b: any) => REASON_RANK.indexOf(a.reason) - REASON_RANK.indexOf(b.reason) || (a.node.seasonYear || 0) - (b.node.seasonYear || 0));
    for (const r of rel) push(r.node, r.reason);

    const recs = (m.recommendations?.nodes || []).filter((n: any) => n?.mediaRecommendation && (n.rating ?? 0) > 0);
    for (const n of recs) push(n.mediaRecommendation, 'recommended');

    const tags = (m.tags || [])
      .filter((tg: any) => tg && !tg.isMediaSpoiler && !tg.isAdult && (tg.rank ?? 0) >= 55)
      .sort((a: any, b: any) => (b.rank || 0) - (a.rank || 0))
      .slice(0, 10)
      .map((tg: any) => String(tg.name));
    return { items: items.slice(0, 24), tags, genres: m.genres || [] };
  });
}

/** Converte um item do AniList no formato que a página de anime usa */
export function anilistAnimeToWork(media: AniListRecMedia) {
  const title = anilistTitle(media);
  const total = media.episodes || (media.format === 'MOVIE' ? 1 : 12);
  return {
    source: 'anilist',
    sourceName: 'AniList',
    url: `https://anilist.co/anime/${media.id}`,
    title,
    author: '',
    description: (media.description || '').replace(/<br\s*\/?>/gi, '\n'),
    genres: media.genres || [],
    status: media.status === 'FINISHED' ? 2 : 1,
    cover: media.coverImage?.extraLarge || media.coverImage?.large || '',
    background: media.bannerImage || undefined,
    dateAdded: Date.now(),
    favorite: false,
    categories: [],
    chapters: Array.from({ length: total }, (_, i) => ({
      url: `https://anilist.co/anime/${media.id}#ep${i + 1}`,
      name: t('Episódio {n}', { n: i + 1 }),
      number: i + 1,
      read: false,
      bookmark: false,
      lastPageRead: 0,
      lastSecondSeen: 0,
      lastModifiedAt: Date.now(),
    })),
    totalChapters: total,
    readChapters: 0,
    altTitles: [media.title.romaji, media.title.english, media.title.native].filter(Boolean) as string[],
    year: media.seasonYear,
    format: media.format,
    score: media.averageScore,
  };
}

/* ───────────────────────── Cinemeta (séries e filmes) ───────────────────────── */

/** "Duna: Parte Dois" → "duna"; "Toy Story 3" → "toy story" */
export function franchiseBase(name: string): string {
  return norm(
    String(name || '')
      .replace(/\(\d{4}\)/g, '')
      .split(/\s[:\-–—]\s|:\s/)[0]
      .replace(/\b(part|parte|chapter|capitulo|season|temporada|vol(ume)?)\b.*$/i, '')
      .replace(/\s+(\d+|ii|iii|iv|v|vi)$/i, '')
  );
}

export function cinemetaRecommendations(meta: { id: string; type: NuvioType; name: string; genres?: string[]; year?: string | number }): Promise<RecResult> {
  return cached(`cm:${meta.type}:${meta.id}`, async () => {
    const base = franchiseBase(meta.name);
    const myGenres = (meta.genres || []).filter(Boolean);
    const myYear = parseInt(String(meta.year || ''), 10);

    const [franchiseRaw, ...byGenre] = await Promise.all([
      base.length >= 3 ? nuvioCatalog(meta.type, { search: base }).catch(() => [] as NuvioMetaPreview[]) : Promise.resolve([] as NuvioMetaPreview[]),
      ...myGenres.slice(0, 2).map((g) => nuvioCatalog(meta.type, { genre: g }).catch(() => [] as NuvioMetaPreview[])),
    ]);

    const seen = new Set<string>([meta.id]);
    const items: RecItem[] = [];

    // Mesma franquia: o título começa igual (continuações, remakes, spin-offs)
    for (const m of franchiseRaw) {
      if (seen.has(m.id)) continue;
      const b = franchiseBase(m.name);
      if (!b || !(b === base || b.startsWith(base + ' ') || base.startsWith(b + ' '))) continue;
      seen.add(m.id);
      items.push({ key: `cm-${m.id}`, title: m.name, cover: m.poster, year: m.year, score: m.imdbRating ? Math.round(Number(m.imdbRating) * 10) : undefined, reason: 'franchise', meta: m });
    }
    items.sort((a, b) => parseInt(String(a.year || '0'), 10) - parseInt(String(b.year || '0'), 10));

    // Parecidos: mais gêneros em comum, nota alta e época próxima
    const lowerMine = myGenres.map((g) => g.toLowerCase());
    const pool = new Map<string, NuvioMetaPreview>();
    for (const list of byGenre) for (const m of list) if (!seen.has(m.id)) pool.set(m.id, m);
    const scored = Array.from(pool.values())
      .map((m) => {
        const shared = (m.genres || []).filter((g) => lowerMine.includes(String(g).toLowerCase()));
        const rating = Number(m.imdbRating) || 6;
        const y = parseInt(String(m.year || ''), 10);
        const near = myYear && y ? Math.max(0, 1 - Math.abs(myYear - y) / 15) : 0;
        return { m, shared, score: shared.length * 3 + rating / 2 + near * 1.5 };
      })
      .filter((x) => x.shared.length > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 18);
    for (const { m, shared } of scored) {
      items.push({ key: `cm-${m.id}`, title: m.name, cover: m.poster, year: m.year, score: m.imdbRating ? Math.round(Number(m.imdbRating) * 10) : undefined, reason: 'similar', shared, meta: m });
    }
    return { items: items.slice(0, 24), tags: [], genres: myGenres };
  });
}
