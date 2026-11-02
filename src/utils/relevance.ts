// src/utils/relevance.ts
// Quanto um título bate com o que foi digitado na busca (0 = não bate; 100 = idêntico).
// Usado para ordenar os resultados e esconder o que não tem nada a ver com a busca.

const clean = (s: string) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const compact = (s: string) => s.replace(/ /g, '');

/** Palavras que não ajudam a decidir (artigos e conectivos) */
const STOP = new Set(['the', 'a', 'an', 'of', 'and', 'o', 'os', 'as', 'de', 'da', 'do', 'das', 'dos', 'e', 'el', 'la', 'los', 'las', 'no', 'wa', 'to']);

/** Mínimo para aparecer nos resultados */
export const MIN_RELEVANCE = 55;

/** Chave para juntar a mesma obra vinda de fontes diferentes */
export const titleKey = (s: string) => compact(clean(s));

export function relevance(title: string, query: string): number {
  const t = clean(title);
  const q = clean(query);
  if (!t || !q) return 0;
  // Títulos longos com a mesma correspondência ficam um pouco abaixo
  const lengthPenalty = Math.min(12, Math.max(0, t.length - q.length) / 5);

  if (t === q) return 100;
  if (compact(t) === compact(q)) return 97;
  if (t.startsWith(q + ' ')) return 92 - lengthPenalty;
  if ((' ' + t + ' ').includes(' ' + q + ' ')) return 84 - lengthPenalty;

  const tw = t.split(' ');
  const qw = q.split(' ').filter((w) => !STOP.has(w));
  if (qw.length === 0) return 0;
  // A última palavra pode estar incompleta (a pessoa ainda está digitando)
  const matches = (w: string, i: number) => (i === qw.length - 1 ? tw.some((x) => x.startsWith(w)) : tw.includes(w));

  // Todas as palavras, na mesma ordem e quase juntas ("Fullmetal Alchemist" → "Fullmetal: Alchemist")
  let pos = -1;
  let gaps = 0;
  let ordered = true;
  for (let i = 0; i < qw.length; i++) {
    const at = tw.findIndex((x, k) => k > pos && (i === qw.length - 1 ? x.startsWith(qw[i]) : x === qw[i]));
    if (at < 0) {
      ordered = false;
      break;
    }
    if (pos >= 0) gaps += at - pos - 1;
    pos = at;
  }
  if (ordered) return Math.max(0, 76 - gaps * 8 - lengthPenalty);

  // Escrito junto/separado ("Full Metal" x "Fullmetal")
  if (compact(t).includes(compact(q)) && q.length >= 4) return 72 - lengthPenalty;

  // Todas as palavras, mas fora de ordem: fraco
  if (qw.every(matches)) return 58 - lengthPenalty;

  // Quase igual, escrito de outro jeito ("Shippuden" x "Shippuuden", "Ousama" x "Osama"):
  // compara letra a letra (pares) e aceita quando é praticamente o mesmo nome
  const sim = bestSimilarity(tw, qw);
  if (sim >= 0.8) return Math.round(50 + (sim - 0.8) * 250);
  return 0;
}

/** Semelhança 0..1 entre duas palavras/frases pelos pares de letras (coeficiente de Dice) */
function dice(a: string, b: string): number {
  const A = compact(a);
  const B = compact(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  if (A.length < 2 || B.length < 2) return 0;
  const pairs = new Map<string, number>();
  for (let i = 0; i < A.length - 1; i++) {
    const k = A.slice(i, i + 2);
    pairs.set(k, (pairs.get(k) || 0) + 1);
  }
  let hits = 0;
  for (let i = 0; i < B.length - 1; i++) {
    const k = B.slice(i, i + 2);
    const n = pairs.get(k) || 0;
    if (n > 0) {
      pairs.set(k, n - 1);
      hits++;
    }
  }
  return (2 * hits) / (A.length - 1 + (B.length - 1));
}

/** Melhor semelhança entre a busca e um trecho do título do mesmo tamanho (o resto do título é ruído) */
function bestSimilarity(titleWords: string[], queryWords: string[]): number {
  const q = queryWords.join(' ');
  let best = dice(titleWords.join(' '), q);
  const n = queryWords.length;
  for (let size = n; size <= n + 1; size++) {
    for (let i = 0; i + size <= titleWords.length; i++) {
      const piece = titleWords.slice(i, i + size).join(' ');
      const d = dice(piece, q);
      if (d > best) best = d;
    }
  }
  return best;
}

/** Melhor nota entre o título e os nomes alternativos */
export function bestRelevance(titles: (string | undefined | null)[], query: string): number {
  let best = 0;
  for (const x of titles) if (x) best = Math.max(best, relevance(x, query));
  return best;
}
