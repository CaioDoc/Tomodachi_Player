// src/api/suwayomi.ts
// Cliente do Suwayomi-Server (GraphQL). O Suwayomi executa as extensões reais do
// Mihon/Tachiyomi, então busca, capítulos e páginas vêm direto das fontes oficiais.
//
// Identificadores usados na biblioteca do Tomodachi:
//   obra:     suwayomi:manga:<id>
//   capítulo: suwayomi:chapter:<id>

import { getSecret, setSecret } from '../utils/secrets';
import { t } from '../i18n';

export interface SuwayomiConfig {
  baseUrl: string;
  username?: string;
  password?: string;
  /** Executável/atalho do servidor para iniciar junto com o app */
  exePath?: string;
  autoStart?: boolean;
}

export interface SuwaSource {
  id: string;
  name: string;
  lang: string;
  displayName: string;
  iconUrl: string;
  supportsLatest: boolean;
  isNsfw: boolean;
}

export interface SuwaManga {
  id: number;
  title: string;
  thumbnailUrl?: string | null;
  author?: string | null;
  artist?: string | null;
  description?: string | null;
  genre?: string[];
  status?: string;
  realUrl?: string | null;
  inLibrary?: boolean;
  sourceId?: string;
  source?: { displayName?: string; name?: string } | null;
}

export interface SuwaChapter {
  id: number;
  name: string;
  chapterNumber: number;
  uploadDate?: string | number;
  scanlator?: string | null;
  isRead?: boolean;
  lastPageRead?: number;
  sourceOrder?: number;
}

export interface SuwaExtension {
  pkgName: string;
  name: string;
  lang: string;
  versionName: string;
  iconUrl: string;
  isInstalled: boolean;
  hasUpdate: boolean;
  isObsolete: boolean;
  isNsfw: boolean;
}

const KEY = 'tp_suwayomi';
const SUWA_SECRET = 'suwayomi_password';
export const SUWAYOMI_EVENT = 'tomodachi:suwayomi-changed';
export const DEFAULT_SUWAYOMI_URL = 'http://127.0.0.1:4567';
export const SUWAYOMI_DOWNLOAD_URL = 'https://github.com/Suwayomi/Suwayomi-Server/releases/latest';

export const MANGA_PREFIX = 'suwayomi:manga:';
export const CHAPTER_PREFIX = 'suwayomi:chapter:';

export const isSuwayomiUrl = (url?: string) => !!url && url.startsWith('suwayomi:');
export const suwaMangaId = (url: string) => Number(url.slice(MANGA_PREFIX.length)) || 0;
export const suwaChapterId = (url: string) => Number(url.slice(CHAPTER_PREFIX.length)) || 0;

export function getSuwayomiConfig(): SuwayomiConfig | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const cfg = JSON.parse(raw);
    if (!cfg?.baseUrl) return null;
    // Senha criptografada no cofre do sistema (migra a antiga, salva em texto puro)
    if (cfg.password) {
      setSecret(SUWA_SECRET, cfg.password);
      delete cfg.password;
      localStorage.setItem(KEY, JSON.stringify(cfg));
    }
    return { ...cfg, password: getSecret(SUWA_SECRET) || undefined };
  } catch {
    return null;
  }
}

export function saveSuwayomiConfig(cfg: SuwayomiConfig | null): void {
  try {
    if (cfg) {
      const { password, ...rest } = cfg;
      setSecret(SUWA_SECRET, password || null);
      localStorage.setItem(KEY, JSON.stringify({ ...rest, baseUrl: cfg.baseUrl.trim().replace(/\/+$/, '') }));
    } else {
      setSecret(SUWA_SECRET, null);
      localStorage.removeItem(KEY);
    }
  } catch {
    /* ignore */
  }
  syncSuwayomiAuth();
  try {
    window.dispatchEvent(new CustomEvent(SUWAYOMI_EVENT));
  } catch {
    /* ignore */
  }
}

/** Informa ao processo principal as credenciais (para carregar capas/páginas protegidas). */
export function syncSuwayomiAuth(): void {
  const cfg = getSuwayomiConfig();
  window.electronAPI?.suwayomiSetAuth?.(cfg ? { baseUrl: cfg.baseUrl, username: cfg.username, password: cfg.password } : { baseUrl: '' });
}

export const absoluteSuwaUrl = (path?: string | null, cfg = getSuwayomiConfig()) => {
  if (!path) return '';
  if (/^(https?:|data:|blob:)/i.test(path)) return path;
  return cfg ? `${cfg.baseUrl}${path.startsWith('/') ? '' : '/'}${path}` : path;
};

async function gql<T = any>(query: string, variables?: Record<string, unknown>, timeoutMs?: number, cfgOverride?: SuwayomiConfig): Promise<T> {
  const cfg = cfgOverride || getSuwayomiConfig();
  if (!cfg) throw new Error(t('Suwayomi não configurado'));
  if (!window.electronAPI?.suwayomiGraphql) throw new Error(t('Integração indisponível nesta versão'));
  const res = await window.electronAPI.suwayomiGraphql({
    baseUrl: cfg.baseUrl,
    username: cfg.username,
    password: cfg.password,
    query,
    variables,
    timeoutMs,
  });
  if (!res.success) throw new Error(res.error || t('Erro ao falar com o Suwayomi'));
  return res.data as T;
}

/* ─────────────── Servidor ─────────────── */

export async function testConnection(cfg: SuwayomiConfig): Promise<string> {
  const data = await gql<{ aboutServer: { name: string; version: string } }>('query { aboutServer { name version } }', undefined, 8000, cfg);
  return `${data.aboutServer.name} ${data.aboutServer.version}`;
}

/** Tenta iniciar o servidor (se configurado) e espera ficar pronto. */
export async function ensureServerRunning(maxWaitMs = 45000): Promise<boolean> {
  const cfg = getSuwayomiConfig();
  if (!cfg) return false;
  try {
    await testConnection(cfg);
    return true;
  } catch {
    /* não está rodando */
  }
  if (!cfg.exePath || !window.electronAPI?.suwayomiStart) return false;
  const started = await window.electronAPI.suwayomiStart(cfg.exePath);
  if (!started.success) return false;
  const t0 = Date.now();
  while (Date.now() - t0 < maxWaitMs) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      await testConnection(cfg);
      return true;
    } catch {
      /* ainda iniciando */
    }
  }
  return false;
}

/* ─────────────── Fontes e catálogo ─────────────── */

export async function listSources(): Promise<SuwaSource[]> {
  const data = await gql<{ sources: { nodes: any[] } }>(
    'query { sources { nodes { id name lang displayName iconUrl supportsLatest isNsfw } } }'
  );
  return (data.sources?.nodes || [])
    .map((s) => ({ ...s, id: String(s.id), iconUrl: absoluteSuwaUrl(s.iconUrl) }))
    .filter((s) => s.id !== '0'); // fonte "Local" do servidor
}

const MANGA_FIELDS = 'id title thumbnailUrl author artist description genre status realUrl inLibrary sourceId source { displayName name }';

export async function browseSource(
  sourceId: string,
  type: 'POPULAR' | 'LATEST' | 'SEARCH',
  page: number,
  query?: string
): Promise<{ mangas: SuwaManga[]; hasNextPage: boolean }> {
  const data = await gql<{ fetchSourceManga: { mangas: SuwaManga[]; hasNextPage: boolean } }>(
    `mutation($input: FetchSourceMangaInput!) { fetchSourceManga(input: $input) { hasNextPage mangas { ${MANGA_FIELDS} } } }`,
    { input: { source: sourceId, type, page, query: type === 'SEARCH' ? query || '' : undefined } },
    90000
  );
  const r = data.fetchSourceManga || { mangas: [], hasNextPage: false };
  return { hasNextPage: !!r.hasNextPage, mangas: (r.mangas || []).map((m) => ({ ...m, thumbnailUrl: absoluteSuwaUrl(m.thumbnailUrl) })) };
}

export async function fetchMangaAndChapters(mangaId: number): Promise<{ manga: SuwaManga; chapters: SuwaChapter[] }> {
  const data = await gql<any>(
    `mutation($input: FetchMangaAndChaptersInput!) { fetchMangaAndChapters(input: $input) { manga { ${MANGA_FIELDS} } chapters { id name chapterNumber uploadDate scanlator isRead lastPageRead sourceOrder } } }`,
    { input: { id: mangaId, fetchManga: true, fetchChapters: true } },
    120000
  ).catch(async (err) => {
    // Servidores mais antigos: usa as mutações separadas
    if (!/fetchMangaAndChapters|FetchMangaAndChaptersInput|undefined/i.test(String(err?.message))) throw err;
    const m = await gql<any>(`mutation($input: FetchMangaInput!) { fetchManga(input: $input) { manga { ${MANGA_FIELDS} } } }`, { input: { id: mangaId } }, 120000);
    const c = await gql<any>(
      'mutation($input: FetchChaptersInput!) { fetchChapters(input: $input) { chapters { id name chapterNumber uploadDate scanlator isRead lastPageRead sourceOrder } } }',
      { input: { mangaId } },
      120000
    );
    return { fetchMangaAndChapters: { manga: m.fetchManga?.manga, chapters: c.fetchChapters?.chapters || [] } };
  });
  const payload = data.fetchMangaAndChapters || {};
  return {
    manga: { ...payload.manga, thumbnailUrl: absoluteSuwaUrl(payload.manga?.thumbnailUrl) },
    chapters: payload.chapters || [],
  };
}

export async function fetchChapterPageUrls(chapterId: number): Promise<string[]> {
  const data = await gql<{ fetchChapterPages: { pages: string[] } }>(
    'mutation($input: FetchChapterPagesInput!) { fetchChapterPages(input: $input) { pages } }',
    { input: { chapterId } },
    120000
  );
  return (data.fetchChapterPages?.pages || []).map((p) => absoluteSuwaUrl(p));
}

/* ─────────────── Extensões ─────────────── */

export async function listExtensions(refreshFromRepos = false): Promise<SuwaExtension[]> {
  const fields = 'pkgName name lang versionName iconUrl isInstalled hasUpdate isObsolete isNsfw';
  if (refreshFromRepos) {
    const data = await gql<any>(`mutation { fetchExtensions(input: {}) { extensions { ${fields} } } }`, undefined, 120000);
    return (data.fetchExtensions?.extensions || []).map((e: SuwaExtension) => ({ ...e, iconUrl: absoluteSuwaUrl(e.iconUrl) }));
  }
  const data = await gql<any>(`query { extensions { nodes { ${fields} } } }`);
  return (data.extensions?.nodes || []).map((e: SuwaExtension) => ({ ...e, iconUrl: absoluteSuwaUrl(e.iconUrl) }));
}

export async function changeExtension(pkgName: string, action: 'install' | 'update' | 'uninstall'): Promise<void> {
  await gql(
    'mutation($input: UpdateExtensionInput!) { updateExtension(input: $input) { extension { pkgName isInstalled hasUpdate } } }',
    { input: { id: pkgName, patch: { [action]: true } } },
    180000
  );
}

/** Adiciona um repositório de extensões (servidores recentes). */
export async function addExtensionRepo(indexUrl: string): Promise<void> {
  await gql('mutation($input: AddExtensionStoreInput!) { addExtensionStore(input: $input) { extensionStore { indexUrl } } }', { input: { indexUrl } }, 60000);
}

/* ─────────────── Conversões para a biblioteca do Tomodachi ─────────────── */

const STATUS_MAP: Record<string, number> = { ONGOING: 1, COMPLETED: 2, LICENSED: 3, PUBLISHING_FINISHED: 4, CANCELLED: 5, ON_HIATUS: 6 };

export function suwaMangaToLibraryItem(m: SuwaManga, sourceLabel?: string) {
  return {
    source: 'suwayomi',
    sourceName: `Suwayomi · ${sourceLabel || m.source?.displayName || m.source?.name || t('Fonte')}`,
    url: `${MANGA_PREFIX}${m.id}`,
    webUrl: m.realUrl || undefined,
    title: m.title,
    author: [m.author, m.artist].filter((x, i, a) => x && a.indexOf(x) === i).join(', '),
    description: m.description || '',
    genres: m.genre || [],
    status: STATUS_MAP[m.status || ''] ?? 0,
    cover: m.thumbnailUrl || '',
    dateAdded: Date.now(),
    favorite: false,
    categories: [] as string[],
    chapters: [] as any[],
  };
}

export function suwaChaptersToLibrary(chapters: SuwaChapter[]) {
  return chapters.map((c) => ({
    url: `${CHAPTER_PREFIX}${c.id}`,
    name: c.name || t('Capítulo {n}', { n: c.chapterNumber }),
    number: typeof c.chapterNumber === 'number' && c.chapterNumber >= 0 ? c.chapterNumber : 0,
    read: false,
    bookmark: false,
    lastPageRead: 0,
    lastSecondSeen: 0,
    lastModifiedAt: Number(c.uploadDate) || Date.now(),
  }));
}
