// electron/browserExtensions.ts
// Extensões de navegador (formato Chrome) para o navegador integrado.
//
// - Instala pela Chrome Web Store (link ou ID), por arquivo .crx/.zip ou por pasta descompactada.
// - As extensões ficam em <userData>/browser-extensions/<chave> e são carregadas a cada
//   abertura do app na sessão do navegador ("persist:user_session").
// - Limitação do Electron: só parte da API de extensões do Chrome existe. Extensões que alteram
//   páginas (content scripts) costumam funcionar; as que dependem de declarativeNetRequest
//   (ex.: uBlock Origin Lite) não bloqueiam nada — por isso o app tem o bloqueador integrado.

import { app, BrowserWindow, dialog, ipcMain, net, session, type Session } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import zlib from 'node:zlib';

const PARTITION = 'persist:user_session';

interface StoredExtension {
  key: string; // nome da pasta
  source: 'store' | 'file' | 'folder';
  storeId?: string;
  enabled: boolean;
  installedAt: number;
}

interface ExtensionInfo extends StoredExtension {
  name: string;
  version: string;
  description?: string;
  icon?: string;
  id?: string; // id do Electron (chrome-extension://<id>)
  loaded: boolean;
  error?: string;
  popup?: string;
  options?: string;
  warnings: string[];
  manifestVersion: number;
}

const root = () => path.join(app.getPath('userData'), 'browser-extensions');
const indexFile = () => path.join(root(), 'index.json');
const ses = (): Session => session.fromPartition(PARTITION);

const loadedIds = new Map<string, string>(); // key → id do Electron
const loadErrors = new Map<string, string>();

/* ───────────── Índice ───────────── */

function readIndex(): StoredExtension[] {
  try {
    const list = JSON.parse(fs.readFileSync(indexFile(), 'utf8'));
    return Array.isArray(list) ? list.filter((e) => e && typeof e.key === 'string') : [];
  } catch {
    return [];
  }
}

async function writeIndex(list: StoredExtension[]) {
  await fsp.mkdir(root(), { recursive: true });
  const tmp = `${indexFile()}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(list, null, 2), 'utf8');
  await fsp.rename(tmp, indexFile());
}

const extDir = (key: string) => path.join(root(), key);

/* ───────────── Manifesto ───────────── */

function readManifest(dir: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8').replace(/^﻿/, ''));
  } catch {
    return null;
  }
}

/** Resolve textos "__MSG_nome__" usando _locales */
function localize(dir: string, manifest: any, value: string): string {
  const m = typeof value === 'string' ? value.match(/^__MSG_(.+)__$/) : null;
  if (!m) return value;
  const key = m[1].toLowerCase();
  const locales = [app.getLocale?.().replace('-', '_'), 'pt_BR', 'pt_PT', manifest?.default_locale, 'en', 'en_US'].filter(Boolean) as string[];
  for (const loc of locales) {
    try {
      const msgs = JSON.parse(fs.readFileSync(path.join(dir, '_locales', loc, 'messages.json'), 'utf8').replace(/^﻿/, ''));
      const hit = Object.entries<any>(msgs).find(([k]) => k.toLowerCase() === key);
      if (hit?.[1]?.message) return hit[1].message;
    } catch {
      /* tenta o próximo */
    }
  }
  return value;
}

function iconDataUrl(dir: string, manifest: any): string | undefined {
  const icons = manifest?.icons || manifest?.action?.default_icon || manifest?.browser_action?.default_icon;
  let file: string | undefined;
  if (typeof icons === 'string') file = icons;
  else if (icons && typeof icons === 'object') {
    const sizes = Object.keys(icons).map(Number).filter(isFinite).sort((a, b) => a - b);
    const best = sizes.find((s) => s >= 32) ?? sizes[sizes.length - 1];
    file = icons[String(best)];
  }
  if (!file) return undefined;
  try {
    const full = path.join(dir, file.replace(/^\//, ''));
    const buf = fs.readFileSync(full);
    const ext = path.extname(full).toLowerCase();
    const mime = ext === '.svg' ? 'image/svg+xml' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  } catch {
    return undefined;
  }
}

function compatibilityWarnings(manifest: any): string[] {
  const out: string[] = [];
  const perms: string[] = [...(manifest?.permissions || []), ...(manifest?.optional_permissions || [])].filter((p) => typeof p === 'string');
  if (perms.some((p) => p.startsWith('declarativeNetRequest'))) {
    out.push('Usa "declarativeNetRequest", que o Electron não suporta: o bloqueio desta extensão provavelmente não vai funcionar. Use a proteção integrada.');
  }
  if (manifest?.manifest_version === 3 && manifest?.background?.service_worker) {
    out.push('Extensão MV3 com service worker: partes dela podem não funcionar no navegador integrado.');
  }
  if (perms.some((p) => ['contextMenus', 'notifications', 'downloads', 'bookmarks', 'history', 'identity', 'proxy', 'privacy'].includes(p))) {
    out.push('Usa recursos do Chrome que o app não tem (menus, notificações, downloads…); essas funções ficam indisponíveis.');
  }
  return out;
}

/* ───────────── Carregar / descarregar ───────────── */

async function loadOne(entry: StoredExtension): Promise<void> {
  const dir = extDir(entry.key);
  try {
    const s: any = ses();
    const loader = s.extensions?.loadExtension ? s.extensions.loadExtension.bind(s.extensions) : s.loadExtension.bind(s);
    const ext = await loader(dir, { allowFileAccess: false });
    loadedIds.set(entry.key, ext.id);
    loadErrors.delete(entry.key);
  } catch (err: any) {
    loadErrors.set(entry.key, err?.message || String(err));
    console.warn(`[Extensões] Falha ao carregar ${entry.key}:`, err?.message || err);
  }
}

function unloadOne(key: string) {
  const id = loadedIds.get(key);
  if (!id) return;
  try {
    const s: any = ses();
    if (s.extensions?.removeExtension) s.extensions.removeExtension(id);
    else s.removeExtension(id);
  } catch {
    /* ignore */
  }
  loadedIds.delete(key);
}

export async function loadInstalledExtensions() {
  for (const e of readIndex()) {
    if (e.enabled && fs.existsSync(extDir(e.key))) await loadOne(e);
  }
}

/* ───────────── Arquivos .crx / .zip ───────────── */

/** Remove o cabeçalho de um .crx (v2 ou v3) e devolve o .zip */
function crxToZip(buf: Buffer): Buffer {
  if (buf.length > 16 && buf.toString('latin1', 0, 4) === 'Cr24') {
    const version = buf.readUInt32LE(4);
    if (version === 3) return buf.subarray(12 + buf.readUInt32LE(8));
    if (version === 2) return buf.subarray(16 + buf.readUInt32LE(8) + buf.readUInt32LE(12));
    throw new Error(`Formato .crx desconhecido (v${version})`);
  }
  return buf;
}

/** Extrator .zip mínimo (stored/deflate), com proteção contra caminhos fora da pasta */
async function extractZip(zip: Buffer, dest: string) {
  // Fim do diretório central
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Arquivo .zip inválido');
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const base = path.resolve(dest);
  let total = 0;
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(p) !== 0x02014b50) throw new Error('Diretório do .zip corrompido');
    const method = zip.readUInt16LE(p + 10);
    const compSize = zip.readUInt32LE(p + 20);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOff = zip.readUInt32LE(p + 42);
    const name = zip.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;

    const target = path.resolve(base, name);
    if (!target.startsWith(base + path.sep) && target !== base) continue; // zip-slip
    if (name.endsWith('/')) {
      await fsp.mkdir(target, { recursive: true });
      continue;
    }
    const lNameLen = zip.readUInt16LE(localOff + 26);
    const lExtraLen = zip.readUInt16LE(localOff + 28);
    const start = localOff + 30 + lNameLen + lExtraLen;
    const raw = zip.subarray(start, start + compSize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error(`Compressão não suportada no arquivo "${name}"`);
    total += data.length;
    if (total > 300 * 1024 * 1024) throw new Error('Extensão grande demais');
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, data);
  }
}

/** Procura o manifest.json (na raiz ou em uma subpasta) */
function findManifestDir(dir: string, depth = 0): string | null {
  if (fs.existsSync(path.join(dir, 'manifest.json'))) return dir;
  if (depth >= 2) return null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && !e.name.startsWith('.')) {
      const found = findManifestDir(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const slug = (s: string) =>
  (s || 'extensao')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'extensao';

/** Instala a partir de uma pasta temporária já extraída */
async function finishInstall(tmpDir: string, meta: { source: StoredExtension['source']; storeId?: string; keyHint?: string }): Promise<ExtensionInfo> {
  const manifestDir = findManifestDir(tmpDir);
  if (!manifestDir) throw new Error('Não encontrei o manifest.json — isso não parece uma extensão de navegador');
  const manifest = readManifest(manifestDir);
  if (!manifest?.name) throw new Error('manifest.json inválido');
  // Pastas "_metadata" (assinatura da loja) impedem o carregamento descompactado
  await fsp.rm(path.join(manifestDir, '_metadata'), { recursive: true, force: true });

  const list = readIndex();
  const key = meta.storeId || meta.keyHint || `${slug(localize(manifestDir, manifest, manifest.name))}-${Date.now().toString(36)}`;
  const existing = list.find((e) => e.key === key);
  if (existing) unloadOne(key);
  const finalDir = extDir(key);
  await fsp.rm(finalDir, { recursive: true, force: true });
  await fsp.mkdir(root(), { recursive: true });
  await fsp.rename(manifestDir, finalDir).catch(async () => {
    await fsp.cp(manifestDir, finalDir, { recursive: true });
  });
  await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

  const entry: StoredExtension = { key, source: meta.source, storeId: meta.storeId, enabled: true, installedAt: existing?.installedAt || Date.now() };
  await writeIndex([...list.filter((e) => e.key !== key), entry]);
  await loadOne(entry);
  return describe(entry);
}

const tmpDirFor = async () => {
  const dir = path.join(app.getPath('temp'), `tp-ext-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`);
  await fsp.mkdir(dir, { recursive: true });
  return dir;
};

/** Aceita o link da Chrome Web Store ou o ID de 32 letras */
export function parseStoreId(input: string): string | null {
  const m = String(input || '').match(/(?:^|[/=?&])([a-p]{32})(?:$|[/?#&])/i) || String(input || '').trim().match(/^([a-p]{32})$/i);
  return m ? m[1].toLowerCase() : null;
}

async function installFromStore(input: string): Promise<ExtensionInfo> {
  const id = parseStoreId(input);
  if (!id) throw new Error('Cole o link da extensão na Chrome Web Store (ou o ID de 32 letras)');
  const url =
    `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=${encodeURIComponent(process.versions.chrome)}` +
    `&acceptformat=crx2,crx3&x=id%3D${id}%26uc`;
  const res = await net.fetch(url, { redirect: 'follow' } as any);
  if (!res.ok) throw new Error(`A Chrome Web Store recusou o download (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 100) throw new Error('A extensão não foi encontrada ou não está disponível para download');
  const tmp = await tmpDirFor();
  await extractZip(crxToZip(buf), tmp);
  return finishInstall(tmp, { source: 'store', storeId: id });
}

async function installFromFile(file: string): Promise<ExtensionInfo> {
  const buf = await fsp.readFile(file);
  const tmp = await tmpDirFor();
  await extractZip(crxToZip(buf), tmp);
  const id = parseStoreId(path.basename(file));
  return finishInstall(tmp, { source: 'file', storeId: id || undefined });
}

async function installFromFolder(folder: string): Promise<ExtensionInfo> {
  if (!findManifestDir(folder)) throw new Error('Essa pasta não tem um manifest.json');
  const tmp = await tmpDirFor();
  await fsp.cp(folder, tmp, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)([\\/]|$)/.test(src) });
  return finishInstall(tmp, { source: 'folder' });
}

/* ───────────── Informações ───────────── */

function describe(e: StoredExtension): ExtensionInfo {
  const dir = extDir(e.key);
  const manifest = readManifest(dir) || {};
  const popup = manifest.action?.default_popup || manifest.browser_action?.default_popup || manifest.page_action?.default_popup;
  const options = manifest.options_ui?.page || manifest.options_page;
  return {
    ...e,
    name: localize(dir, manifest, manifest.name || e.key),
    version: manifest.version || '?',
    description: manifest.description ? localize(dir, manifest, manifest.description) : undefined,
    icon: iconDataUrl(dir, manifest),
    id: loadedIds.get(e.key),
    loaded: loadedIds.has(e.key),
    error: loadErrors.get(e.key),
    popup: popup || undefined,
    options: options || undefined,
    warnings: compatibilityWarnings(manifest),
    manifestVersion: manifest.manifest_version || 2,
  };
}

function openExtensionPage(key: string, page: string | undefined, parent: BrowserWindow | null, title: string, size: { width: number; height: number }) {
  const id = loadedIds.get(key);
  if (!id || !page) return { success: false, error: 'A extensão não está ativa' };
  const win = new BrowserWindow({
    ...size,
    title,
    parent: parent || undefined,
    autoHideMenuBar: true,
    backgroundColor: '#ffffff',
    webPreferences: { partition: PARTITION, contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  win.loadURL(`chrome-extension://${id}/${page.replace(/^\//, '')}`).catch(() => {});
  return { success: true };
}

/* ───────────── IPC ───────────── */

const wrap = async <T,>(fn: () => Promise<T>) => {
  try {
    return { success: true, data: await fn() };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
};

export function registerBrowserExtensionsIpc(getParent: () => BrowserWindow | null) {
  ipcMain.handle('extensions:list', () => readIndex().map(describe));

  ipcMain.handle('extensions:installFromStore', (_e, input: string) => wrap(() => installFromStore(input)));

  ipcMain.handle('extensions:installFromFile', () =>
    wrap(async () => {
      const parent = getParent();
      const opts = { title: 'Escolher extensão (.crx ou .zip)', properties: ['openFile'] as any, filters: [{ name: 'Extensões', extensions: ['crx', 'zip'] }] };
      const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
      if (r.canceled || !r.filePaths[0]) return null;
      return installFromFile(r.filePaths[0]);
    })
  );

  ipcMain.handle('extensions:installFromFolder', () =>
    wrap(async () => {
      const parent = getParent();
      const opts = { title: 'Escolher a pasta da extensão (com manifest.json)', properties: ['openDirectory'] as any };
      const r = parent ? await dialog.showOpenDialog(parent, opts) : await dialog.showOpenDialog(opts);
      if (r.canceled || !r.filePaths[0]) return null;
      return installFromFolder(r.filePaths[0]);
    })
  );

  ipcMain.handle('extensions:setEnabled', (_e, key: string, enabled: boolean) =>
    wrap(async () => {
      const list = readIndex();
      const entry = list.find((x) => x.key === key);
      if (!entry) throw new Error('Extensão não encontrada');
      entry.enabled = !!enabled;
      await writeIndex(list);
      if (enabled) await loadOne(entry);
      else unloadOne(key);
      return describe(entry);
    })
  );

  ipcMain.handle('extensions:remove', (_e, key: string) =>
    wrap(async () => {
      unloadOne(key);
      await writeIndex(readIndex().filter((x) => x.key !== key));
      const dir = path.resolve(extDir(key));
      if (dir.startsWith(path.resolve(root()) + path.sep)) await fsp.rm(dir, { recursive: true, force: true });
      return true;
    })
  );

  ipcMain.handle('extensions:openPopup', (_e, key: string) => {
    const info = readIndex().find((x) => x.key === key);
    if (!info) return { success: false, error: 'Extensão não encontrada' };
    const d = describe(info);
    return openExtensionPage(key, d.popup, getParent(), d.name, { width: 420, height: 600 });
  });

  ipcMain.handle('extensions:openOptions', (_e, key: string) => {
    const info = readIndex().find((x) => x.key === key);
    if (!info) return { success: false, error: 'Extensão não encontrada' };
    const d = describe(info);
    return openExtensionPage(key, d.options, getParent(), `${d.name} — Opções`, { width: 900, height: 700 });
  });

  ipcMain.handle('extensions:openFolder', async () => {
    await fsp.mkdir(root(), { recursive: true });
    const { shell } = await import('electron');
    return { success: !(await shell.openPath(root())) };
  });
}

/** Exportado para testes */
export const __test = { crxToZip, extractZip, findManifestDir, compatibilityWarnings };
