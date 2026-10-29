// electron/mal.ts
// Busca de animes no MyAnimeList.
//  - Com Client ID (Configurações → Contas → MyAnimeList): API oficial (api.myanimelist.net/v2).
//  - Sem Client ID: Jikan (api.jikan.moe), espelho público do MAL, sem chave.
//  - Se o Jikan estiver fora do ar ou limitando: a busca rápida do próprio site do MAL.
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
  via?: 'api' | 'jikan' | 'site';
  items?: MalAnime[];
  error?: string;
  /** A API oficial recusou o Client ID e a busca caiu para o Jikan */
  clientIdRejected?: boolean;
}

const SECRET_NAME = 'mal_client_id';
const CACHE_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 12000;
const JIKAN_TIMEOUT_MS = 7000;
/** Jikan fora do ar/limitando: pula direto para a busca do site do MAL por um tempo */
const JIKAN_PAUSE_MS = 10 * 60 * 1000;
let jikanDownUntil = 0;
const cache = new Map<string, { at: number; result: MalSearchResult }>();

const validClientId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9]{16,64}$/.test(v.trim());

class HttpError extends Error {
  constructor(public status: number) {
    super(`HTTP ${status}`);
  }
}

async function getJson(url: string, headers: Record<string, string> = {}, timeoutMs = TIMEOUT_MS): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
    data = await getJson(url, {}, JIKAN_TIMEOUT_MS);
  } catch (err) {
    // Jikan limita a ~3 pedidos por segundo: espera um pouco e tenta de novo
    if (err instanceof HttpError && err.status === 429) {
      await new Promise((r) => setTimeout(r, 1500));
      data = await getJson(url, {}, JIKAN_TIMEOUT_MS);
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

/** Busca rápida do site do MAL (a mesma da caixa de busca de myanimelist.net) */
async function searchSite(q: string, limit: number): Promise<MalAnime[]> {
  const data = await getJson(`https://myanimelist.net/search/prefix.json?type=anime&keyword=${encodeURIComponent(q)}&v=1`, {
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://myanimelist.net/',
  });
  const cat = (Array.isArray(data?.categories) ? data.categories : []).find((c: any) => c?.type === 'anime');
  // A capa vem pequena (/r/116x180/…): tira o redimensionamento para pegar a original
  const bigCover = (u?: string) => (u ? u.replace(/\/r\/\d+x\d+\//, '/').replace(/\?s=[a-f0-9]+$/i, '') : undefined);
  return (Array.isArray(cat?.items) ? cat.items : [])
    .filter((n: any) => n && Number.isFinite(n.id) && n.name)
    .slice(0, limit)
    .map((n: any): MalAnime => {
      const score = parseFloat(n.payload?.score);
      return {
        id: n.id,
        title: String(n.name),
        altTitles: [],
        cover: bigCover(n.image_url || n.thumbnail_url),
        year: Number(n.payload?.start_year) || undefined,
        score: Number.isFinite(score) && score > 0 ? score : undefined,
        type: n.payload?.media_type ? String(n.payload.media_type).toUpperCase() : undefined,
        genres: [],
        url: n.url || `https://myanimelist.net/anime/${n.id}`,
      };
    });
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
  let jikanError = '';
  if (Date.now() >= jikanDownUntil) {
    try {
      result = { success: true, via: 'jikan', items: await searchJikan(q, limit), clientIdRejected: clientIdRejected || undefined };
      cache.set(key, { at: Date.now(), result });
      return result;
    } catch (err) {
      jikanError = describe(err);
      // Fora do ar, lento ou limitando: evita esperar por ele de novo nos próximos minutos
      if (!(err instanceof HttpError) || err.status === 429 || err.status >= 500) jikanDownUntil = Date.now() + JIKAN_PAUSE_MS;
      writeLog('warn', 'mal', `Jikan falhou (${jikanError}); usando a busca do site do MAL`);
    }
  }
  try {
    result = { success: true, via: 'site', items: await searchSite(q, limit), clientIdRejected: clientIdRejected || undefined };
  } catch (err2) {
    writeLog('warn', 'mal', `busca do site do MAL falhou (${describe(err2)})`);
    return { success: false, error: `${jikanError ? `Jikan: ${jikanError} · ` : ''}MAL: ${describe(err2)}`, clientIdRejected: clientIdRejected || undefined };
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
