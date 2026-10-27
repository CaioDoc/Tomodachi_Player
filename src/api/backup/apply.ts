// src/api/backup/apply.ts
import type { NormalizedBackup } from './mapper';
import type { RepoType } from '../../types';
import { loadRepos, saveRepos } from '../reposStore';
import type { RepoEntry } from '../defaultRepos';

export function importReposFromBackup(backup: NormalizedBackup, type: RepoType) {
  const current = loadRepos(type);
  const urls = new Set(current.map((r) => r.url));
  const added: RepoEntry[] = [];

  for (const url of backup.repos) {
    if (urls.has(url) || !/^https?:\/\//.test(url)) continue;
    try {
      added.push({ url, label: `${new URL(url).hostname} (backup)` });
      urls.add(url);
    } catch {
      /* ignora url inválida */
    }
  }
  if (added.length) saveRepos(type, [...current, ...added]);
  return added.length;
}

export async function applyBackup(backup: NormalizedBackup, source: 'manga' | 'video') {
  const incomingEntries = source === 'manga' ? backup.manga : backup.anime;
  const incomingCategories = source === 'manga' ? backup.categories.manga : backup.categories.anime;

  // 0. Carrega biblioteca existente (Electron e localStorage) para fundir sem apagar obras de extensões
  let existingEntries: any[] = [];
  let existingCategories: string[] = [];
  if (window.electronAPI?.loadLibrary) {
    try {
      const res = await window.electronAPI.loadLibrary(source);
      if (res.success && res.data?.entries) {
        existingEntries = res.data.entries;
        existingCategories = res.data.categories || [];
      }
    } catch {}
  }
  if (existingEntries.length === 0) {
    try {
      const raw = localStorage.getItem(`${source}_library`);
      if (raw) existingEntries = JSON.parse(raw);
      const rawCats = localStorage.getItem(`${source}_categories`);
      if (rawCats) existingCategories = JSON.parse(rawCats);
    } catch {}
  }

  // 1. Funde categorias
  const categoriesList = Array.from(new Set([...existingCategories, ...incomingCategories]));

  // 2. Funde obras preservando favoritos e tags prévios
  const mergedMap = new Map<string, any>();

  // Adiciona primeiro as obras existentes
  for (const item of existingEntries) {
    const key = (item.url || `${item.sourceName || item.source}_${item.title}`).toLowerCase().trim();
    mergedMap.set(key, { ...item });
  }

  // Mescla com as obras vindas do backup
  for (const incoming of incomingEntries) {
    const key = (incoming.url || `${incoming.sourceName || incoming.source}_${incoming.title}`).toLowerCase().trim();
    if (mergedMap.has(key)) {
      const existing = mergedMap.get(key);
      const combinedCats = Array.from(new Set([...(existing.categories || []), ...(incoming.categories || [])]));
      const isFav = Boolean(existing.favorite || incoming.favorite);

      // Mescla capítulos e progresso
      const chMap = new Map<string, any>();
      for (const ch of (existing.chapters || [])) {
        chMap.set(ch.url, ch);
      }
      for (const ch of (incoming.chapters || [])) {
        if (chMap.has(ch.url)) {
          const exCh = chMap.get(ch.url);
          chMap.set(ch.url, {
            ...ch,
            read: Boolean(exCh.read || ch.read),
            bookmark: Boolean(exCh.bookmark || ch.bookmark),
            lastPageRead: Math.max(exCh.lastPageRead || 0, ch.lastPageRead || 0),
            lastSecondSeen: Math.max(exCh.lastSecondSeen || 0, ch.lastSecondSeen || 0),
          });
        } else {
          chMap.set(ch.url, ch);
        }
      }

      mergedMap.set(key, {
        ...incoming,
        favorite: isFav,
        categories: combinedCats,
        cover: incoming.cover || existing.cover,
        chapters: Array.from(chMap.values()),
        totalChapters: chMap.size,
        readChapters: Array.from(chMap.values()).filter((c: any) => c.read).length,
      });
    } else {
      mergedMap.set(key, {
        source: incoming.source,
        sourceName: incoming.sourceName || '',
        url: incoming.url, 
        title: incoming.title, 
        author: incoming.author,
        description: incoming.description,
        genres: incoming.genres, 
        status: incoming.status, 
        cover: incoming.cover, 
        background: incoming.background,
        dateAdded: incoming.dateAdded, 
        favorite: incoming.favorite,
        categories: incoming.categories,
        chapters: incoming.chapters,
        tracking: incoming.tracking,
        history: incoming.history,
      });
    }
  }

  const finalEntries = Array.from(mergedMap.values());

  // 3. Payload completo da biblioteca fundida
  const fullLibrary = {
    app: backup.app,
    source,
    updatedAt: Date.now(),
    categories: categoriesList,
    entries: finalEntries,
  };

  // 3.1 Persistência de alta capacidade no Electron (disco físico sem limite de cota)
  if (window.electronAPI?.saveLibrary) {
    try {
      await window.electronAPI.saveLibrary(source, fullLibrary);
    } catch (err) {
      console.warn('Falha ao salvar biblioteca no disco do Electron:', err);
    }
  }

  // 3.2 Persistência em localStorage (com tratamento seguro de cota)
  try {
    localStorage.setItem(`${source}_library`, JSON.stringify(finalEntries.map((m) => ({
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
    }))));
  } catch (e) {
    console.warn('Cota de localStorage atingida para sumário, usando dados salvos no Electron.', e);
  }

  // 2. Capítulos + entradas lidas
  try {
    const progress: Record<string, any> = {};
    for (const m of finalEntries) {
      if (Array.isArray(m.chapters)) {
        for (const c of m.chapters) {
          if (c.read || c.bookmark || c.lastPageRead || c.lastSecondSeen) {
            progress[c.url] = { 
              read: c.read, 
              bookmark: c.bookmark, 
              lastPageRead: c.lastPageRead, 
              lastSecondSeen: c.lastSecondSeen 
            };
          }
        }
      }
    }
    localStorage.setItem(`${source}_progress`, JSON.stringify(progress));
  } catch (e) {
    console.warn('Cota de progresso em localStorage:', e);
  }

  // 3. Monitoramento
  try {
    localStorage.setItem(`${source}_tracking`, JSON.stringify(
      finalEntries.flatMap((m: any) => (m.tracking || []).map((t: any) => ({ ...t, mangaUrl: m.url })))
    ));
  } catch (e) {
    console.warn('Cota de tracking em localStorage:', e);
  }

  // 4. Histórico
  try {
    localStorage.setItem(`${source}_history`, JSON.stringify(
      finalEntries.flatMap((m: any) => (m.history || []).map((h: any) => ({ ...h, mangaUrl: m.url })))
    ));
  } catch (e) {
    console.warn('Cota de history em localStorage:', e);
  }

  // 5. Categorias
  try {
    localStorage.setItem(`${source}_categories`, JSON.stringify(categoriesList));
  } catch (e) {
    console.warn('Cota de categories em localStorage:', e);
  }

  // 7. Loja de extensões + repos
  const repoType: RepoType = source === 'manga' ? 'manga' : 'anime';
  importReposFromBackup(backup, repoType);

  if (source === 'manga') {
    try {
      localStorage.setItem('extensions', JSON.stringify(backup.extensions));
      let saved: string[] = [];
      try {
        saved = JSON.parse(localStorage.getItem('repos') || '[]');
      } catch {
        saved = [];
      }
      localStorage.setItem('repos', JSON.stringify([...new Set([...saved, ...backup.repos])]));
    } catch (e) {
      console.warn('Cota de repos/extensions em localStorage:', e);
    }
  }

  // 8. Configurações das fontes
  const prefs = source === 'manga' ? backup.sourcePrefs : [];
  if (prefs.length) {
    try {
      localStorage.setItem('sourcePreferences', JSON.stringify(prefs));
    } catch (e) {
      console.warn('Cota de sourcePreferences em localStorage:', e);
    }
  }

  window.dispatchEvent(new CustomEvent('backup:applied', { detail: { source } }));
}

/** Aplica integralmente tanto a biblioteca de mangás quanto a de animes de um backup Aniyomi */
export async function applyFullAniyomiBackup(backup: NormalizedBackup): Promise<{ mangaCount: number; animeCount: number }> {
  let mangaCount = 0;
  let animeCount = 0;

  if (backup.manga && backup.manga.length > 0) {
    await applyBackup(backup, 'manga');
    mangaCount = backup.manga.length;
  }

  if (backup.anime && backup.anime.length > 0) {
    await applyBackup(backup, 'video');
    animeCount = backup.anime.length;
  }

  importReposFromBackup(backup, 'manga');
  importReposFromBackup(backup, 'anime');

  window.dispatchEvent(new CustomEvent('backup:applied', { 
    detail: { 
      source: 'both', 
      mangaCount, 
      animeCount,
      timestamp: Date.now() 
    } 
  }));

  return { mangaCount, animeCount };
}
