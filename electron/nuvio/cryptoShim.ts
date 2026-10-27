// electron/nuvio/cryptoShim.ts
// Subconjunto compatível com a biblioteca crypto-js, usado pelos plugins do Nuvio.
// A criptografia de verdade é feita pelo Node (processo principal) através de uma
// chamada síncrona — aqui ficam só os tipos (WordArray, CipherParams) e os formatos.

export interface CryptoBackend {
  hash(alg: string, data: Uint8Array): Uint8Array;
  hmac(alg: string, key: Uint8Array, data: Uint8Array): Uint8Array;
  cipher(op: { alg: string; decrypt: boolean; key: Uint8Array; iv: Uint8Array | null; data: Uint8Array; autoPadding: boolean }): Uint8Array;
  pbkdf2(password: Uint8Array, salt: Uint8Array, iterations: number, keylen: number, digest: string): Uint8Array;
  random(n: number): Uint8Array;
}

/* ───────────── bytes ⇄ words ───────────── */

function bytesToWords(bytes: Uint8Array): number[] {
  const words: number[] = [];
  for (let i = 0; i < bytes.length; i++) words[i >>> 2] |= bytes[i] << (24 - (i % 4) * 8);
  for (let i = 0; i < words.length; i++) words[i] = words[i] | 0;
  return words;
}

function wordsToBytes(words: number[], sigBytes: number): Uint8Array {
  const out = new Uint8Array(sigBytes);
  for (let i = 0; i < sigBytes; i++) out[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
  return out;
}

export function createCryptoJS(backend: CryptoBackend) {
  class WordArray {
    words: number[];
    sigBytes: number;
    constructor(words?: number[], sigBytes?: number) {
      this.words = words || [];
      this.sigBytes = sigBytes != null ? sigBytes : this.words.length * 4;
    }
    static create(words?: any, sigBytes?: number): WordArray {
      if (words instanceof ArrayBuffer) return WordArray.fromBytes(new Uint8Array(words));
      if (ArrayBuffer.isView(words)) {
        const v = words as ArrayBufferView;
        return WordArray.fromBytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
      }
      return new WordArray(Array.isArray(words) ? words.slice() : undefined, sigBytes);
    }
    static fromBytes(bytes: Uint8Array): WordArray {
      return new WordArray(bytesToWords(bytes), bytes.length);
    }
    static random(n: number): WordArray {
      return WordArray.fromBytes(backend.random(n));
    }
    bytes(): Uint8Array {
      return wordsToBytes(this.words, this.sigBytes);
    }
    toString(encoder?: any): string {
      return (encoder || Hex).stringify(this);
    }
    concat(other: WordArray): WordArray {
      const merged = new Uint8Array(this.sigBytes + other.sigBytes);
      merged.set(this.bytes(), 0);
      merged.set(other.bytes(), this.sigBytes);
      const w = bytesToWords(merged);
      this.words = w;
      this.sigBytes = merged.length;
      return this;
    }
    clamp(): void {
      const b = this.bytes();
      this.words = bytesToWords(b);
      this.words.length = Math.ceil(this.sigBytes / 4);
    }
    clone(): WordArray {
      return new WordArray(this.words.slice(), this.sigBytes);
    }
  }

  const toWA = (v: any): WordArray => {
    if (v instanceof WordArray) return v;
    if (typeof v === 'string') return Utf8.parse(v);
    if (v && Array.isArray(v.words)) return new WordArray(v.words.slice(), v.sigBytes);
    if (v instanceof ArrayBuffer || ArrayBuffer.isView(v)) return WordArray.create(v);
    return Utf8.parse(String(v ?? ''));
  };

  /* ───────────── encoders ───────────── */

  const Hex = {
    stringify: (wa: WordArray) => Array.from(toWA(wa).bytes(), (b) => b.toString(16).padStart(2, '0')).join(''),
    parse: (hex: string) => {
      const clean = String(hex).replace(/[^0-9a-f]/gi, '');
      const out = new Uint8Array(clean.length >> 1);
      for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
      return WordArray.fromBytes(out);
    },
  };
  const Latin1 = {
    stringify: (wa: WordArray) => {
      let s = '';
      for (const b of toWA(wa).bytes()) s += String.fromCharCode(b);
      return s;
    },
    parse: (str: string) => {
      const s = String(str);
      const out = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
      return WordArray.fromBytes(out);
    },
  };
  const Utf8 = {
    stringify: (wa: WordArray) => {
      try {
        return new TextDecoder('utf-8', { fatal: true }).decode(toWA(wa).bytes());
      } catch {
        throw new Error('Malformed UTF-8 data');
      }
    },
    parse: (str: string) => WordArray.fromBytes(new TextEncoder().encode(String(str))),
  };
  const Utf16LE = {
    stringify: (wa: WordArray) => {
      const b = toWA(wa).bytes();
      let s = '';
      for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(b[i] | (b[i + 1] << 8));
      return s;
    },
    parse: (str: string) => {
      const out = new Uint8Array(str.length * 2);
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        out[i * 2] = c & 0xff;
        out[i * 2 + 1] = c >> 8;
      }
      return WordArray.fromBytes(out);
    },
  };
  const Utf16BE = {
    stringify: (wa: WordArray) => {
      const b = toWA(wa).bytes();
      let s = '';
      for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode((b[i] << 8) | b[i + 1]);
      return s;
    },
    parse: (str: string) => {
      const out = new Uint8Array(str.length * 2);
      for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        out[i * 2] = c >> 8;
        out[i * 2 + 1] = c & 0xff;
      }
      return WordArray.fromBytes(out);
    },
  };
  const b64encode = (bytes: Uint8Array) => {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  };
  const b64decode = (s: string) => {
    const clean = String(s).replace(/\s/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  };
  const Base64 = {
    stringify: (wa: WordArray) => b64encode(toWA(wa).bytes()),
    parse: (s: string) => WordArray.fromBytes(b64decode(s)),
  };
  const Base64url = {
    stringify: (wa: WordArray, urlSafe = true) => {
      const s = b64encode(toWA(wa).bytes());
      return urlSafe ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s;
    },
    parse: (s: string) => WordArray.fromBytes(b64decode(s)),
  };

  /* ───────────── hashes / HMAC ───────────── */

  const makeHasher = (alg: string) => {
    const fn: any = (message: any) => WordArray.fromBytes(backend.hash(alg, toWA(message).bytes()));
    fn.__alg = alg;
    fn.create = () => {
      const parts: Uint8Array[] = [];
      return {
        update(m: any) {
          parts.push(toWA(m).bytes());
          return this;
        },
        finalize(m?: any) {
          if (m != null) parts.push(toWA(m).bytes());
          const total = parts.reduce((n, p) => n + p.length, 0);
          const all = new Uint8Array(total);
          let o = 0;
          for (const p of parts) {
            all.set(p, o);
            o += p.length;
          }
          return fn(WordArray.fromBytes(all));
        },
      };
    };
    return fn;
  };
  const MD5 = makeHasher('md5');
  const SHA1 = makeHasher('sha1');
  const SHA224 = makeHasher('sha224');
  const SHA256 = makeHasher('sha256');
  const SHA384 = makeHasher('sha384');
  const SHA512 = makeHasher('sha512');
  const RIPEMD160 = makeHasher('ripemd160');

  const makeHmac = (alg: string) => (message: any, key: any) =>
    WordArray.fromBytes(backend.hmac(alg, toWA(key).bytes(), toWA(message).bytes()));

  /* ───────────── KDFs ───────────── */

  /** EVP_BytesToKey (OpenSSL), igual ao EvpKDF do crypto-js */
  const evpKdf = (password: Uint8Array, salt: Uint8Array | null, keyBytes: number, ivBytes: number, hashAlg = 'md5', iterations = 1) => {
    const out: number[] = [];
    let prev: Uint8Array = new Uint8Array(0);
    while (out.length < keyBytes + ivBytes) {
      const parts = new Uint8Array(prev.length + password.length + (salt ? salt.length : 0));
      parts.set(prev, 0);
      parts.set(password, prev.length);
      if (salt) parts.set(salt, prev.length + password.length);
      let block = backend.hash(hashAlg, parts);
      for (let i = 1; i < iterations; i++) block = backend.hash(hashAlg, block);
      out.push(...block);
      prev = block;
    }
    return { key: new Uint8Array(out.slice(0, keyBytes)), iv: new Uint8Array(out.slice(keyBytes, keyBytes + ivBytes)) };
  };

  const EvpKDF = (password: any, salt: any, cfg: any = {}) => {
    const keySize = (cfg.keySize ?? 4) * 4;
    const hasher = cfg.hasher?.__alg || 'md5';
    const r = evpKdf(toWA(password).bytes(), salt ? toWA(salt).bytes() : null, keySize, 0, hasher, cfg.iterations || 1);
    return WordArray.fromBytes(r.key);
  };

  const PBKDF2 = (password: any, salt: any, cfg: any = {}) => {
    const keyBytes = (cfg.keySize ?? 4) * 4;
    const digest = cfg.hasher?.__alg || 'sha256';
    const iterations = cfg.iterations ?? 250000;
    return WordArray.fromBytes(backend.pbkdf2(toWA(password).bytes(), toWA(salt).bytes(), iterations, keyBytes, digest));
  };

  /* ───────────── cifras ───────────── */

  const mode = { CBC: { name: 'cbc' }, ECB: { name: 'ecb' }, CTR: { name: 'ctr' }, CFB: { name: 'cfb' }, OFB: { name: 'ofb' } };
  const pad = { Pkcs7: { name: 'pkcs7' }, NoPadding: { name: 'none' }, ZeroPadding: { name: 'zero' }, AnsiX923: { name: 'ansix923' }, Iso10126: { name: 'iso10126' } };

  class CipherParams {
    ciphertext?: WordArray;
    key?: WordArray;
    iv?: WordArray;
    salt?: WordArray;
    formatter: any;
    constructor(p: any) {
      Object.assign(this, p);
      if (!this.formatter) this.formatter = OpenSSLFormat;
    }
    static create(p: any) {
      return new CipherParams(p);
    }
    toString(formatter?: any) {
      return (formatter || this.formatter).stringify(this);
    }
  }

  const SALTED = [0x53, 0x61, 0x6c, 0x74, 0x65, 0x64, 0x5f, 0x5f]; // "Salted__"
  const OpenSSLFormat = {
    stringify(cp: CipherParams) {
      const ct = cp.ciphertext ? cp.ciphertext.bytes() : new Uint8Array(0);
      if (cp.salt) {
        const s = cp.salt.bytes();
        const out = new Uint8Array(8 + s.length + ct.length);
        out.set(SALTED, 0);
        out.set(s, 8);
        out.set(ct, 8 + s.length);
        return b64encode(out);
      }
      return b64encode(ct);
    },
    parse(str: string) {
      const bytes = b64decode(str);
      if (bytes.length >= 16 && SALTED.every((b, i) => bytes[i] === b)) {
        return new CipherParams({ salt: WordArray.fromBytes(bytes.slice(8, 16)), ciphertext: WordArray.fromBytes(bytes.slice(16)) });
      }
      return new CipherParams({ ciphertext: WordArray.fromBytes(bytes) });
    },
  };
  const HexFormat = {
    stringify: (cp: CipherParams) => Hex.stringify(cp.ciphertext!),
    parse: (s: string) => new CipherParams({ ciphertext: Hex.parse(s) }),
  };

  const blockSizeOf = (family: string) => (family === 'aes' ? 16 : 8);

  const applyPad = (data: Uint8Array, padName: string, bs: number): Uint8Array => {
    if (padName === 'zero') {
      const n = data.length % bs === 0 ? 0 : bs - (data.length % bs);
      const out = new Uint8Array(data.length + n);
      out.set(data);
      return out;
    }
    if (padName === 'ansix923' || padName === 'iso10126') {
      const n = bs - (data.length % bs);
      const out = new Uint8Array(data.length + n);
      out.set(data);
      if (padName === 'iso10126') out.set(backend.random(n - 1), data.length);
      out[out.length - 1] = n;
      return out;
    }
    return data;
  };
  const removePad = (data: Uint8Array, padName: string): Uint8Array => {
    if (padName === 'zero') {
      let end = data.length;
      while (end > 0 && data[end - 1] === 0) end--;
      return data.slice(0, end);
    }
    if (padName === 'ansix923' || padName === 'iso10126') {
      const n = data[data.length - 1] || 0;
      return data.slice(0, Math.max(0, data.length - n));
    }
    return data;
  };

  const algName = (family: string, keyLen: number, modeName: string) => {
    if (family === 'aes') return `aes-${keyLen * 8}-${modeName}`;
    if (family === 'tripledes') return modeName === 'ecb' ? 'des-ede3' : `des-ede3-${modeName}`;
    return modeName === 'ecb' ? 'des-ecb' : `des-${modeName}`;
  };

  const makeCipher = (family: 'aes' | 'tripledes' | 'des') => {
    const defaultKeyBytes = family === 'aes' ? 32 : family === 'tripledes' ? 24 : 8;
    const run = (decrypt: boolean, data: Uint8Array, key: Uint8Array, iv: Uint8Array | null, cfg: any) => {
      const modeName: string = cfg?.mode?.name || 'cbc';
      const padName: string = cfg?.padding?.name || 'pkcs7';
      const bs = blockSizeOf(family);
      const streamMode = modeName === 'ctr' || modeName === 'cfb' || modeName === 'ofb';
      let k = key;
      if (family === 'tripledes' && k.length === 16) {
        const k3 = new Uint8Array(24);
        k3.set(k, 0);
        k3.set(k.slice(0, 8), 16);
        k = k3;
      }
      const alg = algName(family, k.length, modeName);
      const ivUse = modeName === 'ecb' ? null : iv || new Uint8Array(bs);
      const autoPadding = !streamMode && padName === 'pkcs7';
      if (!decrypt) {
        const input = streamMode || padName === 'pkcs7' || padName === 'none' ? data : applyPad(data, padName, bs);
        return backend.cipher({ alg, decrypt, key: k, iv: ivUse, data: input, autoPadding });
      }
      let out: Uint8Array;
      try {
        out = backend.cipher({ alg, decrypt, key: k, iv: ivUse, data, autoPadding });
      } catch (err) {
        if (!autoPadding || data.length === 0 || data.length % bs !== 0) throw err;
        // Igual ao crypto-js: chave errada não lança erro — devolve bytes sem sentido
        const raw = backend.cipher({ alg, decrypt, key: k, iv: ivUse, data, autoPadding: false });
        const n = raw[raw.length - 1] || 0;
        return raw.slice(0, Math.max(0, raw.length - n));
      }
      return streamMode || padName === 'pkcs7' || padName === 'none' ? out : removePad(out, padName);
    };

    return {
      encrypt(message: any, key: any, cfg: any = {}) {
        const data = toWA(message).bytes();
        if (typeof key === 'string') {
          const salt = cfg.salt ? toWA(cfg.salt).bytes() : backend.random(8);
          const d = evpKdf(new TextEncoder().encode(key), salt, defaultKeyBytes, blockSizeOf(family));
          const ct = run(false, data, d.key, d.iv, cfg);
          return new CipherParams({
            ciphertext: WordArray.fromBytes(ct),
            key: WordArray.fromBytes(d.key),
            iv: WordArray.fromBytes(d.iv),
            salt: WordArray.fromBytes(salt),
            formatter: cfg.format,
          });
        }
        const k = toWA(key).bytes();
        const iv = cfg.iv ? toWA(cfg.iv).bytes() : null;
        const ct = run(false, data, k, iv, cfg);
        return new CipherParams({ ciphertext: WordArray.fromBytes(ct), key: toWA(key), iv: cfg.iv ? toWA(cfg.iv) : undefined, formatter: cfg.format });
      },
      decrypt(ciphertext: any, key: any, cfg: any = {}) {
        const fmt = cfg.format || OpenSSLFormat;
        const cp: CipherParams =
          typeof ciphertext === 'string' ? fmt.parse(ciphertext) : ciphertext instanceof CipherParams ? ciphertext : new CipherParams(ciphertext);
        const data = cp.ciphertext ? toWA(cp.ciphertext).bytes() : new Uint8Array(0);
        if (typeof key === 'string') {
          const d = evpKdf(new TextEncoder().encode(key), cp.salt ? toWA(cp.salt).bytes() : null, defaultKeyBytes, blockSizeOf(family));
          return WordArray.fromBytes(run(true, data, d.key, d.iv, cfg));
        }
        const iv = cfg.iv ? toWA(cfg.iv).bytes() : null;
        return WordArray.fromBytes(run(true, data, toWA(key).bytes(), iv, cfg));
      },
    };
  };

  const CryptoJS: any = {
    lib: { WordArray, CipherParams },
    enc: { Hex, Latin1, Utf8, Utf16: Utf16BE, Utf16BE, Utf16LE, Base64, Base64url },
    format: { OpenSSL: OpenSSLFormat, Hex: HexFormat },
    mode,
    pad,
    algo: { MD5, SHA1, SHA224, SHA256, SHA384, SHA512, RIPEMD160 },
    MD5,
    SHA1,
    SHA224,
    SHA256,
    SHA384,
    SHA512,
    RIPEMD160,
    HmacMD5: makeHmac('md5'),
    HmacSHA1: makeHmac('sha1'),
    HmacSHA224: makeHmac('sha224'),
    HmacSHA256: makeHmac('sha256'),
    HmacSHA384: makeHmac('sha384'),
    HmacSHA512: makeHmac('sha512'),
    HmacRIPEMD160: makeHmac('ripemd160'),
    EvpKDF,
    PBKDF2,
    AES: makeCipher('aes'),
    TripleDES: makeCipher('tripledes'),
    DES: makeCipher('des'),
  };
  return CryptoJS;
}
