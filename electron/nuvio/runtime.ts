// electron/nuvio/runtime.ts
// Ambiente onde os plugins do Nuvio rodam: uma janela oculta do Chromium com sandbox,
// sem acesso ao Node nem aos arquivos do computador. Os plugins recebem:
//   fetch, axios, cheerio(-without-node-native), crypto-js, Buffer (básico) e console.
// A rede passa pelo processo principal (sem CORS e com Referer/User-Agent livres).

import { cheerioModule } from './cheerioShim';
import { createCryptoJS, type CryptoBackend } from './cryptoShim';

interface HostFetchRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: Uint8Array | string | null;
  redirect?: 'follow' | 'manual';
}
interface HostFetchResponse {
  ok: boolean;
  status: number;
  statusText: string;
  url: string;
  redirected: boolean;
  headers: [string, string][];
  body: Uint8Array;
  error?: string;
}
interface NuvioHost {
  fetch(req: HostFetchRequest): Promise<HostFetchResponse>;
  crypto(op: any): any;
}

declare global {
  interface Window {
    __nuvioHost?: NuvioHost;
    __nuvioRun?: (key: string, code: string, args: any) => Promise<any>;
  }
}

export function installRuntime(host: NuvioHost, target: any = window) {
  const backend: CryptoBackend = {
    hash: (alg, data) => unwrapCrypto(host.crypto({ op: 'hash', alg, data })),
    hmac: (alg, key, data) => unwrapCrypto(host.crypto({ op: 'hmac', alg, key, data })),
    cipher: (o) => unwrapCrypto(host.crypto({ op: 'cipher', ...o })),
    pbkdf2: (password, salt, iterations, keylen, digest) => unwrapCrypto(host.crypto({ op: 'pbkdf2', password, salt, iterations, keylen, digest })),
    random: (n) => unwrapCrypto(host.crypto({ op: 'random', n })),
  };
  const CryptoJS = createCryptoJS(backend);

  /* ───────────── fetch ───────────── */

  const toHeaderObject = (h: any): Record<string, string> => {
    const out: Record<string, string> = {};
    if (!h) return out;
    if (typeof h.forEach === 'function' && !Array.isArray(h)) {
      h.forEach((v: string, k: string) => (out[k] = String(v)));
      return out;
    }
    if (Array.isArray(h)) {
      for (const [k, v] of h) out[String(k)] = String(v);
      return out;
    }
    for (const k of Object.keys(h)) if (h[k] != null) out[k] = String(h[k]);
    return out;
  };

  const hasHeader = (h: Record<string, string>, name: string) => Object.keys(h).some((k) => k.toLowerCase() === name.toLowerCase());

  async function encodeBody(body: any, headers: Record<string, string>): Promise<Uint8Array | string | null> {
    if (body == null) return null;
    if (typeof body === 'string') return body;
    if (body instanceof Uint8Array) return body;
    if (body instanceof ArrayBuffer) return new Uint8Array(body);
    if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    // URLSearchParams, FormData, Blob: o próprio navegador serializa
    const r = new Response(body);
    const ct = r.headers.get('content-type');
    if (ct && !hasHeader(headers, 'content-type')) headers['Content-Type'] = ct;
    return new Uint8Array(await r.arrayBuffer());
  }

  class NuvioResponse {
    ok: boolean;
    status: number;
    statusText: string;
    url: string;
    redirected: boolean;
    headers: Headers;
    type = 'basic';
    bodyUsed = false;
    private _body: Uint8Array;
    constructor(r: HostFetchResponse) {
      this.ok = r.status >= 200 && r.status < 300;
      this.status = r.status;
      this.statusText = r.statusText || '';
      this.url = r.url;
      this.redirected = !!r.redirected;
      const h = new Headers();
      for (const [k, v] of r.headers || []) {
        try {
          h.append(k, v);
        } catch {
          /* cabeçalho inválido */
        }
      }
      this.headers = h;
      this._body = r.body instanceof Uint8Array ? r.body : new Uint8Array(r.body || []);
    }
    async text() {
      this.bodyUsed = true;
      return new TextDecoder('utf-8').decode(this._body);
    }
    async json() {
      return JSON.parse(await this.text());
    }
    async arrayBuffer() {
      this.bodyUsed = true;
      return this._body.slice().buffer;
    }
    async blob() {
      return new Blob([this._body.slice()], { type: this.headers.get('content-type') || '' });
    }
    clone() {
      const c = Object.create(NuvioResponse.prototype);
      Object.assign(c, this);
      c.bodyUsed = false;
      return c;
    }
  }

  async function nuvioFetch(input: any, init: any = {}): Promise<any> {
    const isReq = typeof Request !== 'undefined' && input instanceof Request;
    const url = String(isReq ? input.url : input?.href || input);
    const method = String(init.method || (isReq ? input.method : 'GET')).toUpperCase();
    const headers = { ...(isReq ? toHeaderObject(input.headers) : {}), ...toHeaderObject(init.headers) };
    const body = await encodeBody(init.body, headers);
    if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const pending = host.fetch({ url, method, headers, body, redirect: init.redirect === 'manual' ? 'manual' : 'follow' });
    const res = init.signal
      ? await Promise.race([
          pending,
          new Promise<never>((_, rej) => init.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')), { once: true })),
        ])
      : await pending;
    if (res.error) throw new TypeError(`Failed to fetch: ${res.error}`);
    return new NuvioResponse(res);
  }

  /* ───────────── axios (subconjunto) ───────────── */

  const buildUrl = (base: string | undefined, url: string, params?: any) => {
    let full = url || '';
    if (base && !/^https?:\/\//i.test(full)) full = base.replace(/\/+$/, '') + '/' + full.replace(/^\/+/, '');
    if (params && typeof params === 'object') {
      const sp = params instanceof URLSearchParams ? params : new URLSearchParams();
      if (!(params instanceof URLSearchParams)) {
        for (const k of Object.keys(params)) {
          const v = params[k];
          if (v == null) continue;
          if (Array.isArray(v)) v.forEach((x) => sp.append(k, String(x)));
          else sp.append(k, String(v));
        }
      }
      const qs = sp.toString();
      if (qs) full += (full.includes('?') ? '&' : '?') + qs;
    }
    return full;
  };

  const createAxios = (defaults: any = {}): any => {
    const request = async (config: any) => {
      const cfg = { ...defaults, ...config, headers: { ...toHeaderObject(defaults.headers), ...toHeaderObject(config.headers) } };
      const method = String(cfg.method || 'get').toUpperCase();
      let data = cfg.data;
      if (data != null && typeof data === 'object' && !(data instanceof URLSearchParams) && !(data instanceof ArrayBuffer) && !ArrayBuffer.isView(data) && !(typeof FormData !== 'undefined' && data instanceof FormData)) {
        data = JSON.stringify(data);
        if (!hasHeader(cfg.headers, 'content-type')) cfg.headers['Content-Type'] = 'application/json';
      }
      const url = buildUrl(cfg.baseURL, cfg.url, cfg.params);
      const res = await nuvioFetch(url, { method, headers: cfg.headers, body: method === 'GET' || method === 'HEAD' ? undefined : data, redirect: cfg.maxRedirects === 0 ? 'manual' : 'follow' });
      const headersObj: Record<string, string> = {};
      res.headers.forEach((v: string, k: string) => (headersObj[k.toLowerCase()] = v));
      let body: any;
      const rt = cfg.responseType || 'json';
      if (rt === 'arraybuffer') body = await res.arrayBuffer();
      else {
        const text = await res.text();
        if (rt === 'text' || rt === 'document') body = text;
        else {
          try {
            body = text ? JSON.parse(text) : text;
          } catch {
            body = text;
          }
        }
      }
      const response = { data: body, status: res.status, statusText: res.statusText, headers: headersObj, config: cfg, request: { responseURL: res.url } };
      const validate = cfg.validateStatus === undefined ? (s: number) => s >= 200 && s < 300 : cfg.validateStatus;
      if (validate && !validate(res.status)) {
        const err: any = new Error(`Request failed with status code ${res.status}`);
        err.isAxiosError = true;
        err.response = response;
        err.config = cfg;
        err.code = res.status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST';
        throw err;
      }
      return response;
    };
    const ax: any = (a: any, b?: any) => (typeof a === 'string' ? request({ ...(b || {}), url: a }) : request(a || {}));
    ax.request = request;
    for (const m of ['get', 'delete', 'head', 'options']) ax[m] = (url: string, cfg: any = {}) => request({ ...cfg, url, method: m });
    for (const m of ['post', 'put', 'patch']) ax[m] = (url: string, data?: any, cfg: any = {}) => request({ ...cfg, url, data, method: m });
    ax.create = (cfg: any = {}) => createAxios({ ...defaults, ...cfg, headers: { ...toHeaderObject(defaults.headers), ...toHeaderObject(cfg.headers) } });
    ax.defaults = defaults;
    ax.defaults.headers = ax.defaults.headers || {};
    ax.interceptors = { request: { use: () => 0, eject: () => {} }, response: { use: () => 0, eject: () => {} } };
    ax.isAxiosError = (e: any) => !!e?.isAxiosError;
    ax.isCancel = () => false;
    ax.all = (p: any[]) => Promise.all(p);
    ax.spread = (fn: any) => (arr: any[]) => fn(...arr);
    ax.default = ax;
    return ax;
  };
  const axios = createAxios();

  /* ───────────── Buffer (básico) ───────────── */

  const bytesFrom = (value: any, enc = 'utf8'): Uint8Array => {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (Array.isArray(value)) return new Uint8Array(value);
    const s = String(value ?? '');
    const e = String(enc).toLowerCase();
    if (e === 'base64' || e === 'base64url') {
      const clean = s.replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
      const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
      return Uint8Array.from(bin, (c) => c.charCodeAt(0));
    }
    if (e === 'hex') {
      const out = new Uint8Array(s.length >> 1);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(s.substr(i * 2, 2), 16);
      return out;
    }
    if (e === 'latin1' || e === 'binary' || e === 'ascii') return Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);
    return new TextEncoder().encode(s);
  };
  // @ts-expect-error: Buffer.from(texto, codificação) difere da assinatura de Uint8Array.from
  class BufferShim extends Uint8Array {
    static from(value: any, enc?: string) {
      const b = bytesFrom(value, enc);
      const out = new BufferShim(b.length);
      out.set(b);
      return out;
    }
    static alloc(n: number) {
      return new BufferShim(n);
    }
    static isBuffer(v: any) {
      return v instanceof BufferShim;
    }
    static concat(list: Uint8Array[]) {
      const total = list.reduce((n, b) => n + b.length, 0);
      const out = new BufferShim(total);
      let o = 0;
      for (const b of list) {
        out.set(b, o);
        o += b.length;
      }
      return out;
    }
    static byteLength(s: string, enc?: string) {
      return bytesFrom(s, enc).length;
    }
    toString(enc = 'utf8'): string {
      const e = String(enc).toLowerCase();
      if (e === 'base64' || e === 'base64url') {
        let bin = '';
        for (let i = 0; i < this.length; i += 0x8000) bin += String.fromCharCode(...this.subarray(i, i + 0x8000));
        const b64 = btoa(bin);
        return e === 'base64url' ? b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : b64;
      }
      if (e === 'hex') return Array.from(this, (b) => b.toString(16).padStart(2, '0')).join('');
      if (e === 'latin1' || e === 'binary' || e === 'ascii') return Array.from(this, (b) => String.fromCharCode(b)).join('');
      return new TextDecoder('utf-8').decode(this);
    }
  }

  /* ───────────── módulos ───────────── */

  const cryptoSub: Record<string, any> = {
    'crypto-js': CryptoJS,
    'crypto-js/core': CryptoJS,
    'crypto-js/aes': CryptoJS.AES,
    'crypto-js/tripledes': CryptoJS.TripleDES,
    'crypto-js/md5': CryptoJS.MD5,
    'crypto-js/sha1': CryptoJS.SHA1,
    'crypto-js/sha256': CryptoJS.SHA256,
    'crypto-js/sha512': CryptoJS.SHA512,
    'crypto-js/hmac-sha256': CryptoJS.HmacSHA256,
    'crypto-js/hmac-sha1': CryptoJS.HmacSHA1,
    'crypto-js/hmac-md5': CryptoJS.HmacMD5,
    'crypto-js/hmac-sha512': CryptoJS.HmacSHA512,
    'crypto-js/pbkdf2': CryptoJS.PBKDF2,
    'crypto-js/evpkdf': CryptoJS.EvpKDF,
    'crypto-js/enc-utf8': CryptoJS.enc.Utf8,
    'crypto-js/enc-hex': CryptoJS.enc.Hex,
    'crypto-js/enc-base64': CryptoJS.enc.Base64,
    'crypto-js/enc-base64url': CryptoJS.enc.Base64url,
    'crypto-js/enc-latin1': CryptoJS.enc.Latin1,
    'crypto-js/mode-ecb': CryptoJS.mode.ECB,
    'crypto-js/mode-ctr': CryptoJS.mode.CTR,
    'crypto-js/pad-nopadding': CryptoJS.pad.NoPadding,
    'crypto-js/pad-zeropadding': CryptoJS.pad.ZeroPadding,
  };

  const modules: Record<string, any> = {
    'cheerio-without-node-native': cheerioModule,
    'react-native-cheerio': cheerioModule,
    cheerio: cheerioModule,
    axios,
    buffer: { Buffer: BufferShim },
    ...cryptoSub,
  };

  const requireShim = (name: string) => {
    const key = String(name).replace(/^node:/, '');
    if (key in modules) return modules[key];
    throw new Error(`Módulo "${name}" não está disponível para plugins no Tomodachi Player`);
  };

  const compiled = new Map<string, any>();

  const compile = (key: string, code: string) => {
    const cached = compiled.get(key);
    if (cached) return cached;
    const module: any = { exports: {} };
    // eslint-disable-next-line no-new-func
    const fn = new Function('module', 'exports', 'require', 'Buffer', 'global', 'fetch', 'SCRAPER_ID', 'SCRAPER_SETTINGS', code);
    fn(module, module.exports, requireShim, BufferShim, target, nuvioFetch, key, {});
    compiled.set(key, module.exports);
    return module.exports;
  };

  const sanitize = (s: any) => {
    if (!s || typeof s !== 'object') return null;
    const str = (v: any) => (v == null ? undefined : String(v));
    // Torrents: link magnet ou infoHash (estilo Stremio)
    let url = typeof s.url === 'string' ? s.url : '';
    let torrent = /^magnet:\?/i.test(url);
    if (!url && typeof s.infoHash === 'string' && /^[a-f0-9]{40}$/i.test(s.infoHash)) {
      url = `magnet:?xt=urn:btih:${s.infoHash.toLowerCase()}`;
      torrent = true;
    }
    if (!torrent && !/^https?:\/\//i.test(url)) return null;
    const headers: Record<string, string> = {};
    if (s.headers && typeof s.headers === 'object') for (const k of Object.keys(s.headers)) if (s.headers[k] != null) headers[k] = String(s.headers[k]);
    const subtitles = Array.isArray(s.subtitles)
      ? s.subtitles
          .filter((x: any) => x && typeof x.url === 'string')
          .map((x: any) => ({ url: x.url, name: str(x.name), language: str(x.language || x.lang) }))
      : undefined;
    return {
      name: str(s.name),
      title: str(s.title),
      url,
      quality: str(s.quality),
      size: str(s.size),
      type: torrent ? 'torrent' : str(s.type),
      fileIdx: torrent && s.fileIdx != null && Number.isFinite(Number(s.fileIdx)) ? Number(s.fileIdx) : undefined,
      sources: torrent && Array.isArray(s.sources) ? s.sources.map(String).slice(0, 40) : undefined,
      provider: str(s.provider),
      headers: Object.keys(headers).length ? headers : undefined,
      subtitles,
    };
  };

  target.fetch = nuvioFetch;
  target.axios = axios;
  target.Buffer = BufferShim;
  target.global = target;

  target.__nuvioRun = async (key: string, code: string, args: any) => {
    try {
      const exp = compile(key, code);
      const getStreams = exp?.getStreams || exp?.default?.getStreams || (typeof exp === 'function' ? exp : null);
      if (typeof getStreams !== 'function') return { ok: false, error: 'O plugin não exporta getStreams()' };
      const result = await getStreams(args.tmdbId, args.mediaType, args.season ?? null, args.episode ?? null);
      const list = Array.isArray(result) ? result : Array.isArray(result?.streams) ? result.streams : [];
      return { ok: true, streams: list.map(sanitize).filter(Boolean) };
    } catch (err: any) {
      return { ok: false, error: String(err?.message || err) };
    }
  };
  target.__nuvioForget = (key: string) => compiled.delete(key);

  return { CryptoJS, axios, fetch: nuvioFetch, Buffer: BufferShim, cheerio: cheerioModule };
}

function unwrapCrypto(res: any): Uint8Array {
  if (!res || res.error) throw new Error(res?.error || 'crypto error');
  const v = res.data;
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}

// Na janela de plugins: instala sozinho
if (typeof window !== 'undefined' && window.__nuvioHost) {
  installRuntime(window.__nuvioHost);
}
