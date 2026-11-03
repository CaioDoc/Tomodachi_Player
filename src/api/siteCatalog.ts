// src/api/siteCatalog.ts
// Catálogo de um site de vídeo, do jeito que o visitante vê: a lista de obras de uma página e o
// caminho para a próxima. Usa o mesmo leitor de cards da busca (que lê o HTML de verdade), então
// funciona em qualquer site — inclusive nos que montam a lista com JavaScript.

import { extractSiteItems, getDoc, type SiteItem } from './siteSearch';

export interface CatalogPage {
  items: SiteItem[];
  /** Endereço da próxima página (null quando acabou) */
  next: string | null;
  /** Endereço desta página (para voltar depois) */
  url: string;
}

const ROOT_KEY = 'tp_site_list_root';
const hostOf = (u: string) => {
  try {
    return new URL(u).host.toLowerCase();
  } catch {
    return '';
  }
};

function readRoots(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(ROOT_KEY) || '{}') || {};
  } catch {
    return {};
  }
}
function saveRoot(host: string, url: string) {
  try {
    const all = readRoots();
    all[host] = url;
    localStorage.setItem(ROOT_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

/** Links do menu que levam à lista de obras do site ("Animes", "Todos", "Catálogo", "Lançamentos"…) */
const LIST_LINK = /\b(animes?|todos|todas|catalogo|catálogo|lista|biblioteca|browse|videos|vídeos|filmes|series|séries|lancamentos|lançamentos|recentes|populares|a-z|az)\b/i;
const SKIP_LINK = /\b(login|entrar|cadastr|conta|perfil|dmca|contato|privacidade|termos|doar|discord|telegram|premium|assinar)\b/i;

/** Acha a melhor página de listagem do site (guarda por site, para não procurar toda vez) */
async function findListRoot(base: string, browser: boolean): Promise<{ url: string; doc: Document } | null> {
  const host = hostOf(base);
  const saved = readRoots()[host];
  if (saved) {
    const page = await getDoc(saved, base, browser);
    if (page) {
      const items = extractSiteItems(page.doc, page.url, () => 0);
      if (items.length >= 3) return { url: page.url, doc: page.doc };
    }
  }
  const home = await getDoc(base, undefined, browser);
  if (!home) return null;
  // Candidatos do menu (lidos antes de varrer os cards, que apaga o cabeçalho)
  const candidates: string[] = [];
  for (const a of Array.from(home.doc.querySelectorAll<HTMLAnchorElement>('header a[href], nav a[href], [class*="menu" i] a[href]'))) {
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || SKIP_LINK.test(text) || SKIP_LINK.test(href)) continue;
    if (!LIST_LINK.test(text) && !LIST_LINK.test(href)) continue;
    try {
      const u = new URL(href, home.url);
      if (hostOf(u.href) === host && !candidates.includes(u.href)) candidates.push(u.href);
    } catch {
      /* ignore */
    }
  }
  let best = { url: home.url, doc: home.doc, n: extractSiteItems(home.doc, home.url, () => 0).length };
  for (const url of candidates.slice(0, 3)) {
    const page = await getDoc(url, home.url, browser);
    if (!page) continue;
    const n = extractSiteItems(page.doc, page.url, () => 0).length;
    if (n > best.n * 1.2) best = { url: page.url, doc: page.doc, n };
  }
  if (best.n >= 3) saveRoot(host, best.url);
  return { url: best.url, doc: best.doc };
}

const NEXT_TEXT = /^(?:»|›|>|próxima|proxima|next|seguinte|mais|carregar mais|ver mais)$/i;

/** Endereço da próxima página, lido da própria paginação do site */
function findNext(doc: Document, pageUrl: string, pageNumber: number): string | null {
  const host = hostOf(pageUrl);
  const abs = (href: string | null) => {
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return null;
    try {
      const u = new URL(href, pageUrl);
      return hostOf(u.href) === host && u.href !== pageUrl ? u.href : null;
    } catch {
      return null;
    }
  };
  // 1. O jeito certo: <a rel="next">
  const rel = abs(doc.querySelector<HTMLAnchorElement>('a[rel~=next]')?.getAttribute('href') || null);
  if (rel) return rel;
  // 2. Link com o número da próxima página, ou com a seta, dentro da paginação
  const area = doc.querySelector('.pagination, .page-numbers, .paginacao, .pagenavi, [class*="pagina" i], [class*="paging" i], nav[aria-label*="pag" i]') || doc;
  const links = Array.from(area.querySelectorAll<HTMLAnchorElement>('a[href]'));
  for (const a of links) {
    const text = (a.textContent || '').replace(/\s+/g, ' ').trim();
    if (text === String(pageNumber + 1) || NEXT_TEXT.test(text) || /next|próxim|proxim/i.test(a.className) || /next/i.test(a.getAttribute('aria-label') || '')) {
      const u = abs(a.getAttribute('href'));
      if (u) return u;
    }
  }
  // 3. Endereço no padrão /page/N/ ou ?page=N: monta a próxima
  const m = pageUrl.match(/(\/page\/)(\d+)(\/?)/i);
  if (m) return pageUrl.replace(m[0], `${m[1]}${Number(m[2]) + 1}${m[3]}`);
  try {
    const u = new URL(pageUrl);
    for (const k of ['page', 'pagina', 'p', 'pg']) {
      const v = u.searchParams.get(k);
      if (v && /^\d+$/.test(v)) {
        u.searchParams.set(k, String(Number(v) + 1));
        return u.href;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Uma página do catálogo. `pageUrl` vazio começa do início (o app guarda o endereço de cada
 * página para ir e voltar sem perder o lugar).
 */
export async function siteCatalogPage(baseUrl: string, pageUrl: string, pageNumber: number): Promise<CatalogPage> {
  const base = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`;
  const load = async (browser: boolean): Promise<CatalogPage | null> => {
    let doc: Document | null = null;
    let url = pageUrl;
    if (pageUrl) {
      const page = await getDoc(pageUrl, base, browser);
      if (page) {
        doc = page.doc;
        url = page.url;
      }
    } else {
      const root = await findListRoot(base, browser);
      if (root) {
        doc = root.doc;
        url = root.url;
      }
    }
    if (!doc) return null;
    const next = findNext(doc, url, pageNumber);
    const items = extractSiteItems(doc, url, () => 0).filter((i) => !i.isEpisode);
    return { items, next, url };
  };
  // Primeiro do jeito rápido; se vier pouca coisa, carrega como navegador (sites feitos em JavaScript)
  const quick = await load(false);
  if (quick && quick.items.length >= 3) return quick;
  const rendered = await load(true).catch(() => null);
  if (rendered && rendered.items.length > (quick?.items.length || 0)) return rendered;
  return quick || { items: [], next: null, url: pageUrl || base };
}
