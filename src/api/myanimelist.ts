// src/api/myanimelist.ts
// MyAnimeList na busca do Descobrir.
// Sem configurar nada usa o Jikan (espelho público do MAL); com um Client ID usa a API oficial.
// O Client ID fica no cofre do sistema (nunca no código nem no localStorage).

import { getSecret, setSecret } from '../utils/secrets';
import { anilistAnimeByMalId, anilistAnimeToWork } from './recommend';
import { t } from '../i18n';

export const MAL_EVENT = 'tp:mal-settings';
const ENABLED_KEY = 'tp_mal_search';
const SECRET = 'mal_client_id';

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
  clientIdRejected?: boolean;
}

const notify = () => {
  try {
    window.dispatchEvent(new CustomEvent(MAL_EVENT));
  } catch {
    /* ignore */
  }
};

/** Mostrar resultados do MyAnimeList na busca (ligado por padrão) */
export function isMalSearchEnabled(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setMalSearchEnabled(on: boolean) {
  try {
    localStorage.setItem(ENABLED_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
  notify();
}

/** Só o Client ID (letras e números). O Client Secret não é usado em lugar nenhum. */
export const isValidMalClientId = (v: string) => /^[A-Za-z0-9]{16,64}$/.test(v.trim());

export const getMalClientId = () => getSecret(SECRET);

export function setMalClientId(value: string | null) {
  setSecret(SECRET, value && isValidMalClientId(value) ? value.trim() : null);
  void window.electronAPI?.malClearCache?.();
  notify();
}

export async function testMalClientId(clientId: string): Promise<{ success: boolean; count?: number; error?: string }> {
  if (!isValidMalClientId(clientId)) return { success: false, error: 'invalid' };
  if (!window.electronAPI?.malTest) return { success: false, error: t('Disponível só no app instalado') };
  return window.electronAPI.malTest(clientId.trim());
}

/** Fora do Electron (pré-visualização): o Jikan aceita chamadas direto da página */
async function jikanDirect(query: string, limit: number): Promise<MalSearchResult> {
  const res = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=true`);
  if (!res.ok) return { success: false, error: `HTTP ${res.status}` };
  const data = await res.json();
  return {
    success: true,
    via: 'jikan',
    items: (data?.data || []).map((n: any) => ({
      id: n.mal_id,
      title: n.title,
      altTitles: [n.title_english, n.title_japanese].filter(Boolean),
      cover: n.images?.webp?.large_image_url || n.images?.jpg?.large_image_url,
      year: n.year || n.aired?.prop?.from?.year,
      score: n.score ?? undefined,
      type: n.type ? String(n.type).toUpperCase() : undefined,
      episodes: n.episodes || undefined,
      genres: (n.genres || []).map((g: any) => g.name),
      url: n.url,
    })),
  };
}

export async function malSearch(query: string, limit = 20): Promise<MalSearchResult> {
  const q = query.trim();
  if (!q) return { success: true, items: [] };
  if (window.electronAPI?.malSearch) return window.electronAPI.malSearch({ query: q, limit });
  return jikanDirect(q, limit);
}

const TYPE_LABEL: Record<string, string> = { TV: 'TV', MOVIE: 'Filme', OVA: 'OVA', ONA: 'ONA', SPECIAL: 'Especial', TV_SPECIAL: 'Especial', MUSIC: 'Música' };
export const malTypeLabel = (type?: string) => (type ? t(TYPE_LABEL[type] || type) : '');

type OpenTabFn = (typeOrTab: any, title?: string, data?: any) => void;

/**
 * Abre a obra: se ela existe no AniList, abre a página completa (episódios, "Assistir", "Talvez você goste");
 * senão abre a página dela no MyAnimeList, no navegador do app.
 */
export async function openMalAnime(item: MalAnime, onOpenTab?: OpenTabFn): Promise<'anilist' | 'mal'> {
  try {
    const media = await anilistAnimeByMalId(item.id);
    if (media && !(media as any).isAdult) {
      const work = anilistAnimeToWork(media);
      onOpenTab?.('anime-detail', work.title, { anime: { ...work, altTitles: [item.title, ...item.altTitles], year: media.seasonYear || item.year, score: media.averageScore || undefined } });
      return 'anilist';
    }
  } catch {
    /* sem AniList: abre no MAL */
  }
  onOpenTab?.('webview', item.title, { initialUrl: item.url, url: item.url });
  return 'mal';
}
