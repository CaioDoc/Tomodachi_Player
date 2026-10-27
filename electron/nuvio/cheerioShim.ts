// electron/nuvio/cheerioShim.ts
// Implementação leve da API do cheerio (load / $(...)) sobre o DOMParser do Chromium,
// para os plugins do Nuvio que fazem `require('cheerio-without-node-native')`.
// Cobre os métodos usados na prática pelos scrapers, inclusive os seletores do jQuery
// :contains(), :eq(), :first, :last, :gt() e :lt().

type Node_ = Node;

const JQ_PSEUDO = /:(contains|eq|first|last|gt|lt|even|odd)(?:\((?:"([^"]*)"|'([^']*)'|([^)]*))\))?/;

function splitTopLevel(selector: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (const ch of selector) {
    if (quote) {
      if (ch === quote) quote = '';
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function uniq(nodes: Node_[]): Node_[] {
  const seen = new Set<Node_>();
  const out: Node_[] = [];
  for (const n of nodes) {
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

/** querySelectorAll com suporte às pseudo-classes do jQuery */
function selectFrom(roots: Node_[], selector: string, includeSelf = false): Element[] {
  const results: Node_[] = [];
  for (const part of splitTopLevel(selector)) {
    const m = JQ_PSEUDO.exec(part);
    if (!m) {
      for (const r of roots) {
        const anyR = r as any;
        if (includeSelf && r.nodeType === 1 && (r as Element).matches(part)) results.push(r);
        if (anyR.querySelectorAll) results.push(...Array.from(anyR.querySelectorAll(part) as NodeListOf<Element>));
      }
      continue;
    }
    const before = part.slice(0, m.index).trim() || '*';
    const after = part.slice(m.index + m[0].length);
    let base = selectFrom(roots, before, includeSelf);
    const arg = m[2] ?? m[3] ?? m[4] ?? '';
    switch (m[1]) {
      case 'contains':
        base = base.filter((el) => (el.textContent || '').includes(arg));
        break;
      case 'eq': {
        const i = Number(arg);
        const el = i < 0 ? base[base.length + i] : base[i];
        base = el ? [el] : [];
        break;
      }
      case 'first':
        base = base.slice(0, 1);
        break;
      case 'last':
        base = base.slice(-1);
        break;
      case 'gt':
        base = base.slice(Number(arg) + 1);
        break;
      case 'lt':
        base = base.slice(0, Math.max(0, Number(arg)));
        break;
      case 'even':
        base = base.filter((_, i) => i % 2 === 0);
        break;
      case 'odd':
        base = base.filter((_, i) => i % 2 === 1);
        break;
    }
    const rest = after.trim();
    if (!rest) {
      results.push(...base);
    } else if (/^[>+~]/.test(rest)) {
      // combinador logo após a pseudo-classe
      const comb = rest[0];
      const sel = rest.slice(1).trim();
      for (const el of base) {
        if (comb === '>') results.push(...Array.from(el.children).filter((c) => matchesSel(c, sel)));
        else if (comb === '+') {
          const n = el.nextElementSibling;
          if (n && matchesSel(n, sel)) results.push(n);
        } else {
          let n = el.nextElementSibling;
          while (n) {
            if (matchesSel(n, sel)) results.push(n);
            n = n.nextElementSibling;
          }
        }
      }
    } else if (after.startsWith(' ')) {
      results.push(...selectFrom(base, rest));
    } else {
      // mais filtros grudados (ex.: :first.ativo)
      results.push(...base.filter((el) => matchesSel(el, '*' + rest)));
    }
  }
  return uniq(results) as Element[];
}

function matchesSel(el: Element, selector: string): boolean {
  if (!selector) return true;
  try {
    return el.matches(selector);
  } catch {
    const root = el.ownerDocument || el;
    return selectFrom([root as Node_], selector).includes(el);
  }
}

function parseHtml(html: string, xmlMode = false): Document {
  const parser = new DOMParser();
  return parser.parseFromString(String(html ?? ''), xmlMode ? 'text/xml' : 'text/html');
}

function fragmentFrom(html: string): Node_[] {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return Array.from(tpl.content.childNodes);
}

const isElement = (n: any): n is Element => !!n && n.nodeType === 1;

class Cheerio {
  [index: number]: any;
  length = 0;
  _root: Document;
  _prev?: Cheerio;

  constructor(nodes: any[], root: Document, prev?: Cheerio) {
    this._root = root;
    this._prev = prev;
    nodes.forEach((n, i) => (this[i] = n));
    this.length = nodes.length;
  }

  _wrap(nodes: any[]) {
    return new Cheerio(nodes, this._root, this);
  }
  toArray(): any[] {
    return Array.prototype.slice.call(this);
  }
  get(i?: number) {
    if (i == null) return this.toArray();
    return i < 0 ? this[this.length + i] : this[i];
  }
  [Symbol.iterator]() {
    return this.toArray()[Symbol.iterator]();
  }
  each(fn: (this: any, i: number, el: any) => any) {
    for (let i = 0; i < this.length; i++) if (fn.call(this[i], i, this[i]) === false) break;
    return this;
  }
  map(fn: (this: any, i: number, el: any) => any) {
    const out: any[] = [];
    for (let i = 0; i < this.length; i++) {
      const v = fn.call(this[i], i, this[i]);
      if (v == null) continue;
      if (Array.isArray(v)) out.push(...v);
      else out.push(v);
    }
    return this._wrap(out);
  }
  filter(sel: any) {
    if (typeof sel === 'function') return this._wrap(this.toArray().filter((el, i) => sel.call(el, i, el)));
    if (typeof sel === 'string') return this._wrap(this.toArray().filter((el) => isElement(el) && matchesSel(el, sel)));
    const set = new Set(sel instanceof Cheerio ? sel.toArray() : [sel]);
    return this._wrap(this.toArray().filter((el) => set.has(el)));
  }
  not(sel: any) {
    const keep = new Set(this.filter(sel).toArray());
    return this._wrap(this.toArray().filter((el) => !keep.has(el)));
  }
  is(sel: any) {
    return this.filter(sel).length > 0;
  }
  has(sel: string) {
    return this._wrap(this.toArray().filter((el) => isElement(el) && selectFrom([el], sel).length > 0));
  }
  find(sel: any) {
    if (typeof sel !== 'string') {
      const targets = sel instanceof Cheerio ? sel.toArray() : [sel];
      return this._wrap(targets.filter((t) => this.toArray().some((r) => r !== t && r.contains?.(t))));
    }
    return this._wrap(selectFrom(this.toArray(), sel));
  }
  first() {
    return this._wrap(this.length ? [this[0]] : []);
  }
  last() {
    return this._wrap(this.length ? [this[this.length - 1]] : []);
  }
  eq(i: number) {
    const el = i < 0 ? this[this.length + i] : this[i];
    return this._wrap(el ? [el] : []);
  }
  slice(a?: number, b?: number) {
    return this._wrap(this.toArray().slice(a, b));
  }
  add(other: any) {
    const extra = other instanceof Cheerio ? other.toArray() : typeof other === 'string' ? selectFrom([this._root], other) : [other];
    return this._wrap(uniq([...this.toArray(), ...extra]));
  }
  end() {
    return this._prev || this;
  }
  index(sel?: any) {
    if (sel == null) {
      const el = this[0];
      if (!el || !el.parentNode) return -1;
      return Array.from(el.parentNode.children || []).indexOf(el);
    }
    const target = sel instanceof Cheerio ? sel[0] : sel;
    return this.toArray().indexOf(target);
  }
  children(sel?: string) {
    const out: Element[] = [];
    for (const el of this.toArray()) if (isElement(el)) out.push(...Array.from(el.children));
    return this._wrap(sel ? out.filter((c) => matchesSel(c, sel)) : out);
  }
  contents() {
    const out: Node_[] = [];
    for (const el of this.toArray()) if (el?.childNodes) out.push(...Array.from(el.childNodes as NodeListOf<Node_>));
    return this._wrap(out);
  }
  parent(sel?: string) {
    const out = uniq(this.toArray().map((el) => el?.parentElement).filter(Boolean));
    return this._wrap(sel ? out.filter((p) => matchesSel(p as Element, sel)) : out);
  }
  parents(sel?: string) {
    const out: Element[] = [];
    for (const el of this.toArray()) {
      let p = el?.parentElement;
      while (p) {
        if (!sel || matchesSel(p, sel)) out.push(p);
        p = p.parentElement;
      }
    }
    return this._wrap(uniq(out));
  }
  closest(sel: string) {
    const out: Element[] = [];
    for (const el of this.toArray()) {
      let p: Element | null = isElement(el) ? el : el?.parentElement;
      while (p && !matchesSel(p, sel)) p = p.parentElement;
      if (p) out.push(p);
    }
    return this._wrap(uniq(out));
  }
  next(sel?: string) {
    const out = this.toArray().map((el) => el?.nextElementSibling).filter(Boolean) as Element[];
    return this._wrap(sel ? out.filter((n) => matchesSel(n, sel)) : out);
  }
  prev(sel?: string) {
    const out = this.toArray().map((el) => el?.previousElementSibling).filter(Boolean) as Element[];
    return this._wrap(sel ? out.filter((n) => matchesSel(n, sel)) : out);
  }
  nextAll(sel?: string) {
    const out: Element[] = [];
    for (const el of this.toArray()) {
      let n = el?.nextElementSibling;
      while (n) {
        if (!sel || matchesSel(n, sel)) out.push(n);
        n = n.nextElementSibling;
      }
    }
    return this._wrap(uniq(out));
  }
  prevAll(sel?: string) {
    const out: Element[] = [];
    for (const el of this.toArray()) {
      let n = el?.previousElementSibling;
      while (n) {
        if (!sel || matchesSel(n, sel)) out.push(n);
        n = n.previousElementSibling;
      }
    }
    return this._wrap(uniq(out));
  }
  siblings(sel?: string) {
    const out: Element[] = [];
    for (const el of this.toArray()) {
      for (const s of Array.from((el?.parentElement?.children || []) as HTMLCollection)) {
        if (s !== el && (!sel || matchesSel(s, sel))) out.push(s);
      }
    }
    return this._wrap(uniq(out));
  }
  attr(name?: any, value?: any): any {
    if (name == null) {
      const el = this[0];
      if (!isElement(el)) return undefined;
      const o: Record<string, string> = {};
      for (const a of Array.from(el.attributes)) o[a.name] = a.value;
      return o;
    }
    if (typeof name === 'object') {
      for (const k of Object.keys(name)) this.attr(k, name[k]);
      return this;
    }
    if (value === undefined) {
      const el = this[0];
      if (!isElement(el)) return undefined;
      const v = el.getAttribute(name);
      return v == null ? undefined : v;
    }
    for (const el of this.toArray()) if (isElement(el)) value === null ? el.removeAttribute(name) : el.setAttribute(name, String(value));
    return this;
  }
  removeAttr(name: string) {
    for (const el of this.toArray()) if (isElement(el)) el.removeAttribute(name);
    return this;
  }
  prop(name: string) {
    const el = this[0];
    if (!el) return undefined;
    if (name === 'outerHTML') return isElement(el) ? el.outerHTML : el.textContent;
    if (name === 'innerHTML') return isElement(el) ? el.innerHTML : '';
    if (name === 'tagName' || name === 'nodeName') return isElement(el) ? el.tagName : undefined;
    if (name === 'textContent' || name === 'innerText') return el.textContent;
    return (el as any)[name];
  }
  data(name?: string) {
    const el = this[0];
    if (!isElement(el)) return undefined;
    const parse = (v: string | null) => {
      if (v == null) return undefined;
      if (v === 'true') return true;
      if (v === 'false') return false;
      if (v === 'null') return null;
      if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
      if (/^[[{]/.test(v)) {
        try {
          return JSON.parse(v);
        } catch {
          /* texto */
        }
      }
      return v;
    };
    if (name) return parse(el.getAttribute(`data-${name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`));
    const out: Record<string, any> = {};
    for (const a of Array.from(el.attributes)) {
      if (a.name.startsWith('data-')) out[a.name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = parse(a.value);
    }
    return out;
  }
  val() {
    const el: any = this[0];
    if (!el) return undefined;
    if (el.tagName === 'SELECT') {
      const opt = el.querySelector('option[selected]') || el.querySelector('option');
      return opt ? opt.getAttribute('value') ?? opt.textContent : undefined;
    }
    if (el.tagName === 'TEXTAREA') return el.textContent;
    const v = el.getAttribute?.('value');
    return v == null ? undefined : v;
  }
  text(value?: string): any {
    if (value !== undefined) {
      for (const el of this.toArray()) if (el) el.textContent = String(value);
      return this;
    }
    return this.toArray()
      .map((el) => el?.textContent || '')
      .join('');
  }
  html(value?: string): any {
    if (value !== undefined) {
      for (const el of this.toArray()) if (isElement(el)) el.innerHTML = String(value);
      return this;
    }
    const el = this[0];
    if (!el) return null;
    return isElement(el) ? el.innerHTML : el.textContent;
  }
  hasClass(c: string) {
    return this.toArray().some((el) => isElement(el) && el.classList.contains(c));
  }
  addClass(c: string) {
    for (const el of this.toArray()) if (isElement(el)) el.classList.add(...String(c).split(/\s+/).filter(Boolean));
    return this;
  }
  removeClass(c?: string) {
    for (const el of this.toArray()) if (isElement(el)) c ? el.classList.remove(...String(c).split(/\s+/).filter(Boolean)) : el.removeAttribute('class');
    return this;
  }
  remove(sel?: string) {
    const targets = sel ? this.filter(sel).toArray() : this.toArray();
    for (const el of targets) el?.parentNode?.removeChild(el);
    return this;
  }
  replaceWith(content: any) {
    for (const el of this.toArray()) {
      const nodes = typeof content === 'string' ? fragmentFrom(content) : content instanceof Cheerio ? content.toArray() : [content];
      (el as Element).replaceWith?.(...nodes);
    }
    return this;
  }
  append(content: any) {
    for (const el of this.toArray()) {
      if (!isElement(el)) continue;
      const nodes = typeof content === 'string' ? fragmentFrom(content) : content instanceof Cheerio ? content.toArray() : [content];
      el.append(...nodes);
    }
    return this;
  }
  serializeArray() {
    const out: { name: string; value: string }[] = [];
    for (const el of this.toArray()) {
      if (!isElement(el)) continue;
      const fields = el.matches('input,select,textarea') ? [el] : Array.from(el.querySelectorAll('input,select,textarea'));
      for (const f of fields as any[]) {
        const name = f.getAttribute('name');
        if (!name) continue;
        const type = (f.getAttribute('type') || '').toLowerCase();
        if ((type === 'checkbox' || type === 'radio') && !f.hasAttribute('checked')) continue;
        out.push({ name, value: new Cheerio([f], this._root).val() ?? '' });
      }
    }
    return out;
  }
}

export function load(content: any, options?: any) {
  const xmlMode = !!(options && (options.xmlMode || options.xml));
  const doc = typeof content === 'string' || content == null ? parseHtml(String(content ?? ''), xmlMode) : (content.ownerDocument || content);

  const $: any = (selector?: any, context?: any) => {
    if (selector == null || selector === '') return new Cheerio([], doc);
    if (selector instanceof Cheerio) return selector;
    if (typeof selector === 'string') {
      const s = selector.trim();
      if (s.startsWith('<') && s.endsWith('>')) return new Cheerio(fragmentFrom(s), doc);
      const roots = context == null ? [doc] : typeof context === 'string' ? selectFrom([doc], context) : context instanceof Cheerio ? context.toArray() : [context];
      return new Cheerio(selectFrom(roots, s), doc);
    }
    if (Array.isArray(selector)) return new Cheerio(selector, doc);
    return new Cheerio([selector], doc);
  };
  $.root = () => new Cheerio([doc], doc);
  $.html = (sel?: any) => {
    if (sel == null) return xmlMode ? new XMLSerializer().serializeToString(doc) : doc.documentElement ? doc.documentElement.outerHTML : '';
    const c = sel instanceof Cheerio ? sel : $(sel);
    return c
      .toArray()
      .map((el: any) => (isElement(el) ? el.outerHTML : el?.textContent || ''))
      .join('');
  };
  $.xml = $.html;
  $.text = (sel?: any) => (sel == null ? doc.documentElement?.textContent || '' : $(sel).text());
  $.contains = (a: Node_, b: Node_) => a !== b && a.contains(b);
  $.load = load;
  $.fn = Cheerio.prototype;
  return $;
}

export const cheerioModule: any = {
  load,
  html: (el: any) => (el && isElement(el) ? el.outerHTML : ''),
  text: (els: any) => (Array.isArray(els) ? els.map((e) => e?.textContent || '').join('') : els?.textContent || ''),
  contains: (a: Node_, b: Node_) => a !== b && a.contains(b),
};
