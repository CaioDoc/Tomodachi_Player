// src/api/siteSearch.ts
// Busca uma obra no site de uma extensão como uma pessoa faria:
//  1. descobre como o site busca (o formulário de busca da página inicial) e guarda;
//     sem formulário, tenta os endereços de busca mais comuns (?s=, /search?keyword=, /busca?q=…);
//  2. lê a página de resultados com o DOMParser e pega cada link de obra com o nome
//     (do título do link, da imagem, do <h2>/<h3> do card ou do texto) e a capa.
// Quem chama decide qual resultado é a obra (comparando os nomes).

export interface SiteItem {
  title: string;
  url: string;
  cover?: string;
  /** Link de um episódio (não da página da obra) */
  isEpisode: boolean;
}

type Scorer = (candidate: string) => number;

const TPL_KEY = 'tp_site_search_tpl';
const FALLBACK_TEMPLATES = ['?s={q}', 'search?keyword={q}', 'search?q={q}', 'busca?q={q}', '?search={q}', 'pesquisar?q={q}', 'search/{q}', 'busca/{q}'];
const NOT_A_WORK = /\/(?:page|category|categoria|categorias|genero|generos|genre|genres|tag|tags|author|autor|login|entrar|register|cadastro|contato|contact|dmca|privacy|privacidade|termos|terms|search|busca|pesquisa|pesquisar|wp-admin|wp-login|feed|calendario|lancamentos|ultimos|recentes|top|ranking)(?:[/?#]|$)/i;
const EPISODE = /epis[oó]dio\s*\d+|\bep(?:isode)?\.?\s*\d+\b|\/episod|\/ep-?\d+|\/watch\//i;

const hostOf = (u: string) => {
  try {
    return new URL(u).host.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

function readTemplates(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(TPL_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function saveTemplate(host: string, tpl: string | null) {
  try {
    const all = readTemplates();
    if (tpl) all[host] = tpl;
    else delete all[host];
    localStorage.setItem(TPL_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

async function getDoc(url: string, referer?: string): Promise<{ doc: Document; url: string } | null> {
  const api = window.electronAPI;
  if (!api?.siteFetchHtml) return null;
  const res = await api.siteFetchHtml({ url, referer });
  if (!res?.success || !res.html) return null;
  const doc = new DOMParser().parseFromString(res.html, 'text/html');
  return { doc, url: res.url || url };
}

/** Acha o formulário de busca do site e monta o endereço com {q} no lugar do texto */
function findSearchTemplate(doc: Document, pageUrl: string): string | null {
  const forms = Array.from(doc.querySelectorAll('form'));
  const scored = forms
    .map((form) => {
      if ((form.getAttribute('method') || 'get').toLowerCase() === 'post') return null;
      const input = form.querySelector<HTMLInputElement>(
        'input[type=search], input[name=s], input[name=q], input[name=keyword], input[name=search], input[name=query], input[name=busca], input[name=pesquisa], input[name=term], input[name=k]'
      );
      if (!input?.name) return null;
      let action: URL;
      try {
        action = new URL(form.getAttribute('action') || pageUrl, pageUrl);
      } catch {
        return null;
      }
      if (hostOf(action.href) !== hostOf(pageUrl)) return null;
      const params: string[] = [];
      for (const h of Array.from(form.querySelectorAll<HTMLInputElement>('input[type=hidden][name]'))) {
        params.push(`${encodeURIComponent(h.name)}=${encodeURIComponent(h.value || '')}`);
      }
      params.push(`${encodeURIComponent(input.name)}={q}`);
      const hint = `${input.placeholder || ''} ${input.getAttribute('aria-label') || ''} ${form.className} ${form.id} ${input.type}`.toLowerCase();
      const weight = /search|busca|pesquis|procur/.test(hint) ? 2 : 1;
      return { tpl: `${action.origin}${action.pathname}?${params.join('&')}`, weight };
    })
    .filter(Boolean) as { tpl: string; weight: number }[];
  scored.sort((a, b) => b.weight - a.weight);
  return scored[0]?.tpl || null;
}

const fill = (tpl: string, base: string, q: string) => {
  const enc = encodeURIComponent(q).replace(/%20/g, '+');
  const filled = tpl.replace('{q}', /\/\{q\}/.test(tpl) ? encodeURIComponent(q) : enc);
  if (/^https?:\/\//i.test(filled)) return filled;
  return base.replace(/\/+$/, '') + '/' + filled.replace(/^\/+/, '');
};

const clean = (s: string | null | undefined) =>
  String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();

/** Primeiro endereço de imagem "de verdade" (pula marcadores de lazy-load em data:) */
function imageOf(el: Element | null, pageUrl: string): string | undefined {
  if (!el) return undefined;
  const imgs = el.tagName === 'IMG' ? [el] : Array.from(el.querySelectorAll('img'));
  for (const img of imgs) {
    const srcset = (img.getAttribute('data-srcset') || img.getAttribute('srcset') || '').split(',')[0]?.trim().split(' ')[0];
    for (const v of [img.getAttribute('data-src'), img.getAttribute('data-lazy-src'), img.getAttribute('data-original'), img.getAttribute('data-lazy'), srcset, img.getAttribute('src')]) {
      if (v && !/^data:/i.test(v) && !/logo|avatar|icon|placeholder|blank\.gif/i.test(v)) {
        try {
          return new URL(v, pageUrl).href;
        } catch {
          /* ignore */
        }
      }
    }
  }
  const styled = el.querySelector<HTMLElement>('[style*="background"]') || (el as HTMLElement);
  const m = (styled.getAttribute?.('style') || '').match(/url\(['"]?([^'")]+)['"]?\)/);
  if (m && !/^data:/i.test(m[1])) {
    try {
      return new URL(m[1], pageUrl).href;
    } catch {
      /* ignore */
    }
  }
  return undefined;
}

/** Todos os links de obra da página de resultados, com o melhor nome de cada um */
export function extractSiteItems(doc: Document, pageUrl: string, scorer: Scorer): SiteItem[] {
  const host = hostOf(pageUrl);
  // Menus, rodapé e cabeçalho não têm resultados
  doc.querySelectorAll('header, nav, footer, script, style, noscript, [role=navigation], .menu, .navbar, #menu, .footer, #footer').forEach((n) => n.remove());
  const byUrl = new Map<string, { item: SiteItem; score: number }>();
  for (const a of Array.from(doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const raw = a.getAttribute('href') || '';
    if (!raw || raw.startsWith('#') || /^(javascript|mailto|tel):/i.test(raw)) continue;
    let abs: URL;
    try {
      abs = new URL(raw, pageUrl);
    } catch {
      continue;
    }
    if (hostOf(abs.href) !== host) continue;
    const path = abs.pathname.replace(/\/+$/, '');
    if (!path || NOT_A_WORK.test(abs.pathname) || abs.searchParams.has('s')) continue;
    const key = `${abs.origin}${path}`;
    // Card da obra: sobe até o bloco com imagem/título, mas para antes de entrar em outro card
    // (bloco com link para outra obra)
    let card: Element | null = a;
    for (let i = 0; i < 4 && card?.parentElement; i++) {
      const p: Element = card.parentElement;
      const others = Array.from(p.querySelectorAll<HTMLAnchorElement>('a[href]')).some((x) => {
        try {
          const u = new URL(x.getAttribute('href') || '', pageUrl);
          return `${u.origin}${u.pathname.replace(/\/+$/, '')}` !== key;
        } catch {
          return false;
        }
      });
      if (others) break;
      card = p;
    }
    const options = [
      a.getAttribute('title'),
      a.getAttribute('aria-label'),
      a.querySelector('img')?.getAttribute('alt'),
      a.querySelector('img')?.getAttribute('title'),
      a.querySelector('h1,h2,h3,h4,h5,h6,[class*="title" i],[class*="name" i]')?.textContent,
      card?.querySelector('h1,h2,h3,h4,h5,h6,[class*="title" i]')?.textContent,
      a.textContent,
    ]
      .map(clean)
      .filter((x) => x.length >= 2 && x.length <= 160);
    if (options.length === 0) continue;
    let best = options[0];
    let bestScore = -1;
    for (const o of options) {
      const s = scorer(o);
      if (s > bestScore) {
        best = o;
        bestScore = s;
      }
    }
    const item: SiteItem = { title: best, url: abs.href.split('#')[0], cover: imageOf(a, pageUrl) || imageOf(card, pageUrl), isEpisode: EPISODE.test(best) || EPISODE.test(abs.pathname) };
    const prev = byUrl.get(key);
    if (!prev || bestScore > prev.score || (!prev.item.cover && item.cover)) byUrl.set(key, { item: { ...item, cover: item.cover || prev?.item.cover }, score: Math.max(bestScore, prev?.score ?? -1) });
  }
  return Array.from(byUrl.values())
    .sort((x, y) => y.score - x.score)
    .slice(0, 60)
    .map((x) => x.item);
}

/**
 * Busca no site. `scorer` diz quanto um nome bate com a obra procurada (0..1);
 * serve para escolher o nome certo de cada card e para saber quando parar de tentar.
 */
export async function searchSite(baseUrl: string, query: string, scorer: Scorer): Promise<SiteItem[]> {
  const base = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
  const host = hostOf(base);
  if (!host || !query.trim()) return [];
  const saved = readTemplates()[host];
  const tried = new Set<string>();

  let best: SiteItem[] = [];
  let bestTop = 0;
  let reachable = false;
  const tryTemplate = async (tpl: string) => {
    if (tried.has(tpl)) return false;
    tried.add(tpl);
    const page = await getDoc(fill(tpl, base, query.trim()), base);
    if (!page) return false;
    reachable = true;
    const items = extractSiteItems(page.doc, page.url, scorer);
    const top = Math.max(0, ...items.map((i) => scorer(i.title)));
    if (top > bestTop) {
      best = items;
      bestTop = top;
    }
    if (top >= 0.5) {
      if (saved !== tpl) saveTemplate(host, tpl);
      return true;
    }
    return false;
  };

  // Jeito de buscar já conhecido: confia nele (a obra pode simplesmente não estar no site)
  if (saved) {
    await tryTemplate(saved);
    if (reachable) return best;
  }
  // Formulário de busca da página inicial (o jeito "oficial" do site): guarda mesmo sem achar a obra
  const home = await getDoc(base);
  if (home) {
    reachable = true;
    const tpl = findSearchTemplate(home.doc, home.url);
    if (tpl) {
      const found = await tryTemplate(tpl);
      saveTemplate(host, tpl);
      if (found || best.length) return best;
    }
  }
  for (const tpl of FALLBACK_TEMPLATES.slice(0, 5)) if (await tryTemplate(tpl)) return best;
  if (!reachable) throw new Error('O site não respondeu');
  return best;
}

/** Links de episódios na página de uma obra (quando o leitor de capítulos não achou nenhum) */
export async function siteEpisodeLinks(pageUrl: string): Promise<Array<{ url: string; name: string; number: number }>> {
  const page = await getDoc(pageUrl);
  if (!page) return [];
  const host = hostOf(page.url);
  const byNumber = new Map<number, { url: string; name: string; number: number }>();
  for (const a of Array.from(page.doc.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    let abs: URL;
    try {
      abs = new URL(a.getAttribute('href') || '', page.url);
    } catch {
      continue;
    }
    if (hostOf(abs.href) !== host || abs.href.split('#')[0] === page.url.split('#')[0]) continue;
    const text = clean(a.getAttribute('title') || a.textContent);
    const m =
      text.match(/epis[oó]dio\s*(\d+(?:\.\d+)?)/i) ||
      text.match(/\bep(?:isode)?\.?\s*(\d+(?:\.\d+)?)\b/i) ||
      abs.pathname.match(/(?:episodio|episode|ep)[-_/]?(\d+(?:\.\d+)?)(?:[-_/]|$)/i);
    if (!m) continue;
    const n = Number(m[1]);
    if (!Number.isFinite(n) || n <= 0 || n > 5000 || byNumber.has(n)) continue;
    byNumber.set(n, { url: abs.href.split('#')[0], name: text || `Episódio ${n}`, number: n });
  }
  return Array.from(byNumber.values()).sort((x, y) => x.number - y.number);
}
