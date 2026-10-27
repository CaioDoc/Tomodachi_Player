export type MediaKind = 'image' | 'video';

// Listas independentes (cada seção gerencia e filtra suas próprias pastas)
export const FOLDERS_KEY = (kind: MediaKind) => `libraryFolders_${kind}`;

export function loadFolders(kind: MediaKind = 'image'): string[] {
  try {
    const key = FOLDERS_KEY(kind);
    const saved = localStorage.getItem(key);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length) return parsed;
    }
    // Migração de chaves legadas (explorer_folders ou libraryFolders)
    const legacy = localStorage.getItem('explorer_folders') || localStorage.getItem('libraryFolders');
    if (legacy) {
      const parsedLegacy = JSON.parse(legacy);
      if (Array.isArray(parsedLegacy) && parsedLegacy.length) {
        localStorage.setItem(key, legacy);
        return parsedLegacy;
      }
    }
    return [];
  } catch {
    return [];
  }
}

export function saveFolders(folders: string[], kind: MediaKind = 'image'): void {
  try {
    localStorage.setItem(FOLDERS_KEY(kind), JSON.stringify(folders));
  } catch {}
}
