import type { RepoType } from '../types';
import { DEFAULT_REPOS, type RepoEntry } from './defaultRepos';

const KEY = (t: RepoType) => `repos_${t}`;
const CACHE_KEY = (t: RepoType, url: string) => `repocache_${t}_${btoa(encodeURI(url)).slice(0, 40)}`;
const TTL = 6 * 60 * 60 * 1000; // 6h

export function loadRepos(type: RepoType): RepoEntry[] {
  const raw = localStorage.getItem(KEY(type));
  if (raw != null) {
    try {
      const parsed = JSON.parse(raw);
      // Lista vazia é escolha do usuário (removeu tudo): não recoloca os padrões
      if (Array.isArray(parsed)) return parsed;
    } catch { /* recria */ }
  }
  const seeded = DEFAULT_REPOS[type];
  localStorage.setItem(KEY(type), JSON.stringify(seeded)); // seed na primeira execução
  return seeded;
}

export function saveRepos(type: RepoType, repos: RepoEntry[]) {
  localStorage.setItem(KEY(type), JSON.stringify(repos));
}

const MEMORY_CACHE = new Map<string, { at: number; data: unknown }>();

export function readCache(type: RepoType, url: string) {
  const cacheKey = CACHE_KEY(type, url);

  // 1. Tenta cache em memória primeiro
  const mem = MEMORY_CACHE.get(cacheKey);
  if (mem && Date.now() - mem.at <= TTL) {
    // Invalida cache corrompido ou dummy (ex: Keiyoushi com <= 2 itens "Outdated App")
    if (Array.isArray(mem.data) && mem.data.length <= 2 && /keiyoushi/i.test(url)) {
      MEMORY_CACHE.delete(cacheKey);
    } else {
      return mem.data;
    }
  }

  // 2. Tenta localStorage
  const raw = localStorage.getItem(cacheKey);
  if (!raw) return null;
  try {
    const { at, data } = JSON.parse(raw);
    if (Date.now() - at > TTL) return null;

    // Invalida cache corrompido ou dummy (ex: Keiyoushi com <= 2 itens "Outdated App")
    if (Array.isArray(data) && data.length <= 2 && /keiyoushi/i.test(url)) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    // Alimenta cache de memória
    MEMORY_CACHE.set(cacheKey, { at, data });
    return data;
  } catch { return null; }
}

export function writeCache(type: RepoType, url: string, data: unknown) {
  const cacheKey = CACHE_KEY(type, url);
  const entry = { at: Date.now(), data };
  MEMORY_CACHE.set(cacheKey, entry);

  try {
    localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch {
    // Quota do localStorage atingida (comum com repositórios gigantes como Keiyoushi de 1.400 extensões).
    // O cache de memória cuidará de manter os dados acessíveis durante a sessão.
  }
}

export function clearRepoCache(type: RepoType, url: string) {
  const cacheKey = CACHE_KEY(type, url);
  MEMORY_CACHE.delete(cacheKey);
  localStorage.removeItem(cacheKey);
}
