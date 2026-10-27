// src/utils/libraryStore.ts
// Leitura/escrita segura da biblioteca (disco do Electron + resumo no localStorage).

export type LibrarySource = 'manga' | 'video';

interface LibraryFile {
  app?: string;
  source?: string;
  updatedAt?: number;
  categories?: string[];
  entries: any[];
}

/** Resumo leve salvo no localStorage (o disco guarda a versão completa). */
const summarize = (m: any) => ({
  source: m.source,
  sourceName: m.sourceName || '',
  url: m.url,
  title: m.title,
  cover: m.cover,
  author: m.author,
  genres: m.genres,
  status: m.status,
  favorite: m.favorite,
  dateAdded: m.dateAdded,
  categories: m.categories,
  totalChapters: m.chapters?.length || m.totalChapters || 0,
  readChapters: m.chapters?.filter((c: any) => c.read).length || m.readChapters || 0,
});

export async function readLibrary(source: LibrarySource): Promise<LibraryFile> {
  if (window.electronAPI?.loadLibrary) {
    try {
      const res = await window.electronAPI.loadLibrary(source);
      const data = res?.data;
      if (res?.success && data) {
        if (Array.isArray(data)) return { source, categories: [], entries: data };
        if (Array.isArray(data.entries)) return data as LibraryFile;
      }
    } catch {
      /* usa fallback */
    }
  }
  try {
    const raw = localStorage.getItem(`${source}_library`);
    const entries = raw ? JSON.parse(raw) : [];
    const catsRaw = localStorage.getItem(`${source}_categories`);
    const categories = catsRaw ? JSON.parse(catsRaw) : [];
    return { source, categories: Array.isArray(categories) ? categories : [], entries: Array.isArray(entries) ? entries : [] };
  } catch {
    return { source, categories: [], entries: [] };
  }
}

/**
 * Aplica uma alteração às obras da biblioteca preservando todos os outros
 * dados (capítulos, descrições e categorias).
 */
export async function updateLibrary(
  source: LibrarySource,
  updater: (entries: any[]) => any[],
  opts: { notify?: boolean; categories?: string[] } = {}
): Promise<boolean> {
  try {
    const current = await readLibrary(source);
    const entries = updater([...(current.entries || [])]);
    const payload: LibraryFile = {
      ...current,
      source,
      updatedAt: Date.now(),
      categories: opts.categories || current.categories || [],
      entries,
    };

    if (window.electronAPI?.saveLibrary) {
      await window.electronAPI.saveLibrary(source, payload);
      try {
        localStorage.setItem(`${source}_library`, JSON.stringify(entries.map(summarize)));
      } catch {
        /* cota: o disco já tem a versão completa */
      }
    } else {
      try {
        localStorage.setItem(`${source}_library`, JSON.stringify(entries));
      } catch {
        localStorage.setItem(`${source}_library`, JSON.stringify(entries.map(summarize)));
      }
    }

    if (opts.notify) {
      window.dispatchEvent(new CustomEvent(`${source}:library-updated`));
    }
    return true;
  } catch (err) {
    console.warn('Falha ao atualizar a biblioteca:', err);
    return false;
  }
}
