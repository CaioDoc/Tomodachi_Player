// src/api/backupParser.ts
import pako from 'pako';
import { decodeBackup } from './backup/decode';
import type { TachiyomiBackupResult } from '../types';
import { t } from '../i18n';

export async function parseTachiyomiBackup(fileBuffer: ArrayBuffer | Uint8Array): Promise<TachiyomiBackupResult> {
  try {
    const uint8Array = fileBuffer instanceof Uint8Array ? fileBuffer : new Uint8Array(fileBuffer);

    // 1. Descomprime GZIP se estiver comprimido
    let decompressed: Uint8Array;
    if (uint8Array[0] === 0x1f && uint8Array[1] === 0x8b) {
      decompressed = pako.ungzip(uint8Array);
    } else {
      try {
        decompressed = pako.ungzip(uint8Array);
      } catch {
        decompressed = uint8Array;
      }
    }

    // 2. Decodifica usando os schemas verificados
    const { data } = decodeBackup(decompressed);

    return {
      backupManga: (data.backupManga || []).map((m: any) => ({
        ...m,
        thumbnailUrl: m.customThumbnailUrl || m.thumbnailUrl,
      })),
      backupCategories: data.backupCategories || [],
      backupSources: data.backupSources || [],
      backupAnime: (data.backupAnime || []).map((a: any) => ({
        ...a,
        thumbnailUrl: a.customThumbnailUrl || a.thumbnailUrl,
      })),
      backupAnimeCategories: data.backupAnimeCategories || [],
      backupAnimeSources: data.backupAnimeSources || [],
    } as TachiyomiBackupResult;
  } catch (error) {
    console.error('Failed to parse .tachibk backup:', error);
    throw new Error(t('Falha ao decodificar backup .tachibk: {error}', { error: error instanceof Error ? error.message : String(error) }));
  }
}

