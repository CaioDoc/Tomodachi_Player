import axios, { AxiosError } from 'axios';
import type { GalleryItem, GalleryPageInfo } from '../types';
import { getSecret, setSecret } from '../utils/secrets';
import { t } from '../i18n';

export const DEFAULT_API_KEY = '';
const BASE_URL = 'https://nhentai.net/api/v2';

export interface NHentaiUser {
  id: number;
  username: string;
  slug?: string;
  avatar_url?: string;
  theme?: string;
  is_staff?: boolean;
}

export function formatAuthHeader(key?: string): string {
  let raw = key?.trim() || '';
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('bearer ')) {
    raw = raw.slice(7).trim();
  }
  if (raw.startsWith('Key ') || raw.startsWith('User ')) {
    return raw;
  }
  if (raw.startsWith('nhk_')) {
    return `Key ${raw}`;
  }
  return `User ${raw}`;
}

// O token fica criptografado no cofre do sistema (antes ficava em texto puro no localStorage)
export const NHENTAI_SECRET = 'nhentai_api_key';
export const getNHentaiToken = (): string => (typeof window === 'undefined' ? '' : getSecret(NHENTAI_SECRET, 'nhentai_api_key').trim());
export const setNHentaiToken = (token: string | null): void => setSecret(NHENTAI_SECRET, token, 'nhentai_api_key');

export function getActiveApiKey(): string {
  return getNHentaiToken();
}

export function getStoredNHentaiUser(): NHentaiUser | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = localStorage.getItem('nhentai_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredNHentaiUser(user: NHentaiUser, token?: string): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.setItem('nhentai_user', JSON.stringify(user));
    if (token && token.trim()) {
      setNHentaiToken(token.trim());
    }
    window.dispatchEvent(new CustomEvent('nhentai:auth-changed', { detail: { user, token } }));
  } catch {}
}

export function clearStoredNHentaiUser(): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    localStorage.removeItem('nhentai_user');
    setNHentaiToken(null);
    window.dispatchEvent(new CustomEvent('nhentai:auth-changed', { detail: null }));
  } catch {}
}

export function isNHentaiLoggedIn(): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false;
  const user = getStoredNHentaiUser();
  const token = getNHentaiToken();
  return Boolean(user && token.length > 0);
}

export const directNhentaiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Accept: 'application/json',
    'User-Agent': 'TomodachiPlayer/1.0.0'
  }
});

// Request interceptor to inject properly formatted active key
directNhentaiClient.interceptors.request.use((config) => {
  const activeKey = getActiveApiKey();
  const auth = formatAuthHeader(activeKey);
  if (auth) {
    config.headers['Authorization'] = auth;
  }
  return config;
});

// Response interceptor to format all errors into clean, readable messages
directNhentaiClient.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status;
    const data = error.response?.data as any;

    let msg = t('Falha na API NHentai ({status})', { status: status ?? t('sem resposta') });
    if (status === 401 || status === 403) {
      msg = t('Chave ou token de login inválido ou sem permissão. Verifique sua conta NHentai.');
    } else if (status === 429) {
      msg = t('Muitas requisições (Rate Limit). Aguarde um pouco e tente de novo.');
    } else if (data?.error) {
      const details = Array.isArray(data.details)
        ? ` (${data.details.join(', ')})`
        : data.details
        ? ` (${data.details})`
        : '';
      msg = `NHentai: ${data.error}${details}`;
    } else if (data?.message) {
      msg = `NHentai: ${data.message}`;
    } else if (data?.detail) {
      msg = `NHentai: ${typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail)}`;
    }
    return Promise.reject(new Error(msg));
  }
);

// Resolve thumbnail image URL
export function getGalleryThumbnail(item: GalleryItem): string {
  if (item.thumbnail) {
    return item.thumbnail.startsWith('http') ? item.thumbnail : `https://t.nhentai.net/${item.thumbnail}`;
  }
  if (item.cover) {
    return item.cover.startsWith('http') ? item.cover : `https://t.nhentai.net/${item.cover}`;
  }
  return `https://t.nhentai.net/galleries/${item.media_id}/thumb.webp`;
}

// Resolve cover image URL
export function getGalleryCover(item: GalleryItem): string {
  if (item.cover) {
    return item.cover.startsWith('http') ? item.cover : `https://t.nhentai.net/${item.cover}`;
  }
  if (item.thumbnail) {
    return item.thumbnail.startsWith('http') ? item.thumbnail : `https://t.nhentai.net/${item.thumbnail}`;
  }
  return `https://t.nhentai.net/galleries/${item.media_id}/cover.webp`;
}

// Resolve page image URL
export function getGalleryPageUrl(page: GalleryPageInfo | any, mediaId: string, index: number): string {
  if (page?.path) {
    return page.path.startsWith('http') ? page.path : `https://i.nhentai.net/${page.path}`;
  }
  return `https://i.nhentai.net/galleries/${mediaId}/${index + 1}.webp`;
}

// Search or browse galleries with pagination
export async function searchGalleries(
  query: string = '',
  page: number = 1
): Promise<{ result: GalleryItem[]; num_pages: number; per_page: number; total?: number }> {
  const endpoint = query.trim() ? `/search` : `/galleries`;
  const params = query.trim() ? { query: query.trim(), page } : { page };
  const customApiKey = getActiveApiKey();

  // Use Electron IPC proxy to bypass CORS
  if (window.electronAPI?.nhentaiApi) {
    const res = await window.electronAPI.nhentaiApi({ endpoint, method: 'GET', params, customApiKey });
    if (res.success && res.data) {
      return res.data;
    }
    throw new Error(typeof res.error === 'string' ? res.error : JSON.stringify(res.error || t('Falha ao buscar catálogo via IPC proxy')));
  }

  // Fallback to direct client
  const response = await directNhentaiClient.get(endpoint, { params });
  return response.data;
}

// Fetch user's favorite galleries
export async function fetchFavorites(
  query: string = '',
  page: number = 1
): Promise<{ result: GalleryItem[]; num_pages: number; per_page: number; total?: number }> {
  const endpoint = '/favorites';
  const params: any = { page };
  if (query.trim()) {
    params.q = query.trim();
  }
  const customApiKey = getActiveApiKey();

  if (window.electronAPI?.nhentaiApi) {
    const res = await window.electronAPI.nhentaiApi({ endpoint, method: 'GET', params, customApiKey });
    if (res.success && res.data) {
      return res.data;
    }
    throw new Error(typeof res.error === 'string' ? res.error : JSON.stringify(res.error || t('Falha ao buscar favoritos')));
  }

  const response = await directNhentaiClient.get(endpoint, { params });
  return response.data;
}

// Get user profile details
export async function getUserProfile(customToken?: string): Promise<NHentaiUser> {
  const endpoint = '/user';
  const customApiKey = customToken || getActiveApiKey();

  if (window.electronAPI?.nhentaiApi) {
    const res = await window.electronAPI.nhentaiApi({ endpoint, method: 'GET', customApiKey });
    if (res.success && res.data) {
      return res.data;
    }
    throw new Error(typeof res.error === 'string' ? res.error : JSON.stringify(res.error || t('Falha ao buscar perfil de usuário')));
  }

  const response = await directNhentaiClient.get(endpoint, {
    headers: { Authorization: formatAuthHeader(customApiKey) }
  });
  return response.data;
}

// Check if gallery is favorited
export async function checkIsFavorited(galleryId: number): Promise<boolean> {
  const endpoint = `/galleries/${galleryId}/favorite`;
  const customApiKey = getActiveApiKey();

  try {
    if (window.electronAPI?.nhentaiApi) {
      const res = await window.electronAPI.nhentaiApi({ endpoint, method: 'GET', customApiKey });
      if (res.success && res.data) {
        return Boolean(res.data.favorited);
      }
      return false;
    }

    const response = await directNhentaiClient.get(endpoint);
    return Boolean(response.data?.favorited);
  } catch {
    return false;
  }
}

// Add gallery to favorites
export async function addToFavorites(galleryId: number): Promise<boolean> {
  const endpoint = `/galleries/${galleryId}/favorite`;
  const customApiKey = getActiveApiKey();

  if (window.electronAPI?.nhentaiApi) {
    const res = await window.electronAPI.nhentaiApi({ endpoint, method: 'POST', customApiKey });
    if (res.success) {
      return true;
    }
    throw new Error(res.error || t('Falha ao favoritar galeria'));
  }

  await directNhentaiClient.post(endpoint);
  return true;
}

// Remove gallery from favorites
export async function removeFromFavorites(galleryId: number): Promise<boolean> {
  const endpoint = `/galleries/${galleryId}/favorite`;
  const customApiKey = getActiveApiKey();

  if (window.electronAPI?.nhentaiApi) {
    const res = await window.electronAPI.nhentaiApi({ endpoint, method: 'DELETE', customApiKey });
    if (res.success) {
      return true;
    }
    throw new Error(res.error || t('Falha ao remover dos favoritos'));
  }

  await directNhentaiClient.delete(endpoint);
  return true;
}

// Get details for a single gallery
export async function getGalleryDetails(id: number): Promise<GalleryItem> {
  const endpoint = `/galleries/${id}`;
  const customApiKey = getActiveApiKey();

  if (window.electronAPI?.nhentaiApi) {
    const res = await window.electronAPI.nhentaiApi({ endpoint, method: 'GET', customApiKey });
    if (res.success && res.data) {
      return res.data;
    }
    throw new Error(typeof res.error === 'string' ? res.error : JSON.stringify(res.error || t('Falha ao carregar galeria #{id}', { id })));
  }

  const response = await directNhentaiClient.get(endpoint);
  return response.data;
}
