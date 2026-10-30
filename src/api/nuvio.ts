// src/api/nuvio.ts
// Integração com os plugins do Nuvio (https://nuvio.tv).
//
// - Repositórios: o usuário cola o link do manifest.json (igual no app Nuvio) e os
//   plugins ("scrapers") ficam listados com liga/desliga individual.
// - Catálogo: vem do Cinemeta (o mesmo catálogo de metadados do Stremio), que já traz
//   o ID do TMDB que os plugins usam para buscar os links.
// - Os plugins rodam no processo principal, numa janela isolada (veja electron/nuvio).

import type { NuvioStream } from '../../electron/preload';
import { t } from '../i18n';

export type { NuvioStream };

export const NUVIO_EVENT = 'tomodachi:nuvio-changed';
const KEY = 'tp_nuvio';
const CINEMETA = 'https://v3-cinemeta.strem.io';

/* ───────────────────────── Repositórios ───────────────────────── */

export interface NuvioScraper {
  id: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  supportedTypes: string[];
  filename: string;
  codeUrl: string;
  /** Padrão do manifesto */
  enabled: boolean;
  formats?: string[];
  logo?: string;
  contentLanguage?: string[];
  limited?: boolean;
}

export interface NuvioRepo {
  url: string;
  name: string;
  author?: string;
  version?: string;
  scrapers: NuvioScraper[];
  addedAt: number;
  updatedAt: number;
  error?: string;
}

/* ───────────────────────── Addons do Stremio ───────────────────────── */

export interface StremioResource {
  name: string;
  types?: string[];
  idPrefixes?: string[];
}

export interface StremioCatalog {
  type: string;
  id: string;
  name?: string;
  /** extras aceitos (search, genre, skip) e obrigatórios */
  extra: { name: string; isRequired?: boolean; options?: string[] }[];
}

export interface StremioAddon {
  /** Link do manifest.json */
  url: string;
  /** Endereço base (sem /manifest.json) */
  base: string;
  id: string;
  name: string;
  version?: string;
  description?: string;
  logo?: string;
  types: string[];
  idPrefixes?: string[];
  resources: StremioResource[];
  catalogs: StremioCatalog[];
  enabled: boolean;
  addedAt: number;
  updatedAt: number;
  error?: string;
}

interface NuvioState {
  repos: NuvioRepo[];
  addons: StremioAddon[];
  /** Liga/desliga individual (chave repoUrl#id), sobrescreve o padrão do manifesto */
  overrides: Record<string, boolean>;
  /** Interruptor geral */
  enabled: boolean;
}

export function getNuvioState(): NuvioState {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return {
      repos: Array.isArray(s.repos) ? s.repos : [],
      addons: Array.isArray(s.addons) ? s.addons : [],
      overrides: s.overrides && typeof s.overrides === 'object' ? s.overrides : {},
      enabled: s.enabled !== false,
    };
  } catch {
    return { repos: [], addons: [], overrides: {}, enabled: true };
  }
}

function saveState(next: NuvioState) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* cota */
  }
  try {
    window.dispatchEvent(new CustomEvent(NUVIO_EVENT));
  } catch {
    /* ignore */
  }
}

export const scraperKey = (repoUrl: string, id: string) => `${repoUrl}#${id}`;

export function isScraperEnabled(state: NuvioState, repo: NuvioRepo, s: NuvioScraper): boolean {
  const o = state.overrides[scraperKey(repo.url, s.id)];
  return o === undefined ? s.enabled !== false : o;
}

export function setScraperEnabled(repoUrl: string, id: string, enabled: boolean) {
  const st = getNuvioState();
  st.overrides = { ...st.overrides, [scraperKey(repoUrl, id)]: enabled };
  saveState(st);
}

export function setRepoScrapersEnabled(repoUrl: string, enabled: boolean) {
  const st = getNuvioState();
  const repo = st.repos.find((r) => r.url === repoUrl);
  if (!repo) return;
  const overrides = { ...st.overrides };
  for (const s of repo.scrapers) overrides[scraperKey(repoUrl, s.id)] = enabled;
  st.overrides = overrides;
  saveState(st);
}

export function setNuvioEnabled(enabled: boolean) {
  const st = getNuvioState();
  st.enabled = enabled;
  saveState(st);
}

/** Aceita link do GitHub (página ou "raw"), com ou sem /manifest.json */
export function normalizeManifestUrl(input: string): string {
  let u = String(input || '').trim();
  if (!u) return '';
  // Links "stremio://…" (botão Instalar dos sites de addons) são https
  u = u.replace(/^stremio:\/\//i, 'https://');
  if (!/^https?:\/\//i.test(u)) u = `https://${u}`;
  try {
    const url = new URL(u);
    if (url.hostname === 'github.com') {
      const parts = url.pathname.split('/').filter(Boolean);
      // github.com/usuario/repo/blob/branch/caminho → raw
      if (parts.length >= 5 && (parts[2] === 'blob' || parts[2] === 'raw')) {
        return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/${parts.slice(3).join('/')}`;
      }
      // github.com/usuario/repo(/tree/branch) → manifest.json na raiz
      if (parts.length >= 2) {
        const branch = parts[2] === 'tree' && parts[3] ? parts[3] : 'main';
        return `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/refs/heads/${branch}/manifest.json`;
      }
    }
    if (!/\.json($|\?)/i.test(url.pathname + url.search) && !url.pathname.endsWith('.json')) {
      url.pathname = url.pathname.replace(/\/+$/, '') + '/manifest.json';
    }
    return url.toString();
  } catch {
    return u;
  }
}

async function fetchText(url: string): Promise<string> {
  const api = window.electronAPI;
  if (api?.nuvioFetchText) {
    const res = await api.nuvioFetchText(url);
    if (!res?.success || typeof res.text !== 'string') throw new Error(res?.error || (res?.status ? `HTTP ${res.status}` : t('Sem resposta')));
    return res.text;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
}

// Catálogos e detalhes (Cinemeta e addons) mudam pouco: guarda 10 min e junta pedidos iguais
const JSON_TTL = 10 * 60 * 1000;
const jsonCache = new Map<string, { at: number; data: any }>();
const jsonInflight = new Map<string, Promise<any>>();
const cacheable = (url: string) => /\/(?:catalog|meta)\//.test(url);

async function fetchJsonNow<T>(url: string): Promise<T> {
  const text = await fetchText(url);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(t('Resposta inválida (não é JSON)'));
  }
}

export async function fetchJson<T = any>(url: string): Promise<T> {
  if (!cacheable(url)) return fetchJsonNow<T>(url);
  const hit = jsonCache.get(url);
  if (hit && Date.now() - hit.at < JSON_TTL) return hit.data as T;
  const running = jsonInflight.get(url);
  if (running) return running as Promise<T>;
  const job = fetchJsonNow<T>(url)
    .then((data) => {
      jsonCache.set(url, { at: Date.now(), data });
      if (jsonCache.size > 150) jsonCache.delete(jsonCache.keys().next().value as string);
      return data;
    })
    .finally(() => jsonInflight.delete(url));
  jsonInflight.set(url, job);
  return job;
}

function parseManifest(raw: any, manifestUrl: string): Omit<NuvioRepo, 'addedAt' | 'updatedAt'> {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.scrapers)) {
    throw new Error(t('Este link não é um repositório de plugins do Nuvio (manifest.json sem "scrapers").'));
  }
  const scrapers: NuvioScraper[] = [];
  for (const s of raw.scrapers) {
    if (!s || typeof s !== 'object' || !s.id || !s.filename) continue;
    let codeUrl = '';
    try {
      codeUrl = new URL(String(s.filename), manifestUrl).toString();
    } catch {
      continue;
    }
    scrapers.push({
      id: String(s.id),
      name: String(s.name || s.id),
      description: s.description ? String(s.description) : undefined,
      version: s.version ? String(s.version) : undefined,
      author: s.author ? String(s.author) : undefined,
      supportedTypes: Array.isArray(s.supportedTypes) ? s.supportedTypes.map(String) : ['movie', 'tv'],
      filename: String(s.filename),
      codeUrl,
      enabled: s.enabled !== false,
      formats: Array.isArray(s.formats) ? s.formats.map(String) : undefined,
      logo: typeof s.logo === 'string' ? s.logo : undefined,
      contentLanguage: Array.isArray(s.contentLanguage) ? s.contentLanguage.map(String) : undefined,
      limited: !!s.limited,
    });
  }
  if (scrapers.length === 0) throw new Error(t('O repositório não tem plugins válidos.'));
  return {
    url: manifestUrl,
    name: String(raw.name || new URL(manifestUrl).hostname),
    author: raw.author ? String(raw.author) : undefined,
    version: raw.version ? String(raw.version) : undefined,
    scrapers,
  };
}

/** Instala (ou atualiza) um repositório a partir do link do manifest.json */
export async function addNuvioRepo(input: string): Promise<NuvioRepo> {
  const url = normalizeManifestUrl(input);
  if (!/^https?:\/\//i.test(url)) throw new Error(t('Link inválido'));
  let raw: any;
  try {
    raw = await fetchJson(url);
  } catch (err: any) {
    // github.com/usuario/repo sem branch "main": tenta "master"
    if (/\/refs\/heads\/main\/manifest\.json$/.test(url)) raw = await fetchJson(url.replace('/refs/heads/main/', '/refs/heads/master/'));
    else throw err;
  }
  const parsed = parseManifest(raw, url);
  const st = getNuvioState();
  const now = Date.now();
  const existing = st.repos.find((r) => r.url === url);
  const repo: NuvioRepo = { ...parsed, addedAt: existing?.addedAt || now, updatedAt: now };
  st.repos = existing ? st.repos.map((r) => (r.url === url ? repo : r)) : [...st.repos, repo];
  saveState(st);
  return repo;
}

export async function refreshNuvioRepos(): Promise<{ updated: number; failed: number }> {
  const st = getNuvioState();
  let updated = 0;
  let failed = 0;
  const repos = await Promise.all(
    st.repos.map(async (r) => {
      try {
        const parsed = parseManifest(await fetchJson(r.url), r.url);
        updated++;
        return { ...r, ...parsed, updatedAt: Date.now(), error: undefined };
      } catch (err: any) {
        failed++;
        return { ...r, error: String(err?.message || err) };
      }
    })
  );
  saveState({ ...getNuvioState(), repos });
  return { updated, failed };
}

export function removeNuvioRepo(url: string) {
  const st = getNuvioState();
  st.repos = st.repos.filter((r) => r.url !== url);
  st.overrides = Object.fromEntries(Object.entries(st.overrides).filter(([k]) => !k.startsWith(`${url}#`)));
  saveState(st);
}

const PLAYABLE_FORMATS = new Set(['mp4', 'mkv', 'm3u8', 'hls', 'webm', 'mov', 'avi', 'm4v', 'ts']);

/** O plugin entrega algum formato que o player toca? (sem "formats" no manifesto = assume que sim) */
export function scraperSupported(s: Pick<NuvioScraper, 'formats'>): boolean {
  if (!s.formats || s.formats.length === 0) return true;
  return s.formats.some((f) => PLAYABLE_FORMATS.has(String(f).toLowerCase()));
}

/** Plugins ligados que aceitam o tipo pedido */
export function activeScrapers(mediaType: 'movie' | 'tv'): { repo: NuvioRepo; scraper: NuvioScraper }[] {
  const st = getNuvioState();
  if (!st.enabled) return [];
  const out: { repo: NuvioRepo; scraper: NuvioScraper }[] = [];
  const seen = new Set<string>();
  for (const repo of st.repos) {
    for (const s of repo.scrapers) {
      if (!isScraperEnabled(st, repo, s) || !scraperSupported(s)) continue;
      const types = s.supportedTypes.map((x) => x.toLowerCase());
      if (types.length && !types.includes(mediaType) && !(mediaType === 'tv' && (types.includes('series') || types.includes('anime')))) continue;
      const k = `${s.id}|${s.codeUrl}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ repo, scraper: s });
    }
  }
  return out;
}

/* ───────────────────────── Catálogo (Cinemeta) ───────────────────────── */

export type NuvioType = 'movie' | 'series';

export interface NuvioMetaPreview {
  id: string; // IMDb (tt…) ou ID do addon
  /** Addon que forneceu o item (catálogos de addons) */
  addonUrl?: string;
  type: NuvioType;
  name: string;
  poster?: string;
  year?: string;
  imdbRating?: string;
  genres?: string[];
}

export interface NuvioEpisode {
  id: string;
  season: number;
  episode: number;
  name: string;
  overview?: string;
  thumbnail?: string;
  released?: string;
}

export interface NuvioMeta extends NuvioMetaPreview {
  tmdbId?: string;
  /** ID do IMDb quando a obra veio de outro catálogo (addons usam para buscar links) */
  imdbAlt?: string;
  description?: string;
  background?: string;
  logo?: string;
  runtime?: string;
  status?: string;
  cast?: string[];
  director?: string[];
  releaseInfo?: string;
  episodes: NuvioEpisode[];
}

const enc = (v: string) => encodeURIComponent(v).replace(/%20/g, '%20');

export async function nuvioCatalog(type: NuvioType, opts: { search?: string; genre?: string; skip?: number } = {}): Promise<NuvioMetaPreview[]> {
  const extras: string[] = [];
  if (opts.search?.trim()) extras.push(`search=${enc(opts.search.trim())}`);
  else {
    if (opts.genre) extras.push(`genre=${enc(opts.genre)}`);
    if (opts.skip) extras.push(`skip=${opts.skip}`);
  }
  const url = `${CINEMETA}/catalog/${type}/top${extras.length ? '/' + extras.join('&') : ''}.json`;
  const data = await fetchJson<{ metas?: any[] }>(url);
  return (data.metas || [])
    .filter((m) => m && typeof m.id === 'string' && m.id.startsWith('tt'))
    .map((m) => ({
      id: m.id,
      type,
      name: String(m.name || ''),
      poster: m.poster || undefined,
      year: m.releaseInfo || m.year || undefined,
      imdbRating: m.imdbRating || undefined,
      genres: Array.isArray(m.genres) ? m.genres : Array.isArray(m.genre) ? m.genre : undefined,
    }));
}

export async function nuvioMeta(type: NuvioType, imdbId: string, addonUrl?: string): Promise<NuvioMeta> {
  let m: any = null;
  let source: StremioAddon | undefined;
  if (/^tt\d+$/.test(imdbId)) {
    try {
      m = (await fetchJson<{ meta?: any }>(`${CINEMETA}/meta/${type}/${encodeURIComponent(imdbId)}.json`)).meta;
    } catch (err) {
      if (!addonsFor('meta', type, imdbId).length) throw err;
    }
  }
  if (!m) {
    // Obras de catálogos de addons (ex.: Kitsu): os detalhes vêm do próprio addon
    const candidates = addonsFor('meta', type, imdbId);
    const ordered = addonUrl ? [...candidates.filter((a) => a.url === addonUrl), ...candidates.filter((a) => a.url !== addonUrl)] : candidates;
    for (const a of ordered) {
      try {
        m = (await fetchJson<{ meta?: any }>(`${a.base}/meta/${addonTypeFor(a, 'meta', type)}/${encodeURIComponent(imdbId)}.json`)).meta;
        if (m) {
          source = a;
          break;
        }
      } catch {
        /* próximo addon */
      }
    }
  }
  if (!m) throw new Error(t('Obra não encontrada no catálogo'));
  const rawVideos: any[] = Array.isArray(m.videos) ? m.videos : [];
  const allHaveSeason = rawVideos.every((v) => v && v.season != null);
  const episodes: NuvioEpisode[] = rawVideos
    .map((v: any, i: number) => ({
      id: String(v.id || ''),
      // Addons de anime às vezes não mandam temporada: tudo vira temporada 1
      season: allHaveSeason ? Number(v.season ?? 0) : 1,
      episode: Number(v.episode ?? v.number ?? i + 1),
      name: String(v.name || v.title || ''),
      overview: v.overview || v.description || undefined,
      thumbnail: v.thumbnail || undefined,
      released: v.released || v.firstAired || undefined,
    }))
    .filter((v: NuvioEpisode) => v.episode > 0)
    .sort((a: NuvioEpisode, b: NuvioEpisode) => a.season - b.season || a.episode - b.episode);
  return {
    id: /^tt\d+$/.test(imdbId) ? m.imdb_id || imdbId : imdbId,
    addonUrl: source?.url || addonUrl,
    type,
    name: String(m.name || ''),
    poster: m.poster || undefined,
    background: m.background || undefined,
    logo: m.logo || undefined,
    year: m.releaseInfo || m.year || undefined,
    imdbRating: m.imdbRating || undefined,
    genres: Array.isArray(m.genres) ? m.genres : Array.isArray(m.genre) ? m.genre : [],
    description: m.description || undefined,
    runtime: m.runtime || undefined,
    status: m.status || undefined,
    cast: Array.isArray(m.cast) ? m.cast : undefined,
    director: Array.isArray(m.director) ? m.director : undefined,
    releaseInfo: m.releaseInfo || undefined,
    tmdbId: m.moviedb_id != null ? String(m.moviedb_id) : undefined,
    imdbAlt: typeof m.imdb_id === 'string' && /^tt\d+$/.test(m.imdb_id) ? m.imdb_id : undefined,
    episodes,
  };
}

export const NUVIO_GENRES = [
  'Action',
  'Adventure',
  'Animation',
  'Comedy',
  'Crime',
  'Documentary',
  'Drama',
  'Family',
  'Fantasy',
  'History',
  'Horror',
  'Mystery',
  'Romance',
  'Sci-Fi',
  'Thriller',
];

/* ───────────────────────── Biblioteca ───────────────────────── */

// IDs que não são do IMDb (ex.: "kitsu:123" de addons) vão codificados, sem ":"
const encId = (id: string) => encodeURIComponent(id);
export const nuvioWorkUrl = (type: NuvioType, id: string) => `nuvio:${type}:${encId(id)}`;
export const nuvioEpisodeUrl = (id: string, season: number, episode: number) => `nuvio:series:${encId(id)}:${season}:${episode}`;
export const nuvioMovieUrl = (id: string) => `nuvio:movie:${encId(id)}`;

/** `imdbId` é o ID da obra no catálogo (IMDb "tt…" ou o ID do addon, ex.: "kitsu:123") */
export function parseNuvioUrl(url: string): { type: NuvioType; imdbId: string; season?: number; episode?: number } | null {
  const m = /^nuvio:(movie|series):([^:]+)(?::(\d+):(\d+))?$/.exec(String(url || ''));
  if (!m) return null;
  let id = m[2];
  try {
    id = decodeURIComponent(id);
  } catch {
    /* mantém */
  }
  return { type: m[1] as NuvioType, imdbId: id, season: m[3] ? Number(m[3]) : undefined, episode: m[4] ? Number(m[4]) : undefined };
}

export function nuvioChapters(meta: NuvioMeta) {
  if (meta.type === 'movie') return [{ url: nuvioMovieUrl(meta.id), name: meta.name, number: 1, read: false }];
  return meta.episodes
    .filter((e) => e.season > 0)
    .map((e, i) => ({
      url: nuvioEpisodeUrl(meta.id, e.season, e.episode),
      name: t('T{s} E{e}', { s: e.season, e: e.episode }) + (e.name ? ` · ${e.name}` : ''),
      number: i + 1,
      season: e.season,
      episode: e.episode,
      dateUpload: e.released ? Date.parse(e.released) || undefined : undefined,
      read: false,
    }));
}

/** Converte para o formato da biblioteca do Tomodachi */
export function nuvioLibraryItem(meta: NuvioMeta) {
  const statusText = (meta.status || '').toLowerCase();
  return {
    source: 'nuvio',
    sourceName: 'Nuvio',
    url: nuvioWorkUrl(meta.type, meta.id),
    title: meta.name,
    author: (meta.director || []).join(', '),
    description: meta.description || '',
    genres: meta.genres || [],
    status: statusText.includes('ended') ? 2 : statusText ? 1 : meta.type === 'movie' ? 2 : 0,
    cover: meta.poster || '',
    background: meta.background,
    dateAdded: Date.now(),
    favorite: true,
    categories: [] as string[],
    // Só episódios já lançados (os próximos aparecem em "Atualizar")
    chapters: nuvioChapters(meta).filter((c: any) => !c.dateUpload || c.dateUpload <= Date.now()),
    nuvio: { type: meta.type, imdbId: meta.id, tmdbId: meta.tmdbId, addonUrl: meta.addonUrl },
  };
}

/** Tags sugeridas ao favoritar: tipo da obra + gêneros que batem com tags existentes */
export function suggestNuvioTags(meta: Pick<NuvioMeta, 'type' | 'genres'>, existing: string[]): string[] {
  const out: string[] = [];
  const isAnime = (meta.genres || []).some((g) => /anima/i.test(g));
  out.push(isAnime ? t('Animes') : meta.type === 'movie' ? t('Filmes') : t('Séries'));
  const lower = new Map(existing.map((c) => [c.toLowerCase(), c]));
  for (const g of meta.genres || []) {
    const hit = lower.get(String(g).toLowerCase());
    if (hit && !out.includes(hit)) out.push(hit);
  }
  return out;
}

/* ───────────────────────── Fontes (streams) ───────────────────────── */

export interface ScraperRun {
  key: string;
  repoName: string;
  scraper: NuvioScraper;
  /** 'addon' = addon do Stremio */
  kind?: 'plugin' | 'addon';
  status: 'running' | 'done' | 'error';
  streams: NuvioStream[];
  /** Links de torrent ignorados (motor de torrent indisponível) */
  skippedTorrents?: number;
  error?: string;
  ms?: number;
}

export interface StreamRequest {
  /** Plugins do Nuvio precisam do TMDB */
  tmdbId?: string;
  /** Addons do Stremio: ID do vídeo (ex.: "tt123", "tt123:1:2", "kitsu:5:3") */
  stremioId?: string;
  mediaType: 'movie' | 'tv';
  season?: number | null;
  episode?: number | null;
  /** Só estes addons (ex.: os que aceitam apenas IDs do Kitsu) */
  addonFilter?: (a: StremioAddon) => boolean;
}

/** Roda os plugins e addons ligados em paralelo e avisa a cada resultado */
export function runNuvioScrapers(req: StreamRequest, onUpdate: (runs: ScraperRun[]) => void, signal?: { cancelled: boolean }): Promise<ScraperRun[]> {
  const stremioType = req.mediaType === 'movie' ? 'movie' : 'series';
  const list = req.tmdbId ? activeScrapers(req.mediaType) : [];
  const addons = req.stremioId ? addonsFor('stream', stremioType, req.stremioId).filter((a) => !req.addonFilter || req.addonFilter(a)) : [];
  const runs: ScraperRun[] = [
    ...addons.map((a) => ({
      key: `addon:${a.url}`,
      repoName: a.name,
      kind: 'addon' as const,
      scraper: { id: a.id, name: a.name, logo: a.logo, supportedTypes: a.types, filename: '', codeUrl: a.url, enabled: true, version: a.version },
      status: 'running' as const,
      streams: [],
    })),
    ...list.map(({ repo, scraper }) => ({
      key: scraperKey(repo.url, scraper.id),
      repoName: repo.name,
      kind: 'plugin' as const,
      scraper,
      status: 'running' as const,
      streams: [],
    })),
  ];
  onUpdate([...runs]);
  const api = window.electronAPI;
  const torrentReady = checkTorrentSupport();

  const runOne = async (run: ScraperRun) => {
    await torrentReady;
    if (run.kind === 'addon') {
      const addon = addons.find((a) => `addon:${a.url}` === run.key)!;
      const started = Date.now();
      const res = await fetchAddonStreams(addon, stremioType, req.stremioId!);
      run.status = 'done';
      run.streams = res.streams.filter(isPlayableStream);
      run.skippedTorrents = res.streams.filter((s) => isTorrentStream(s) && !isPlayableStream(s)).length;
      run.ms = Date.now() - started;
      return;
    }
    if (!api?.nuvioRunScraper) throw new Error(t('Disponível apenas no aplicativo para Windows'));
    const res = await api.nuvioRunScraper({
      id: run.scraper.id,
      codeUrl: run.scraper.codeUrl,
      version: run.scraper.version,
      tmdbId: req.tmdbId!,
      mediaType: req.mediaType,
      season: req.season ?? null,
      episode: req.episode ?? null,
    });
    if (res?.success) {
      run.status = 'done';
      run.streams = (res.streams || []).filter((s) => s && isPlayableStream(s));
    } else {
      run.status = 'error';
      run.error = res?.error || t('Falha no plugin');
    }
    run.ms = res?.ms;
  };

  // Até 6 ao mesmo tempo
  let next = 0;
  const worker = async () => {
    while (next < runs.length) {
      const run = runs[next++];
      if (signal?.cancelled) return;
      try {
        await runOne(run);
      } catch (err: any) {
        run.status = 'error';
        run.error = String(err?.message || err);
      }
      if (signal?.cancelled) return;
      onUpdate([...runs]);
    }
  };
  return Promise.all(Array.from({ length: Math.min(6, runs.length) }, worker)).then(() => runs);
}

/* ───────────────────────── Torrents ───────────────────────── */

let torrentSupport: boolean | null = null;
let torrentCheck: Promise<boolean> | null = null;

/** O motor de torrent do app está funcionando? (verifica uma vez e guarda) */
export function checkTorrentSupport(): Promise<boolean> {
  if (torrentSupport != null) return Promise.resolve(torrentSupport);
  if (torrentCheck) return torrentCheck;
  const api = window.electronAPI;
  if (!api?.torrentAvailable) {
    torrentSupport = false;
    return Promise.resolve(false);
  }
  torrentCheck = api
    .torrentAvailable()
    .then((r) => !!r?.available)
    .catch(() => false)
    .then((ok) => {
      torrentSupport = ok;
      torrentCheck = null;
      return ok;
    });
  return torrentCheck;
}

export const isTorrentStream = (s: Pick<NuvioStream, 'url' | 'type'>) => !!s && (s.type === 'torrent' || /^magnet:\?/i.test(String(s.url || '')));

/** Hash do torrent (para o status de peers) */
export const torrentHashOf = (url: string) => (/xt=urn:btih:([a-z0-9]+)/i.exec(url)?.[1] || '').toLowerCase();

/**
 * Só mostramos links que o player do Tomodachi consegue tocar:
 * HTTP(S) direto (MP4/MKV/WebM…), HLS e torrents (quando o motor de torrent está ativo).
 * Ficam de fora DASH (.mpd), páginas externas e YouTube.
 */
export function isPlayableStream(s: Pick<NuvioStream, 'url' | 'type'>): boolean {
  if (!s || typeof s.url !== 'string') return false;
  if (isTorrentStream(s)) return torrentSupport === true && /^magnet:\?/i.test(s.url);
  if (!/^https?:\/\//i.test(s.url)) return false;
  if (s.type === 'external') return false;
  const path = s.url.split(/[?#]/)[0].toLowerCase();
  if (/\.(mpd|torrent|ism|f4m)$/.test(path)) return false;
  if (/(^|\.)(youtube\.com|youtu\.be)\//.test(s.url.replace(/^https?:\/\//i, ''))) return false;
  return true;
}

/** Qualidade como número (para ordenar: 4K > 1080p > 720p…) */
export function qualityRank(q?: string): number {
  const s = String(q || '').toLowerCase();
  if (/2160|4k|uhd/.test(s)) return 2160;
  const m = s.match(/(\d{3,4})p/);
  if (m) return Number(m[1]);
  if (/cam|ts\b/.test(s)) return 100;
  return 0;
}

export const isHlsStream = (s: NuvioStream) => /m3u8/i.test(s.url) || /hls/i.test(s.type || '');

/** Prepara o stream (cabeçalhos exigidos) e abre no player */
export async function playNuvioStream(
  stream: NuvioStream,
  ctx: { title: string; episodeUrl: string; stremio?: { type: NuvioType; id: string }; work?: { title?: string; url?: string; cover?: string } },
  onOpenTab?: (type: any, title: string, data?: any) => void
) {
  if (!onOpenTab) return;
  // Links para páginas (ex.: YouTube ou a página de um vídeo): o player do app acha o vídeo nelas e toca aqui dentro
  if (stream.type === 'external') {
    onOpenTab('video-player', ctx.title, {
      filePath: stream.url,
      title: ctx.title,
      item: { path: stream.url, name: ctx.title },
      episodeUrl: ctx.episodeUrl,
      stremio: ctx.stremio ? { type: ctx.stremio.type, id: ctx.stremio.id } : undefined,
      work: ctx.work,
    });
    return;
  }
  const torrent = isTorrentStream(stream);
  // Legendas dos addons de legenda (ex.: OpenSubtitles)
  let subtitles = stream.subtitles || [];
  if (ctx.stremio) {
    try {
      const extra = await fetchAddonSubtitles(ctx.stremio.type, ctx.stremio.id);
      subtitles = [...subtitles, ...extra];
    } catch {
      /* sem legendas extras */
    }
    // Legendas online do OpenSubtitles (sem chave), para não precisar baixar arquivo
    if (/^tt\d+/.test(ctx.stremio.id)) {
      try {
        const data = await Promise.race([
          fetchJson<{ subtitles?: any[] }>(`https://opensubtitles-v3.strem.io/subtitles/${ctx.stremio.type}/${encodeURIComponent(ctx.stremio.id)}.json`),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
        ]);
        for (const x of data.subtitles || []) {
          if (x && typeof x.url === 'string' && !subtitles.some((y) => y.url === x.url)) subtitles.push({ url: x.url, language: x.lang, name: `${x.lang || ''} · OpenSubtitles` });
        }
      } catch {
        /* sem OpenSubtitles */
      }
    }
  }
  try {
    if (!torrent && stream.headers && window.electronAPI?.nuvioRegisterStream) await window.electronAPI.nuvioRegisterStream(stream.url, stream.headers);
  } catch {
    /* segue sem cabeçalhos */
  }
  const referer = stream.headers?.Referer || stream.headers?.referer;
  onOpenTab('video-player', ctx.title, {
    // Torrent: a aba abre já e o player espera o motor preparar o arquivo
    torrent: torrent ? { magnet: stream.url, fileIdx: stream.fileIdx ?? null, sources: stream.sources, filename: stream.filename, label: stream.title || stream.name } : undefined,
    filePath: stream.url,
    title: ctx.title,
    item: { path: stream.url, name: ctx.title },
    episodeUrl: ctx.episodeUrl,
    directStream: true,
    streamReferer: referer,
    subtitles: subtitles.length ? subtitles.slice(0, 80) : undefined,
    stremio: ctx.stremio ? { type: ctx.stremio.type, id: ctx.stremio.id } : undefined,
    work: ctx.work,
  });
}

/* ───────────────────────── Addons do Stremio: instalação e chamadas ───────────────────────── */

const addonBase = (manifestUrl: string) => manifestUrl.replace(/\/manifest\.json(\?.*)?$/i, '').replace(/\/+$/, '');

function parseStremioManifest(raw: any, manifestUrl: string): Omit<StremioAddon, 'addedAt' | 'updatedAt' | 'enabled'> {
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.name || !Array.isArray(raw.resources)) {
    throw new Error(t('Este link não é um addon do Stremio (manifest.json sem "resources").'));
  }
  const resources: StremioResource[] = raw.resources
    .map((r: any) =>
      typeof r === 'string'
        ? { name: r }
        : r && typeof r.name === 'string'
          ? { name: r.name, types: Array.isArray(r.types) ? r.types.map(String) : undefined, idPrefixes: Array.isArray(r.idPrefixes) ? r.idPrefixes.map(String) : undefined }
          : null
    )
    .filter(Boolean);
  const catalogs: StremioCatalog[] = (Array.isArray(raw.catalogs) ? raw.catalogs : [])
    .filter((c: any) => c && c.type && c.id)
    .map((c: any) => {
      const extra: StremioCatalog['extra'] = Array.isArray(c.extra)
        ? c.extra.filter((e: any) => e && e.name).map((e: any) => ({ name: String(e.name), isRequired: !!e.isRequired, options: Array.isArray(e.options) ? e.options.map(String) : undefined }))
        : [];
      // formato antigo: extraSupported / extraRequired
      for (const n of Array.isArray(c.extraSupported) ? c.extraSupported : []) if (!extra.some((e) => e.name === n)) extra.push({ name: String(n), isRequired: (c.extraRequired || []).includes(n) });
      return { type: String(c.type), id: String(c.id), name: c.name ? String(c.name) : undefined, extra };
    });
  return {
    url: manifestUrl,
    base: addonBase(manifestUrl),
    id: String(raw.id),
    name: String(raw.name),
    version: raw.version ? String(raw.version) : undefined,
    description: raw.description ? String(raw.description) : undefined,
    logo: typeof raw.logo === 'string' ? raw.logo : undefined,
    types: Array.isArray(raw.types) ? raw.types.map(String) : [],
    idPrefixes: Array.isArray(raw.idPrefixes) ? raw.idPrefixes.map(String) : undefined,
    resources,
    catalogs,
  };
}

function saveAddon(parsed: Omit<StremioAddon, 'addedAt' | 'updatedAt' | 'enabled'>): StremioAddon {
  const st = getNuvioState();
  const now = Date.now();
  const existing = st.addons.find((a) => a.url === parsed.url);
  const addon: StremioAddon = { ...parsed, enabled: existing?.enabled ?? true, addedAt: existing?.addedAt || now, updatedAt: now };
  st.addons = existing ? st.addons.map((a) => (a.url === parsed.url ? addon : a)) : [...st.addons, addon];
  saveState(st);
  return addon;
}

export type InstallResult = { kind: 'repo'; repo: NuvioRepo } | { kind: 'addon'; addon: StremioAddon };

/** Instala pelo link: repositório de plugins do Nuvio ou addon do Stremio (detecta sozinho) */
export async function installFromLink(input: string): Promise<InstallResult> {
  const url = normalizeManifestUrl(input);
  if (!/^https?:\/\//i.test(url)) throw new Error(t('Link inválido'));
  let raw: any;
  try {
    raw = await fetchJson(url);
  } catch (err) {
    if (/\/refs\/heads\/main\/manifest\.json$/.test(url)) return { kind: 'repo', repo: await addNuvioRepo(input) };
    throw err;
  }
  if (raw && Array.isArray(raw.scrapers)) return { kind: 'repo', repo: await addNuvioRepo(input) };
  return { kind: 'addon', addon: saveAddon(parseStremioManifest(raw, url)) };
}

/**
 * Importa um arquivo .json:
 * - lista de addons exportada (Stremio / gerenciadores): [{ transportUrl, manifest }, …]
 * - manifesto de addon com "transportUrl"
 * - manifesto de repositório do Nuvio com links completos dos plugins
 */
export async function importNuvioJson(text: string): Promise<{ addons: number; repos: number; failed: string[] }> {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(t('O arquivo não é um JSON válido.'));
  }
  const out = { addons: 0, repos: 0, failed: [] as string[] };
  const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.addons) ? data.addons : Array.isArray(data?.result) ? data.result : [data];
  for (const item of list) {
    if (!item) continue;
    if (typeof item === 'string') {
      try {
        const r = await installFromLink(item);
        r.kind === 'repo' ? out.repos++ : out.addons++;
      } catch (err: any) {
        out.failed.push(`${item}: ${err?.message || err}`);
      }
      continue;
    }
    const transport = item.transportUrl || item.manifestUrl || item.url;
    const manifest = item.manifest || item;
    if (Array.isArray(manifest.scrapers)) {
      // repositório do Nuvio colado como arquivo: só funciona com links completos
      const base = typeof transport === 'string' ? normalizeManifestUrl(transport) : '';
      const absolute = manifest.scrapers.every((s: any) => /^https?:\/\//i.test(String(s?.filename || '')));
      if (!base && !absolute) {
        out.failed.push(`${manifest.name || 'Nuvio'}: ${t('os plugins usam caminhos relativos; instale pelo link do manifest.json.')}`);
        continue;
      }
      try {
        const parsed = parseManifest(manifest, base || 'https://local.invalid/manifest.json');
        const st = getNuvioState();
        const now = Date.now();
        const repo: NuvioRepo = { ...parsed, url: base || `local:${parsed.name}`, addedAt: now, updatedAt: now };
        st.repos = [...st.repos.filter((r) => r.url !== repo.url), repo];
        saveState(st);
        out.repos++;
      } catch (err: any) {
        out.failed.push(`${manifest.name || 'Nuvio'}: ${err?.message || err}`);
      }
      continue;
    }
    if (typeof transport === 'string' && /^(https?|stremio):\/\//i.test(transport)) {
      const url = normalizeManifestUrl(transport);
      try {
        // usa o manifesto do arquivo; se faltar algo, busca no endereço
        const parsed = manifest && manifest.resources ? parseStremioManifest(manifest, url) : parseStremioManifest(await fetchJson(url), url);
        saveAddon(parsed);
        out.addons++;
      } catch (err: any) {
        out.failed.push(`${manifest?.name || transport}: ${err?.message || err}`);
      }
      continue;
    }
    out.failed.push(`${manifest?.name || t('item')}: ${t('sem o endereço do addon (transportUrl).')}`);
  }
  return out;
}

export async function refreshStremioAddons(): Promise<{ updated: number; failed: number }> {
  const st = getNuvioState();
  let updated = 0;
  let failed = 0;
  const addons = await Promise.all(
    st.addons.map(async (a) => {
      try {
        const parsed = parseStremioManifest(await fetchJson(a.url), a.url);
        updated++;
        return { ...a, ...parsed, updatedAt: Date.now(), error: undefined };
      } catch (err: any) {
        failed++;
        return { ...a, error: String(err?.message || err) };
      }
    })
  );
  saveState({ ...getNuvioState(), addons });
  return { updated, failed };
}

export function removeStremioAddon(url: string) {
  const st = getNuvioState();
  st.addons = st.addons.filter((a) => a.url !== url);
  saveState(st);
}

export function setStremioAddonEnabled(url: string, enabled: boolean) {
  const st = getNuvioState();
  st.addons = st.addons.map((a) => (a.url === url ? { ...a, enabled } : a));
  saveState(st);
}

/** Addons ligados que oferecem o recurso para esse tipo/ID */
/** Addons de links que só aceitam IDs do Kitsu (não entendem os do IMDb/Cinemeta) */
export function kitsuOnlyStreamAddons(type: string): StremioAddon[] {
  return addonsFor('stream', type).filter((a) => {
    const r = a.resources.find((x) => x.name === 'stream');
    const prefixes = r?.idPrefixes || a.idPrefixes || [];
    return prefixes.some((p) => p.startsWith('kitsu')) && !prefixes.some((p) => p.startsWith('tt'));
  });
}

/** Tipo que o addon usa na URL: addons de anime (ex.: Kitsu) usam "anime" no lugar de série/filme */
export function addonTypeFor(addon: StremioAddon, resource: string, type: string): string {
  const r = addon.resources.find((x) => x.name === resource);
  const types = (r && r.types) || addon.types || [];
  if (!types.length || types.includes(type)) return type;
  if ((type === 'series' || type === 'movie') && types.includes('anime')) return 'anime';
  return type;
}

export function addonsFor(resource: string, type: string, id?: string): StremioAddon[] {
  const st = getNuvioState();
  if (!st.enabled) return [];
  return st.addons.filter((a) => {
    if (!a.enabled) return false;
    const r = a.resources.find((x) => x.name === resource);
    if (!r) return false;
    const types = r.types || a.types;
    if (types.length && !types.includes(type) && !((type === 'series' || type === 'movie') && types.includes('anime'))) return false;
    const prefixes = r.idPrefixes || a.idPrefixes;
    if (id && prefixes && prefixes.length && !prefixes.some((p) => id.startsWith(p))) return false;
    return true;
  });
}

const firstLine = (s?: string) => String(s || '').split('\n')[0].trim();

function streamQuality(text: string): string | undefined {
  const s = text.toLowerCase();
  if (/2160p|\b4k\b|uhd/.test(s)) return '4K';
  const m = s.match(/(1080|720|480|360)p/);
  if (m) return `${m[1]}p`;
  if (/\bcam\b|\bts\b|telesync/.test(s)) return 'CAM';
  return undefined;
}

/** Busca os links de um addon (diretos, externos e torrents) */
export async function fetchAddonStreams(addon: StremioAddon, type: string, id: string): Promise<{ streams: NuvioStream[]; torrents: number }> {
  const data = await fetchJson<{ streams?: any[] }>(`${addon.base}/stream/${addonTypeFor(addon, 'stream', type)}/${encodeURIComponent(id)}.json`);
  let torrents = 0;
  const streams: NuvioStream[] = [];
  for (const s of Array.isArray(data?.streams) ? data.streams : []) {
    if (!s || typeof s !== 'object') continue;
    const text = [s.name, s.title, s.description].filter(Boolean).join('\n');
    const size = (text.match(/(\d+(?:[.,]\d+)?\s?(?:GB|MB|GiB|MiB))/i) || [])[1];
    const label = [firstLine(s.title || s.description), firstLine(s.name)].filter(Boolean);
    const subtitles = Array.isArray(s.subtitles)
      ? s.subtitles.filter((x: any) => x && typeof x.url === 'string').map((x: any) => ({ url: x.url, language: x.lang || x.language, name: x.lang }))
      : undefined;
    if (typeof s.url === 'string' && /^https?:\/\//i.test(s.url)) {
      const headers = s.behaviorHints?.proxyHeaders?.request;
      streams.push({
        name: firstLine(s.name) || addon.name,
        title: label.join(' · ') || addon.name,
        url: s.url,
        quality: streamQuality(text),
        size,
        type: /m3u8/i.test(s.url) ? 'hls' : undefined,
        headers: headers && typeof headers === 'object' ? Object.fromEntries(Object.entries(headers).map(([k, v]) => [k, String(v)])) : undefined,
        subtitles,
      });
    } else if (typeof s.externalUrl === 'string' && /^https?:\/\//i.test(s.externalUrl)) {
      streams.push({ name: firstLine(s.name) || addon.name, title: label.join(' · ') || t('Abrir no navegador'), url: s.externalUrl, type: 'external' });
    } else if (typeof s.ytId === 'string') {
      const yt = `https://www.youtube.com/watch?v=${encodeURIComponent(s.ytId)}`;
      streams.push({ name: 'YouTube', title: label.join(' · ') || 'YouTube', url: yt, type: 'external' });
    } else if (typeof s.infoHash === 'string' && /^[a-f0-9]{40}$/i.test(s.infoHash)) {
      torrents++;
      const filename = typeof s.behaviorHints?.filename === 'string' ? s.behaviorHints.filename : undefined;
      streams.push({
        name: firstLine(s.name) || addon.name,
        title: label.join(' · ') || filename || addon.name,
        url: `magnet:?xt=urn:btih:${s.infoHash.toLowerCase()}${filename ? `&dn=${encodeURIComponent(filename)}` : ''}`,
        quality: streamQuality(text),
        size,
        type: 'torrent',
        fileIdx: s.fileIdx != null && Number.isFinite(Number(s.fileIdx)) ? Number(s.fileIdx) : undefined,
        sources: Array.isArray(s.sources) ? s.sources.map(String).slice(0, 40) : undefined,
        filename,
        subtitles,
      });
    } else if (typeof s.url === 'string' && /^magnet:\?/i.test(s.url)) {
      torrents++;
      streams.push({ name: firstLine(s.name) || addon.name, title: label.join(' · ') || addon.name, url: s.url, quality: streamQuality(text), size, type: 'torrent', subtitles });
    }
  }
  return { streams, torrents };
}

/** Legendas de todos os addons de legenda ligados */
export async function fetchAddonSubtitles(type: string, id: string): Promise<{ url: string; language?: string; name?: string }[]> {
  const list = addonsFor('subtitles', type, id);
  const results = await Promise.all(
    list.map(async (a) => {
      try {
        const data = await Promise.race([
          fetchJson<{ subtitles?: any[] }>(`${a.base}/subtitles/${type}/${encodeURIComponent(id)}.json`),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
        ]);
        return (data.subtitles || [])
          .filter((x: any) => x && typeof x.url === 'string')
          .map((x: any) => ({ url: x.url, language: x.lang, name: `${x.lang || ''} · ${a.name}`.trim() }));
      } catch {
        return [];
      }
    })
  );
  return results.flat().slice(0, 60);
}

export interface AddonCatalogRef {
  addon: StremioAddon;
  catalog: StremioCatalog;
  key: string;
  label: string;
  searchable: boolean;
  genres?: string[];
}

/** Catálogos dos addons que dá para navegar (filmes e séries, sem filtros obrigatórios além de busca) */
export function addonCatalogs(): AddonCatalogRef[] {
  const st = getNuvioState();
  if (!st.enabled) return [];
  const out: AddonCatalogRef[] = [];
  for (const a of st.addons) {
    if (!a.enabled) continue;
    for (const c of a.catalogs) {
      // "anime" (ex.: Kitsu) entra como série; o tipo original continua sendo usado na URL do addon
      if (c.type !== 'movie' && c.type !== 'series' && c.type !== 'anime') continue;
      const required = c.extra.filter((e) => e.isRequired).map((e) => e.name);
      if (required.some((n) => n !== 'search' && n !== 'genre')) continue;
      const onlySearch = required.includes('search');
      out.push({
        addon: a,
        catalog: c,
        key: `${a.url}|${c.type}|${c.id}`,
        label: `${a.name} · ${c.name || c.id} (${c.type === 'movie' ? t('Filmes') : c.type === 'anime' ? t('Animes') : t('Séries')})${onlySearch ? ' · ' + t('só busca') : ''}`,
        searchable: c.extra.some((e) => e.name === 'search'),
        genres: c.extra.find((e) => e.name === 'genre')?.options,
      });
    }
  }
  return out;
}

export async function fetchAddonCatalog(ref: AddonCatalogRef, opts: { search?: string; genre?: string; skip?: number } = {}): Promise<NuvioMetaPreview[]> {
  const extras: string[] = [];
  const req = ref.catalog.extra.filter((e) => e.isRequired).map((e) => e.name);
  if (opts.search?.trim()) extras.push(`search=${encodeURIComponent(opts.search.trim())}`);
  else if (req.includes('search')) return [];
  if (opts.genre) extras.push(`genre=${encodeURIComponent(opts.genre)}`);
  else if (req.includes('genre') && ref.genres?.length) extras.push(`genre=${encodeURIComponent(ref.genres[0])}`);
  if (opts.skip && !opts.search) extras.push(`skip=${opts.skip}`);
  const url = `${ref.addon.base}/catalog/${ref.catalog.type}/${encodeURIComponent(ref.catalog.id)}${extras.length ? '/' + extras.join('&') : ''}.json`;
  const data = await fetchJson<{ metas?: any[] }>(url);
  const catalogType: NuvioType = ref.catalog.type === 'movie' ? 'movie' : 'series';
  return (data.metas || [])
    .filter((m) => m && typeof m.id === 'string')
    .map((m) => ({
      id: m.id,
      // Itens de catálogos "anime" podem ser filmes ou séries
      type: (m.type === 'movie' ? 'movie' : m.type === 'series' ? 'series' : catalogType) as NuvioType,
      name: String(m.name || ''),
      poster: m.poster || undefined,
      year: m.releaseInfo || m.year || undefined,
      imdbRating: m.imdbRating || undefined,
      genres: Array.isArray(m.genres) ? m.genres : Array.isArray(m.genre) ? m.genre : undefined,
      addonUrl: ref.addon.url,
    }));
}
