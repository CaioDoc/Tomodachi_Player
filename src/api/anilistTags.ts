// src/api/anilistTags.ts
// Interpreta a busca do Descobrir: termos que são gêneros ou tags do AniList viram filtros;
// o resto vira texto. "Seinen, Monster" → tag Seinen + texto "monster".

import { canonicalGenre, norm, parseTerms } from '../utils/smartSearch';

export const ANILIST_GENRES = [
  'Action',
  'Adventure',
  'Comedy',
  'Drama',
  'Ecchi',
  'Fantasy',
  'Horror',
  'Mahou Shoujo',
  'Mecha',
  'Music',
  'Mystery',
  'Psychological',
  'Romance',
  'Sci-Fi',
  'Slice of Life',
  'Sports',
  'Supernatural',
  'Thriller',
];

const TAGS_KEY = 'tp_anilist_tags_v1';
const TAGS_TTL = 7 * 86400000;
let tagsMemo: string[] | null = null;
let tagsPromise: Promise<string[]> | null = null;

/** Lista de tags do AniList (guardada por uma semana) */
export async function anilistTagNames(): Promise<string[]> {
  if (tagsMemo) return tagsMemo;
  try {
    const raw = JSON.parse(localStorage.getItem(TAGS_KEY) || 'null');
    if (raw && Array.isArray(raw.names) && Date.now() - raw.at < TAGS_TTL) return (tagsMemo = raw.names);
  } catch {
    /* ignore */
  }
  if (!tagsPromise) {
    tagsPromise = fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: '{ MediaTagCollection { name isAdult } }' }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        const names: string[] = (j?.data?.MediaTagCollection || []).filter((x: any) => x && !x.isAdult).map((x: any) => String(x.name));
        if (names.length) {
          tagsMemo = names;
          try {
            localStorage.setItem(TAGS_KEY, JSON.stringify({ at: Date.now(), names }));
          } catch {
            /* ignore */
          }
        }
        return names;
      })
      .catch(() => [] as string[])
      .finally(() => {
        tagsPromise = null;
      });
  }
  return tagsPromise;
}

export interface ParsedAniListQuery {
  genres: string[];
  tags: string[];
  text: string;
  /** Termos na ordem digitada, com o que cada um virou */
  parts: Array<{ term: string; kind: 'genre' | 'tag' | 'text'; value: string }>;
}

/** Separa a busca em gêneros, tags e texto livre */
export function parseAniListQuery(q: string, tagNames: string[]): ParsedAniListQuery {
  const genreByNorm = new Map(ANILIST_GENRES.map((g) => [norm(g), g]));
  const tagByNorm = new Map(tagNames.map((g) => [norm(g), g]));
  const out: ParsedAniListQuery = { genres: [], tags: [], text: '', parts: [] };
  const terms = parseTerms(q);
  // Uma busca simples (sem vírgula) que não é gênero/tag continua sendo busca por título
  for (const term of terms) {
    const n = norm(term);
    const canon = canonicalGenre(term);
    const g = genreByNorm.get(n) || (canon ? genreByNorm.get(canon) : undefined);
    if (g) {
      if (!out.genres.includes(g)) out.genres.push(g);
      out.parts.push({ term, kind: 'genre', value: g });
      continue;
    }
    const tag =
      tagByNorm.get(n) ||
      (canon ? tagByNorm.get(canon) : undefined) ||
      tagByNorm.get(n.endsWith('s') ? n.slice(0, -1) : n + 's');
    if (tag) {
      if (!out.tags.includes(tag)) out.tags.push(tag);
      out.parts.push({ term, kind: 'tag', value: tag });
      continue;
    }
    out.parts.push({ term, kind: 'text', value: term });
  }
  out.text = out.parts
    .filter((p) => p.kind === 'text')
    .map((p) => p.value)
    .join(' ')
    .trim();
  return out;
}
