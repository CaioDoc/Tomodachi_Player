import pako from 'pako';
import protobuf from 'protobufjs';
import type { ExtensionRepo } from '../types';
import { t } from '../i18n';

export interface RepoExtension {
  name: string;
  pkg: string;
  apk: string;
  version: string;
  versionName?: string;
  lang: string;
  nsfw: boolean;
  sources: { name: string; lang: string; baseUrl?: string }[];
  baseUrl?: string;
  icon?: string;
}

/** Deriva o index.min.json a partir de um index.pb (ou devolve a própria URL se já for JSON) */
function toJsonUrl(url: string): string | null {
  if (/index(\.min)?\.json$/i.test(url)) return url;
  if (/index\.pb$/i.test(url)) return url.replace(/index\.pb$/i, 'index.min.json');
  return null;
}

function mapJson(data: any): RepoExtension[] {
  const apps = data?.apps ?? (Array.isArray(data) ? data : []);
  return apps.map((a: any) => ({
    name: a.name ?? a.pkg ?? t('Sem nome'),
    pkg: a.pkg ?? '',
    apk: a.apk ?? '',
    version: a.versionName ?? a.version ?? '',
    versionName: a.versionName ?? a.version ?? '',
    lang: a.lang ?? 'all',
    nsfw: !!a.nsfw,
    baseUrl: a.baseUrl ?? a.sources?.[0]?.baseUrl ?? '',
    icon: a.icon,
    sources: (a.sources ?? []).map((s: any) => ({ 
      name: s.name ?? '', 
      lang: s.lang ?? '',
      baseUrl: s.baseUrl ?? ''
    })),
  }));
}

// Helper para decodificar mensagens aninhadas de Source no field 8 do protobuf
function parseSources(sourceSlice: Uint8Array): { id: string; name: string; lang: string; baseUrl: string } {
  const sReader = new protobuf.Reader(sourceSlice);
  let id = '';
  let name = '';
  let lang = '';
  let baseUrl = '';

  while (sReader.pos < sReader.len) {
    const tag = sReader.uint32();
    const fNo = tag >>> 3;
    const fWt = tag & 7;

    if (fWt === 0) {
      id = sReader.int64().toString();
    } else if (fWt === 2) {
      const text = sReader.string();
      if (fNo === 2) name = text;
      else if (fNo === 3) lang = text;
      else if (fNo === 4) baseUrl = text;
    } else {
      sReader.skipType(fWt);
    }
  }

  return { id, name, lang, baseUrl };
}

// Schema tolerante só como último recurso (proto3, sem 'required')
const PB_SCHEMA = `
syntax = "proto3";
message Index { repeated Extension apps = 1; }
message Extension {
  string name = 1; string pkg = 2; string apk = 3; string lang = 4;
  int32 versionCode = 5; string versionName = 6; bool nsfw = 7;
  repeated Source sources = 8; string icon = 9;
}
message Source { string name = 1; string lang = 2; int64 id = 3; }
`;

export function parseProtobufRepo(buffer: ArrayBuffer | Uint8Array): (ExtensionRepo & { sources?: { name: string; lang: string; baseUrl?: string }[] })[] {
  let bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    try {
      bytes = pako.ungzip(bytes);
    } catch {
      // Already uncompressed
    }
  }

  const extensions: (ExtensionRepo & { sources?: { name: string; lang: string; baseUrl?: string }[] })[] = [];
  const reader = new protobuf.Reader(bytes);

  while (reader.pos < reader.len) {
    const tag = reader.uint32();
    const fieldNo = tag >>> 3;
    const wireType = tag & 7;

    // Field 101 contains repeated Extension entries in Mihon/Tachiyomi repos
    if (fieldNo === 101 && wireType === 2) {
      const len = reader.uint32();
      const end = reader.pos + len;
      const subSlice = bytes.slice(reader.pos, end);
      reader.pos = end;

      const subReader = new protobuf.Reader(subSlice);

      while (subReader.pos < subReader.len) {
        const itemTag = subReader.uint32();
        const itemWire = itemTag & 7;

        if (itemWire === 2) {
          const itemLen = subReader.uint32();
          const itemSlice = subSlice.slice(subReader.pos, subReader.pos + itemLen);
          subReader.pos += itemLen;

          const extReader = new protobuf.Reader(itemSlice);

          let name = '';
          let pkg = '';
          let versionName = '';
          let rawApk = '';
          let lang = 'all';
          let nsfw = false;
          let explicitIcon = '';
          const sources: { name: string; lang: string; baseUrl?: string }[] = [];

          while (extReader.pos < extReader.len) {
            const fTag = extReader.uint32();
            const fNo = fTag >>> 3;
            const fWt = fTag & 7;

            if (fWt === 2) {
              const strLen = extReader.uint32();
              const strBytes = itemSlice.slice(extReader.pos, extReader.pos + strLen);
              extReader.pos += strLen;

              if (fNo === 1) name = new TextDecoder().decode(strBytes);
              else if (fNo === 2) pkg = new TextDecoder().decode(strBytes);
              else if (fNo === 3) rawApk = new TextDecoder().decode(strBytes);
              else if (fNo === 6 || (fNo === 4 && !versionName)) versionName = new TextDecoder().decode(strBytes);
              else if (fNo === 5 && !lang) lang = new TextDecoder().decode(strBytes);
              else if (fNo === 8) {
                const src = parseSources(strBytes);
                if (src.name) sources.push({ name: src.name, lang: src.lang, baseUrl: src.baseUrl });
              }
              else if (fNo === 9) explicitIcon = new TextDecoder().decode(strBytes);
            } else if (fWt === 0) {
              const val = extReader.uint32();
              if (fNo === 7) nsfw = val > 0;
            } else {
              extReader.skipType(fWt);
            }
          }

          if (name && pkg) {
            const parts = pkg.split('.');
            if (parts.length >= 5) {
              lang = parts[4];
            }
            const apkMatch = rawApk.match(/https:\/\/[^\s\x00-\x1f]+\.apk/i);
            const iconMatch = rawApk.match(/https:\/\/[^\s\x00-\x1f]+\.png/i);

            extensions.push({
              name,
              baseUrl: sources[0]?.baseUrl || '',
              pkg,
              versionName: versionName || '1.0',
              lang,
              nsfw,
              apk: apkMatch ? apkMatch[0] : rawApk,
              icon: explicitIcon || (iconMatch ? iconMatch[0] : undefined),
              sources
            });
          }
        } else {
          subReader.skipType(itemWire);
        }
      }
    } else if (wireType === 2) {
      reader.skip(reader.uint32());
    } else {
      reader.skipType(wireType);
    }
  }

  return extensions;
}

export async function fetchBytes(url: string): Promise<Uint8Array> {
  // 1. Se estiver no Electron, usa o proxy IPC do processo principal para ignorar CORS / CSP
  if (typeof window !== 'undefined' && window.electronAPI?.fetchRepoUrl) {
    try {
      const res = await window.electronAPI.fetchRepoUrl(url);
      if (res.success && res.dataBase64) {
        const binStr = atob(res.dataBase64);
        const bytes = new Uint8Array(binStr.length);
        for (let i = 0; i < binStr.length; i++) {
          bytes[i] = binStr.charCodeAt(i);
        }
        return bytes;
      }
    } catch {
      // Segue para fetch padrão
    }
  }

  // 2. Fetch padrão do navegador
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/octet-stream, application/json, */*'
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function readPb(url: string): Promise<RepoExtension[]> {
  const buf = await fetchBytes(url);
  let bytes = buf;
  if (buf[0] === 0x1f && buf[1] === 0x8b) {
    try {
      bytes = pako.ungzip(buf);
    } catch {
      // Already uncompressed
    }
  }

  // 1. Usa o decodificador manual rápido e completo (extrai todas as 1.400 extensões com sources e baseUrl)
  const manual = parseProtobufRepo(bytes);
  if (manual && manual.length > 0) {
    return manual.map((m) => ({
      name: m.name,
      pkg: m.pkg,
      apk: m.apk,
      version: m.versionName,
      versionName: m.versionName,
      lang: m.lang,
      nsfw: m.nsfw,
      baseUrl: m.baseUrl,
      icon: m.icon,
      sources: m.sources || [],
    }));
  }

  // 2. Fallback tolerante para schema proto
  try {
    const root = protobuf.parse(PB_SCHEMA).root;
    const Index = root.lookupType('Index');
    const obj = Index.toObject(Index.decode(bytes), { longs: String, defaults: false }) as any;
    const list = (obj.apps ?? []).map((a: any) => ({
      name: a.name ?? a.pkg ?? '',
      pkg: a.pkg ?? '',
      apk: a.apk ?? '',
      version: a.versionName ?? a.version ?? '',
      versionName: a.versionName ?? a.version ?? '',
      lang: a.lang ?? 'all',
      nsfw: !!a.nsfw,
      sources: (a.sources ?? []).map((s: any) => ({ name: s.name ?? '', lang: s.lang ?? '' })),
    }));
    if (list.length > 0) return list;
  } catch {
    /* ignore */
  }

  return [];
}

/** Carrega o índice de um repo: respeita .pb se especificado, senão tenta JSON derivado, cai para .pb */
export async function loadRepoIndex(url: string): Promise<RepoExtension[]> {
  const isPb = url.toLowerCase().endsWith('.pb');

  // 1. Se a URL for explicitamente .pb (ex: Keiyoushi), SEMPRE carrega o .pb primeiro!
  if (isPb) {
    try {
      const list = await readPb(url);
      if (list && list.length > 0) return list;
    } catch (e) {
      console.warn('Falha ao ler .pb diretamente, tentando fallback:', e);
    }
  }

  // 2. Tenta JSON se for URL .json ou se o .pb acima falhou
  const jsonUrl = isPb ? toJsonUrl(url) : url;
  if (jsonUrl) {
    try {
      const bytes = await fetchBytes(jsonUrl);
      const text = new TextDecoder('utf-8').decode(bytes);
      const data = JSON.parse(text);
      const mapped = mapJson(data);
      // Se tiver mais de 2 itens ou se for repo JSON genuíno (evita o dummy "Outdated App" do Keiyoushi)
      if (mapped.length > 2 || !isPb) {
        return mapped;
      }
    } catch { /* segue */ }
  }

  // 3. Se era uma URL .json que falhou, tenta converter para .pb
  if (!isPb) {
    const pbUrl = url.replace(/index(\.min)?\.json$/i, 'index.pb');
    if (pbUrl !== url) {
      try {
        const list = await readPb(pbUrl);
        if (list && list.length > 0) return list;
      } catch { /* falhou */ }
    }
  }

  // 4. Última tentativa com readPb na URL original
  try {
    const list = await readPb(url);
    if (list && list.length > 0) return list;
  } catch { /* falhou */ }

  throw new Error(t('Não foi possível ler o índice deste repositório.'));
}

/** Validação antes de salvar (evita salvar URL quebrada) */
export async function validateRepo(url: string): Promise<number> {
  const list = await loadRepoIndex(url);
  return list.length; // nº de extensões encontradas
}

export async function fetchRepository(repoUrl: string, explicitFormat?: 'pb' | 'json'): Promise<ExtensionRepo[]> {
  const format = explicitFormat || (repoUrl.toLowerCase().endsWith('.pb') ? 'pb' : 'json');

  if (format === 'pb') {
    const bytes = await fetchBytes(repoUrl);
    return parseProtobufRepo(bytes);
  }

  const bytes = await fetchBytes(repoUrl);
  const text = new TextDecoder('utf-8').decode(bytes);
  const data = JSON.parse(text);
  const items = Array.isArray(data) ? data : (data.apps || []);

  return items.map((app: any) => ({
    name: app.name || t('Extensão Desconhecida'),
    baseUrl: app.baseUrl || '',
    pkg: app.pkg || '',
    versionName: app.versionName || app.version || '1.0',
    lang: app.lang || 'all',
    nsfw: app.isNsfw ?? app.nsfw ?? false,
    apk: app.apk || '',
    icon: app.icon ? (app.icon.startsWith('http') ? app.icon : `${repoUrl.substring(0, repoUrl.lastIndexOf('/'))}/icon/${app.apk?.replace('.apk', '.png')}`) : undefined
  }));
}
