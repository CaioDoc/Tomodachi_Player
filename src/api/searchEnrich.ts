// src/api/searchEnrich.ts
// Dados extras para os resultados da busca (as obras vêm sempre das fontes do usuário):
// nomes alternativos (para "Attack on Titan" achar "Shingeki no Kyojin"), capa, ano, nota e gêneros/tags,
// vindos do AniList e, se ligado, do MyAnimeList.

import { titleKey } from '../utils/relevance';
import { isMalSearchEnabled, malSearch } from './myanimelist';

export interface EnrichEntry {
  titles: string[];
  cover?: string;
  year?: number;
  /** Nota de 0 a 10 */
  score?: number;
  scoreFrom?: 'MAL' | 'AniList';
  genres: string[];
}

const QUERY = `query ($q: String) {
  Page(perPage: 25) {
    media(search: $q, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
      title { romaji english native } synonyms seasonYear averageScore genres
      tags { name isMediaSpoiler }
      coverImage { large extraLarge }
    }
  }
}`;

async function fromAniList(q: string): Promise<EnrichEntry[]> {
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { q } }),
  });
  if (!res.ok) return [];
  const list = (await res.json())?.data?.Page?.media || [];
  return list.map((m: any) => ({
    titles: [m.title?.romaji, m.title?.english, m.title?.native, ...(m.synonyms || [])].filter(Boolean),
    cover: m.coverImage?.extraLarge || m.coverImage?.large || undefined,
    year: m.seasonYear || undefined,
    score: typeof m.averageScore === 'number' ? m.averageScore / 10 : undefined,
    scoreFrom: typeof m.averageScore === 'number' ? 'AniList' : undefined,
    genres: [...(m.genres || []), ...(m.tags || []).filter((x: any) => !x?.isMediaSpoiler).map((x: any) => x?.name)].filter(Boolean),
  }));
}

async function fromMal(q: string): Promise<EnrichEntry[]> {
  if (!isMalSearchEnabled()) return [];
  const res = await malSearch(q, 20);
  return (res.items || []).map((m) => ({
    titles: [m.title, ...m.altTitles],
    cover: m.cover,
    year: m.year,
    score: m.score,
    scoreFrom: m.score != null ? 'MAL' : undefined,
    genres: m.genres || [],
  }));
}

export interface EnrichIndex {
  /** Acha os dados extras de uma obra pelo título dela */
  find: (title: string) => EnrichEntry | undefined;
}

/** Busca no AniList e no MAL ao mesmo tempo e junta tudo num índice por título */
export async function buildEnrichIndex(q: string): Promise<EnrichIndex> {
  const [al, mal] = await Promise.all([fromAniList(q).catch(() => []), fromMal(q).catch(() => [])]);
  const map = new Map<string, EnrichEntry>();
  const add = (e: EnrichEntry, preferMalScore: boolean) => {
    const keys = e.titles.map(titleKey).filter(Boolean);
    if (keys.length === 0) return;
    let target = keys.map((k) => map.get(k)).find(Boolean);
    if (!target) {
      target = { ...e, titles: [...e.titles], genres: [...e.genres] };
    } else {
      // Mesma obra no AniList e no MAL: junta nomes e gêneros; a nota do MAL tem preferência
      target.titles = Array.from(new Set([...target.titles, ...e.titles]));
      target.genres = Array.from(new Set([...target.genres, ...e.genres]));
      target.cover = target.cover || e.cover;
      target.year = target.year || e.year;
      if ((preferMalScore && e.score != null) || target.score == null) {
        target.score = e.score;
        target.scoreFrom = e.scoreFrom;
      }
    }
    for (const title of target.titles) {
      const k = titleKey(title);
      if (k) map.set(k, target);
    }
  };
  for (const e of al) add(e, false);
  for (const e of mal) add(e, true);
  return { find: (title: string) => map.get(titleKey(title)) };
}
