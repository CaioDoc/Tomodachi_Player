// src/utils/smartSearch.ts
// Busca por várias palavras/tags de uma vez: "Seinen, Monster" → a obra precisa bater com
// TODOS os termos (título, autor, gêneros, tags ou categorias). Entende gêneros em PT/EN/ES.

/** minúsculas, sem acentos e sem pontuação extra */
export const norm = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9+#&' -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Sinônimos de gêneros (PT/ES → nome usado pelas fontes, em inglês) */
const GENRE_ALIASES: Record<string, string[]> = {
  action: ['acao', 'accion'],
  adventure: ['aventura'],
  comedy: ['comedia'],
  drama: [],
  fantasy: ['fantasia'],
  horror: ['terror', 'horror'],
  mystery: ['misterio'],
  romance: ['romantico'],
  'sci-fi': ['ficcao cientifica', 'ficcion', 'ciencia ficcion', 'scifi', 'science fiction', 'sci fi'],
  'slice of life': ['cotidiano', 'vida cotidiana', 'recorte de vida'],
  sports: ['esportes', 'esporte', 'deportes', 'sport'],
  supernatural: ['sobrenatural'],
  thriller: ['suspense', 'thriller'],
  psychological: ['psicologico'],
  school: ['escolar', 'escola', 'colegial', 'school life'],
  'martial arts': ['artes marciais'],
  music: ['musica', 'musical'],
  historical: ['historico', 'historia', 'history'],
  military: ['militar', 'war', 'guerra'],
  monsters: ['monstro', 'monstros', 'monster', 'monstruos'],
  magic: ['magia'],
  harem: [],
  isekai: [],
  mecha: [],
  ecchi: [],
  seinen: [],
  shounen: ['shonen'],
  shoujo: ['shojo'],
  josei: [],
  crime: ['policial', 'crimen'],
  family: ['familia'],
  animation: ['animacao', 'animacion'],
  documentary: ['documentario', 'documental'],
  western: ['faroeste', 'velho oeste'],
  'mahou shoujo': ['garotas magicas'],
  vampire: ['vampiro', 'vampiros'],
  demons: ['demonio', 'demonios'],
  'boys love': ['bl', 'yaoi'],
  'girls love': ['gl', 'yuri'],
};

const ALIAS_TO_CANON = new Map<string, string>();
for (const [canon, list] of Object.entries(GENRE_ALIASES)) {
  ALIAS_TO_CANON.set(canon, canon);
  for (const a of list) ALIAS_TO_CANON.set(a, canon);
}

/** Nome canônico (em inglês) de um gênero digitado em qualquer idioma, se for um gênero conhecido */
export function canonicalGenre(term: string): string | undefined {
  return ALIAS_TO_CANON.get(norm(term));
}

/** Todas as formas aceitas para um termo (ele mesmo + sinônimos do gênero) */
export function termVariants(term: string): string[] {
  const n = norm(term);
  const canon = ALIAS_TO_CANON.get(n);
  if (!canon) return [n];
  return Array.from(new Set([n, canon, ...(GENRE_ALIASES[canon] || [])]));
}

/** "Seinen, Monster ; ação" → ['Seinen', 'Monster', 'ação'] */
export function parseTerms(q: string): string[] {
  return String(q || '')
    .split(/[,;|]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export interface SearchableWork {
  title?: string;
  altTitles?: string[];
  author?: string;
  genres?: string[];
  categories?: string[];
  sourceName?: string;
}

/** Texto e tags de uma obra prontos para comparar */
function fields(w: SearchableWork) {
  const tags = [...(w.genres || []), ...(w.categories || [])].map(norm).filter(Boolean);
  const text = [w.title, ...(w.altTitles || []), w.author, w.sourceName].map((x) => norm(x || '')).filter(Boolean);
  return { tags, text };
}

/** A obra bate com o termo? Tags valem por igualdade/prefixo; textos, por trecho */
export function matchesTerm(w: SearchableWork, term: string, pre?: ReturnType<typeof fields>): boolean {
  const f = pre || fields(w);
  for (const v of termVariants(term)) {
    if (!v) continue;
    if (f.tags.some((g) => g === v || g.startsWith(v + ' ') || g.includes(v))) return true;
    if (f.text.some((s) => s.includes(v))) return true;
  }
  return false;
}

/** Todos os termos precisam bater (E lógico) */
export function matchesAll(w: SearchableWork, terms: string[]): boolean {
  if (!terms.length) return true;
  const f = fields(w);
  return terms.every((t) => matchesTerm(w, t, f));
}

/** Tags mais comuns em uma lista de obras (para sugerir na busca) */
export function topTags(works: SearchableWork[], exclude: string[] = [], limit = 14): Array<{ tag: string; count: number }> {
  const skip = new Set(exclude.flatMap(termVariants));
  const counts = new Map<string, { tag: string; count: number }>();
  for (const w of works) {
    const seen = new Set<string>();
    for (const g of w.genres || []) {
      const k = norm(g);
      if (!k || seen.has(k) || skip.has(k) || skip.has(ALIAS_TO_CANON.get(k) || '')) continue;
      seen.add(k);
      const cur = counts.get(k);
      if (cur) cur.count++;
      else counts.set(k, { tag: g, count: 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
    .slice(0, limit);
}

/** Separa a busca em gêneros conhecidos (da lista da fonte) e texto livre */
export function parseGenreQuery(q: string, genreList: string[]): { genres: string[]; text: string; parts: Array<{ term: string; kind: 'genre' | 'text'; value: string }> } {
  const byNorm = new Map(genreList.map((g) => [norm(g), g]));
  const genres: string[] = [];
  const parts: Array<{ term: string; kind: 'genre' | 'text'; value: string }> = [];
  for (const term of parseTerms(q)) {
    const n = norm(term);
    const canon = canonicalGenre(term);
    const g = byNorm.get(n) || (canon ? byNorm.get(canon) || byNorm.get(canon.replace(/s$/, '')) : undefined);
    if (g) {
      if (!genres.includes(g)) genres.push(g);
      parts.push({ term, kind: 'genre', value: g });
    } else parts.push({ term, kind: 'text', value: term });
  }
  return { genres, text: parts.filter((p) => p.kind === 'text').map((p) => p.value).join(' ').trim(), parts };
}
