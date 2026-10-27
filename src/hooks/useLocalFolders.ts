import { useCallback, useEffect, useState } from 'react';
import type { MediaKind } from '../types';
import { loadFolders, saveFolders, FOLDERS_KEY } from '../utils/libraryStorage';

/**
 * Garante a hierarquia de pastas: se uma pasta pai (ex: D:\Videos) estiver presente,
 * remove quaisquer subpastas filhas (ex: D:\Videos\2D) para que apenas a pasta pai seja exibida na raiz.
 */
export function collapseParentFolders(paths: string[]): string[] {
  if (!paths || !paths.length) return [];
  const normalized = paths
    .map((p) => p.replace(/[\\/]+$/, '').trim())
    .filter(Boolean);
  const unique = Array.from(new Set(normalized));
  // Ordena por comprimento crescente para que os pais venham antes dos filhos
  unique.sort((a, b) => a.length - b.length);

  const result: string[] = [];
  for (const p of unique) {
    const pNorm = p.replace(/\\/g, '/').toLowerCase();
    const isChild = result.some((parent) => {
      const parentNorm = parent.replace(/\\/g, '/').toLowerCase();
      return pNorm.startsWith(parentNorm + '/');
    });
    if (!isChild) {
      result.push(p);
    }
  }
  return result;
}

export function useLocalFolders(kind: MediaKind) {
  const [folders, setFolders] = useState<string[]>(() => collapseParentFolders(loadFolders(kind)));

  // Sincroniza se outra janela ou aba alterar o localStorage
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === FOLDERS_KEY(kind)) {
        setFolders(collapseParentFolders(loadFolders(kind)));
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [kind]);

  const addFolders = useCallback((paths: string[]) => {
    const cleaned = paths.map((p) => p.replace(/[\\/]+$/, '').trim()).filter(Boolean);
    if (!cleaned.length) return;
    setFolders((prev) => {
      // Se o usuário selecionou subpastas específicas que são filhas de uma pasta pai já cadastrada,
      // removemos o pai anterior para que as subpastas escolhidas agora tenham precedência.
      const filteredPrev = prev.filter((existing) => {
        const existingNorm = existing.replace(/\\/g, '/').toLowerCase();
        const hasChildInCleaned = cleaned.some((child) => {
          const childNorm = child.replace(/\\/g, '/').toLowerCase();
          return childNorm.startsWith(existingNorm + '/');
        });
        return !hasChildInCleaned;
      });

      const merged = collapseParentFolders([...filteredPrev, ...cleaned]);
      saveFolders(merged, kind);
      return merged;
    });
  }, [kind]);

  const addFolder = useCallback((path: string) => {
    addFolders([path]);
  }, [addFolders]);

  const removeFolder = useCallback((path: string) => {
    let result: string[] = [];
    setFolders((prev) => {
      result = prev.filter((f) => f !== path);
      saveFolders(result, kind);
      return result;
    });
    return result;
  }, [kind]);

  const setAllFolders = useCallback((paths: string[]) => {
    const collapsed = collapseParentFolders(paths);
    setFolders(collapsed);
    saveFolders(collapsed, kind);
    return collapsed;
  }, [kind]);

  return { folders, addFolder, addFolders, removeFolder, setAllFolders };
}
