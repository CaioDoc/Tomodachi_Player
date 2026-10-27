// src/api/extensionRegistry.ts
// Registro centralizado de extensões: mapeia fontes (sources) a websites,
// gerencia extensões "instaladas" e resolve URLs de mangás/capítulos.

import { loadRepos, readCache } from './reposStore';
import type { RepoExtension } from './repositories';

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface InstalledExtension {
  pkg: string;
  name: string;
  sourceName: string;
  lang: string;
  baseUrl: string;       // domínio do website da fonte (ex: "mangadex.org")
  repoUrl?: string;      // URL do repositório de origem
  icon?: string;
  installedAt: number;
  type?: 'manga' | 'anime';
  /** Versão no repositório (preenchida pela atualização automática) */
  version?: string;
}

export interface ExtensionMatch {
  extension: RepoExtension;
  repoUrl: string;
  sourceName: string;
  baseUrl: string;
}

// ─── Mapa Estático de Fontes Conhecidas ──────────────────────────────────────

const SOURCE_DOMAIN_MAP: Record<string, string> = {
  // Fontes de Anime / Vídeo
  'BetterAnime': 'betteranime.net', 'Better Anime': 'betteranime.net',
  'AnimesOnline': 'animesonline.cc', 'Animes Online': 'animesonline.cc',
  'AnimesVision': 'animesvision.biz', 'Animes Vision': 'animesvision.biz',
  'AnimeFire': 'animefire.plus', 'Anime Fire': 'animefire.plus',
  'Gogoanime': 'anitaku.to', 'GogoAnime': 'anitaku.to',
  '9anime': 'aniwave.to', 'AniWave': 'aniwave.to',
  'Zoro': 'hianime.to', 'HiAnime': 'hianime.to',
  'AnimePahe': 'animepahe.ru', 'Animepahe': 'animepahe.ru',
  'Crunchyroll': 'crunchyroll.com',
  'AnimeDao': 'animedao.to',
  'KickAssAnime': 'kaas.to',
  'Marin': 'marin.moe',
  'Monoschinos': 'monoschinos2.com',
  'AnimeFLV': 'animeflv.net',
  'Jkanime': 'jkanime.net',
  // Globais Mangá
  'MangaDex': 'mangadex.org', 'Mangadex': 'mangadex.org',
  'MangaFire': 'mangafire.to', 'Mangafire': 'mangafire.to',
  'Atsumaru': 'atsu.moe', 'Atsu': 'atsu.moe',
  'MangaPlus': 'mangaplus.shueisha.co.jp', 'MANGA Plus by SHUEISHA': 'mangaplus.shueisha.co.jp',
  'Webtoons': 'webtoons.com', 'WEBTOON': 'webtoons.com', 'Webtoon': 'webtoons.com',
  'ComicK': 'comick.io', 'Comick': 'comick.io',
  'MangaUpdates': 'mangaupdates.com',
  'GlobalComix': 'globalcomix.com', 'Global Comix': 'globalcomix.com',
  // EN
  'Mangakakalot': 'mangakakalot.com', 'Manganato': 'manganato.com', 'Chapmanganato': 'chapmanganato.to',
  'MangaFox': 'fanfox.net', 'Mangafox': 'fanfox.net',
  'MangaHere': 'mangahere.cc', 'Mangahere': 'mangahere.cc',
  'MangaPark': 'mangapark.net', 'Mangapark': 'mangapark.net', 'MangaPark v5': 'mangapark.net',
  'MangaSee': 'mangasee123.com', 'Mangasee': 'mangasee123.com',
  'MangaLife': 'manga4life.com', 'Manga4Life': 'manga4life.com',
  'Mangabuddy': 'mangabuddy.com', 'MangaBuddy': 'mangabuddy.com',
  'AsuraScans': 'asuracomic.net', 'Asura Scans': 'asuracomic.net', 'Asura Scans (EN)': 'asuracomic.net',
  'Batoto': 'bato.to', 'Bato.to': 'bato.to', 'Bato.To': 'bato.to',
  'Omega Scans': 'omegascans.org', 'OmegaScans': 'omegascans.org',
  'ReaperScans': 'reaperscans.com', 'Reaper Scans': 'reaperscans.com',
  'LuminousScans': 'luminousscans.net', 'Luminous Scans': 'luminousscans.net',
  'FlameScans': 'flamescans.org', 'Flame Scans': 'flamescans.org', 'Flame Comics': 'flamecomics.xyz',
  'ReadComicOnline': 'readcomiconline.li', 'Read Comic Online': 'readcomiconline.li',
  'VyvyManga': 'vyvymanga.net', 'MangaKakalot.tv': 'mangakakalot.tv',
  'KissManga': 'kissmanga.org', 'MangaReader': 'mangareader.to',
  'Kissmanga.in': 'kissmanga.in',
  'Toonily': 'toonily.com', 'ManhuaPlus': 'manhuaplus.org',
  'MangaClash': 'mangaclash.com', 'MangaTX': 'mangatx.com',
  'IsekaiScan': 'isekaiscan.to', 'ZeroScans': 'zeroscans.com', 'Zero Scans': 'zeroscans.com',
  'Drake Scans': 'drakescans.com',
  'HotComics': 'hotcomics.me', 'Hot Comics': 'hotcomics.me',
  'ToonHey': 'toonhey.com',
  'Manhwa18.cc': 'manhwa18.cc',
  'Manga18.Club': 'manga18.club',
  'KingComiX': 'kingcomix.com',
  'Jinmangas': 'jinmangas.com',
  'Pawchive': 'pawchive.pw',
  // PT-BR
  'MangaLivre': 'mangalivre.net', 'Manga Livre': 'mangalivre.net',
  'MuitoManga': 'muitomanga.com', 'Muito Manga': 'muitomanga.com',
  'UnionMangas': 'unionmangas.top', 'Union Mangás': 'unionmangas.top',
  'MangaHosted': 'mangahosted.com',
  'SlimeRead': 'slimeread.com', 'Slime Read': 'slimeread.com',
  'TaoSect': 'taosect.com', 'Tao Sect': 'taosect.com',
  'BRMangas': 'brmangas.net', 'BR Mangás': 'brmangas.net',
  'YomuMangas': 'yomumangas.com',
  'MangaYabu': 'mangayabu.top',
  'GekkouScans': 'gekkouscans.com.br', 'Gekkou Scans': 'gekkouscans.com.br',
  'HuntersScan': 'huntersscan.com', 'Hunters Scan': 'huntersscan.com',
  'RandomScan': 'randomscan.com', 'Random Scan': 'randomscan.com',
  'LerManga': 'lermanga.org', 'Ler Manga': 'lermanga.org',
  'ArgosComics': 'argoscomics.com.br', 'Argos Comics': 'argoscomics.com.br',
  'Tsuki Mangás': 'tsukimangas.com', 'TsukiMangas': 'tsukimangas.com',
  'Mangá Online': 'mangaonline.biz', 'MangaOnline': 'mangaonline.biz',
  'Central de Mangás': 'centraldemangas.online', 'CentralDeMangas': 'centraldemangas.online',
  'Mark Mangás': 'markmangas.net', 'MarkMangas': 'markmangas.net',
  'Opus Scans': 'opusscans.com',
  // ES
  'TuMangaOnline': 'visortmo.com', 'TMO': 'visortmo.com', 'Tmo': 'visortmo.com',
  'MangaES': 'manga-es.com', 'LeerCapitulo': 'leercapitulo.com',
  'InManga': 'inmanga.com', 'LeerManga': 'leermanga.net', 'MangaMx': 'mangamx.com',
  // FR
  'Japscan': 'japscan.lol', 'Scan Manga': 'scanmanga-vf.ws', 'Scan-Manga': 'scanmanga-vf.ws',
  'Sushi-Scan': 'sushiscan.net', 'SushiScan': 'sushiscan.net',
  // JP
  'Raw Manga': 'rawmanga.top', 'Rawkuma': 'rawkuma.com',
  // Adulto & Comics
  'NHentai': 'nhentai.net', 'nHentai': 'nhentai.net', 'nhentai': 'nhentai.net',
  '3Hentai': '3hentai.net', '3hentai': '3hentai.net',
  'HentaiNexus': 'hentainexus.com', 'Hentai Nexus': 'hentainexus.com',
  'HentaiEra': 'hentaiera.com', 'Hentai Era': 'hentaiera.com',
  'E-Hentai': 'e-hentai.org', 'e-hentai': 'e-hentai.org',
  'Hitomi': 'hitomi.la', 'hitomi': 'hitomi.la',
  'Pururin': 'pururin.to',
  'HentaiFox': 'hentaifox.com', 'IMHentai': 'imhentai.xxx',
  'Hentai2Read': 'hentai2read.com',
  'Milftoon': 'milftoon.xxx', 'Milftoons': 'milftoon.xxx',
  'Luscious': 'luscious.net', 'ah-img': 'ah-img.luscious.net',
  'AllPornComic': 'allporncomic.com', 'AllPornComics.co': 'allporncomics.co', 'AllPornComic.io': 'allporncomic.io',
  'HentaiXComic': 'hentaixcomic.com',
  'Eggporncomics': 'eggporncomics.com',
  '8Muses': 'comics.8muses.com', '8muses': 'comics.8muses.com',
  'SpyFakku': 'spyfakku.com',
};

const LS_KEY = 'installed_extensions';

// ─── Gerenciamento de Extensões Instaladas ───────────────────────────────────

export function getInstalledExtensions(type?: 'manga' | 'anime'): InstalledExtension[] {
  let list: InstalledExtension[] = [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) list = JSON.parse(raw);
  } catch { /* ignore */ }

  if (!type) return list;

  return list.filter((e) => {
    if (e.type) return e.type === type;
    const isAnime = (e.repoUrl && /anime|aniyomi/i.test(e.repoUrl)) || (e.pkg && /anime/i.test(e.pkg));
    if (type === 'anime') return isAnime;
    return !isAnime;
  });
}

export function saveInstalledExtensions(exts: InstalledExtension[]): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(exts));
  } catch { /* quota */ }
  try {
    window.dispatchEvent(new CustomEvent('extensions:updated'));
  } catch { /* ignore */ }
}

export function installExtension(ext: InstalledExtension): void {
  const current = getInstalledExtensions();
  const idx = current.findIndex((e) => e.pkg === ext.pkg);
  if (idx >= 0) {
    current[idx] = { ...current[idx], ...ext };
  } else {
    current.push(ext);
  }
  saveInstalledExtensions(current);
}

export function removeExtension(pkg: string): void {
  const current = getInstalledExtensions().filter((e) => e.pkg !== pkg);
  saveInstalledExtensions(current);
}

export function isExtensionInstalled(sourceName: string): boolean {
  const exts = getInstalledExtensions();
  const norm = sourceName.toLowerCase().trim();
  return exts.some((e) =>
    e.sourceName.toLowerCase().trim() === norm ||
    e.name.toLowerCase().trim() === norm
  );
}

export function isExtensionInstalledByPkg(pkg: string): boolean {
  if (!pkg) return false;
  const exts = getInstalledExtensions();
  return exts.some((e) => e.pkg === pkg);
}

// ─── Resolução de Domínio de Fonte ───────────────────────────────────────────

export function resolveSourceBaseUrl(sourceName?: string, mangaUrl?: string): string | null {
  if (!sourceName && !mangaUrl) return null;

  // 1. Extensão já instalada
  if (sourceName) {
    const installed = getInstalledExtensions();
    const norm = sourceName.toLowerCase().trim();
    const match = installed.find((e) =>
      e.sourceName.toLowerCase().trim() === norm ||
      e.name.toLowerCase().trim() === norm
    );
    if (match?.baseUrl) return match.baseUrl;
  }

  // 2. Mapa estático
  if (sourceName) {
    const direct = SOURCE_DOMAIN_MAP[sourceName];
    if (direct) return direct;

    const normKey = sourceName.toLowerCase().trim();
    for (const [key, domain] of Object.entries(SOURCE_DOMAIN_MAP)) {
      if (key.toLowerCase().trim() === normKey) return domain;
    }
    for (const [key, domain] of Object.entries(SOURCE_DOMAIN_MAP)) {
      if (normKey.includes(key.toLowerCase()) || key.toLowerCase().includes(normKey)) {
        return domain;
      }
    }
  }

  // 3. Extrai domínio da URL do mangá
  if (mangaUrl) {
    let url = mangaUrl.trim();
    if (url.startsWith('//')) url = `https:${url}`;
    if (url.startsWith('http://') || url.startsWith('https://')) {
      try {
        return new URL(url).hostname;
      } catch { /* ignore */ }
    }
  }

  return null;
}

export function findExtensionInRepos(sourceName: string): ExtensionMatch | null {
  if (!sourceName) return null;
  const normSource = sourceName.toLowerCase().trim();

  for (const type of ['manga', 'anime'] as const) {
    const repos = loadRepos(type);
    for (const repo of repos) {
      const cached = readCache(type, repo.url) as RepoExtension[] | null;
      if (!cached) continue;

      for (const ext of cached) {
        if (ext.sources && ext.sources.length > 0) {
          for (const src of ext.sources) {
            if (src.name.toLowerCase().trim() === normSource) {
              return {
                extension: ext,
                repoUrl: repo.url,
                sourceName: src.name,
                baseUrl: (src as any).baseUrl || ext.baseUrl || resolveSourceBaseUrl(src.name) || '',
              };
            }
          }
        }
        if (ext.name.toLowerCase().trim() === normSource) {
          return {
            extension: ext,
            repoUrl: repo.url,
            sourceName: ext.name,
            baseUrl: ext.baseUrl || resolveSourceBaseUrl(ext.name) || '',
          };
        }
      }
    }
  }

  return null;
}

// ─── Resolução de URLs ───────────────────────────────────────────────────────

export function buildMangaWebUrl(mangaUrl: string, sourceName?: string): string | null {
  if (!mangaUrl) return null;
  let url = mangaUrl.trim();
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;

  const domain = resolveSourceBaseUrl(sourceName, mangaUrl);
  if (domain) {
    const sep = url.startsWith('/') ? '' : '/';
    if (domain.startsWith('http')) {
      try { return new URL(url, domain).href; } catch { /* ignore */ }
    }
    return `https://${domain}${sep}${url}`;
  }
  return null;
}

export function buildChapterWebUrl(
  chapterUrl: string, mangaUrl: string, sourceName?: string
): string | null {
  if (!chapterUrl) return null;
  let chapUrl = chapterUrl.trim();
  if (chapUrl.startsWith('suwayomi:')) return chapUrl;
  if (chapUrl.startsWith('http://') || chapUrl.startsWith('https://')) return chapUrl;
  if (chapUrl.startsWith('//')) return `https:${chapUrl}`;

  const s = (sourceName || '').toLowerCase().trim();

  // MangaDex UUID
  const isDex = s.includes('mangadex') || mangaUrl?.includes('mangadex.org');
  if (isDex) {
    const uuidMatch = chapUrl.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
    if (uuidMatch) return `https://mangadex.org/chapter/${uuidMatch[0]}`;
    const cleanPath = chapUrl.replace(/^\/chapter\//, '').replace(/^\//, '');
    if (/^[0-9a-fA-F-]{36}$/.test(cleanPath)) return `https://mangadex.org/chapter/${cleanPath}`;
  }

  // Atsumaru (formato mangaId/chapterId ou v8Kbg/xGVbd)
  if (s.includes('atsu') || /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(chapUrl)) {
    return `https://atsu.moe/read/${chapUrl.replace(/^\/+/, '')}`;
  }

  // MangaFire
  if (s.includes('mangafire') || s.includes('mfcdn')) {
    const p = chapUrl.replace(/^\/+/, '');
    return `https://mangafire.to/${p}`;
  }

  // NHentai
  if (s.includes('nhentai') || chapUrl.startsWith('/g/')) {
    return `https://nhentai.net/${chapUrl.replace(/^\/+/, '')}`;
  }

  // HentaiNexus
  if (s.includes('hentainexus') || chapUrl.startsWith('/read/') || chapUrl.startsWith('/view/')) {
    return `https://hentainexus.com/${chapUrl.replace(/^\/+/, '')}`;
  }

  // 3Hentai
  if (s.includes('3hentai') || chapUrl.startsWith('/d/')) {
    return `https://3hentai.net/${chapUrl.replace(/^\/+/, '')}`;
  }

  // HentaiEra
  if (s.includes('hentaiera') || chapUrl.startsWith('/gallery/')) {
    return `https://hentaiera.com/${chapUrl.replace(/^\/+/, '')}`;
  }

  // Luscious
  if (s.includes('luscious')) {
    if (/\.(jpg|jpeg|png|webp|avif)$/i.test(chapUrl)) {
      return `https://ah-img.luscious.net/${chapUrl.replace(/^\/+/, '')}`;
    }
    return `https://luscious.net/${chapUrl.replace(/^\/+/, '')}`;
  }

  // Tenta resolver contra a URL do mangá (se absoluta)
  let absManUrl = mangaUrl?.trim() || '';
  if (absManUrl.startsWith('//')) absManUrl = `https:${absManUrl}`;
  if (absManUrl.startsWith('http://') || absManUrl.startsWith('https://')) {
    try { return new URL(chapUrl, absManUrl).href; } catch { /* ignore */ }
  }

  // Resolve com o domínio da fonte
  const domain = resolveSourceBaseUrl(sourceName, mangaUrl);
  if (domain) {
    const sep = chapUrl.startsWith('/') ? '' : '/';
    if (domain.startsWith('http')) {
      try { return new URL(chapUrl, domain).href; } catch { /* ignore */ }
    }
    return `https://${domain}${sep}${chapUrl}`;
  }
  return null;
}

export function getSourceDomainMap(): Record<string, string> {
  return { ...SOURCE_DOMAIN_MAP };
}

export function deriveNameFromPkg(pkg: string): string {
  const parts = pkg.split('.');
  return parts[parts.length - 1] || '';
}

export function resolveWorkUrl(
  mangaUrl: string,
  sourceName?: string,
  baseUrl?: string
): string {
  if (!mangaUrl) return '';
  const trimmed = mangaUrl.trim();
  if (trimmed.startsWith('suwayomi:')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  if (trimmed.startsWith('//')) {
    return `https:${trimmed}`;
  }

  const s = (sourceName || '').toLowerCase().trim();

  // 1. Atsumaru
  if (s.includes('atsu')) {
    const isChapter = trimmed.includes('/read/') || /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(trimmed.replace(/^\/?(manga|read)\//i, ''));
    const clean = trimmed.replace(/^\/?(manga|read)\//i, '').replace(/^\/+/, '');
    return isChapter ? `https://atsu.moe/read/${clean}` : `https://atsu.moe/manga/${clean}`;
  }

  // 2. MangaDex
  if (s.includes('mangadex')) {
    const isChapter = trimmed.includes('/chapter/');
    const clean = trimmed.replace(/^\/?(title|manga|chapter)\//i, '').replace(/^\/+/, '');
    return isChapter ? `https://mangadex.org/chapter/${clean}` : `https://mangadex.org/title/${clean}`;
  }

  // 3. MangaFire
  if (s.includes('mangafire') || s.includes('mfcdn')) {
    const clean = trimmed.replace(/^\/+/, '');
    return `https://mangafire.to/${clean.startsWith('manga/') ? clean : `manga/${clean}`}`;
  }

  // 4. NHentai
  if (s.includes('nhentai')) {
    const clean = trimmed.replace(/^\/?g\//i, '').replace(/^\/+|\/+$/g, '');
    return `https://nhentai.net/g/${clean}/`;
  }

  // 5. 3Hentai
  if (s.includes('3hentai')) {
    const clean = trimmed.replace(/^\/?d\//i, '').replace(/^\/+/, '');
    return `https://3hentai.net/d/${clean}`;
  }

  // 6. HentaiNexus
  if (s.includes('hentainexus')) {
    const clean = trimmed.replace(/^\/?(view|read)\//i, '').replace(/^\/+/, '');
    return `https://hentainexus.com/view/${clean}`;
  }

  // 7. HentaiEra
  if (s.includes('hentaiera')) {
    const clean = trimmed.replace(/^\/?gallery\//i, '').replace(/^\/+/, '');
    return `https://hentaiera.com/gallery/${clean}/`;
  }

  // 8. Luscious
  if (s.includes('luscious')) {
    const clean = trimmed.replace(/^\/?albums\//i, '').replace(/^\/+/, '');
    return `https://luscious.net/albums/${clean}`;
  }

  // 9. Se temos baseUrl da extensão
  if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
    try {
      return new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, baseUrl).href;
    } catch {}
  }

  // 10. Se a fonte mapeia para um domínio conhecido em SOURCE_DOMAIN_MAP
  for (const [name, domain] of Object.entries(SOURCE_DOMAIN_MAP)) {
    if (s.includes(name.toLowerCase())) {
      const pathPart = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
      return `https://${domain}${pathPart}`;
    }
  }

  if (trimmed.startsWith('/')) {
    const dom = resolveSourceBaseUrl(sourceName);
    if (dom) return `https://${dom}${trimmed}`;
  }

  return trimmed;
}

// ─── Resolução Inteligente de URLs para Assistir Anime na Webview ────────────

export function buildAnimeWatchWebUrl(
  title: string,
  episodeNum?: number,
  sourceName?: string,
  extensionBaseUrl?: string
): string {
  const cleanTitle = (title || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/[^\w\s\u00C0-\u017F-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const epSuffix = episodeNum ? ` episodio ${episodeNum}` : '';
  const s = (sourceName || '').toLowerCase().trim();

  // BetterAnime
  if (s.includes('betteranime') || extensionBaseUrl?.includes('betteranime.net')) {
    return `https://betteranime.net/pesquisa?titulo=${encodeURIComponent(cleanTitle)}`;
  }
  // AnimeFire
  if (s.includes('animefire') || extensionBaseUrl?.includes('animefire.plus')) {
    const slug = cleanTitle.toLowerCase().replace(/\s+/g, '-');
    return `https://animefire.plus/pesquisar/${encodeURIComponent(slug)}`;
  }
  // HiAnime / Zoro
  if (s.includes('hianime') || s.includes('zoro') || extensionBaseUrl?.includes('hianime.to')) {
    return `https://hianime.to/search?keyword=${encodeURIComponent(cleanTitle)}`;
  }
  // GogoAnime / Anitaku
  if (s.includes('gogo') || s.includes('anitaku') || extensionBaseUrl?.includes('anitaku.to')) {
    return `https://anitaku.to/search.html?keyword=${encodeURIComponent(cleanTitle)}`;
  }
  // AnimesOnline
  if (s.includes('animesonline') || extensionBaseUrl?.includes('animesonline.cc')) {
    return `https://animesonline.cc/search/${encodeURIComponent(cleanTitle)}`;
  }
  // Se houver baseUrl da extensão genérica
  if (extensionBaseUrl && extensionBaseUrl.startsWith('http')) {
    return `${extensionBaseUrl.replace(/\/+$/, '')}/search?q=${encodeURIComponent(cleanTitle)}`;
  }

  // Universal: DuckDuckGo search para assistir online diretamente no leitor/portal web
  return `https://duckduckgo.com/?q=${encodeURIComponent(`${cleanTitle}${epSuffix} assistir anime online`)}`;
}



/** Extensões de anime que já vêm no app */
export const BUILTIN_ANIME_EXTENSIONS: InstalledExtension[] = [
  { pkg: 'builtin-betteranime', name: 'BetterAnime', sourceName: 'BetterAnime', lang: 'pt-BR', baseUrl: 'https://betteranime.net', installedAt: 0, type: 'anime' },
  { pkg: 'builtin-animefire', name: 'AnimeFire', sourceName: 'AnimeFire', lang: 'pt-BR', baseUrl: 'https://animefire.plus', installedAt: 0, type: 'anime' },
  { pkg: 'builtin-hianime', name: 'HiAnime', sourceName: 'HiAnime', lang: 'en', baseUrl: 'https://hianime.to', installedAt: 0, type: 'anime' },
  { pkg: 'builtin-gogoanime', name: 'GogoAnime', sourceName: 'GogoAnime', lang: 'en', baseUrl: 'https://anitaku.to', installedAt: 0, type: 'anime' },
];

/** Extensões de anime disponíveis (as do app + as instaladas, sem repetir) */
export function getAnimeSources(): InstalledExtension[] {
  // Só as que o usuário instalou (as "embutidas" não aparecem mais sem ele pedir)
  return getInstalledExtensions('anime');
}
