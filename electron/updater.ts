// electron/updater.ts
// Atualização automática pelo GitHub Releases.
//  - Instalado (Setup.exe): baixa a versão nova em segundo plano e instala ao fechar o app
//    (ou na hora, se o usuário clicar em "Reiniciar e atualizar").
//  - Portátil ou build local: só avisa que há versão nova e abre a página de download.
// A opção "Atualizar automaticamente" fica salva em <userData>/updater.json (ligada por padrão).

import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { autoUpdater } from 'electron-updater';
import { writeLog } from './logger';

const OWNER = 'CaioDoc';
const REPO = 'Tomodachi_Player';
const RELEASES_URL = `https://github.com/${OWNER}/${REPO}/releases`;
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000;
const FIRST_CHECK_DELAY_MS = 15 * 1000;

export type UpdateStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error';
export type UpdateMode = 'installer' | 'portable' | 'manual';

export interface UpdateState {
  status: UpdateStatus;
  mode: UpdateMode;
  auto: boolean;
  current: string;
  version?: string;
  percent?: number;
  releaseUrl?: string;
  notes?: string;
  error?: string;
  checkedAt?: number;
  /** Caminho do .exe em uso (para saber qual cópia está aberta) */
  exe?: string;
}

const settingsFile = () => path.join(app.getPath('userData'), 'updater.json');

function readAuto(): boolean {
  try {
    const v = JSON.parse(fs.readFileSync(settingsFile(), 'utf8'));
    return v?.auto !== false;
  } catch {
    return true;
  }
}

function writeAuto(auto: boolean) {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify({ auto }), 'utf8');
  } catch (err) {
    writeLog('warn', 'updater', 'não foi possível salvar a preferência', err);
  }
}

function detectMode(): UpdateMode {
  if (process.env.PORTABLE_EXECUTABLE_DIR || process.env.PORTABLE_EXECUTABLE_FILE) return 'portable';
  // Só a cópia instalada pelo Setup tem o desinstalador ao lado do .exe (a pasta win-unpacked não tem)
  const dir = path.dirname(process.execPath);
  const installed = fs.existsSync(path.join(dir, `Uninstall ${app.getName()}.exe`)) || fs.readdirSync(dir).some((f) => /^Uninstall .*\.exe$/i.test(f));
  if (app.isPackaged && installed && fs.existsSync(path.join(process.resourcesPath, 'app-update.yml'))) return 'installer';
  return 'manual';
}

let state: UpdateState = { status: 'idle', mode: 'manual', auto: true, current: app.getVersion(), exe: process.execPath };

function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('updater:state', state);
  }
}

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  broadcast();
}

/* ── comparação de versões (1.6.0-beta < 1.6.0 < 1.6.1-beta) ── */
function parseVersion(v: string) {
  const m = String(v || '').replace(/^v/i, '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!m) return null;
  return { nums: [Number(m[1]), Number(m[2]), Number(m[3])], pre: m[4] || '' };
}
export function isNewer(candidate: string, current: string): boolean {
  const a = parseVersion(candidate);
  const b = parseVersion(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) if (a.nums[i] !== b.nums[i]) return a.nums[i] > b.nums[i];
  if (a.pre === b.pre) return false;
  if (!a.pre) return true; // versão final é mais nova que a beta do mesmo número
  if (!b.pre) return false;
  return a.pre.localeCompare(b.pre, undefined, { numeric: true }) > 0;
}

/** Portátil/build local: consulta a última versão publicada direto na API do GitHub */
async function checkManually() {
  setState({ status: 'checking', error: undefined });
  try {
    const res = await net.fetch(`https://api.github.com/repos/${OWNER}/${REPO}/releases?per_page=5`, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Tomodachi-Player' },
    });
    if (!res.ok) throw new Error(`GitHub ${res.status}`);
    const list = (await res.json()) as any[];
    const latest = (list || []).find((r) => r && !r.draft);
    const version = String(latest?.tag_name || '').replace(/^v/i, '');
    if (latest && isNewer(version, state.current)) {
      setState({ status: 'available', version, releaseUrl: latest.html_url || RELEASES_URL, notes: latest.body || '', checkedAt: Date.now() });
    } else {
      setState({ status: 'up-to-date', version: undefined, checkedAt: Date.now() });
    }
  } catch (err: any) {
    setState({ status: 'error', error: String(err?.message || err), checkedAt: Date.now() });
  }
}

async function check() {
  if (state.status === 'checking' || state.status === 'downloading') return;
  if (state.mode !== 'installer') return checkManually();
  try {
    autoUpdater.autoDownload = state.auto;
    await autoUpdater.checkForUpdates();
  } catch (err: any) {
    writeLog('warn', 'updater', 'falha ao procurar atualização', err);
    setState({ status: 'error', error: String(err?.message || err), checkedAt: Date.now() });
  }
}

export function setupUpdater() {
  state = { ...state, mode: detectMode(), auto: readAuto(), current: app.getVersion() };

  if (state.mode === 'installer') {
    autoUpdater.allowPrerelease = true; // as versões atuais são beta
    autoUpdater.autoDownload = state.auto;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = {
      info: (m: unknown) => writeLog('info', 'updater', m),
      warn: (m: unknown) => writeLog('warn', 'updater', m),
      error: (m: unknown) => writeLog('error', 'updater', m),
      debug: () => {},
    } as any;
    autoUpdater.on('checking-for-update', () => setState({ status: 'checking', error: undefined }));
    autoUpdater.on('update-available', (info) =>
      setState({
        status: state.auto ? 'downloading' : 'available',
        version: info.version,
        percent: 0,
        releaseUrl: `${RELEASES_URL}/tag/v${info.version}`,
        notes: typeof info.releaseNotes === 'string' ? info.releaseNotes : '',
        checkedAt: Date.now(),
      })
    );
    autoUpdater.on('update-not-available', () => setState({ status: 'up-to-date', version: undefined, percent: undefined, checkedAt: Date.now() }));
    autoUpdater.on('download-progress', (p) => setState({ status: 'downloading', percent: Math.round(p.percent || 0) }));
    autoUpdater.on('update-downloaded', (info) => setState({ status: 'downloaded', version: info.version, percent: 100 }));
    autoUpdater.on('error', (err) => setState({ status: 'error', error: String(err?.message || err) }));
  }

  ipcMain.handle('updater:get-state', () => state);
  ipcMain.handle('updater:set-auto', (_e, auto: boolean) => {
    writeAuto(!!auto);
    setState({ auto: !!auto });
    if (state.mode === 'installer') autoUpdater.autoDownload = !!auto;
    if (auto) void check();
    return state;
  });
  ipcMain.handle('updater:check', async () => {
    await check();
    return state;
  });
  ipcMain.handle('updater:download', async () => {
    if (state.mode !== 'installer') {
      await shell.openExternal(state.releaseUrl || RELEASES_URL);
      return state;
    }
    try {
      setState({ status: 'downloading', percent: 0 });
      await autoUpdater.downloadUpdate();
    } catch (err: any) {
      setState({ status: 'error', error: String(err?.message || err) });
    }
    return state;
  });
  ipcMain.handle('updater:install', () => {
    if (state.mode === 'installer' && state.status === 'downloaded') {
      // Fecha o app, instala em silêncio e abre de novo
      setImmediate(() => autoUpdater.quitAndInstall(true, true));
      return { success: true };
    }
    void shell.openExternal(state.releaseUrl || RELEASES_URL);
    return { success: false };
  });
  ipcMain.handle('updater:open-releases', () => shell.openExternal(state.releaseUrl || RELEASES_URL));

  // Ao abrir sempre verifica (com a opção desligada, só avisa, sem baixar); depois a cada 6 horas se ligada
  setTimeout(() => void check(), FIRST_CHECK_DELAY_MS);
  setInterval(() => {
    if (state.auto) void check();
  }, CHECK_EVERY_MS);
}
