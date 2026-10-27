// src/api/anilistSync.ts
// Sincroniza o progresso (capítulos lidos / episódios vistos) com a lista do AniList.
//
// Como funciona:
//  - Login pelo AniList (janela própria); o token fica criptografado no cofre do sistema.
//  - Ao marcar algo como lido/visto, a obra é procurada no AniList pelo título (o vínculo
//    fica salvo e pode ser trocado) e o progresso é enviado — só para frente, nunca diminui.

import { getSecret, invalidateSecret } from '../utils/secrets';
import { readLibrary } from '../utils/libraryStore';
import { mergeChapterProgress, onChaptersRead, type ProgressSource } from '../utils/progress';
import { toast } from '../components/Feedback';
import { t } from '../i18n';

const API = 'https://graphql.anilist.co';
const TOKEN = 'anilist_token';
const STATE_KEY = 'tp_anilist';
const MAP_KEY = 'tp_anilist_map';
const LOG_KEY = 'tp_anilist_log';
export const ANILIST_EVENT = 'tomodachi:anilist-changed';

export interface AniListUser {
  id: number;
  name: string;
  avatar?: string;
}
export interface AniListState {
  user: AniListUser;
  enabled: boolean;
  expiresAt?: number;
}
export interface AniListMedia {
  id: number;
  title: string;
  total?: number | null;
  cover?: string;
  siteUrl?: string;
}
export interface AniListLogEntry {
  at: number;
  title: string;
  progress?: number;
  ok: boolean;
  message?: string;
}

const kindOf = (source: ProgressSource) => (source === 'manga' ? 'MANGA' : 'ANIME');
const emit = () => {
  try {
    window.dispatchEvent(new CustomEvent(ANILIST_EVENT));
  } catch {
    /* ignore */
  }
};

/* ───────────── Estado ───────────── */

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
};

export function getAniListState(): AniListState | null {
  const st = readJson<AniListState | null>(STATE_KEY, null);
  if (!st?.user || !getSecret(TOKEN)) return null;
  return st;
}

export function setAniListSyncEnabled(enabled: boolean) {
  const st = readJson<AniListState | null>(STATE_KEY, null);
  if (!st) return;
  writeJson(STATE_KEY, { ...st, enabled });
  emit();
}

export const getAniListLog = (): AniListLogEntry[] => readJson<AniListLogEntry[]>(LOG_KEY, []);
const pushLog = (entry: AniListLogEntry) => {
  writeJson(LOG_KEY, [entry, ...getAniListLog()].slice(0, 30));
  emit();
};

/* ───────────── API ───────────── */

class AniListAuthError extends Error {}

async function gql<T = any>(query: string, variables: Record<string, unknown> = {}, auth = true): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' };
  if (auth) {
    const token = getSecret(TOKEN);
    if (!token) throw new AniListAuthError(t('Não conectado ao AniList'));
    headers.Authorization = `Bearer ${token}`;
  }
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(API, { method: 'POST', headers, body: JSON.stringify({ query, variables }) });
    if (res.status === 429 && attempt === 0) {
      const wait = Math.min(60, Number(res.headers.get('Retry-After')) || 10);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    if (res.status === 401) throw new AniListAuthError(t('A sessão do AniList expirou. Entre novamente.'));
    const json: any = await res.json().catch(() => null);
    if (json?.errors?.length) {
      const msg = json.errors.map((e: any) => e?.message).filter(Boolean).join(' · ');
      if (/invalid token|unauthorized/i.test(msg)) throw new AniListAuthError(t('A sessão do AniList expirou. Entre novamente.'));
      throw new Error(msg || t('Erro do AniList (HTTP {status})', { status: res.status }));
    }
    if (!res.ok || !json) throw new Error(t('Erro do AniList (HTTP {status})', { status: res.status }));
    return json.data as T;
  }
  throw new Error(t('AniList ocupado, tente de novo em instantes'));
}

/* ───────────── Login ───────────── */

export async function loginAniList(): Promise<AniListUser> {
  if (!window.electronAPI?.anilistLogin) throw new Error(t('Login indisponível nesta versão'));
  const res = await window.electronAPI.anilistLogin();
  invalidateSecret(TOKEN);
  if (!res.success) throw new Error(res.error || 'Login cancelado');
  const data = await gql<{ Viewer: { id: number; name: string; avatar?: { medium?: string } } }>('query { Viewer { id name avatar { medium } } }');
  const user: AniListUser = { id: data.Viewer.id, name: data.Viewer.name, avatar: data.Viewer.avatar?.medium };
  writeJson(STATE_KEY, { user, enabled: true, expiresAt: res.expiresAt } satisfies AniListState);
  emit();
  return user;
}

export async function logoutAniList(): Promise<void> {
  try {
    await window.electronAPI?.anilistLogout?.();
  } catch {
    /* ignore */
  }
  invalidateSecret(TOKEN);
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    /* ignore */
  }
  emit();
}

const handleAuthError = (err: unknown) => {
  if (err instanceof AniListAuthError) {
    void logoutAniList();
    toast.warning(t('AniList desconectado'), err.message);
  }
};

/* ───────────── Vínculo obra ↔ AniList ───────────── */

const mapKey = (source: ProgressSource, workUrl: string) => `${source}:${workUrl}`;
export function getLinkedMedia(source: ProgressSource, workUrl: string): AniListMedia | null | undefined {
  const map = readJson<Record<string, AniListMedia | null>>(MAP_KEY, {});
  return map[mapKey(source, workUrl)];
}
export function setLinkedMedia(source: ProgressSource, workUrl: string, media: AniListMedia | null | undefined) {
  const map = readJson<Record<string, AniListMedia | null>>(MAP_KEY, {});
  if (media === undefined) delete map[mapKey(source, workUrl)];
  else map[mapKey(source, workUrl)] = media;
  writeJson(MAP_KEY, map);
  emit();
}

const cleanTitle = (t: string) =>
  (t || '')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\((?:dub|dublado|leg|legendado|sub|uncensored|sem censura)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const norm = (t?: string | null) => (t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

export async function searchAniList(source: ProgressSource, title: string): Promise<AniListMedia[]> {
  const data = await gql<any>(
    `query($s: String, $t: MediaType) { Page(perPage: 8) { media(search: $s, type: $t, sort: SEARCH_MATCH) {
      id format episodes chapters siteUrl coverImage { medium } title { romaji english native userPreferred } synonyms } } }`,
    { s: cleanTitle(title), t: kindOf(source) },
    false
  );
  const target = norm(cleanTitle(title));
  const list: any[] = (data?.Page?.media || []).filter((m: any) => m.format !== 'NOVEL');
  // Título idêntico primeiro (romaji, inglês, nativo ou sinônimos)
  list.sort((a, b) => {
    const score = (m: any) => ([m.title?.romaji, m.title?.english, m.title?.native, ...(m.synonyms || [])].some((x) => norm(x) === target) ? 0 : 1);
    return score(a) - score(b);
  });
  return list.map((m) => ({
    id: m.id,
    title: m.title?.userPreferred || m.title?.romaji || m.title?.english || String(m.id),
    total: source === 'manga' ? m.chapters : m.episodes,
    cover: m.coverImage?.medium,
    siteUrl: m.siteUrl,
  }));
}

async function resolveMedia(source: ProgressSource, workUrl: string, title: string): Promise<AniListMedia | null> {
  const linked = getLinkedMedia(source, workUrl);
  if (linked !== undefined) return linked; // null = usuário escolheu não sincronizar
  const found = (await searchAniList(source, title))[0] || null;
  if (found) setLinkedMedia(source, workUrl, found);
  return found;
}

/* ───────────── Sincronização ───────────── */

/** Envia ao AniList o maior capítulo/episódio lido de uma obra da biblioteca. */
export async function syncWork(source: ProgressSource, workUrl: string, opts: { force?: boolean } = {}): Promise<string> {
  const st = getAniListState();
  if (!st || (!st.enabled && !opts.force)) return 'Sincronização desativada';
  const lib = await readLibrary(source);
  const work: any = (lib.entries || []).find((e: any) => e?.url === workUrl);
  if (!work) return 'Obra fora da biblioteca';
  const chapters = mergeChapterProgress(Array.isArray(work.chapters) ? work.chapters : [], source);
  const progress = chapters.reduce((max: number, c: any) => (c.read && Number(c.number) > 0 ? Math.max(max, Math.floor(Number(c.number))) : max), 0);
  if (progress <= 0) return 'Nada lido ainda';

  try {
    const media = await resolveMedia(source, workUrl, work.title || '');
    if (!media) {
      pushLog({ at: Date.now(), title: work.title, ok: false, message: 'Não encontrada no AniList' });
      return 'Não encontrada no AniList';
    }
    const cur = await gql<any>(
      'query($id: Int) { Media(id: $id) { episodes chapters mediaListEntry { progress status } } }',
      { id: media.id }
    );
    const entry = cur?.Media?.mediaListEntry;
    const total = (source === 'manga' ? cur?.Media?.chapters : cur?.Media?.episodes) || null;
    const target = total ? Math.min(progress, total) : progress;
    if (entry && entry.progress >= target && !opts.force) return 'Já atualizado';
    const status = total && target >= total ? 'COMPLETED' : entry?.status === 'REPEATING' ? 'REPEATING' : 'CURRENT';
    await gql(
      'mutation($id: Int, $p: Int, $s: MediaListStatus) { SaveMediaListEntry(mediaId: $id, progress: $p, status: $s) { id progress } }',
      { id: media.id, p: Math.max(target, entry?.progress || 0), s: status }
    );
    pushLog({ at: Date.now(), title: media.title, progress: target, ok: true });
    return `Atualizado para ${target}`;
  } catch (err: any) {
    handleAuthError(err);
    pushLog({ at: Date.now(), title: work.title, ok: false, message: err?.message || String(err) });
    return err?.message || 'Falha ao sincronizar';
  }
}

/* ───────────── Automático: ao marcar como lido/visto ───────────── */

const pending = new Map<string, number>();

async function onRead(source: ProgressSource, urls: string[]) {
  const st = getAniListState();
  if (!st?.enabled) return;
  const set = new Set(urls);
  const lib = await readLibrary(source).catch(() => null);
  for (const work of (lib?.entries || []) as any[]) {
    if (!work?.url || !Array.isArray(work.chapters) || !work.chapters.some((c: any) => set.has(c?.url))) continue;
    const key = mapKey(source, work.url);
    const prev = pending.get(key);
    if (prev) window.clearTimeout(prev);
    // Agrupa marcações seguidas (ex.: "marcar todos") em um único envio
    pending.set(
      key,
      window.setTimeout(() => {
        pending.delete(key);
        void syncWork(source, work.url);
      }, 4000)
    );
  }
}

export function initAniListSync() {
  onChaptersRead((source, urls) => void onRead(source, urls));
}
