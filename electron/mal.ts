// electron/mal.ts
// Busca de animes no MyAnimeList.
//  - Com Client ID (Configurações → Contas → MyAnimeList): API oficial (api.myanimelist.net/v2).
//  - Sem Client ID: Jikan (api.jikan.moe), espelho público do MAL, sem chave.
// Roda no processo principal porque a API oficial não aceita chamadas direto da página (CORS).
// O Client ID fica no cofre do sistema (secrets.ts) e nunca vai para o código.

import { ipcMain, net } from 'electron';
import { getSecret } from './secrets';
import { writeLog } from './logger';

export interface MalAnime {
  id: number;
  title: string;
  altTitles: string[];
  cover?: string;
  year?: number;
  score?: number;
  type?: string;
  episodes?: number;
  genres: string[];
  url: string;
}

export interface MalSearchResult {
  success: boolean;
  via?: 'api' | 'jikan';
  items?: MalAnime[];
  error?: string;
  /** A API oficial recusou o Client ID e a busca caiu para o Jikan */
  clientIdRejected?: boolean;
}

const SECRET_NAME = 'mal_client_id';
const CACHE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 12000;
const cache = new Map<string, { at: number; result: MalSearchResult }>();

const validClientId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{16,64}$/.test(v.trim());

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await net.fetch(url, { headers: { Accept: 'application/json', 'User-Agent': 'Tomodachi-Player', ...headers }, signal: ctrl.signal } as any);
    if (!res.ok) throw new HttpError(res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

const uniq = (list: (string | undefined | null)[]) => Array.from(new Set(list.map((x) => String(x || '').trim()).filter(Boolean)));

async function searchOfficial(q: string, clientId: string, limit: number): Promise<MalAnime[]> {
  const fields = 'alternative_titles,start_season,mean,media_type,num_episodes,genres';
  const url = `https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(q)}&limit=${limit}&fields=${fields}`;
  const data = await getJson(url, { 'X-MAL-CLIENT-ID': clientId });
  return (Array.isArray(data?.data) ? data.data : [])
    .map((x: any) => x?.node)
    .filter((n: any) => n && Number.isFinite(n.id) && n.title)
    .map(
      (n: any): MalAnime => ({
        id: n.id,
        title: String(n.title),
        altTitles: uniq([n.alternative_titles?.en, n.alternative_titles?.ja, ...(Array.isArray(n.alternative_titles?.synonyms) ? n.alternative_titles.synonyms : [])]),
        cover: n.main_picture?.large || n.main_picture?.medium || undefined,
        year: n.start_season?.year || undefined,
        score: typeof n.mean === 'number' ? n.mean : undefined,
        type: n.media_type ? String(n.media_type).toUpperCase() : undefined,
        episodes: n.num_episodes || undefined,
        genres: Array.isArray(n.genres) ? n.genres.map((g: any) => String(g?.name || '')).filter(Boolean) : [],
        url: `https://myanimelist.net/anime/${n.id}`,
      })
    );
}

async function searchJikan(q: string, limit: number): Promise<MalAnime[]> {
  const url = `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=${limit}&sfw=true`;
  let data: any;
  try {
    data = await getJson(url);
  } catch (err) {
    // Jikan limita a ~3 pedidos por segundo: espera um pouco e tenta de novo
    if (err instanceof HttpError && err.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      data = await getJson(url);
    } else throw err;
  }
  return (Array.isArray(data?.data) ? data.data : [])
    .filter((n: any) => n && Number.isFinite(n.mal_id) && n.title)
    .map(
      (n: any): MalAnime => ({
        id: n.mal_id,
        title: String(n.title),
        altTitles: uniq([n.title_english, n.title_japanese, ...(Array.isArray(n.title_synonyms) ? n.title_synonyms : [])]),
        cover: n.images?.webp?.large_image_url || n.images?.jpg?.large_image_url || n.images?.jpg?.image_url || undefined,
        year: n.year || n.aired?.prop?.from?.year || undefined,
        score: typeof n.score === 'number' ? n.score : undefined,
        type: n.type ? String(n.type).toUpperCase() : undefined,
        episodes: n.episodes || undefined,
        genres: [...(n.genres || []), ...(n.themes || []), ...(n.demographics || [])].map((g: any) => String(g?.name || '')).filter(Boolean),
        url: n.url || `https://myanimelist.net/anime/${n.mal_id}`,
      })
    );
}

const describe = (err: unknown) => (err instanceof HttpError ? `HTTP ${err.status}` : String((err as any)?.message || err));

export async function malSearch(query: string, opts: { limit?: number; clientId?: string } = {}): Promise<MalSearchResult> {
  const q = String(query || '').trim().slice(0, 100);
  if (!q) return { success: true, items: [] };
  const limit = Math.min(Math.max(opts.limit || 20, 1), 25);
  const saved = getSecret(SECRET_NAME);
  const clientId = validClientId(opts.clientId) ? opts.clientId.trim() : validClientId(saved) ? saved.trim() : '';
  const key = `${clientId ? 'api' : 'jikan'}|${limit}|${q.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.result;

  let result: MalSearchResult;
  let clientIdRejected = false;
  // A API oficial pede pelo menos 3 letras; com menos, vai direto para o Jikan
  if (clientId && q.length >= 3) {
    try {
      result = { success: true, via: 'api', items: await searchOfficial(q, clientId, limit) };
      cache.set(key, { at: Date.now(), result });
      return result;
    } catch (err) {
      clientIdRejected = err instanceof HttpError && (err.status === 401 || err.status === 403);
      writeLog('warn', 'mal', `API oficial falhou (${describe(err)}); usando o Jikan`);
    }
  }
  try {
    result = { success: true, via: 'jikan', items: await searchJikan(q, limit), clientIdRejected: clientIdRejected || undefined };
  } catch (err) {
    return { success: false, error: describe(err), clientIdRejected: clientIdRejected || undefined };
  }
  cache.set(key, { at: Date.now(), result });
  return result;
}

/** Confere um Client ID direto na API oficial (botão "Testar" das Configurações) */
async function testClientId(clientId: string): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!validClientId(clientId)) return { success: false, error: 'invalid' };
  try {
    const items = await searchOfficial('Naruto', clientId.trim(), 3);
    return { success: true, count: items.length };
  } catch (err) {
    if (err instanceof HttpError && (err.status === 401 || err.status === 403)) return { success: false, error: 'rejected' };
    return { success: false, error: describe(err) };
  }
}

export function registerMalIpc() {
  ipcMain.handle('mal:search', (_e, args: { query?: string; limit?: number; clientId?: string }) =>
    malSearch(String(args?.query || ''), { limit: Number(args?.limit) || undefined, clientId: args?.clientId })
  );
  ipcMain.handle('mal:test', (_e, clientId: string) => testClientId(String(clientId || '')));
  ipcMain.handle('mal:clear-cache', () => {
    cache.clear();
    return { success: true };
  });
}
