import { app, BrowserWindow, ipcMain, dialog, protocol, net, session, shell, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable } from 'node:stream';
import { fileResponse } from './fileResponse';
import { pathToFileURL } from 'url';
import axios from 'axios';
import { startVideoServer, NEEDS_TRANSCODE } from './videoServer';
import { registerMediaProtocol, getFfmpegPath } from './mediaProtocol';
import { registerDownloadIpcHandlers } from './downloads';
import { setupLogging } from './logger';
import { setupUpdater, isNewer } from './updater';
import { registerSuwayomiIpcHandlers, suwayomiAuthFor } from './suwayomi';
import { registerMediaProbeIpc } from './mediaProbe';
import { registerNuvioIpc, destroyNuvioHost } from './nuvio';
import { registerTorrentIpc, stopTorrentEngine } from './torrent';
import { streamHeadersFor } from './streamHeaders';
import { registerSecretsIpc } from './secrets';
import { registerMalIpc } from './mal';
import { sniffMedia } from './videoSniffer';
import { registerAniListAuthIpc } from './anilistAuth';
import {
  setupAdblocker,
  handleAdblockBeforeRequest,
  handleAdblockHeadersReceived,
  registerAdblockIpcHandlers,
  applyAdblockToSession,
  attachCosmeticFiltering,
  shouldBlockPopup,
} from './adblocker';
import { registerBrowserExtensionsIpc, loadInstalledExtensions } from './browserExtensions';

// Register custom privileged schemes for media streaming and safe Range/CORS handling
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'media',
    privileges: {
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'media-file',
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4', '.m4v': 'video/mp4', '.webm': 'video/webm', '.ogv': 'video/ogg',
  '.mov': 'video/quicktime', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif',
};
const mimeFor = (p: string) => MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream';

function resolveFsPath(url: string): string {
  try {
    const u = new URL(url);
    let p = decodeURIComponent(u.pathname);
    if (u.host && /^[A-Za-z]:?$/.test(u.host)) {
      p = (u.host.endsWith(':') ? u.host : u.host + ':') + p;
    }
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(p)) {
      p = p.slice(1);
    }
    if ((u.search || u.hash) && !fs.existsSync(p)) {
      const extra = decodeURIComponent(u.search + u.hash);
      if (extra && fs.existsSync(p + extra)) {
        p = p + extra;
      }
    }
    return path.normalize(p);
  } catch {
    let p = decodeURIComponent(url.replace(/^media-file:\/\/?\/?/, ''));
    if (process.platform === 'win32' && /^\/[A-Za-z]:/.test(p)) {
      p = p.slice(1);
    }
    return path.normalize(p);
  }
}

let mainWindow: BrowserWindow | null = null;

// ─── Identidade do app (nome, ícone e pasta de dados) ───────────────────────
const APP_ID = 'com.manga.video.hub';
app.setName('Tomodachi Player');

// Mantém a pasta de dados das versões anteriores (biblioteca, progresso,
// logins), mesmo com o novo nome do aplicativo.
(function pinUserDataFolder() {
  try {
    const appData = app.getPath('appData');
    const candidates = ['Mangás & Comics + Vídeos & Animations', 'manga-video-hub', 'Tomodachi Player']
      .map((n) => path.join(appData, n))
      .filter((dir) => fs.existsSync(dir));
    if (candidates.length === 0) {
      app.setPath('userData', path.join(appData, 'Tomodachi Player'));
      return;
    }
    // Prefere a pasta com a biblioteca salva mais recentemente
    const score = (dir: string) => {
      let best = 0;
      for (const f of ['manga_library.json', 'video_library.json', 'Local Storage']) {
        try {
          best = Math.max(best, fs.statSync(path.join(dir, f)).mtimeMs);
        } catch {
          /* ignora */
        }
      }
      return best;
    };
    candidates.sort((a, b) => score(b) - score(a));
    app.setPath('userData', candidates[0]);
  } catch (err) {
    console.warn('[userData] Mantendo pasta padrão:', err);
  }
})();

if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Uma única instância: abrir o atalho de novo só traz a janela existente para frente
// (duas instâncias gravando a mesma biblioteca podiam perder dados).
// Quem abre por último informa a versão e o caminho: se for uma versão MAIS NOVA instalada em outro
// lugar, a janela antiga oferece fechar e abrir a nova (antes, a versão antiga ficava sempre na frente).
const gotSingleInstanceLock = app.requestSingleInstanceLock({ version: app.getVersion(), exe: process.execPath });
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, _argv, _cwd, additionalData: any) => {
    const win = mainWindow;
    if (!win || win.isDestroyed()) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    const other = additionalData && typeof additionalData === 'object' ? additionalData : null;
    if (other?.exe && other?.version && other.exe !== process.execPath && isNewer(String(other.version), app.getVersion())) {
      void dialog
        .showMessageBox(win, {
          type: 'question',
          title: 'Tomodachi Player',
          message: `Você abriu a versão ${other.version}, mas a ${app.getVersion()} já estava aberta.`,
          detail: `Versão nova: ${other.exe}\nVersão aberta: ${process.execPath}\n\nDica: desinstale as cópias antigas para os atalhos abrirem sempre a versão atual.`,
          buttons: ['Abrir a versão nova', 'Continuar nesta'],
          defaultId: 0,
          cancelId: 1,
          noLink: true,
        })
        .then(({ response }) => {
          if (response !== 0) return;
          app.relaunch({ execPath: String(other.exe), args: [] });
          app.quit();
        });
    }
  });
}

function resolveAppIcon(): string | undefined {
  const options = [
    path.join(__dirname, '../dist/icon.png'),
    path.join(__dirname, '../public/icon.png'),
    path.join(__dirname, '../build/icon.ico'),
  ];
  return options.find((p) => {
    try {
      return fs.existsSync(p);
    } catch {
      return false;
    }
  });
}

function setupMediaProtocol() {
  // Responde com suporte a "Range" (206): sem isso o Chromium não consegue pular para
  // outro ponto do vídeo e volta para o início ao arrastar a barra.
  protocol.handle('media-file', (request) =>
    fileResponse(resolveFsPath(request.url), request.headers.get('range'), mimeFor)
  );
}

const COVER_NAMES = ['cover', 'capa', 'poster', 'folder', 'thumb', '0001', '001', '01', '1'];

function pickCover(images: string[]): string | null {
  if (!images.length) return null;
  const sorted = [...images].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
  );
  const byName = sorted.find((f) => {
    const base = path.basename(f, path.extname(f)).toLowerCase();
    return COVER_NAMES.includes(base);
  });
  return byName ?? sorted[0];
}

const VIDEO_EXT = new Set(['.mp4','.mkv','.avi','.mov','.webm','.m4v','.wmv','.flv','.ts','.m2ts','.mpg','.mpeg','.3gp','.ogv','.rmvb','.vob']);

async function walkVideos(dir: string, out: any[], depth = 0, maxDepth = 10, rootPath = dir) {
  if (depth > maxDepth) return;
  let entries: fs.Dirent[];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }

  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await walkVideos(full, out, depth + 1, maxDepth, rootPath);
      continue;
    }
    if (!e.isFile()) continue;
    const ext = path.extname(e.name).toLowerCase();
    if (!VIDEO_EXT.has(ext)) continue;
    try {
      const st = await fsp.stat(full);
      out.push({ path: full, name: e.name, ext, size: st.size, mtime: st.mtimeMs, rootPath });
    } catch { /* arquivo inacessível, ignora */ }
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Tomodachi Player',
    icon: resolveAppIcon(),
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 650,
    backgroundColor: '#0e0912',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0e0912',
      symbolColor: '#d8cad8',
      height: 36
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true, // Enables <webview> for web navigation
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  // Impede que iframes, reprodutores embed ou scripts externos sequestrem e redirecionem a janela do app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const isLocalApp =
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1') ||
      url.startsWith('file://');
    if (!isLocalApp) {
      event.preventDefault();
      console.log('[Blocked top-level navigation attempt]:', url);
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log('[Blocked window.open attempt]:', url);
    return { action: 'deny' };
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    destroyNuvioHost(); // a janela oculta dos plugins não pode manter o app aberto
    stopTorrentEngine();
  });
}

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif']);
const ARCHIVE_EXT = new Set(['.zip', '.cbz', '.rar', '.cbr', '.7z']);

function getThumbnailsDir(): string {
  const dir = path.join(app.getPath('userData'), 'thumbnails');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {}
  }
  return dir;
}

function findFirstImage(dir: string, depth = 0): string | null {
  if (depth > 6) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    let firstImage: string | null = null;
    for (const e of entries) {
      if (e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase())) {
        const lower = e.name.toLowerCase();
        if (lower.includes('cover') || lower.includes('folder') || lower.includes('poster') || lower.includes('capa')) {
          return path.join(dir, e.name);
        }
        if (!firstImage) {
          firstImage = path.join(dir, e.name);
        }
      }
    }
    if (firstImage) return firstImage;

    const subDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
    subDirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const e of subDirs) {
      const found = findFirstImage(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}

function findFirstVideo(dir: string, depth = 0): string | null {
  if (depth > 6) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && VIDEO_EXT.has(path.extname(e.name).toLowerCase())) {
        return path.join(dir, e.name);
      }
    }
    const subDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
    subDirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const e of subDirs) {
      const found = findFirstVideo(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}

function findFirstArchive(dir: string, depth = 0): string | null {
  if (depth > 6) return null;
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      if (e.isFile() && ARCHIVE_EXT.has(path.extname(e.name).toLowerCase())) {
        return path.join(dir, e.name);
      }
    }
    const subDirs = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.'));
    subDirs.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
    for (const e of subDirs) {
      const found = findFirstArchive(path.join(dir, e.name), depth + 1);
      if (found) return found;
    }
    return null;
  } catch {
    return null;
  }
}

async function extractVideoThumbnail(videoPath: string): Promise<string | null> {
  try {
    const hash = crypto.createHash('md5').update(videoPath).digest('hex');
    const thumbPath = path.join(getThumbnailsDir(), `vid_${hash}.jpg`);
    if (fs.existsSync(thumbPath)) {
      try {
        const st = fs.statSync(thumbPath);
        if (st.size > 0) return thumbPath;
      } catch {}
    }

    const ffmpeg = getFfmpegPath();
    if (!ffmpeg) return null;

    return new Promise<string | null>((resolve) => {
      let resolved = false;
      const done = (result: string | null) => {
        if (!resolved) {
          resolved = true;
          resolve(result);
        }
      };

      const timer = setTimeout(() => {
        try { proc.kill(); } catch {}
        done(null);
      }, 7000);

      const proc = spawn(ffmpeg, [
        '-ss', '00:00:03',
        '-i', videoPath,
        '-vframes', '1',
        '-q:v', '3',
        '-vf', 'scale=480:-1',
        '-y',
        thumbPath
      ], { windowsHide: true });

      proc.on('close', (code) => {
        if (code === 0 && fs.existsSync(thumbPath)) {
          try {
            const st = fs.statSync(thumbPath);
            if (st.size > 0) {
              clearTimeout(timer);
              return done(thumbPath);
            }
          } catch {}
        }
        // Fallback para o início exato (00:00:00)
        const fbTimer = setTimeout(() => {
          try { fb.kill(); } catch {}
          done(null);
        }, 5000);

        const fb = spawn(ffmpeg, [
          '-ss', '00:00:00',
          '-i', videoPath,
          '-vframes', '1',
          '-q:v', '3',
          '-vf', 'scale=480:-1',
          '-y',
          thumbPath
        ], { windowsHide: true });

        fb.on('close', (c2) => {
          clearTimeout(fbTimer);
          clearTimeout(timer);
          if (c2 === 0 && fs.existsSync(thumbPath)) {
            try {
              const st = fs.statSync(thumbPath);
              if (st.size > 0) return done(thumbPath);
            } catch {}
          }
          done(null);
        });

        fb.on('error', () => {
          clearTimeout(fbTimer);
          clearTimeout(timer);
          done(null);
        });
      });

      proc.on('error', () => {
        clearTimeout(timer);
        done(null);
      });
    });
  } catch {
    return null;
  }
}

async function extractArchiveThumbnail(archivePath: string): Promise<string | null> {
  try {
    const hash = crypto.createHash('md5').update(archivePath).digest('hex');
    const thumbPath = path.join(getThumbnailsDir(), `arc_${hash}.jpg`);
    if (fs.existsSync(thumbPath)) return thumbPath;

    return new Promise<string | null>((resolve) => {
      const listProc = spawn('tar', ['-tf', archivePath], { windowsHide: true });
      let stdout = '';
      listProc.stdout.on('data', (d) => { stdout += d.toString(); });
      listProc.on('close', (code) => {
        if (code !== 0) return resolve(null);
        const files = stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
        const firstImg = files.find((f) => IMAGE_EXT.has(path.extname(f).toLowerCase()) && !f.includes('__MACOSX'));
        if (!firstImg) return resolve(null);

        const extractProc = spawn('tar', ['-xf', archivePath, firstImg, '-O'], { windowsHide: true });
        const chunks: Buffer[] = [];
        extractProc.stdout.on('data', (c) => chunks.push(c));
        extractProc.on('close', (exCode) => {
          if (exCode === 0 && chunks.length > 0) {
            const buf = Buffer.concat(chunks);
            fs.writeFile(thumbPath, buf, (err) => {
              if (!err) resolve(thumbPath);
              else resolve(null);
            });
          } else {
            resolve(null);
          }
        });
        extractProc.on('error', () => resolve(null));
      });
      listProc.on('error', () => resolve(null));
    });
  } catch {
    return null;
  }
}

function getCustomCoversFilePath(): string {
  return path.join(app.getPath('userData'), 'custom_covers.json');
}

async function getCustomCoversMap(): Promise<Record<string, string>> {
  try {
    const file = getCustomCoversFilePath();
    if (fs.existsSync(file)) {
      const data = await fsp.readFile(file, 'utf8');
      return JSON.parse(data);
    }
  } catch {}
  return {};
}

async function getCustomCover(dir: string): Promise<string | null> {
  try {
    const map = await getCustomCoversMap();
    const key = path.normalize(dir).toLowerCase();
    const coverPath = map[key];
    if (coverPath && fs.existsSync(coverPath)) {
      return coverPath;
    }
  } catch {}
  return null;
}

async function setFolderCustomCover(folderPath: string, imagePath: string): Promise<{ success: boolean; coverPath?: string; error?: string }> {
  try {
    const ext = path.extname(imagePath).toLowerCase() || '.jpg';
    const destName = `cover${ext}`;
    const destPath = path.join(folderPath, destName);
    let finalPath = imagePath;

    // 1. Tenta copiar diretamente para dentro da pasta como cover.<ext>
    try {
      await fsp.copyFile(imagePath, destPath);
      if (fs.existsSync(destPath)) {
        finalPath = destPath;
      }
    } catch (copyErr) {
      console.warn('[setFolderCustomCover] Pasta somente leitura ou sem permissão de escrita, usando mapeamento persistente:', copyErr);
    }

    // 2. Persiste o mapeamento em custom_covers.json em userData
    const map = await getCustomCoversMap();
    const key = path.normalize(folderPath).toLowerCase();
    map[key] = finalPath;

    const file = getCustomCoversFilePath();
    await fsp.writeFile(file, JSON.stringify(map, null, 2), 'utf8');

    return { success: true, coverPath: finalPath };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

async function findFolderCover(dir: string): Promise<string | null> {
  // 0. Capa personalizada definida pelo usuário
  const custom = await getCustomCover(dir);
  if (custom) return custom;

  // 1. Imagem direta ou em subpastas de capítulos (prioriza cover/capa/poster)
  const img = findFirstImage(dir);
  if (img) return img;

  // 2. Thumbnail de vídeo se for pasta de vídeo/anime
  const vid = findFirstVideo(dir);
  if (vid) {
    const thumb = await extractVideoThumbnail(vid);
    if (thumb) return thumb;
  }

  // 3. Thumbnail de arquivo compactado (.cbz / .zip)
  const arc = findFirstArchive(dir);
  if (arc) {
    const thumb = await extractArchiveThumbnail(arc);
    if (thumb) return thumb;
  }

  return null;
}

async function expandFolders(paths: string[], _mediaType: 'video' | 'image'): Promise<string[]> {
  // Preserva estritamente as pastas que o usuário selecionou sem achatar/flattening
  const clean = paths.map((p) => path.normalize(p).replace(/[\\/]+$/, '')).filter(Boolean);
  return Array.from(new Set(clean));
}

async function scrapeDynamicChapterPages(targetUrl: string): Promise<{ success: boolean; pages?: string[]; title?: string; error?: string }> {
  return new Promise((resolve) => {
    let finished = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const scraperWin = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        images: true,
        javascript: true,
        webSecurity: false,
        backgroundThrottling: false,
      },
    });

    const collectedImages = new Set<string>();

    const finish = (title = '') => {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      try {
        scraperWin.destroy();
      } catch {}

      const list = Array.from(collectedImages).filter((u) => {
        if (/logo|avatar|favicon|banner|icon|ads|tracker|analytics|pixel|widget|discord|patreon|paypal/i.test(u)) {
          return false;
        }
        return true;
      });

      list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

      if (list.length > 0) {
        resolve({ success: true, pages: list, title });
      } else {
        resolve({ success: false, error: 'Nenhuma página encontrada para este capítulo' });
      }
    };

    scraperWin.webContents.session.webRequest.onResponseStarted(
      { urls: ['http://*/*', 'https://*/*'] },
      (details) => {
        const u = details.url;
        const type = details.responseHeaders?.['content-type']?.[0] || details.responseHeaders?.['Content-Type']?.[0] || '';
        if (
          (type.startsWith('image/') || /\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(u)) &&
          !/logo|icon|avatar|favicon|banner|advert|analytics|tracker|tracking/i.test(u) &&
          !u.includes('google') && !u.includes('facebook')
        ) {
          collectedImages.add(u);
        }
      }
    );

    timeoutId = setTimeout(async () => {
      let pageTitle = '';
      try {
        pageTitle = scraperWin.webContents.getTitle();
        const domImages = await scraperWin.webContents.executeJavaScript(`
          (() => {
            const urls = [];
            document.querySelectorAll('img').forEach(img => {
              const src = img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || img.getAttribute('data-original');
              if (src && /^https?:\\/\\//i.test(src)) urls.push(src);
            });
            if (window.pages && Array.isArray(window.pages)) {
              window.pages.forEach(p => {
                const s = typeof p === 'string' ? p : p?.url || p?.src || p?.image;
                if (s && /^https?:\\/\\//i.test(s)) urls.push(s);
              });
            }
            if (window.chapterImages && Array.isArray(window.chapterImages)) {
              window.chapterImages.forEach(p => {
                const s = typeof p === 'string' ? p : p?.url || p?.src || p?.image;
                if (s && /^https?:\\/\\//i.test(s)) urls.push(s);
              });
            }
            return urls;
          })()
        `).catch(() => []);

        for (const img of domImages) {
          if (!/logo|icon|avatar|favicon|banner|advert/i.test(img)) {
            collectedImages.add(img);
          }
        }
      } catch {}
      finish(pageTitle);
    }, 5000);

    scraperWin.loadURL(targetUrl, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }).catch(() => finish());
  });
}

async function scrapeDynamicMangaChapters(targetUrl: string): Promise<{ success: boolean; chapters?: { url: string; name: string; number: number }[]; error?: string }> {
  return new Promise((resolve) => {
    let finished = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const scraperWin = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        images: false,
        javascript: true,
        webSecurity: false,
        backgroundThrottling: false,
        partition: 'persist:user_session', // Compartilha cookies e sessão da webview
      },
    });

    const finish = (res: { success: boolean; chapters?: any[]; error?: string }) => {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      try {
        scraperWin.destroy();
      } catch {}
      resolve(res);
    };

    const extractFromDom = async () => {
      try {
        const domResult = await scraperWin.webContents.executeJavaScript(`
          (() => {
            // 1. Atsumaru window.mangaPage
            if (window.mangaPage?.mangaPage?.chapters) {
              const mp = window.mangaPage.mangaPage;
              return mp.chapters.map(c => ({
                url: 'https://atsu.moe/read/' + mp.id + '/' + c.id,
                name: c.title || ('Capítulo ' + (c.number || '')),
                number: typeof c.number === 'number' ? c.number : parseFloat(c.number) || 1
              }));
            }

            // 2. Next.js __NEXT_DATA__
            if (window.__NEXT_DATA__?.props?.pageProps) {
              const pp = window.__NEXT_DATA__.props.pageProps;
              const chs = pp.chapters || pp.manga?.chapters || pp.mangaData?.chapters || pp.series?.chapters;
              if (Array.isArray(chs) && chs.length > 0) {
                return chs.map((c, i) => ({
                  url: c.url || c.slug || c.id,
                  name: c.name || c.title || ('Capítulo ' + (c.number || i + 1)),
                  number: typeof c.number === 'number' ? c.number : parseFloat(c.number) || (i + 1)
                }));
              }
            }

            const list = [];
            const seen = new Set();
            const base = window.location.href;

            const allLinks = Array.from(document.querySelectorAll('a[href]'));
            for (const a of allLinks) {
              const href = a.getAttribute('href')?.trim();
              if (!href || href === '#' || href.startsWith('javascript:')) continue;
              let fullUrl = '';
              try {
                fullUrl = new URL(href, base).href;
              } catch {
                continue;
              }

              const text = (a.innerText || a.textContent || '').trim().replace(/\\s+/g, ' ');
              const lowerHref = fullUrl.toLowerCase();
              const lowerText = text.toLowerCase();

              const isChapterUrl =
                /(?:\\/chapter|\\/capitulo|\\/capítulo|\\/read|\\/ler|\\/ch-|\\/c-|\\/ep-|\\/volume|\\/v-|\\/view|\\/comic\\/|\\/manga\\/[^\\/]+\\/[^\\/]+)/i.test(lowerHref) ||
                /(?:chapter|capitulo|capítulo|ch\\.|cap\\.|ep\\.|episodio|episódio|volume|vol\\.|#)\\s*\\d+/i.test(lowerText);

              const isExcluded =
                /login|register|signup|user|profile|bookmark|history|donate|discord|facebook|twitter|patreon|terms|privacy|dmca|contact|author|tag|genre|privacy-policy/i.test(lowerHref);

              if (isChapterUrl && !isExcluded && !seen.has(fullUrl)) {
                seen.add(fullUrl);
                const numMatch = lowerText.match(/(?:chapter|capitulo|capítulo|ch\\.|cap\\.|ep\\.|#)\\s*([0-9]+(?:\\.[0-9]+)?)/i) ||
                                 lowerHref.match(/(?:chapter|capitulo|capítulo|ch-|c-|ep-)([0-9]+(?:\\.[0-9]+)?)/i) ||
                                 lowerText.match(/([0-9]+(?:\\.[0-9]+)?)/);
                const num = numMatch ? parseFloat(numMatch[1]) : (list.length + 1);

                list.push({
                  url: fullUrl,
                  name: text || ('Capítulo ' + num),
                  number: num
                });
              }
            }
            return list;
          })()
        `).catch(() => []);

        if (Array.isArray(domResult) && domResult.length > 0) {
          finish({ success: true, chapters: domResult });
          return true;
        }
      } catch {}
      return false;
    };

    // Timeout se a página demorar muito
    timeoutId = setTimeout(async () => {
      const ok = await extractFromDom();
      if (!ok) {
        finish({ success: false, error: 'Nenhum capítulo encontrado nesta página' });
      }
    }, 7000);

    scraperWin.webContents.on('did-finish-load', () => {
      setTimeout(async () => {
        if (finished) return;
        await extractFromDom();
      }, 1500);
    });

    scraperWin.loadURL(targetUrl, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }).catch(() => finish({ success: false, error: 'Falha ao carregar página do mangá' }));
  });
}

// Raspador universal de catálogo online direto do website da extensão (ex: Jav Guru, BetterAnime, etc.)
async function scrapeExtensionCatalog(params: {
  baseUrl: string;
  query?: string;
  page?: number;
  sourceName?: string;
}): Promise<{
  success: boolean;
  items: Array<{
    title: string;
    url: string;
    cover: string;
    author?: string;
    description?: string;
    genres?: string[];
  }>;
  error?: string;
}> {
  const { baseUrl, query, page = 1 } = params;
  if (!baseUrl) return { success: false, items: [], error: 'URL base inválida' };

  let targetUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  if (query && query.trim()) {
    targetUrl = `${targetUrl}?s=${encodeURIComponent(query.trim())}`;
  } else if (page > 1) {
    targetUrl = `${targetUrl}page/${page}/`;
  }

  // 1. Tentativa rápida estática com axios
  try {
    const res = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Referer': baseUrl,
      },
      timeout: 8000,
    });

    const html = res.data;
    if (typeof html === 'string') {
      const items: Array<{ title: string; url: string; cover: string }> = [];
      const seen = new Set<string>();

      const cleanBase = baseUrl.split('?')[0].replace(/\/+$/, '');

      // Padrão 1 (Mais preciso): Parsing por container de cards (inside-article, article, film-item, anime-card, etc.)
      const cardBlockRegex = /<(?:div|article)[^>]+class="[^"]*(?:inside-article|post-item|film-item|anime-card|item-video|thumb|card|post)[^"]*"[^>]*>([\s\S]*?)<\/(?:div|article)>/gi;
      let cardMatch;
      while ((cardMatch = cardBlockRegex.exec(html)) !== null) {
        const chunk = cardMatch[1];
        const linkM = chunk.match(/<a[^>]+href="([^">]+)"/i);
        const imgM = chunk.match(/<img[^>]+(?:src|data-src|data-lazy-src)="([^">]+)"[^>]*alt="([^">]*)"/i) ||
                     chunk.match(/<img[^>]+alt="([^">]*)"[^>]+(?:src|data-src|data-lazy-src)="([^">]+)"/i);
        if (linkM && imgM) {
          const href = linkM[1];
          const cover = imgM[1].startsWith('http') ? imgM[1] : imgM[2];
          const rawTitle = (imgM[1].startsWith('http') ? imgM[2] : imgM[1]) || '';
          const cleanTitle = rawTitle.replace(/&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
          const cleanHref = href.split('?')[0].replace(/\/+$/, '');

          if (href && cover && cleanTitle && !seen.has(href) && cleanHref !== cleanBase && !cover.includes('logo') && !cover.includes('icon')) {
            seen.add(href);
            items.push({ title: cleanTitle, url: href, cover });
          }
        }
      }

      if (items.length >= 3) {
        return { success: true, items };
      }

      // Padrão 2: Âncora envolvendo imagem com alt/title e verificação estrita anti-homepage
      const itemRegex = /<a[^>]+href="([^">]+)"[^>]*>[\s\S]*?<img[^>]+(?:src|data-src|data-lazy-src)="([^">]+)"[^>]*alt="([^">]*)"[\s\S]*?<\/a>/gi;
      let match;
      while ((match = itemRegex.exec(html)) !== null) {
        const href = match[1];
        const cover = match[2];
        const rawTitle = match[3];
        const cleanTitle = rawTitle.replace(/&#8217;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
        const cleanHref = href.split('?')[0].replace(/\/+$/, '');

        if (
          href &&
          cover &&
          cleanTitle &&
          !seen.has(href) &&
          cleanHref !== cleanBase &&
          href !== targetUrl &&
          !cover.includes('logo') &&
          !cover.includes('icon')
        ) {
          seen.add(href);
          items.push({ title: cleanTitle, url: href, cover });
        }
      }

      if (items.length >= 3) {
        return { success: true, items };
      }
    }
  } catch (err: any) {
    console.warn(`[scrapeExtensionCatalog static failed]:`, err.message);
  }

  // 2. Tentativa dinâmica via BrowserWindow off-screen
  return new Promise((resolve) => {
    let finished = false;
    let timeoutId: NodeJS.Timeout | null = null;

    const scraperWin = new BrowserWindow({
      show: false,
      width: 1280,
      height: 900,
      webPreferences: {
        images: false,
        javascript: true,
        webSecurity: false,
        backgroundThrottling: false,
        partition: 'persist:user_session',
      },
    });

    const finish = (result: { success: boolean; items: any[]; error?: string }) => {
      if (finished) return;
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
      try {
        scraperWin.destroy();
      } catch {}
      resolve(result);
    };

    timeoutId = setTimeout(() => {
      finish({ success: false, items: [], error: 'Timeout ao carregar catálogo da extensão' });
    }, 12000);

    const extractFromDom = async () => {
      try {
        const domResult = await scraperWin.webContents.executeJavaScript(`
          (() => {
            const results = [];
            const seen = new Set();
            const currentUrl = window.location.href.split('?')[0].replace(/\\/+$/, '');
            const origin = window.location.origin;

            // Prioridade a containers estruturados de cards
            const cards = document.querySelectorAll('.inside-article, article, .film-item, .anime-card, .post-item, .card, div[class*="post"]');
            if (cards.length > 0) {
              for (const card of cards) {
                const a = card.querySelector('a');
                const img = card.querySelector('img');
                if (!a || !img) continue;
                const href = a.href;
                const cleanHref = href.split('?')[0].replace(/\\/+$/, '');
                if (!href || cleanHref === currentUrl || cleanHref === origin || href.startsWith('javascript:')) continue;
                const cover = img.src || img.dataset.src || img.dataset.lazySrc || '';
                if (!cover || !cover.startsWith('http') || cover.includes('logo') || cover.includes('avatar') || cover.includes('icon')) continue;
                let title = a.getAttribute('title') || img.getAttribute('alt') || img.getAttribute('title') || a.innerText.trim();
                title = title.replace(/\\s+/g, ' ').trim();
                if (title.length > 2 && !seen.has(href)) {
                  seen.add(href);
                  results.push({ title, url: href, cover });
                }
              }
            }

            if (results.length < 3) {
              const links = document.querySelectorAll('a');
              for (const a of links) {
                const href = a.href;
                const cleanHref = href.split('?')[0].replace(/\\/+$/, '');
                if (!href || cleanHref === currentUrl || cleanHref === origin || href.startsWith('javascript:')) continue;
                const img = a.querySelector('img');
                if (!img) continue;

                const cover = img.src || img.dataset.src || img.dataset.lazySrc || '';
                if (!cover || !cover.startsWith('http') || cover.includes('logo') || cover.includes('avatar') || cover.includes('icon')) continue;

                let title = a.getAttribute('title') || img.getAttribute('alt') || img.getAttribute('title') || a.innerText.trim();
                title = title.replace(/\\s+/g, ' ').trim();
                if (title.length > 2 && !seen.has(href)) {
                  seen.add(href);
                  results.push({ title, url: href, cover });
                }
              }
            }

            return results.slice(0, 36);
          })()
        `);

        if (Array.isArray(domResult) && domResult.length > 0) {
          finish({ success: true, items: domResult });
          return;
        }
      } catch {}
      finish({ success: false, items: [], error: 'Nenhum item encontrado no catálogo' });
    };

    scraperWin.webContents.on('did-finish-load', () => {
      setTimeout(extractFromDom, 1500);
    });

    scraperWin.loadURL(targetUrl, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }).catch((err) => {
      finish({ success: false, items: [], error: err.message });
    });
  });
}

// Desempacotador de código JavaScript ofuscado com eval(function(p,a,c,k,e,d)...) (PlayerJS / JWPlayer)
function unpackPackedJs(html: string): string | null {
  const startIdx = html.indexOf('eval(function(p,a,c,k,e,d)');
  if (startIdx === -1) return null;
  const scriptEnd = html.indexOf('</script>', startIdx);
  if (scriptEnd === -1) return null;
  const evalStr = html.slice(startIdx, scriptEnd).trim();
  const code = 'return ' + evalStr.slice(4);
  try {
    return new Function(code)();
  } catch {
    return null;
  }
}

// Extrator de stream de vídeo direto ou player embed para reprodução na plataforma sem erros de codec
async function extractVideoStream(pageUrl: string): Promise<{
  success: boolean;
  type?: 'stream' | 'embed';
  streamUrl?: string;
  embedUrl?: string;
  url?: string;
  referer?: string;
  servers?: Array<{ name: string; url: string }>;
  error?: string;
}> {
  if (!pageUrl || !/^https?:\/\//i.test(pageUrl)) {
    return { success: false, error: 'URL inválida' };
  }

  // 1. TENTATIVA RÁPIDA: Requisição estática via axios
  try {
    const res = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': pageUrl,
      },
      timeout: 8000,
    });

    const html = res.data;
    if (typeof html === 'string') {
      const videoSrcMatch = html.match(/<video[^>]+src="([^">]+)"/i) || html.match(/<source[^>]+src="([^">]+)"/i);
      if (videoSrcMatch && /^https?:\/\//i.test(videoSrcMatch[1])) {
        return { success: true, type: 'stream', streamUrl: videoSrcMatch[1], url: videoSrcMatch[1], referer: pageUrl };
      }

      const mediaMatch = html.match(/https?:\/\/[^\s"'<>]+\.(?:mp4|m3u8)(?:\?[^\s"'<>]*)?/i);
      if (mediaMatch && !mediaMatch[0].includes('analytics') && !mediaMatch[0].includes('track') && !mediaMatch[0].includes('smartpop')) {
        return { success: true, type: 'stream', streamUrl: mediaMatch[0], url: mediaMatch[0], referer: pageUrl };
      }

      // Múltiplos mirrors/servidores em base64 (JavGuru e similares)
      const b64Matches = [...html.matchAll(/"iframe_url"\s*:\s*"([A-Za-z0-9+/=]{20,})"/g)].map(m => {
        try {
          return Buffer.from(m[1], 'base64').toString('utf8');
        } catch {
          return null;
        }
      }).filter(Boolean) as string[];

      if (b64Matches.length > 0) {
        const discoveredServers: Array<{ name: string; url: string }> = [];

        for (const gwUrl of b64Matches) {
          try {
            const gwRes = await axios.get(gwUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': pageUrl,
              },
              timeout: 4000,
            });

            const gwHtml = gwRes.data;
            const m = gwHtml.match(/data-[a-z0-9]+="([^"]+)"\s+data-[a-z0-9]+="([^"]+)"\s+data-[a-z0-9]+="([^"]+)"/);
            const rtypeMatch = gwHtml.match(/rtype:\s*['"]([^'"]+)['"]/);
            const rtype = rtypeMatch ? rtypeMatch[1] : 'x';

            if (m) {
              const fullToken = (m[1] + m[2] + m[3]).split('').reverse().join('');
              const realSearcho = `https://jav.guru/searcho/?${rtype}r=${fullToken}`;

              try {
                const redRes = await axios.get(realSearcho, {
                  headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Referer': gwUrl,
                  },
                  maxRedirects: 0,
                  validateStatus: s => s >= 200 && s < 400,
                  timeout: 4000,
                });

                const mirrorUrl = redRes.headers.location || realSearcho;

                let serverName = 'Servidor ' + (discoveredServers.length + 1);
                if (mirrorUrl.includes('lulustream') || mirrorUrl.includes('streamhihi')) serverName = 'LuluStream';
                else if (mirrorUrl.includes('maxstream')) serverName = 'MaxStream';
                else if (mirrorUrl.includes('javclan')) serverName = 'JavClan';
                else if (mirrorUrl.includes('vide0')) serverName = 'Vide0';
                else if (mirrorUrl.includes('emturbovid')) serverName = 'EmTurbo';

                discoveredServers.push({ name: serverName, url: mirrorUrl });
              } catch {}
            }
          } catch {}
        }

        if (discoveredServers.length > 0) {
          // Vários servidores: acha o vídeo do primeiro que funcionar (os outros ficam para trocar no player)
          const ordered = [
            ...discoveredServers.filter((s) => s.name === 'LuluStream'),
            ...discoveredServers.filter((s) => s.name === 'MaxStream'),
            ...discoveredServers.filter((s) => s.name !== 'LuluStream' && s.name !== 'MaxStream'),
          ];
          for (const srv of ordered) {
            const hit = await sniffMedia(srv.url, { referer: pageUrl, timeoutMs: 20000 });
            if (hit) {
              return { success: true, type: 'stream', streamUrl: hit.url, url: hit.url, referer: hit.referer, servers: discoveredServers };
            }
          }
          return { success: false, error: 'Nenhum servidor entregou o vídeo', servers: discoveredServers };
        }
      }

    }
  } catch (err: any) {
    console.warn(`[extractVideoStream static failed]:`, err.message);
  }

  // 2. Abre a página escondida, aperta play nos players (inclusive em iframes) e captura o vídeo na rede.
  //    Nunca devolve a página do site: se não achar o vídeo, o player avisa e oferece outras fontes.
  try {
    const hit = await sniffMedia(pageUrl);
    if (hit) return { success: true, type: 'stream', streamUrl: hit.url, url: hit.url, referer: hit.referer };
  } catch (err: any) {
    console.warn('[extractVideoStream sniff failed]:', err?.message || err);
  }
  return { success: false, error: 'O site não entregou o vídeo' };
}

async function resolveAndCacheImage(imageUrl: string, sourceName?: string): Promise<{ success: boolean; url?: string; error?: string }> {
  try {
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) {
      return { success: false, error: 'URL inválida' };
    }

    const hash = crypto.createHash('md5').update(imageUrl).digest('hex');
    const coversDir = path.join(getThumbnailsDir(), 'covers');
    if (!fs.existsSync(coversDir)) {
      fs.mkdirSync(coversDir, { recursive: true });
    }
    const cachedFilePath = path.join(coversDir, `${hash}.jpg`);

    if (fs.existsSync(cachedFilePath)) {
      try {
        const st = fs.statSync(cachedFilePath);
        if (st.size > 500) {
          const p = cachedFilePath.replace(/\\/g, '/').replace(/^\/+/, '');
          return { success: true, url: `media-file:///${encodeURI(p)}` };
        }
      } catch {}
    }

    const u = new URL(imageUrl);
    const host = u.hostname.toLowerCase();
    let referer = `${u.protocol}//${u.host}/`;
    const s = (sourceName || '').toLowerCase();

    if (host.includes('mfcdn') || host.includes('mangafire') || s.includes('mangafire')) {
      referer = 'https://mangafire.to/';
    } else if (host.includes('nhentai') || s.includes('nhentai')) {
      referer = 'https://nhentai.net/';
    } else if (host.includes('3hentai') || s.includes('3hentai')) {
      referer = 'https://3hentai.net/';
    } else if (host.includes('hentainexus') || s.includes('hentainexus')) {
      referer = 'https://hentainexus.com/';
    } else if (host.includes('ehgt') || host.includes('e-hentai') || s.includes('e-hentai')) {
      referer = 'https://e-hentai.org/';
    } else if (host.includes('atsu') || s.includes('atsu')) {
      referer = 'https://atsu.moe/';
    } else if (host.includes('mangadex') || s.includes('mangadex')) {
      referer = 'https://mangadex.org/';
    } else if (host.includes('hentaiera') || s.includes('hentaiera')) {
      referer = 'https://hentaiera.com/';
    } else if (host.includes('luscious') || s.includes('luscious')) {
      referer = 'https://luscious.net/';
    } else if (host.includes('hotcomics') || s.includes('hotcomics')) {
      referer = 'https://hotcomics.me/';
    } else if (host.includes('globalcomix') || s.includes('globalcomix')) {
      referer = 'https://globalcomix.com/';
    } else if (host.includes('omegascans') || s.includes('omegascans')) {
      referer = 'https://omegascans.org/';
    } else if (host.includes('hitomi') || s.includes('hitomi')) {
      referer = 'https://hitomi.la/';
    } else if (host.includes('bato') || s.includes('batoto')) {
      referer = 'https://bato.to/';
    } else if (host.includes('asura')) {
      referer = 'https://asuracomic.net/';
    }

    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Referer': referer,
        'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
      timeout: 10000,
    });

    if (response.status === 200 && response.data && response.data.length > 200) {
      await fsp.writeFile(cachedFilePath, Buffer.from(response.data));
      const p = cachedFilePath.replace(/\\/g, '/').replace(/^\/+/, '');
      return { success: true, url: `media-file:///${encodeURI(p)}` };
    }

    return { success: false, error: `HTTP ${response.status}` };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

function setupIpcHandlers() {
  ipcMain.handle('folder:firstImage', async (_e, folderPath: string) => {
    return await findFolderCover(folderPath);
  });

  ipcMain.handle('folders:expand', async (_e, paths: string[], mediaType: 'video' | 'image') => {
    return await expandFolders(paths, mediaType);
  });

  // Diálogo para selecionar imagem de capa
  ipcMain.handle('dialog:selectCoverImage', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar Imagem de Capa para a Pasta',
      filters: [
        { name: 'Imagens (*.jpg, *.png, *.webp, *.avif, *.jpeg)', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'bmp'] },
        { name: 'Todos os Arquivos', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Definir imagem de capa de pasta
  ipcMain.handle('folder:setCover', async (_e, { folderPath, imagePath }: { folderPath: string; imagePath: string }) => {
    return await setFolderCustomCover(folderPath, imagePath);
  });

  // Localiza diretório raiz comum para consolidar listas que sofreram expansão acidental
  ipcMain.handle('folder:findCommonRoot', async (_e, paths: string[]) => {
    if (!Array.isArray(paths) || paths.length < 3) return null;
    const cleanPaths = paths.map((p) => path.normalize(p).replace(/[\\/]+$/, '')).filter(Boolean);
    if (cleanPaths.length < 3) return null;

    // 1. Verifica se a maioria compartilha exatamente o mesmo dirname
    const parents = cleanPaths.map((p) => path.dirname(p));
    const counts = new Map<string, number>();
    for (const parent of parents) {
      counts.set(parent, (counts.get(parent) || 0) + 1);
    }
    for (const [parent, count] of counts.entries()) {
      if (count >= cleanPaths.length * 0.5 && fs.existsSync(parent)) {
        if (path.dirname(parent) !== parent) {
          return parent;
        }
      }
    }

    // 2. Procura prefixo de segmentos em comum
    const splitPaths = cleanPaths.map((p) => p.split(path.sep).filter(Boolean));
    const first = splitPaths[0];
    const commonSegments: string[] = [];
    for (let i = 0; i < first.length; i++) {
      const seg = first[i];
      if (splitPaths.every((p) => p.length > i && p[i].toLowerCase() === seg.toLowerCase())) {
        commonSegments.push(seg);
      } else {
        break;
      }
    }

    if (commonSegments.length > 1) {
      let candidate = commonSegments.join(path.sep);
      if (/^[A-Za-z]:$/.test(commonSegments[0])) {
        candidate = commonSegments[0] + path.sep + commonSegments.slice(1).join(path.sep);
      }
      if (fs.existsSync(candidate) && path.dirname(candidate) !== candidate) {
        return candidate;
      }
    }

    return null;
  });

  // Read Directory
  ipcMain.handle('read-directory', async (_, dirPath: string) => {
    try {
      const entries = await fsp.readdir(dirPath, { withFileTypes: true });
      const items = [];

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        const isDirectory = entry.isDirectory();
        const ext = path.extname(entry.name).toLowerCase();

        const isImage = ['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp'].includes(ext);
        const isVideo = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.wmv', '.flv', '.ts', '.m4v'].includes(ext);
        const isArchive = ['.zip', '.cbz', '.rar', '.cbr', '.7z', '.tachibk'].includes(ext);

        let size = 0;
        let mtime = 0;
        let coverPath: string | null = null;
        let imageCount = 0;

        try {
          const stats = await fsp.stat(fullPath);
          size = stats.size;
          mtime = stats.mtimeMs;
        } catch {}

        if (isDirectory) {
          try {
            const subEntries = await fsp.readdir(fullPath, { withFileTypes: true });
            const subImages: string[] = [];
            for (const sub of subEntries) {
              if (!sub.isDirectory()) {
                const subExt = path.extname(sub.name).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp'].includes(subExt)) {
                  subImages.push(path.join(fullPath, sub.name));
                }
              }
            }
            imageCount = subImages.length;
            if (subImages.length > 0) {
              coverPath = pickCover(subImages);
            } else {
              coverPath = await findFolderCover(fullPath);
            }
          } catch {}
        } else if (isVideo) {
          coverPath = await extractVideoThumbnail(fullPath);
        } else if (isArchive) {
          coverPath = await extractArchiveThumbnail(fullPath);
        }

        items.push({
          name: entry.name,
          path: fullPath,
          isDirectory,
          isImage,
          isVideo,
          isArchive,
          size,
          mtime,
          ext,
          coverPath,
          imageCount
        });
      }

      items.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
      });

      return { success: true, items };
    } catch (error: any) {
      return { success: false, error: error.message, items: [] };
    }
  });

  // Open Single Folder Dialog
  ipcMain.handle('open-folder-dialog', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Multi-folder selection dialog
  ipcMain.handle('dialog:selectFolders', async () => {
    if (!mainWindow) return [];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Selecionar pastas de mídia',
      properties: ['openDirectory', 'multiSelections'],
      buttonLabel: 'Adicionar pastas'
    });
    return result.canceled ? [] : result.filePaths;
  });

  // Open File Dialog
  ipcMain.handle('open-file-dialog', async (_, options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      title: options?.title || 'Open File',
      filters: options?.filters || [
        { name: 'All Supported Files', extensions: ['tachibk', 'zip', 'cbz', 'mp4', 'mkv', 'webm', 'jpg', 'png', 'webp'] },
        { name: 'Tachiyomi/Aniyomi Backup (*.tachibk)', extensions: ['tachibk'] },
        { name: 'Videos (*.mp4, *.mkv, *.webm, *.avi)', extensions: ['mp4', 'mkv', 'webm', 'avi', 'mov', 'wmv', 'flv'] },
        { name: 'Images (*.jpg, *.png, *.webp)', extensions: ['jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  // Read binary file buffer
  ipcMain.handle('read-file-buffer', async (_, filePath: string) => {
    try {
      const buffer = await fsp.readFile(filePath);
      return { success: true, data: buffer };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  });

  // Save image/file buffer
  ipcMain.handle('save-file-dialog', async (_, { defaultName, dataBase64, filters }: { defaultName: string; dataBase64: string; filters?: { name: string; extensions: string[] }[] }) => {
    if (!mainWindow) return { success: false };
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: Array.isArray(filters) && filters.length
        ? filters
        : [
            { name: 'JPEG Image', extensions: ['jpg'] },
            { name: 'PNG Image', extensions: ['png'] }
          ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    try {
      const base64Data = dataBase64.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      await fsp.writeFile(result.filePath, buffer);
      return { success: true, filePath: result.filePath };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Video streaming universal via FFmpeg (MKV, AVI, HEVC, AC3, HLS e streams remotos sem erro de codec)
  ipcMain.handle('video:getStreamUrl', async (_e, arg: string | { filePath: string; referer?: string }) => {
    const filePath = typeof arg === 'string' ? arg : arg?.filePath;
    const referer = typeof arg === 'object' ? arg?.referer : undefined;
    if (!filePath) return null;
    const p = await startVideoServer();
    let streamUrl = `http://127.0.0.1:${p}/stream?path=${encodeURIComponent(filePath)}`;
    if (referer) streamUrl += `&referer=${encodeURIComponent(referer)}`;
    return streamUrl;
  });

  // Extração de streaming ou embed de vídeo para reproduzir diretamente na plataforma
  ipcMain.handle('video:extractStream', async (_, { pageUrl, sourceName }: { pageUrl: string; sourceName?: string }) => {
    return await extractVideoStream(pageUrl);
  });

  // Scraping direto e autêntico do catálogo online da extensão (ex: Jav Guru, BetterAnime, etc.)
  ipcMain.handle('extension:scrapeCatalog', async (_, params: { baseUrl: string; query?: string; page?: number; sourceName?: string }) => {
    return await scrapeExtensionCatalog(params);
  });

  // Backward compatible stream handler
  ipcMain.handle('video:stream', async (_, filePath: string) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!NEEDS_TRANSCODE.has(ext)) {
      const p = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
      return `media-file:///${encodeURI(p)}`;
    }
    const p = await startVideoServer();
    return `http://127.0.0.1:${p}/stream?path=${encodeURIComponent(filePath)}`;
  });

  // Recursive scan across folders
  ipcMain.handle('video:scanFolders', async (_e, folders: string[]) => {
    const out: any[] = [];
    if (Array.isArray(folders)) {
      for (const f of folders) {
        if (f && typeof f === 'string') {
          await walkVideos(f, out, 0, 10, f);
        }
      }
    }
    const seen = new Map(out.map((v) => [v.path, v]));
    return [...seen.values()].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
    );
  });

  // Helper to format NHentai Authorization header correctly (Key nhk_... or User <token>)
  function formatNhentaiAuthHeader(rawKey?: string): string {
    let key = (rawKey || '').trim();
    if (!key) return '';
    // Strip 'Bearer ' if present because NHentai returns 401 Malformed Authorization header for Bearer
    if (key.toLowerCase().startsWith('bearer ')) {
      key = key.slice(7).trim();
    }
    if (key.startsWith('Key ') || key.startsWith('User ')) {
      return key;
    }
    if (key.startsWith('nhk_')) {
      return `Key ${key}`;
    }
    return `User ${key}`;
  }

  // Proxy NHentai API requests with robust human-readable error formatting and method support
  ipcMain.handle(
    'nhentai-api',
    async (
      _,
      {
        endpoint,
        method = 'GET',
        params,
        data,
        customApiKey
      }: {
        endpoint: string;
        method?: 'GET' | 'POST' | 'DELETE' | 'PUT';
        params?: any;
        data?: any;
        customApiKey?: string;
      }
    ) => {
      const BASE_URL = 'https://nhentai.net/api/v2';
      let authHeader = formatNhentaiAuthHeader(customApiKey);

      // If no custom API key provided, check if we have an access_token in the persist:nhentai_session cookies
      const ses = session.fromPartition('persist:nhentai_session');
      let cookieHeader = '';
      try {
        const cookies = await ses.cookies.get({ domain: 'nhentai.net' });
        if (cookies && cookies.length > 0) {
          cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
          if (!authHeader) {
            const tokenCookie = cookies.find((c) => c.name === 'access_token');
            if (tokenCookie && tokenCookie.value) {
              authHeader = `User ${tokenCookie.value}`;
            }
          }
        }
      } catch {}

      const reqHeaders: Record<string, string> = {
        Accept: 'application/json',
        'User-Agent': 'TomodachiPlayer/1.0.0',
        Referer: 'https://nhentai.net/'
      };
      if (authHeader) {
        reqHeaders['Authorization'] = authHeader;
      }
      if (cookieHeader) {
        reqHeaders['Cookie'] = cookieHeader;
      }

      try {
        const response = await axios({
          url: `${BASE_URL}${endpoint}`,
          method: method as any,
          params,
          data,
          headers: reqHeaders,
          timeout: 15000
        });
        return { success: true, data: response.data };
      } catch (error: any) {
        let msg = 'Falha na requisição da API NHentai';
        if (error.response) {
          const status = error.response.status;
          const resData = error.response.data;
          if (status === 401 || status === 403) {
            msg = 'Chave ou token de login inválido ou sem permissão. Verifique sua conta.';
          } else if (status === 429) {
            msg = 'Muitas requisições (Rate Limit). Aguarde alguns instantes e tente novamente.';
          } else if (resData && typeof resData === 'object') {
            if (resData.error) {
              const details = Array.isArray(resData.details)
                ? ` (${resData.details.join(', ')})`
                : resData.details
                ? ` (${resData.details})`
                : '';
              msg = `NHentai: ${resData.error}${details}`;
            } else if (resData.message) {
              msg = `NHentai: ${resData.message}`;
            } else if (resData.detail) {
              msg = `NHentai: ${typeof resData.detail === 'string' ? resData.detail : JSON.stringify(resData.detail)}`;
            } else {
              msg = `NHentai erro HTTP ${status}`;
            }
          } else if (typeof resData === 'string') {
            msg = `NHentai: ${resData}`;
          } else {
            msg = `NHentai erro HTTP ${status}`;
          }
        } else if (error.message) {
          msg = error.message;
        }
        return {
          success: false,
          error: msg
        };
      }
    }
  );

  // Native interactive Login window for NHentai (handles Cloudflare Turnstile seamlessly)
  ipcMain.handle('nhentai:openLogin', async () => {
    return new Promise((resolve) => {
      const ses = session.fromPartition('persist:nhentai_session');

      const loginWin = new BrowserWindow({
        title: 'Login - NHentai',
        width: 520,
        height: 720,
        minWidth: 420,
        minHeight: 520,
        parent: mainWindow || undefined,
        modal: true,
        backgroundColor: '#0d1117',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          partition: 'persist:nhentai_session'
        }
      });

      let resolved = false;
      let checkTimer: NodeJS.Timeout | null = null;
      let cookieListener: ((_event: any, cookie: any, cause: any, removed: boolean) => void) | null = null;

      const finish = (result: { success: boolean; user?: any; token?: string; error?: string }) => {
        if (!resolved) {
          resolved = true;
          if (checkTimer) {
            clearInterval(checkTimer);
            checkTimer = null;
          }
          if (cookieListener) {
            ses.cookies.removeListener('changed', cookieListener);
            cookieListener = null;
          }
          try {
            if (loginWin.webContents.debugger.isAttached()) {
              loginWin.webContents.debugger.detach();
            }
          } catch {}
          if (!loginWin.isDestroyed()) {
            loginWin.close();
          }
          resolve(result);
        }
      };

      // Helper function to verify token with NHentai /api/v2/user
      const verifyAndComplete = async (tokenCandidate: string) => {
        if (resolved || !tokenCandidate) return;
        const cleanToken = tokenCandidate.trim();
        if (!cleanToken) return;

        try {
          const authHdr = formatNhentaiAuthHeader(cleanToken);
          const res = await axios.get('https://nhentai.net/api/v2/user', {
            headers: {
              Authorization: authHdr,
              Accept: 'application/json',
              'User-Agent': 'TomodachiPlayer/1.0.0'
            },
            timeout: 5000
          });

          if (res.status === 200 && res.data && res.data.username) {
            finish({
              success: true,
              token: cleanToken,
              user: res.data
            });
          }
        } catch {
          // Token candidate not ready or invalid yet
        }
      };

      // 1. Listen directly for cookie changes in session
      cookieListener = async (_event, cookie, _cause, removed) => {
        if (resolved) return;
        if (!removed && cookie && cookie.name === 'access_token' && cookie.value) {
          await verifyAndComplete(cookie.value);
        }
      };
      ses.cookies.on('changed', cookieListener);

      // 2. CDP Network response listener as backup
      try {
        loginWin.webContents.debugger.attach('1.3');
        loginWin.webContents.debugger.sendCommand('Network.enable');
        loginWin.webContents.debugger.on('message', async (_event, cdpMethod, params) => {
          if (resolved) return;
          if (cdpMethod === 'Network.responseReceived') {
            const resUrl = params.response?.url || '';
            if (
              (resUrl.includes('/api/v2/auth') || resUrl.includes('/api/v2/user') || resUrl.includes('/login')) &&
              params.response.status === 200
            ) {
              try {
                const bodyObj = await loginWin.webContents.debugger.sendCommand('Network.getResponseBody', {
                  requestId: params.requestId
                });
                const payload = JSON.parse(bodyObj.body);
                if (payload.access_token) {
                  await verifyAndComplete(payload.access_token);
                } else if (payload.username && payload.id) {
                  const cookies = await ses.cookies.get({ domain: 'nhentai.net', name: 'access_token' });
                  if (cookies.length > 0 && cookies[0].value) {
                    finish({ success: true, token: cookies[0].value, user: payload });
                  }
                }
              } catch {}
            }
          }
        });
      } catch (err) {
        console.warn('[NHentai Login] Debugger CDP indisponível:', err);
      }

      // 3. Periodic check and DOM inspection
      const pollCookiesAndDom = async () => {
        if (resolved || loginWin.isDestroyed()) return;
        try {
          // Check session cookies
          const cookies = await ses.cookies.get({ domain: 'nhentai.net', name: 'access_token' });
          if (cookies.length > 0 && cookies[0].value) {
            await verifyAndComplete(cookies[0].value);
            if (resolved) return;
          }

          // Check DOM cookie and localStorage
          const pageAuth = await loginWin.webContents.executeJavaScript(`
            (() => {
              try {
                const m = document.cookie.match(/(?:^|; )access_token=([^;]*)/);
                const cookieToken = m ? decodeURIComponent(m[1]) : null;
                const lsToken = localStorage.getItem('access_token') || localStorage.getItem('token');
                return cookieToken || lsToken || null;
              } catch {
                return null;
              }
            })()
          `).catch(() => null);

          if (pageAuth) {
            await verifyAndComplete(pageAuth);
          }
        } catch {}
      };

      checkTimer = setInterval(pollCookiesAndDom, 1200);

      loginWin.webContents.on('did-navigate', pollCookiesAndDom);
      loginWin.webContents.on('did-finish-load', pollCookiesAndDom);

      loginWin.on('closed', () => {
        if (!resolved) {
          resolved = true;
          if (checkTimer) clearInterval(checkTimer);
          if (cookieListener) ses.cookies.removeListener('changed', cookieListener);
          resolve({ success: false, error: 'Janela de login fechada pelo usuário' });
        }
      });

      loginWin.loadURL('https://nhentai.net/login/');
    });
  });

  // Logout from NHentai session
  ipcMain.handle('nhentai:logout', async () => {
    try {
      const ses = session.fromPartition('persist:nhentai_session');
      await ses.clearStorageData({ storages: ['cookies', 'localstorage'] }).catch(() => {});
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  });

  // Proxy repository fetching to completely bypass CORS / CSP in renderer
  ipcMain.handle('repo:fetch', async (_, url: string) => {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        headers: {
          'Accept': 'application/json, application/octet-stream, */*',
          'User-Agent': 'TomodachiPlayer/1.0.0'
        },
        timeout: 15000
      });
      return {
        success: true,
        dataBase64: Buffer.from(response.data).toString('base64'),
        status: response.status
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.response?.status
          ? `HTTP ${err.response.status}: ${err.message}`
          : err.message || 'Falha de rede'
      };
    }
  });

  // Busca e raspa capítulos de obras online (estática rápida + dinâmica off-screen com sessão webview)
  ipcMain.handle('manga:extractChapters', async (_, arg: string | { mangaUrl: string; sourceName?: string }) => {
    try {
      let mangaUrl = typeof arg === 'string' ? arg : arg?.mangaUrl;
      const sourceName = typeof arg === 'object' ? arg?.sourceName : undefined;
      const s = (sourceName || '').toLowerCase();

      if (!mangaUrl) {
        return { success: false, error: 'URL do mangá inválida' };
      }

      // Resolve ID para Atsumaru
      let mangaId = '';
      const atsuMatch = mangaUrl.match(/(?:manga|read)\/([a-zA-Z0-9_-]+)/);
      if (atsuMatch) {
        mangaId = atsuMatch[1];
      } else if (!mangaUrl.includes('/') && !mangaUrl.includes(':')) {
        mangaId = mangaUrl.trim();
      }

      // Atsumaru Fast API & HTML extraction
      if (s.includes('atsu') || mangaUrl.includes('atsu.moe') || (mangaId && !mangaUrl.startsWith('http'))) {
        const targetId = mangaId || mangaUrl.replace(/.*\/manga\//, '').replace(/.*\/read\//, '').replace(/^\/+/, '');
        if (targetId && !targetId.includes('://')) {
          try {
            const atsuRes = await axios.get(`https://atsu.moe/api/manga/allChapters?mangaId=${targetId}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json',
              },
              timeout: 6000,
            });
            if (atsuRes.data?.chapters && Array.isArray(atsuRes.data.chapters) && atsuRes.data.chapters.length > 0) {
              const chs = atsuRes.data.chapters.map((c: any) => ({
                url: `https://atsu.moe/read/${targetId}/${c.id}`,
                name: c.title || `Capítulo ${c.number || ''}`,
                number: typeof c.number === 'number' ? c.number : parseFloat(c.number) || 1,
              }));
              return { success: true, chapters: chs };
            }
          } catch {}

          try {
            const pageRes = await axios.get(`https://atsu.moe/manga/${targetId}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
              },
              timeout: 6000,
            });
            const mpMatch = String(pageRes.data).match(/mangaPage\s*=\s*(\{[\s\S]*?\});/);
            if (mpMatch) {
              const parsed = JSON.parse(mpMatch[1]);
              const chList = parsed?.mangaPage?.chapters || parsed?.chapters;
              if (Array.isArray(chList) && chList.length > 0) {
                const chs = chList.map((c: any) => ({
                  url: `https://atsu.moe/read/${targetId}/${c.id}`,
                  name: c.title || `Capítulo ${c.number || ''}`,
                  number: typeof c.number === 'number' ? c.number : parseFloat(c.number) || 1,
                }));
                return { success: true, chapters: chs };
              }
            }
          } catch {}
        }
      }

      // Normaliza mangaUrl se não for absoluta
      if (!mangaUrl.startsWith('http://') && !mangaUrl.startsWith('https://')) {
        const clean = mangaUrl.replace(/^\/+/, '');
        if (s.includes('atsu')) {
          mangaUrl = `https://atsu.moe/manga/${clean}`;
        } else if (s.includes('mangadex')) {
          mangaUrl = `https://mangadex.org/title/${clean}`;
        } else if (s.includes('mangafire')) {
          mangaUrl = `https://mangafire.to/${clean.startsWith('manga/') ? clean : `manga/${clean}`}`;
        } else if (s.includes('nhentai')) {
          const gClean = mangaUrl.replace(/^\/?g\//i, '').replace(/^\/+|\/+$/g, '');
          mangaUrl = `https://nhentai.net/g/${gClean}/`;
        } else if (s.includes('3hentai')) {
          const dClean = mangaUrl.replace(/^\/?d\//i, '');
          mangaUrl = `https://3hentai.net/d/${dClean}`;
        } else if (s.includes('hentainexus')) {
          const vClean = mangaUrl.replace(/^\/?(view|read)\//i, '');
          mangaUrl = `https://hentainexus.com/view/${vClean}`;
        } else if (s.includes('hentaiera')) {
          const galClean = mangaUrl.replace(/^\/?gallery\//i, '');
          mangaUrl = `https://hentaiera.com/gallery/${galClean}/`;
        } else if (s.includes('luscious')) {
          const albClean = mangaUrl.replace(/^\/?albums\//i, '');
          mangaUrl = `https://luscious.net/albums/${albClean}`;
        } else if (s.includes('omegascans')) {
          mangaUrl = `https://omegascans.org/${clean}`;
        } else if (s.includes('hotcomics')) {
          mangaUrl = `https://hotcomics.me/${clean}`;
        } else if (s.includes('globalcomix')) {
          mangaUrl = `https://globalcomix.com/${clean}`;
        }
      }

      if (!mangaUrl || !/^https?:\/\//i.test(mangaUrl)) {
        return { success: false, error: 'URL do mangá inválida' };
      }

      // 1. Tenta raspagem estática rápida via axios
      try {
        const u = new URL(mangaUrl);
        const response = await axios.get(mangaUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': `${u.protocol}//${u.host}/`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          timeout: 5000,
        });

        const html = typeof response.data === 'string' ? response.data : String(response.data);
        const linkRegex = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
        const staticList: { url: string; name: string; number: number }[] = [];
        const seen = new Set<string>();

        let match: RegExpExecArray | null;
        while ((match = linkRegex.exec(html)) !== null) {
          const rawHref = match[1]?.trim();
          if (!rawHref || rawHref === '#' || rawHref.startsWith('javascript:')) continue;
          let fullUrl = '';
          try {
            fullUrl = new URL(rawHref, mangaUrl).href;
          } catch {
            continue;
          }

          const rawText = match[2]?.replace(/<[^>]+>/g, '').trim().replace(/\s+/g, ' ');
          const lowerHref = fullUrl.toLowerCase();
          const lowerText = rawText.toLowerCase();

          const isChapterUrl =
            /(?:\/chapter|\/capitulo|\/capítulo|\/read|\/ler|\/ch-|\/c-|\/ep-|\/volume|\/v-|\/view|\/comic\/|\/manga\/[^\/]+\/[^\/]+)/i.test(lowerHref) ||
            /(?:chapter|capitulo|capítulo|ch\.|cap\.|ep\.|episodio|episódio|volume|vol\.|#)\s*\d+/i.test(lowerText);

          const isExcluded =
            /login|register|signup|user|profile|bookmark|history|donate|discord|facebook|twitter|patreon|terms|privacy|dmca|contact|author|tag|genre|privacy-policy/i.test(lowerHref);

          if (isChapterUrl && !isExcluded && !seen.has(fullUrl)) {
            seen.add(fullUrl);
            const numMatch = lowerText.match(/(?:chapter|capitulo|capítulo|ch\.|cap\.|ep\.|#)\s*([0-9]+(?:\.[0-9]+)?)/i) ||
                             lowerHref.match(/(?:chapter|capitulo|capítulo|ch-|c-|ep-)([0-9]+(?:\.[0-9]+)?)/i) ||
                             lowerText.match(/([0-9]+(?:\.[0-9]+)?)/);
            const num = numMatch ? parseFloat(numMatch[1]) : (staticList.length + 1);

            staticList.push({
              url: fullUrl,
              name: rawText || `Capítulo ${num}`,
              number: num
            });
          }
        }

        if (staticList.length > 0) {
          return { success: true, chapters: staticList };
        }
      } catch {
        // Continua para o raspador dinâmico
      }

      // 2. Raspador Dinâmico off-screen compartilhando cookies e sessão da webview
      return await scrapeDynamicMangaChapters(mangaUrl);
    } catch (e: any) {
      return { success: false, error: e.message || 'Erro ao buscar capítulos' };
    }
  });

  // Extrai imagens de capítulos para leitura 100% nativa (sem redirecionar para web)
  ipcMain.handle('chapter:extractPages', async (_, arg: string | { chapterUrl: string; mangaUrl?: string; sourceName?: string }) => {
    try {
      let chapterUrl = typeof arg === 'string' ? arg : arg?.chapterUrl;
      const mangaUrl = typeof arg === 'object' ? arg?.mangaUrl : undefined;
      const sourceName = typeof arg === 'object' ? arg?.sourceName : undefined;

      if (!chapterUrl) {
        return { success: false, error: 'URL de capítulo não fornecida' };
      }

      chapterUrl = chapterUrl.trim();

      // Suporte a caminhos locais no disco (pastas locais com imagens ou arquivos individuais)
      const candidateLocal = chapterUrl.replace(/^(?:file|media-file):\/\/\/?/i, '');
      if (/^[a-zA-Z]:[\\/]/.test(candidateLocal) || candidateLocal.startsWith('/') || fs.existsSync(candidateLocal)) {
        if (fs.existsSync(candidateLocal)) {
          const stat = fs.statSync(candidateLocal);
          const imageExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.bmp']);
          if (stat.isDirectory()) {
            const files = fs.readdirSync(candidateLocal);
            const images = files
              .filter(f => imageExts.has(path.extname(f).toLowerCase()))
              .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
              .map(f => {
                const fullP = path.join(candidateLocal, f);
                return `media-file:///${fullP.replace(/\\/g, '/')}`;
              });

            if (images.length > 0) {
              return {
                success: true,
                pages: images,
                title: path.basename(candidateLocal)
              };
            }
          } else if (stat.isFile()) {
            const ext = path.extname(candidateLocal).toLowerCase();
            if (imageExts.has(ext)) {
              return {
                success: true,
                pages: [`media-file:///${candidateLocal.replace(/\\/g, '/')}`],
                title: path.basename(candidateLocal)
              };
            }
          }
        }
      }

      // Se for caminho relativo e mangaUrl for absoluto, resolve
      if (!/^https?:\/\//i.test(chapterUrl)) {
        if (mangaUrl && /^https?:\/\//i.test(mangaUrl)) {
          try {
            chapterUrl = new URL(chapterUrl, mangaUrl).href;
          } catch {}
        }
      }

      // Se ainda não tiver protocolo, tenta deduzir pela fonte
      if (!/^https?:\/\//i.test(chapterUrl)) {
        const s = (sourceName || '').toLowerCase();
        if (s.includes('atsu')) {
          chapterUrl = `https://atsu.moe/read/${chapterUrl.replace(/^\/+/, '')}`;
        } else if (s.includes('mangafire')) {
          chapterUrl = `https://mangafire.to/${chapterUrl.replace(/^\/+/, '')}`;
        } else if (s.includes('hentainexus')) {
          chapterUrl = `https://hentainexus.com/${chapterUrl.replace(/^\/+/, '')}`;
        } else if (s.includes('3hentai')) {
          chapterUrl = `https://3hentai.net/${chapterUrl.replace(/^\/+/, '')}`;
        } else if (s.includes('nhentai')) {
          chapterUrl = `https://nhentai.net/${chapterUrl.replace(/^\/+/, '')}`;
        } else if (s.includes('hentaiera')) {
          chapterUrl = `https://hentaiera.com/${chapterUrl.replace(/^\/+/, '')}`;
        } else if (s.includes('omegascans')) {
          chapterUrl = `https://omegascans.org/${chapterUrl.replace(/^\/+/, '')}`;
        }
      }

      if (!chapterUrl || !/^https?:\/\//i.test(chapterUrl)) {
        return { success: false, error: 'URL de capítulo inválida' };
      }

      // Se a URL do capítulo já for um arquivo direto de imagem (ex: Luscious ou links diretos)
      if (/\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(chapterUrl)) {
        return {
          success: true,
          pages: [chapterUrl],
          title: 'Página 1',
        };
      }

      // Atsumaru Fast API extraction
      const isAtsu = (sourceName || '').toLowerCase().includes('atsu') || chapterUrl.includes('atsu.moe') || (mangaUrl && mangaUrl.includes('atsu.moe'));
      if (isAtsu) {
        let mId = '';
        let cId = '';
        const mMatch = (mangaUrl || chapterUrl).match(/(?:manga|read)\/([a-zA-Z0-9_-]+)/);
        if (mMatch) mId = mMatch[1];
        else if (mangaUrl && !mangaUrl.includes('/') && !mangaUrl.includes(':')) mId = mangaUrl.trim();

        const cMatch = chapterUrl.match(/(?:manga|read)\/[^/]+\/([a-zA-Z0-9_-]+)/) || chapterUrl.match(/\/([a-zA-Z0-9_-]+)$/);
        if (cMatch) cId = cMatch[1];
        else if (!chapterUrl.includes('/') && !chapterUrl.includes(':')) cId = chapterUrl.trim();

        if (mId && cId) {
          try {
            const atsuRes = await axios.get(`https://atsu.moe/api/read/chapter?mangaId=${mId}&chapterId=${cId}`, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                'Accept': 'application/json',
              },
              timeout: 8000,
            });
            const readCh = atsuRes.data?.readChapter;
            if (readCh?.pages && Array.isArray(readCh.pages) && readCh.pages.length > 0) {
              const pages = readCh.pages.map((p: any) =>
                p.image?.startsWith('http') ? p.image : `https://cdn.atsu.moe${p.image?.startsWith('/') ? '' : '/'}${p.image}`
              );
              return {
                success: true,
                pages,
                title: readCh.title || 'Capítulo',
              };
            }
          } catch {}
        }
      }

      const u = new URL(chapterUrl);
      let foundUrls: string[] = [];
      let pageTitle = '';

      // TENTATIVA 1: Raspagem estática rápida via axios (economiza recursos para sites estáticos)
      try {
        const response = await axios.get(chapterUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': `${u.protocol}//${u.host}/`,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          },
          timeout: 6000,
        });

        const html: string = typeof response.data === 'string' ? response.data : String(response.data);

        // 1. Procura por arrays JS com imagens
        const jsonArrayMatch = html.match(/(?:pages|images|chapter_images|sources|photos|urls|curChapter)\s*[:=]\s*(\[[^\]]+\])/i);
        if (jsonArrayMatch) {
          try {
            const parsed = JSON.parse(jsonArrayMatch[1]);
            if (Array.isArray(parsed) && parsed.length > 0) {
              for (const item of parsed) {
                const str = typeof item === 'string' ? item : item?.url || item?.src || item?.image;
                if (str && /^https?:\/\//i.test(str) && !foundUrls.includes(str)) {
                  foundUrls.push(str);
                }
              }
            }
          } catch { /* continua busca por tags de imagem */ }
        }

        // 2. Extrai de tags <img>
        if (foundUrls.length === 0) {
          const imgRegex = /<img\s+[^>]*?(?:data-src|data-lazy-src|data-original|data-url|src)\s*=\s*["']([^"']+)["'][^>]*>/gi;
          let match: RegExpExecArray | null;
          while ((match = imgRegex.exec(html)) !== null) {
            let src = match[1]?.trim();
            if (!src) continue;
            if (src.startsWith('//')) src = `${u.protocol}${src}`;
            else if (src.startsWith('/')) src = `${u.protocol}//${u.host}${src}`;

            if (
              !/\.(jpg|jpeg|png|webp|avif)(\?.*)?$/i.test(src) &&
              !src.includes('/chapter') &&
              !src.includes('/manga') &&
              !src.includes('/comics')
            ) {
              continue;
            }

            if (/logo|avatar|favicon|icon|banner|ads|track|widget|social|discord|paypal|patreon|cover/i.test(src)) {
              continue;
            }

            if (/^https?:\/\//i.test(src) && !foundUrls.includes(src)) {
              foundUrls.push(src);
            }
          }
        }

        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) pageTitle = titleMatch[1].trim();
      } catch (staticErr) {
        // Falha na raspagem estática (ex: Cloudflare ou site dinâmico SPA)
      }

      // Se encontrou páginas na raspagem estática, retorna ordenado
      if (foundUrls.length > 0) {
        foundUrls.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
        return {
          success: true,
          pages: foundUrls,
          title: pageTitle,
        };
      }

      // TENTATIVA 2: Raspador Dinâmico off-screen com BrowserWindow do Electron
      // Renderiza JavaScript completo, intercepta requisições de imagens na rede e executa scripts no DOM
      const dynamicResult = await scrapeDynamicChapterPages(chapterUrl);
      if (dynamicResult.success && dynamicResult.pages && dynamicResult.pages.length > 0) {
        return dynamicResult;
      }

      return {
        success: false,
        error: dynamicResult.error || 'Nenhuma página encontrada para este capítulo',
      };
    } catch (err: any) {
      return {
        success: false,
        error: err.message || 'Falha ao carregar páginas do capítulo',
      };
    }
  });

  // Fallback e cache local para capas que falharem no carregamento direto do navegador
  ipcMain.handle('image:resolve', async (_, arg: string | { url: string; sourceName?: string }) => {
    const imageUrl = typeof arg === 'string' ? arg : arg?.url;
    const sourceName = typeof arg === 'object' ? arg?.sourceName : undefined;
    return await resolveAndCacheImage(imageUrl, sourceName);
  });

  // Armazenamento de biblioteca de alta capacidade sem limite de tamanho
  // Biblioteca persistida em disco. O formato canônico é
  // { app, source, updatedAt, categories: string[], entries: LibraryItem[] }.
  // Algumas telas antigas enviavam apenas o array de obras; aqui normalizamos
  // para nunca perder categorias nem gravar um formato que a leitura não entende.
  const libraryFile = (source: string) => {
    const safe = String(source || '').replace(/[^a-z0-9_-]/gi, '') || 'manga';
    return path.join(app.getPath('userData'), `${safe}_library.json`);
  };

  const readLibraryFile = async (source: string): Promise<any | null> => {
    const filePath = libraryFile(source);
    if (!fs.existsSync(filePath)) return null;
    const content = await fsp.readFile(filePath, 'utf8');
    if (!content.trim()) return null;
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return { source, updatedAt: Date.now(), categories: [], entries: parsed };
    }
    return parsed;
  };

  ipcMain.handle('library:save', async (_, { source, data }: { source: string; data: any }) => {
    try {
      let payload: any = data;
      let existing: any = null;
      try {
        existing = await readLibraryFile(source);
      } catch {
        existing = null;
      }

      if (Array.isArray(data)) {
        payload = {
          ...(existing || {}),
          source,
          updatedAt: Date.now(),
          categories: Array.isArray(existing?.categories) ? existing.categories : [],
          entries: data,
        };
      } else if (data && typeof data === 'object') {
        payload = { ...data };
        if (!Array.isArray(payload.categories) && Array.isArray(existing?.categories)) {
          payload.categories = existing.categories;
        }
        if (!Array.isArray(payload.entries)) payload.entries = Array.isArray(existing?.entries) ? existing.entries : [];
      } else {
        return { success: false, error: 'Dados de biblioteca inválidos' };
      }

      // Escrita atômica: grava em arquivo temporário e renomeia
      const filePath = libraryFile(source);
      const tmpPath = `${filePath}.tmp`;
      const json = JSON.stringify(payload);
      try {
        await fsp.writeFile(tmpPath, json, 'utf8');
        await fsp.rename(tmpPath, filePath);
      } catch {
        // Fallback (ex.: arquivo bloqueado por antivírus no Windows)
        await fsp.writeFile(filePath, json, 'utf8');
        fsp.unlink(tmpPath).catch(() => {});
      }
      return { success: true };
    } catch (err: any) {
      console.error(`[library:save error]:`, err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('library:load', async (_, source: string) => {
    try {
      const data = await readLibraryFile(source);
      return { success: true, data };
    } catch (err: any) {
      console.error(`[library:load error]:`, err);
      return { success: false, error: err.message };
    }
  });

  // Restauração de fábrica: remove arquivos de dados, capas personalizadas, miniaturas e limpa sessões
  ipcMain.handle('app:factoryReset', async () => {
    try {
      const userData = app.getPath('userData');

      // 1. Remover arquivos JSON de bibliotecas e customizações
      const targets = [
        'manga_library.json',
        'video_library.json',
        'custom_covers.json',
        'library.json',
      ];
      for (const file of targets) {
        const p = path.join(userData, file);
        if (fs.existsSync(p)) {
          await fsp.unlink(p).catch(() => {});
        }
      }

      // 2. Limpar qualquer outro arquivo *_library.json que possa ter sido criado
      try {
        const files = await fsp.readdir(userData);
        for (const f of files) {
          if (f.endsWith('_library.json') || f.endsWith('_backup.json')) {
            await fsp.unlink(path.join(userData, f)).catch(() => {});
          }
        }
      } catch {
        /* ignore */
      }

      // 3. Remover pasta de thumbnails em cache
      const thumbsDir = path.join(userData, 'thumbnails');
      if (fs.existsSync(thumbsDir)) {
        await fsp.rm(thumbsDir, { recursive: true, force: true }).catch(() => {});
      }

      // 4. Limpar armazenamento e cache da sessão padrão do Electron
      const ses = session.defaultSession;
      await ses.clearStorageData().catch(() => {});
      await ses.clearCache().catch(() => {});

      return { success: true };
    } catch (err: any) {
      console.error('[app:factoryReset error]:', err);
      return { success: false, error: err.message };
    }
  });
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  setupUpdater();
  // 1. Bypass inteligente de anti-hotlink (403 Forbidden) para capas e páginas de mangás
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      const url = details.url;
      // Streams de plugins do Nuvio: cabeçalhos exigidos pela fonte (Referer, Origin…)
      const streamExtra = streamHeadersFor(url);
      if (streamExtra) {
        for (const [k, v] of Object.entries(streamExtra)) {
          for (const existing of Object.keys(headers)) if (existing.toLowerCase() === k.toLowerCase()) delete headers[existing];
          headers[k] = v;
        }
        callback({ requestHeaders: headers });
        return;
      }
      // Autenticação das imagens servidas pelo Suwayomi (quando configurado com usuário/senha)
      const suwaAuth = suwayomiAuthFor(url);
      if (suwaAuth) {
        headers['Authorization'] = suwaAuth;
        callback({ requestHeaders: headers });
        return;
      }
      try {
        const u = new URL(url);
        const lowerUrl = url.toLowerCase();

        if (
          lowerUrl.match(/\.(jpg|jpeg|png|webp|avif|gif)(\?.*)?$/i) ||
          lowerUrl.includes('/covers/') ||
          lowerUrl.includes('/thumb') ||
          lowerUrl.includes('/galleries/') ||
          lowerUrl.includes('mangadex') ||
          lowerUrl.includes('mfcdn') ||
          lowerUrl.includes('nhentai') ||
          lowerUrl.includes('3hentai') ||
          lowerUrl.includes('hentainexus') ||
          lowerUrl.includes('ehgt') ||
          lowerUrl.includes('atsu') ||
          lowerUrl.includes('fanfox') ||
          lowerUrl.includes('mangahere') ||
          lowerUrl.includes('asura') ||
          lowerUrl.includes('batoto') ||
          lowerUrl.includes('allporncomic') ||
          lowerUrl.includes('wp.com')
        ) {
          headers['User-Agent'] =
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

          if (u.hostname.includes('mfcdn') || u.hostname.includes('mangafire')) {
            headers['Referer'] = 'https://mangafire.to/';
          } else if (u.hostname.includes('nhentai')) {
            headers['Referer'] = 'https://nhentai.net/';
          } else if (u.hostname.includes('3hentai')) {
            headers['Referer'] = 'https://3hentai.net/';
          } else if (u.hostname.includes('hentainexus')) {
            headers['Referer'] = 'https://hentainexus.com/';
          } else if (u.hostname.includes('ehgt') || u.hostname.includes('e-hentai')) {
            headers['Referer'] = 'https://e-hentai.org/';
          } else if (u.hostname.includes('atsu')) {
            headers['Referer'] = 'https://atsu.moe/';
          } else if (u.hostname.includes('mangadex')) {
            headers['Referer'] = 'https://mangadex.org/';
          } else {
            headers['Referer'] = `${u.protocol}//${u.host}/`;
          }
          delete headers['Origin'];
        }
      } catch {}
      callback({ requestHeaders: headers });
    }
  );

  // 2. Bloqueio nativo e inteligente de anúncios (uBlock Origin / EasyList / Popunders)
  session.defaultSession.webRequest.onBeforeRequest(
    { urls: ['http://*/*', 'https://*/*'] },
    (details, callback) => {
      const handled = handleAdblockBeforeRequest(details, callback);
      if (!handled) {
        callback({});
      }
    }
  );

  // 3. Remove restrições de CORP, CSP e X-Frame-Options integrando com o motor uBlock Origin
  session.defaultSession.webRequest.onHeadersReceived(
    { urls: ['http://*/*', 'https://*/*'] },
    handleAdblockHeadersReceived
  );

  // Menu enxuto: mantém edição/zoom/DevTools, sem atalhos que recarregam ou fecham a janela
  // por engano (Ctrl+R / Ctrl+W são usados pela interface para abas).
  try {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: 'Editar',
          submenu: [
            { role: 'undo' },
            { role: 'redo' },
            { type: 'separator' },
            { role: 'cut' },
            { role: 'copy' },
            { role: 'paste' },
            { role: 'selectAll' },
          ],
        },
        {
          label: 'Exibir',
          submenu: [
            { role: 'resetZoom' },
            { role: 'zoomIn' },
            { role: 'zoomOut' },
            { type: 'separator' },
            { role: 'togglefullscreen' },
            { role: 'toggleDevTools' },
          ],
        },
      ])
    );
  } catch (err) {
    console.warn('[Menu] Falha ao configurar menu:', err);
  }

  setupMediaProtocol();
  registerMediaProtocol();
  setupLogging();
  setupIpcHandlers();
  registerShellIpcHandlers();
  registerDownloadIpcHandlers();
  registerSuwayomiIpcHandlers();
  registerMediaProbeIpc();
  registerNuvioIpc();
  registerTorrentIpc();
  registerSecretsIpc();
  registerMalIpc();
  registerAniListAuthIpc(() => mainWindow);
  registerAdblockIpcHandlers();
  setupAdblocker();
  // O navegador integrado usa uma sessão própria: o bloqueio precisa ser ligado nela também
  applyAdblockToSession(session.fromPartition('persist:user_session'));
  registerBrowserExtensionsIpc(() => mainWindow);
  void loadInstalledExtensions();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// ─── Integrações de janela / shell usadas pela interface ─────────────────────
function registerShellIpcHandlers() {
  // Sincroniza os botões nativos (minimizar/maximizar/fechar) com o tema ativo
  ipcMain.handle('window:setTitleBarOverlay', (_event, opts: { color?: string; symbolColor?: string }) => {
    try {
      if (!mainWindow || mainWindow.isDestroyed()) return { success: false };
      const isHex = (v?: string) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.trim());
      const overlay: { color?: string; symbolColor?: string; height: number } = { height: 36 };
      if (isHex(opts?.color)) overlay.color = opts.color!.trim();
      if (isHex(opts?.symbolColor)) overlay.symbolColor = opts.symbolColor!.trim();
      if (typeof (mainWindow as any).setTitleBarOverlay === 'function') {
        (mainWindow as any).setTitleBarOverlay(overlay);
      }
      if (overlay.color) mainWindow.setBackgroundColor(overlay.color);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });

  // Abre links no navegador padrão do sistema (somente http/https)
  ipcMain.handle('shell:openExternal', async (_event, url: string) => {
    try {
      if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
        return { success: false, error: 'URL inválida' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || String(err) };
    }
  });
}

// Links "abrir em nova aba" dentro do navegador integrado (<webview>) viram abas do app
app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() !== 'webview') return;

  // Atalhos globais do app continuam funcionando com o foco dentro do navegador integrado
  contents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !(input.control || input.meta) || input.alt) return;
    const key = (input.key || '').toLowerCase();
    const forwarded = key === 'w' || key === 't' || key === 'tab';
    if (!forwarded) return;
    try {
      const host = (contents as any).hostWebContents as Electron.WebContents | undefined;
      host?.send('app:shortcut', { key, shift: !!input.shift });
      event.preventDefault();
    } catch {
      /* ignore */
    }
  });

  attachCosmeticFiltering(contents);

  contents.setWindowOpenHandler(({ url, disposition }) => {
    // Pop-ups e pop-unders de anúncio
    if (shouldBlockPopup(url, contents.getURL())) return { action: 'deny' };
    if (/^https?:\/\//i.test(url) && (disposition === 'foreground-tab' || disposition === 'background-tab')) {
      try {
        const host = (contents as any).hostWebContents as Electron.WebContents | undefined;
        host?.send('webview:open-url', { url, sourceId: contents.id, background: disposition === 'background-tab' });
      } catch {
        /* ignore */
      }
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

process.on('uncaughtException', (err) => {
  console.error('[Main Process uncaughtException]:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main Process unhandledRejection]:', reason);
});
