// src/api/komga.ts
// Cliente e sincronizador para o servidor Komga (https://komga.org)
// Permite sincronizar coleções, séries e livros do Komga para a "Minha Biblioteca"
// e realizar leitura nativa de páginas diretamente no MangaReader.

import type { LibraryItem, LibraryChapter } from '../components/MihonLibrary';
import type { MangaPage } from '../components/MangaReader';
import { t } from '../i18n';

export interface KomgaConfig {
  serverUrl: string;
  authType: 'apiKey' | 'credentials';
  apiKey: string;
  username: string;
  password: string;
  selectedLibraries: string[]; // IDs de bibliotecas a sincronizar (vazio = todas)
  autoSync?: boolean;
  lastSyncTime?: number;
  syncStats?: {
    seriesCount: number;
    booksCount: number;
    lastSyncedAt: number;
  };
}

export const KOMGA_CONFIG_KEY = 'komga_config';

const DEFAULT_CONFIG: KomgaConfig = {
  serverUrl: 'http://localhost:25600',
  authType: 'apiKey',
  apiKey: '',
  username: '',
  password: '',
  selectedLibraries: [],
};

export function getKomgaConfig(): KomgaConfig {
  try {
    const raw = localStorage.getItem(KOMGA_CONFIG_KEY);
    if (raw) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    }
  } catch {
    /* fallback */
  }
  return DEFAULT_CONFIG;
}

export function saveKomgaConfig(patch: Partial<KomgaConfig>): KomgaConfig {
  const current = getKomgaConfig();
  const updated: KomgaConfig = { ...current, ...patch };
  try {
    localStorage.setItem(KOMGA_CONFIG_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent('komga:config-updated', { detail: updated }));
  } catch (err) {
    console.error('Falha ao salvar configuração Komga:', err);
  }
  return updated;
}

export function normalizeKomgaUrl(rawUrl: string): string {
  let url = (rawUrl || '').trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) {
    url = `http://${url}`;
  }
  return url.replace(/\/+$/, '');
}

export function getKomgaHeaders(config?: KomgaConfig): Record<string, string> {
  const cfg = config || getKomgaConfig();
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };

  if (cfg.authType === 'apiKey' && cfg.apiKey.trim()) {
    headers['X-API-Key'] = cfg.apiKey.trim();
  } else if (cfg.authType === 'credentials' && cfg.username.trim()) {
    try {
      const token = btoa(unescape(encodeURIComponent(`${cfg.username.trim()}:${cfg.password}`)));
      headers['Authorization'] = `Basic ${token}`;
    } catch {
      headers['Authorization'] = `Basic ${btoa(`${cfg.username.trim()}:${cfg.password}`)}`;
    }
  }

  return headers;
}

export interface KomgaTestResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    roles?: string[];
  };
  libraries?: Array<{
    id: string;
    name: string;
    root: string;
    seriesCount?: number;
  }>;
  error?: string;
}

export async function testKomgaConnection(config?: KomgaConfig): Promise<KomgaTestResult> {
  const cfg = config || getKomgaConfig();
  const baseUrl = normalizeKomgaUrl(cfg.serverUrl);
  if (!baseUrl) {
    return { success: false, error: t('URL do servidor Komga não informada') };
  }

  const headers = getKomgaHeaders(cfg);

  try {
    // 1. Testa autenticação buscando usuário logado
    const userRes = await fetch(`${baseUrl}/api/v1/users/me`, {
      method: 'GET',
      headers,
    });

    if (userRes.status === 401 || userRes.status === 403) {
      return {
        success: false,
        error: t('Credenciais inválidas ou acesso não autorizado (401/403). Verifique sua chave de API ou usuário/senha.'),
      };
    }

    if (!userRes.ok) {
      return {
        success: false,
        error: t('Erro ao conectar com Komga (HTTP {status}): {text}', { status: userRes.status, text: userRes.statusText }),
      };
    }

    const userData = await userRes.json();

    // 2. Busca lista de bibliotecas no Komga
    let libraries: any[] = [];
    try {
      const libsRes = await fetch(`${baseUrl}/api/v1/libraries`, {
        method: 'GET',
        headers,
      });
      if (libsRes.ok) {
        libraries = await libsRes.json();
      }
    } catch {
      /* ignore */
    }

    return {
      success: true,
      user: userData,
      libraries,
    };
  } catch (err: any) {
    return {
      success: false,
      error: t('Não foi possível conectar ao servidor Komga em "{url}": {error}', { url: baseUrl, error: err?.message || String(err) }),
    };
  }
}

export async function fetchKomgaLibraries(config?: KomgaConfig): Promise<Array<{ id: string; name: string; root: string }>> {
  const cfg = config || getKomgaConfig();
  const baseUrl = normalizeKomgaUrl(cfg.serverUrl);
  if (!baseUrl) return [];

  try {
    const res = await fetch(`${baseUrl}/api/v1/libraries`, {
      headers: getKomgaHeaders(cfg),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function fetchKomgaSeries(config?: KomgaConfig, libraryId?: string): Promise<any[]> {
  const cfg = config || getKomgaConfig();
  const baseUrl = normalizeKomgaUrl(cfg.serverUrl);
  if (!baseUrl) return [];

  const headers = getKomgaHeaders(cfg);
  let allSeries: any[] = [];
  let page = 0;
  const size = 500;
  let totalPages = 1;

  while (page < totalPages) {
    try {
      const url = new URL(`${baseUrl}/api/v1/series`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('size', String(size));
      if (libraryId) {
        url.searchParams.set('library_id', libraryId);
      }

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) break;

      const data = await res.json();
      if (Array.isArray(data.content)) {
        allSeries = allSeries.concat(data.content);
        totalPages = data.totalPages || 1;
      } else if (Array.isArray(data)) {
        allSeries = allSeries.concat(data);
        break;
      } else {
        break;
      }
      page++;
    } catch (e) {
      console.warn('[Komga fetchSeries error]:', e);
      break;
    }
  }

  return allSeries;
}

export async function fetchKomgaSeriesBooks(seriesId: string, config?: KomgaConfig): Promise<any[]> {
  const cfg = config || getKomgaConfig();
  const baseUrl = normalizeKomgaUrl(cfg.serverUrl);
  if (!baseUrl || !seriesId) return [];

  const headers = getKomgaHeaders(cfg);
  let allBooks: any[] = [];
  let page = 0;
  const size = 500;
  let totalPages = 1;

  while (page < totalPages) {
    try {
      const url = new URL(`${baseUrl}/api/v1/series/${seriesId}/books`);
      url.searchParams.set('page', String(page));
      url.searchParams.set('size', String(size));

      const res = await fetch(url.toString(), { headers });
      if (!res.ok) break;

      const data = await res.json();
      if (Array.isArray(data.content)) {
        allBooks = allBooks.concat(data.content);
        totalPages = data.totalPages || 1;
      } else if (Array.isArray(data)) {
        allBooks = allBooks.concat(data);
        break;
      } else {
        break;
      }
      page++;
    } catch {
      break;
    }
  }

  return allBooks;
}

// Converte thumbnail da série em data URL para exibição rápida e offline na Minha Biblioteca
export async function fetchKomgaSeriesThumbnail(seriesId: string, config?: KomgaConfig): Promise<string> {
  const cfg = config || getKomgaConfig();
  const baseUrl = normalizeKomgaUrl(cfg.serverUrl);
  const directUrl = `${baseUrl}/api/v1/series/${seriesId}/thumbnail`;

  try {
    const res = await fetch(directUrl, {
      headers: getKomgaHeaders(cfg),
    });
    if (!res.ok) return directUrl;

    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(typeof reader.result === 'string' ? reader.result : directUrl);
      };
      reader.onerror = () => resolve(directUrl);
      reader.readAsDataURL(blob);
    });
  } catch {
    return directUrl;
  }
}

// Busca as páginas de um livro do Komga e gera Blob URLs utilizáveis pelo MangaReader
export async function fetchKomgaBookPages(
  bookId: string,
  config?: KomgaConfig
): Promise<{ success: boolean; data?: { pages: MangaPage[]; title?: string }; error?: string }> {
  const cfg = config || getKomgaConfig();
  const baseUrl = normalizeKomgaUrl(cfg.serverUrl);
  if (!baseUrl || !bookId) {
    return { success: false, error: t('Komga não configurado ou ID do livro inválido') };
  }

  const headers = getKomgaHeaders(cfg);

  try {
    // 1. Busca lista de páginas
    const pagesRes = await fetch(`${baseUrl}/api/v1/books/${bookId}/pages`, { headers });
    if (!pagesRes.ok) {
      return { success: false, error: t('Falha ao obter páginas do Komga (HTTP {status})', { status: pagesRes.status }) };
    }

    const pagesData: Array<{ number: number; fileName?: string; mediaType?: string; width?: number; height?: number }> =
      await pagesRes.json();

    // 2. Busca detalhes do livro para obter título
    let bookTitle: string | undefined;
    try {
      const bookRes = await fetch(`${baseUrl}/api/v1/books/${bookId}`, { headers });
      if (bookRes.ok) {
        const bookObj = await bookRes.json();
        bookTitle =
          bookObj.metadata?.title ||
          bookObj.name ||
          (bookObj.seriesTitle ? `${bookObj.seriesTitle} - #${bookObj.number}` : undefined);
      }
    } catch {
      /* ignore */
    }

    // 3. Pré-carrega páginas com autenticação e gera Blob URLs para o leitor
    const pagesWithBlobs: MangaPage[] = await Promise.all(
      pagesData.map(async (p, idx) => {
        const pageNum = p.number ?? idx + 1;
        const pageUrl = `${baseUrl}/api/v1/books/${bookId}/pages/${pageNum}`;
        try {
          const imgRes = await fetch(pageUrl, { headers });
          if (imgRes.ok) {
            const blob = await imgRes.blob();
            const blobUrl = URL.createObjectURL(blob);
            return {
              index: idx,
              url: blobUrl,
              name: p.fileName || t('Página {n}', { n: pageNum }),
            };
          }
        } catch (e) {
          console.warn(`[Komga page ${pageNum} fetch error]:`, e);
        }
        return {
          index: idx,
          url: pageUrl,
          name: p.fileName || t('Página {n}', { n: pageNum }),
        };
      })
    );

    return {
      success: true,
      data: {
        pages: pagesWithBlobs,
        title: bookTitle,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: t('Erro ao buscar livro no Komga: {error}', { error: err?.message || String(err) }),
    };
  }
}

export interface SyncProgress {
  message: string;
  current: number;
  total: number;
}

// Sincroniza todas as séries e livros selecionados do Komga para a "Minha Biblioteca"
export async function syncKomgaToLibrary(
  onProgress?: (progress: SyncProgress) => void
): Promise<{ success: boolean; seriesCount: number; booksCount: number; error?: string }> {
  const config = getKomgaConfig();
  const baseUrl = normalizeKomgaUrl(config.serverUrl);
  if (!baseUrl) {
    return { success: false, seriesCount: 0, booksCount: 0, error: t('URL do servidor Komga não informada') };
  }

  // 1. Testa conexão antes de iniciar
  onProgress?.({ message: t('Verificando conexão com o servidor Komga...'), current: 0, total: 100 });
  const testRes = await testKomgaConnection(config);
  if (!testRes.success) {
    return { success: false, seriesCount: 0, booksCount: 0, error: testRes.error };
  }

  // Mapeamento de nome de biblioteca por id
  const libMap = new Map<string, string>();
  for (const lib of testRes.libraries || []) {
    libMap.set(lib.id, lib.name);
  }

  // 2. Busca lista de séries
  onProgress?.({ message: t('Carregando lista de séries do Komga...'), current: 5, total: 100 });
  let rawSeries: any[] = [];
  if (config.selectedLibraries && config.selectedLibraries.length > 0) {
    for (const libId of config.selectedLibraries) {
      const seriesInLib = await fetchKomgaSeries(config, libId);
      rawSeries = rawSeries.concat(seriesInLib);
    }
  } else {
    rawSeries = await fetchKomgaSeries(config);
  }

  if (rawSeries.length === 0) {
    return {
      success: true,
      seriesCount: 0,
      booksCount: 0,
      error: t('Nenhuma série encontrada nas bibliotecas selecionadas do Komga.'),
    };
  }

  // Desduplica por id caso séries apareçam em múltiplas consultas
  const uniqueSeriesMap = new Map<string, any>();
  for (const s of rawSeries) {
    if (s.id && !uniqueSeriesMap.has(s.id)) {
      uniqueSeriesMap.set(s.id, s);
    }
  }
  const seriesList = Array.from(uniqueSeriesMap.values());
  const totalSeries = seriesList.length;

  let totalBooksCount = 0;
  const komgaLibraryItems: LibraryItem[] = [];

  // 3. Processa cada série e seus respectivos livros/capítulos
  for (let i = 0; i < seriesList.length; i++) {
    const s = seriesList[i];
    const seriesTitle = s.metadata?.title || s.name || t('Série Komga {id}', { id: s.id });
    const percent = Math.min(90, Math.round(5 + ((i + 1) / totalSeries) * 85));

    onProgress?.({
      message: t('Processando ({i}/{total}): {title}', { i: i + 1, total: totalSeries, title: seriesTitle }),
      current: percent,
      total: 100,
    });

    // Busca os livros desta série
    let books: any[] = [];
    try {
      books = await fetchKomgaSeriesBooks(s.id, config);
    } catch {
      /* ignore */
    }

    totalBooksCount += books.length;

    // Converte livros em capítulos
    const chapters: LibraryChapter[] = books.map((b, bookIdx) => {
      const bookTitle = b.metadata?.title || b.name || t('Livro {n}', { n: b.metadata?.numberSort || b.number || bookIdx + 1 });
      const isRead = !!b.readProgress?.completed;
      const lastPage = b.readProgress?.page || 0;

      return {
        url: `/books/${b.id}`,
        name: bookTitle,
        number: b.metadata?.numberSort ?? b.number ?? bookIdx + 1,
        read: isRead,
        bookmark: false,
        lastPageRead: lastPage,
        lastSecondSeen: 0,
        lastModifiedAt: b.lastModified ? new Date(b.lastModified).getTime() : Date.now(),
      };
    });

    // Resolve categoria (nome da biblioteca do Komga)
    const libName = libMap.get(s.libraryId) || 'Komga';
    const categories = ['Komga'];
    if (libName && libName !== 'Komga' && !categories.includes(libName)) {
      categories.push(libName);
    }

    // Busca capa da série (converte em data URL com timeout curto para velocidade)
    let coverUrl = `${baseUrl}/api/v1/series/${s.id}/thumbnail`;
    try {
      coverUrl = await fetchKomgaSeriesThumbnail(s.id, config);
    } catch {
      /* fallback */
    }

    // Determina status
    let status = 1; // ongoing
    const komgaStatus = (s.metadata?.status || '').toUpperCase();
    if (komgaStatus === 'ENDED' || komgaStatus === 'COMPLETED') {
      status = 2; // completed
    } else if (komgaStatus === 'HIATUS') {
      status = 4;
    } else if (komgaStatus === 'ABANDONED') {
      status = 3;
    }

    // Coleta autores
    let authors = s.booksMetadata?.authors?.map((a: any) => a.name).join(', ') || '';
    if (!authors && s.metadata?.publisher) {
      authors = s.metadata.publisher;
    }

    const item: LibraryItem = {
      source: 'komga',
      sourceName: 'Komga',
      url: `/series/${s.id}`,
      title: seriesTitle,
      author: authors,
      description: s.metadata?.summary || '',
      genres: s.metadata?.genres || s.metadata?.tags || [],
      status,
      cover: coverUrl,
      dateAdded: s.created ? new Date(s.created).getTime() : Date.now(),
      favorite: true,
      categories,
      chapters,
      totalChapters: chapters.length,
      readChapters: chapters.filter((c) => c.read).length,
    };

    komgaLibraryItems.push(item);
  }

  onProgress?.({ message: t('Mesclando com a Minha Biblioteca...'), current: 95, total: 100 });

  // 4. Carrega a biblioteca de mangás existente para mesclagem limpa
  let existingEntries: LibraryItem[] = [];
  let existingCategories: string[] = [];

  if (window.electronAPI?.loadLibrary) {
    try {
      const res = await window.electronAPI.loadLibrary('manga');
      if (res.success && res.data?.entries) {
        existingEntries = res.data.entries;
        existingCategories = res.data.categories || [];
      }
    } catch {
      /* ignore */
    }
  }

  if (existingEntries.length === 0) {
    try {
      const raw = localStorage.getItem('manga_library');
      if (raw) existingEntries = JSON.parse(raw);
      const rawCats = localStorage.getItem('manga_categories');
      if (rawCats) existingCategories = JSON.parse(rawCats);
    } catch {
      /* ignore */
    }
  }

  // Preserva todas as obras que NÃO são do Komga
  const nonKomgaEntries = existingEntries.filter(
    (e) => (e.sourceName || '').toLowerCase() !== 'komga' && e.source !== 'komga'
  );

  // Combina as obras preservadas com as obras recém-sincronizadas do Komga
  const mergedEntries = [...nonKomgaEntries, ...komgaLibraryItems];

  // Mescla categorias preservando as existentes e adicionando as do Komga
  const categorySet = new Set<string>(existingCategories);
  categorySet.add('Komga');
  for (const item of komgaLibraryItems) {
    for (const cat of item.categories || []) {
      categorySet.add(cat);
    }
  }
  const mergedCategories = Array.from(categorySet);

  // 5. Salva no Electron e no localStorage
  if (window.electronAPI?.saveLibrary) {
    try {
      await window.electronAPI.saveLibrary('manga', {
        entries: mergedEntries,
        categories: mergedCategories,
      });
    } catch (err) {
      console.warn('Erro ao salvar no Electron:', err);
    }
  }

  try {
    localStorage.setItem('manga_library', JSON.stringify(mergedEntries));
    localStorage.setItem('manga_categories', JSON.stringify(mergedCategories));
  } catch (err) {
    console.warn('Erro ao salvar no localStorage:', err);
  }

  // 6. Atualiza dados de estatística
  const now = Date.now();
  saveKomgaConfig({
    lastSyncTime: now,
    syncStats: {
      seriesCount: komgaLibraryItems.length,
      booksCount: totalBooksCount,
      lastSyncedAt: now,
    },
  });

  // 7. Notifica a aplicação para recarregar a visualização da biblioteca
  window.dispatchEvent(new CustomEvent('manga:library-updated'));
  window.dispatchEvent(new CustomEvent('backup:applied', { detail: { source: 'manga' } }));

  onProgress?.({ message: t('Sincronização concluída com sucesso!'), current: 100, total: 100 });

  return {
    success: true,
    seriesCount: komgaLibraryItems.length,
    booksCount: totalBooksCount,
  };
}
