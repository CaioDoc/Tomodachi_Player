// src/api/backup/decode.ts
import protobuf from 'protobufjs';
import './longShim';
import pako from 'pako';
import { MIHON_PROTO, ANIYOMI_PROTO } from './schemas';
import { scanTopLevelFields } from './diagnose';

export type BackupApp = 'mihon' | 'aniyomi';

/** Descomprime e detecta gzip vs JSON legado */
export async function readBackupFile(file: File): Promise<{ bytes: Uint8Array; isJson: boolean }> {
  const raw = new Uint8Array(await file.arrayBuffer());
  let bytes = raw;
  if (raw[0] === 0x1f && raw[1] === 0x8b) {
    try {
      bytes = pako.ungzip(raw);
    } catch {
      bytes = raw;
    }
  } else {
    try {
      bytes = pako.ungzip(raw);
    } catch {
      bytes = raw;
    }
  }

  const i = bytes.findIndex((b) => b !== 9 && b !== 10 && b !== 13 && b !== 32);
  return { bytes, isJson: bytes[i] === 0x7b }; // '{'
}

export interface RawBackup {
  app: BackupApp;
  data: any;
  detectedFields: number[];
}

// Raízes pré-compiladas para alta performance
export const aniyomiRoot = protobuf.parse(ANIYOMI_PROTO).root;
export const mihonRoot = protobuf.parse(MIHON_PROTO).root;

/** Decodifica usando o schema adequado com fallback resiliente */
export function decodeBackup(bytes: Uint8Array): RawBackup {
  const fields = scanTopLevelFields(bytes);

  const decodeWithRoot = (root: protobuf.Root) => {
    const Backup = root.lookupType('Backup');
    const msg = Backup.decode(bytes);
    return Backup.toObject(msg, { longs: String, enums: String, bytes: Uint8Array, defaults: false });
  };

  let data: any = null;
  let app: BackupApp = 'mihon';

  // Como aniyomiRoot é um superconjunto compatível (tem campos 1-107 e 501-506), tentamos primeiro com ele
  try {
    data = decodeWithRoot(aniyomiRoot);
    const hasAnimeData = Array.isArray(data.backupAnime) && data.backupAnime.length > 0;
    const hasAnimeFields = fields.includes(501) || fields.includes(502) || fields.includes(503);
    app = (hasAnimeData || hasAnimeFields) ? 'aniyomi' : 'mihon';
  } catch (errFirst) {
    try {
      data = decodeWithRoot(mihonRoot);
      app = 'mihon';
    } catch {
      throw errFirst;
    }
  }

  return { app, data, detectedFields: fields };
}
