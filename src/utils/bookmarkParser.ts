import type { WebBookmark, WebBookmarkFolder } from '../types';
import { t } from '../i18n';

/**
 * Escapes special HTML characters for safe export
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Normalizes a URL for deduplication
 */
export function normalizeUrl(rawUrl: string): string {
  try {
    const trimmed = rawUrl.trim();
    const u = new URL(trimmed);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${host}${pathname}${u.search}${u.hash}`;
  } catch {
    return rawUrl.trim().toLowerCase().replace(/\/+$/, '');
  }
}

/**
 * Extracts a favicon URL for a given web URL
 */
export function getFaviconUrl(url: string): string {
  try {
    const u = new URL(url);
    const domain = u.hostname;
    if (!domain) return '';
    return `https://icons.duckduckgo.com/ip3/${domain}.ico`;
  } catch {
    return '';
  }
}

/**
 * Decompresses Mozilla's proprietary mozLz40 format (.jsonlz4)
 */
export function decompressMozLz4(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  
  // Verify 8-byte header: mozLz40\0
  const magic = String.fromCharCode(...bytes.subarray(0, 8));
  if (magic !== 'mozLz40\0') {
    throw new Error(t('Não é um arquivo mozLz40 válido do Firefox'));
  }

  // Next 4 bytes: uncompressed size in uint32 little-endian
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const uncompressedSize = view.getUint32(8, true);

  const input = bytes.subarray(12);
  const output = new Uint8Array(uncompressedSize);

  let inPos = 0;
  let outPos = 0;

  while (inPos < input.length && outPos < uncompressedSize) {
    const token = input[inPos++];
    let literalLen = token >> 4;

    if (literalLen === 15) {
      let b;
      do {
        b = input[inPos++];
        literalLen += b;
      } while (b === 255 && inPos < input.length);
    }

    // Copy literals
    for (let i = 0; i < literalLen; i++) {
      output[outPos++] = input[inPos++];
    }

    if (inPos >= input.length || outPos >= uncompressedSize) {
      break;
    }

    // Match offset (2 bytes little-endian)
    const offset = input[inPos++] | (input[inPos++] << 8);
    if (offset === 0) break;

    // Match length
    let matchLen = (token & 0x0f) + 4;
    if ((token & 0x0f) === 15) {
      let b;
      do {
        b = input[inPos++];
        matchLen += b;
      } while (b === 255 && inPos < input.length);
    }

    // Copy match
    let matchPos = outPos - offset;
    for (let i = 0; i < matchLen; i++) {
      output[outPos++] = output[matchPos++];
    }
  }

  return new TextDecoder('utf-8').decode(output.subarray(0, outPos));
}

/* ───────────────────────── Importação com pastas ───────────────────────── */

export interface ParsedBookmarks {
  folders: WebBookmarkFolder[];
  bookmarks: WebBookmark[];
}

const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const toMs = (raw: unknown): number | undefined => {
  const n = typeof raw === 'string' ? parseInt(raw, 10) : typeof raw === 'number' ? raw : NaN;
  if (!isFinite(n) || n <= 0) return undefined;
  // segundos (HTML), milissegundos ou microssegundos (Firefox/Chrome JSON)
  return n > 1e14 ? Math.floor(n / 1000) : n > 1e11 ? n : n * 1000;
};

/** Monta a lista de pastas/favoritos à medida que o arquivo é percorrido. */
class TreeBuilder {
  folders: WebBookmarkFolder[] = [];
  bookmarks: WebBookmark[] = [];
  private pos = 0;

  private synthetic = new Set<string>();

  /** `synthetic`: pasta-raiz do navegador (ex.: "Outros favoritos"), descartada se ficar vazia. */
  folder(title: string, parentId: string | undefined, dateAdded?: number, synthetic = false): string {
    const id = newId('fld');
    this.folders.push({ id, title: title.trim() || t('Sem nome'), parentId, dateAdded: dateAdded ?? Date.now(), pos: this.pos++ });
    if (synthetic) this.synthetic.add(id);
    return id;
  }

  link(title: string, rawUrl: string, parentId: string | undefined, dateAdded?: number, icon?: string) {
    const url = (rawUrl || '').trim();
    if (!/^https?:\/\//i.test(url)) return;
    let t = (title || '').trim();
    if (!t) {
      try {
        t = new URL(url).hostname;
      } catch {
        t = url;
      }
    }
    this.bookmarks.push({
      id: newId('bm'),
      title: t,
      url,
      dateAdded: dateAdded ?? Date.now(),
      favicon: icon && /^(data:|https?:)/i.test(icon) ? icon : getFaviconUrl(url),
      parentId,
      pos: this.pos++,
    });
  }

  /** Remove as pastas-raiz do navegador que ficaram vazias (ex.: "Favoritos do celular"). */
  result(): ParsedBookmarks {
    const used = new Set<string>();
    const parentOf = new Map(this.folders.map((f) => [f.id, f.parentId]));
    const mark = (start?: string) => {
      let p = start;
      while (p && !used.has(p)) {
        used.add(p);
        p = parentOf.get(p);
      }
    };
    this.bookmarks.forEach((b) => mark(b.parentId));
    this.folders.forEach((f) => {
      if (!this.synthetic.has(f.id)) mark(f.id);
    });
    return { folders: this.folders.filter((f) => used.has(f.id)), bookmarks: this.bookmarks };
  }
}

/**
 * HTML no formato Netscape (exportado por Chrome, Edge, Firefox, Brave, Opera, Safari…).
 * A pasta "Barra de favoritos" vai para a raiz (que é a barra do Tomodachi); as demais
 * pastas e subpastas são mantidas.
 */
export function parseNetscapeTree(htmlContent: string): ParsedBookmarks {
  const tree = new TreeBuilder();
  const clean = htmlContent.replace(/^﻿/, '').trim();
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(clean, 'text/html');
  } catch {
    return tree.result();
  }

  const visited = new Set<Element>();

  // Itens de uma lista <DL>, achatando <p> e <DD> que o parser HTML pode criar
  const entriesOf = (dl: Element): Element[] => {
    const out: Element[] = [];
    for (const child of Array.from(dl.children)) {
      const tag = child.tagName;
      if (tag === 'DT') out.push(child);
      else if (tag === 'P' || tag === 'DD') out.push(...entriesOf(child));
      else if (tag === 'DL') out.push(child); // lista solta (exportadores não padronizados)
    }
    return out;
  };

  const walkDL = (dl: Element, parentId: string | undefined) => {
    if (visited.has(dl)) return;
    visited.add(dl);
    const entries = entriesOf(dl);
    for (let i = 0; i < entries.length; i++) {
      const el = entries[i];
      if (el.tagName === 'DL') {
        walkDL(el, parentId);
        continue;
      }
      const h3 = Array.from(el.children).find((c) => c.tagName === 'H3');
      const a = Array.from(el.children).find((c) => c.tagName === 'A');
      if (h3) {
        // Sub-lista da pasta: dentro do <DT> ou logo depois dele
        let sub = Array.from(el.children).find((c) => c.tagName === 'DL') || null;
        if (!sub) {
          const next = el.nextElementSibling;
          if (next?.tagName === 'DL') sub = next;
          else if (next?.tagName === 'DD') sub = Array.from(next.children).find((c) => c.tagName === 'DL') || null;
        }
        const isToolbar = /true/i.test(h3.getAttribute('personal_toolbar_folder') || '');
        const folderId = isToolbar ? parentId : tree.folder(h3.textContent || '', parentId, toMs(h3.getAttribute('add_date')));
        if (sub) walkDL(sub, folderId);
      } else if (a) {
        tree.link(
          a.textContent || '',
          a.getAttribute('href') || '',
          parentId,
          toMs(a.getAttribute('add_date')),
          a.getAttribute('icon') || a.getAttribute('icon_uri') || undefined
        );
      }
    }
  };

  const rootDL = doc.querySelector('dl');
  if (rootDL) walkDL(rootDL, undefined);
  // Listas que não ficaram ligadas à raiz (HTML muito fora do padrão)
  doc.querySelectorAll('dl').forEach((dl) => {
    if (!visited.has(dl) && !dl.parentElement?.closest('dl')) walkDL(dl, undefined);
  });

  // Último recurso: só os links, sem pastas
  if (tree.bookmarks.length === 0) {
    doc.querySelectorAll('a[href]').forEach((a) => tree.link(a.textContent || '', a.getAttribute('href') || '', undefined, toMs(a.getAttribute('add_date'))));
  }
  return tree.result();
}

// Pastas-raiz dos navegadores
const FIREFOX_ROOTS: Record<string, string | null> = {
  'toolbar_____': null, // barra → raiz
  'menu________': t('Menu de favoritos'),
  'unfiled_____': t('Outros favoritos'),
  'mobile______': t('Favoritos do celular'),
};
const CHROME_ROOTS: Record<string, string | null> = {
  bookmark_bar: null,
  other: t('Outros favoritos'),
  synced: t('Favoritos do celular'),
};

/** JSON do Firefox (backup .json/.jsonlz4), do Chrome/Edge/Brave (arquivo "Bookmarks") ou uma lista simples. */
export function parseJsonTree(jsonContent: string): ParsedBookmarks {
  const tree = new TreeBuilder();
  let data: any;
  try {
    data = JSON.parse(jsonContent.replace(/^﻿/, '').trim());
  } catch {
    return tree.result();
  }

  const walk = (node: any, parentId: string | undefined) => {
    if (!node || typeof node !== 'object') return;
    const url = node.uri || node.url || node.href || node.link;
    const children: any[] | null = Array.isArray(node.children) ? node.children : null;
    if (typeof url === 'string' && !children) {
      tree.link(node.title || node.name || '', url, parentId, toMs(node.dateAdded ?? node.date_added ?? node.date), node.iconuri || node.icon || node.favicon);
      return;
    }
    if (children) {
      let target = parentId;
      if (node.guid === 'root________') target = parentId;
      else if (node.guid && node.guid in FIREFOX_ROOTS) {
        const name = FIREFOX_ROOTS[node.guid];
        target = name ? tree.folder(name, parentId, undefined, true) : parentId;
      } else if (node.title || node.name) {
        target = tree.folder(node.title || node.name, parentId, toMs(node.dateAdded ?? node.date_added));
      }
      children.forEach((c) => walk(c, target));
    }
  };

  if (Array.isArray(data)) {
    data.forEach((item) => walk(item, undefined));
  } else if (data?.roots && typeof data.roots === 'object') {
    for (const [key, root] of Object.entries<any>(data.roots)) {
      if (!root || typeof root !== 'object' || !Array.isArray(root.children)) continue;
      const name = key in CHROME_ROOTS ? CHROME_ROOTS[key] : root.name || key;
      const target = name ? tree.folder(name, undefined, undefined, true) : undefined;
      root.children.forEach((c: any) => walk(c, target));
    }
  } else {
    walk(data, undefined);
  }
  return tree.result();
}

/** Lê qualquer formato (HTML, JSON do Chrome/Firefox, .jsonlz4) mantendo as pastas. */
export function parseAnyBookmarksTree(input: string | ArrayBuffer | Uint8Array): ParsedBookmarks {
  let text = '';
  if (input instanceof ArrayBuffer || input instanceof Uint8Array) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (String.fromCharCode(...bytes.subarray(0, 8)) === 'mozLz40\0') {
      try {
        return parseJsonTree(decompressMozLz4(bytes));
      } catch (e) {
        console.error('Falha ao descompactar mozLz4:', e);
      }
    }
    text = new TextDecoder('utf-8').decode(bytes);
  } else {
    text = input;
  }
  const trimmed = text.replace(/^﻿/, '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const res = parseJsonTree(trimmed);
    if (res.bookmarks.length > 0) return res;
  }
  const html = parseNetscapeTree(trimmed);
  if (html.bookmarks.length > 0) return html;
  return parseJsonTree(trimmed);
}

/** Compatibilidade: somente os links, sem pastas. */
export function parseAnyBookmarks(input: string | ArrayBuffer | Uint8Array): WebBookmark[] {
  return parseAnyBookmarksTree(input).bookmarks.map(({ parentId: _p, ...b }) => b);
}

/* ───────────────────────── Exportação e mesclagem ───────────────────────── */

const byPos = <T extends { pos?: number }>(a: T, b: T) => (a.pos ?? Number.MAX_SAFE_INTEGER) - (b.pos ?? Number.MAX_SAFE_INTEGER);

/** Exporta em HTML Netscape (abre em qualquer navegador), com as pastas. */
export function exportBookmarksToHtml(bookmarks: WebBookmark[], folders: WebBookmarkFolder[] = []): string {
  const nowUnix = Math.floor(Date.now() / 1000);
  const folderIds = new Set(folders.map((f) => f.id));
  const parentKey = (p?: string) => (p && folderIds.has(p) ? p : '');

  const render = (parent: string, indent: string): string => {
    const subFolders = folders.filter((f) => parentKey(f.parentId) === parent);
    const links = bookmarks.filter((b) => parentKey(b.parentId) === parent);
    const items: Array<{ pos?: number; html: string }> = [
      ...subFolders.map((f) => ({
        pos: f.pos,
        html: `${indent}<DT><H3 ADD_DATE="${Math.floor((f.dateAdded || Date.now()) / 1000)}">${escapeHtml(f.title)}</H3>\n${indent}<DL><p>\n${render(f.id, indent + '    ')}${indent}</DL><p>\n`,
      })),
      ...links.map((b) => {
        const iconAttr = b.favicon && b.favicon.startsWith('data:') ? ` ICON="${b.favicon}"` : '';
        return {
          pos: b.pos,
          html: `${indent}<DT><A HREF="${escapeHtml(b.url)}" ADD_DATE="${b.dateAdded ? Math.floor(b.dateAdded / 1000) : nowUnix}"${iconAttr}>${escapeHtml(b.title)}</A>\n`,
        };
      }),
    ];
    return items.sort(byPos).map((i) => i.html).join('');
  };

  return `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="${nowUnix}" LAST_MODIFIED="${nowUnix}" PERSONAL_TOOLBAR_FOLDER="true">${t('Barra de favoritos')}</H3>
    <DL><p>
${render('', '        ')}    </DL><p>
</DL><p>
`;
}

/**
 * Junta favoritos importados aos existentes. Pastas com o mesmo caminho
 * (ex.: "Mangás › Leitura") são reaproveitadas; links repetidos na mesma pasta são ignorados.
 */
export function mergeBookmarkTrees(
  existing: { bookmarks: WebBookmark[]; folders: WebBookmarkFolder[] },
  incoming: ParsedBookmarks
): { bookmarks: WebBookmark[]; folders: WebBookmarkFolder[]; addedCount: number; addedFolders: number } {
  const folders = [...existing.folders];
  const bookmarks = [...existing.bookmarks];
  const keyOf = (title: string, parentId?: string) => `${parentId || ''}\u0000${title.trim().toLowerCase()}`;
  const folderByKey = new Map(folders.map((f) => [keyOf(f.title, f.parentId), f.id]));
  // Mantém a ordem original do arquivo (pastas e links intercalados), depois dos itens atuais
  const base = Math.max(0, ...folders.map((f) => f.pos ?? 0), ...bookmarks.map((b) => b.pos ?? 0)) + 1;
  let fallback = 0;
  const posOf = (p?: number) => base + (typeof p === 'number' ? p : 100000 + fallback++);

  // Pastas em ordem de criação (o pai sempre vem antes do filho)
  const idMap = new Map<string, string>();
  let addedFolders = 0;
  for (const f of incoming.folders) {
    const parentId = f.parentId ? idMap.get(f.parentId) : undefined;
    const key = keyOf(f.title, parentId);
    const found = folderByKey.get(key);
    if (found) {
      idMap.set(f.id, found);
      continue;
    }
    const nf: WebBookmarkFolder = { ...f, parentId, pos: posOf(f.pos) };
    folders.push(nf);
    folderByKey.set(key, nf.id);
    idMap.set(f.id, nf.id);
    addedFolders++;
  }

  const seen = new Set(bookmarks.map((b) => `${b.parentId || ''}\u0000${normalizeUrl(b.url)}`));
  let addedCount = 0;
  for (const b of incoming.bookmarks) {
    const parentId = b.parentId ? idMap.get(b.parentId) : undefined;
    const key = `${parentId || ''}\u0000${normalizeUrl(b.url)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    bookmarks.push({ ...b, parentId, pos: posOf(b.pos) });
    addedCount++;
  }
  return { bookmarks, folders, addedCount, addedFolders };
}

/** Compatibilidade: mescla sem pastas. */
export function mergeBookmarks(existing: WebBookmark[], incoming: WebBookmark[]): { merged: WebBookmark[]; addedCount: number } {
  const r = mergeBookmarkTrees({ bookmarks: existing, folders: [] }, { bookmarks: incoming, folders: [] });
  return { merged: r.bookmarks, addedCount: r.addedCount };
}
