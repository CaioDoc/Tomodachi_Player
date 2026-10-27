import { contextBridge, ipcRenderer } from 'electron';

export interface LocalFileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  isImage: boolean;
  isVideo: boolean;
  isArchive: boolean;
  size: number;
  mtime: number;
  ext: string;
  coverPath?: string | null;
  imageCount?: number;
}

export interface VideoItem {
  path: string;
  name: string;
  ext: string;
  size: number;
  mtime: number;
  rootPath?: string;
  coverPath?: string | null;
}

export interface AdblockSettingsInfo {
  enabled: boolean;
  annoyances: boolean;
  cosmetic: boolean;
  popups: boolean;
  ready: boolean;
  updating: boolean;
  listsUpdatedAt: number;
  blockedCount: number;
}

export interface BrowserExtensionInfo {
  key: string;
  source: 'store' | 'file' | 'folder';
  storeId?: string;
  enabled: boolean;
  installedAt: number;
  name: string;
  version: string;
  description?: string;
  icon?: string;
  id?: string;
  loaded: boolean;
  error?: string;
  popup?: string;
  options?: string;
  warnings: string[];
  manifestVersion: number;
}

export interface NuvioStream {
  name?: string;
  title?: string;
  url: string;
  quality?: string;
  size?: string;
  type?: string;
  provider?: string;
  headers?: Record<string, string>;
  subtitles?: { url: string; name?: string; language?: string }[];
  /** Torrents: arquivo dentro do torrent e trackers ("tracker:udp://…") */
  fileIdx?: number;
  sources?: string[];
  /** Nome do arquivo de vídeo (ajuda a escolher o arquivo certo do torrent) */
  filename?: string;
}

export type ExtResult<T> = { success: true; data: T } | { success: false; error: string; data?: undefined };

export interface ElectronAPI {
  readDirectory: (dirPath: string) => Promise<{ success: boolean; items: LocalFileItem[]; error?: string }>;
  openFolderDialog: () => Promise<string | null>;
  selectFolders: () => Promise<string[]>;
  openFileDialog: (options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => Promise<string | null>;
  readFileBuffer: (filePath: string) => Promise<{ success: boolean; data?: Uint8Array; error?: string }>;
  saveFileDialog: (options: { defaultName: string; dataBase64: string; filters?: { name: string; extensions: string[] }[] }) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; error?: string }>;
  nhentaiApi: (args: { endpoint: string; method?: 'GET' | 'POST' | 'DELETE' | 'PUT'; params?: any; data?: any; customApiKey?: string }) => Promise<{ success: boolean; data?: any; error?: string }>;
  nhentaiLogin: () => Promise<{ success: boolean; user?: any; token?: string; error?: string }>;
  nhentaiLogout: () => Promise<{ success: boolean; error?: string }>;
  toMediaUrl: (absolutePath: string) => string;
  videoStreamUrl: (filePath: string) => Promise<string>;
  getStreamUrl: (arg: string | { filePath: string; referer?: string }) => Promise<string | null>;
  scanVideos: (folders: string[]) => Promise<VideoItem[]>;
  fetchRepoUrl: (url: string) => Promise<{ success: boolean; dataBase64?: string; error?: string; status?: number }>;
  mediaUrl: (filePath: string, transcode?: boolean) => string;
  getFirstImage: (folderPath: string) => Promise<string | null>;
  fileUrl: (filePath: string) => string;
  pickFolder: () => Promise<string | null>;
  expandFolders: (paths: string[], mediaType: 'video' | 'image') => Promise<string[]>;
  selectCoverImage: () => Promise<string | null>;
  setFolderCover: (folderPath: string, imagePath: string) => Promise<{ success: boolean; coverPath?: string; error?: string }>;
  findCommonRoot: (paths: string[]) => Promise<string | null>;
  saveLibrary: (source: 'manga' | 'video', data: any) => Promise<{ success: boolean; error?: string }>;
  loadLibrary: (source: 'manga' | 'video') => Promise<{ success: boolean; data?: any; error?: string }>;
  factoryReset: () => Promise<{ success: boolean; error?: string }>;
  resetFactory: () => Promise<{ success: boolean; error?: string }>;
  extractChapterPages: (chapterUrl: string, mangaUrl?: string, sourceName?: string) => Promise<{ success: boolean; pages?: string[]; title?: string; error?: string }>;
  extractMangaChapters: (mangaUrl: string, sourceName?: string) => Promise<{ success: boolean; chapters?: { url: string; name: string; number: number }[]; error?: string }>;
  resolveCover: (url: string, sourceName?: string) => Promise<{ success: boolean; url?: string; error?: string }>;
  extractVideoStream: (pageUrl: string, sourceName?: string) => Promise<{ success: boolean; type?: 'stream' | 'embed'; streamUrl?: string; embedUrl?: string; url?: string; referer?: string; servers?: Array<{ name: string; url: string }>; error?: string }>;
  scrapeExtensionCatalog: (params: { baseUrl: string; query?: string; page?: number; sourceName?: string }) => Promise<{ success: boolean; items: Array<{ title: string; url: string; cover: string; author?: string; description?: string; genres?: string[] }>; error?: string }>;
  getAdblockStatus: () => Promise<{ enabled: boolean; blockedCount: number }>;
  toggleAdblock: (enable?: boolean) => Promise<{ enabled: boolean; blockedCount: number }>;
  onAdblockCountUpdated: (callback: (count: number) => void) => () => void;
  setTitleBarOverlay: (opts: { color?: string; symbolColor?: string }) => Promise<{ success: boolean; error?: string }>;
  openExternal: (url: string) => Promise<{ success: boolean; error?: string }>;
  onWebviewOpenUrl: (callback: (payload: { url: string; sourceId: number; background: boolean }) => void) => () => void;
  onAppShortcut: (callback: (payload: { key: string; shift: boolean }) => void) => () => void;
  downloadChapter: (args: { chapterUrl: string; workTitle: string; chapterName: string; pages: string[] }) => Promise<{ success: boolean; error?: string; dir?: string; count?: number }>;
  cancelDownload: (chapterUrl: string) => Promise<{ success: boolean }>;
  getDownload: (chapterUrl: string) => Promise<{ chapterUrl: string; workTitle: string; chapterName: string; dir: string; count: number; files: string[] } | null>;
  listDownloads: () => Promise<Array<{ chapterUrl: string; workTitle: string; chapterName: string; dir: string; count: number; bytes: number; at: number }>>;
  deleteDownload: (chapterUrl: string) => Promise<{ success: boolean; error?: string }>;
  openDownloadsFolder: () => Promise<{ success: boolean; error?: string }>;
  onDownloadProgress: (callback: (p: { chapterUrl: string; done?: number; total?: number; finished?: boolean; error?: boolean; cancelled?: boolean }) => void) => () => void;
  logError: (payload: { level?: 'info' | 'warn' | 'error'; message: string; stack?: string }) => void;
  openLogsFolder: () => Promise<{ success: boolean; error?: string }>;
  suwayomiGraphql: (args: { baseUrl: string; query: string; variables?: Record<string, unknown>; username?: string; password?: string; timeoutMs?: number }) => Promise<{ success: boolean; data?: any; error?: string; status?: number }>;
  suwayomiSetAuth: (auth: { baseUrl: string; username?: string; password?: string }) => Promise<{ success: boolean }>;
  suwayomiStart: (exePath: string) => Promise<{ success: boolean; error?: string; alreadyRunning?: boolean }>;
  probeMedia: (filePath: string) => Promise<{
    success: boolean;
    error?: string;
    data?: {
      duration: number;
      audio: Array<{ index: number; lang?: string; title?: string; codec: string; isDefault: boolean }>;
      subtitles: Array<{ index: number; lang?: string; title?: string; codec: string; isDefault: boolean; isText?: boolean }>;
    };
  }>;
  extractSubtitle: (filePath: string, index: number) => Promise<{ success: boolean; text?: string; format?: 'ass' | 'srt'; error?: string }>;
  probeRemoteDuration: (url: string, referer?: string) => Promise<{ success: boolean; duration?: number; error?: string }>;
  nuvioFetchText: (url: string, headers?: Record<string, string>) => Promise<{ success: boolean; status?: number; text?: string; url?: string; error?: string }>;
  nuvioRunScraper: (args: {
    id: string;
    codeUrl: string;
    version?: string;
    tmdbId: string;
    mediaType: 'movie' | 'tv';
    season?: number | null;
    episode?: number | null;
    timeoutMs?: number;
  }) => Promise<{ success: boolean; streams?: NuvioStream[]; error?: string; ms?: number }>;
  nuvioRegisterStream: (url: string, headers?: Record<string, string>) => Promise<{ success: boolean }>;
  nuvioClearCache: () => Promise<{ success: boolean }>;
  torrentAvailable: () => Promise<{ available: boolean; error?: string }>;
  torrentStart: (args: { magnet?: string; infoHash?: string; fileIdx?: number | null; sources?: string[]; filename?: string; name?: string }) => Promise<{ success: boolean; url?: string; infoHash?: string; name?: string; length?: number; error?: string }>;
  torrentStatus: (infoHash: string) => Promise<{ success: boolean; ready?: boolean; numPeers?: number; downloadSpeed?: number; uploadSpeed?: number; progress?: number; downloaded?: number; error?: string }>;
  torrentStop: (infoHash: string) => Promise<{ success: boolean }>;
  videoThumbnail: (args: { input: string; time: number; referer?: string; width?: number }) => Promise<{ success: boolean; dataUrl?: string; error?: string }>;
  secretGetSync: (name: string) => string;
  secretSet: (name: string, value: string | null) => Promise<{ success: boolean; encrypted?: boolean }>;
  anilistLogin: () => Promise<{ success: boolean; token?: string; expiresAt?: number; error?: string }>;
  anilistLogout: () => Promise<{ success: boolean }>;
  adblockGetSettings: () => Promise<AdblockSettingsInfo>;
  adblockSetSettings: (patch: Partial<Pick<AdblockSettingsInfo, 'enabled' | 'annoyances' | 'cosmetic' | 'popups'>>) => Promise<AdblockSettingsInfo>;
  adblockUpdateLists: () => Promise<AdblockSettingsInfo>;
  extensionsList: () => Promise<BrowserExtensionInfo[]>;
  extensionsInstallFromStore: (input: string) => Promise<ExtResult<BrowserExtensionInfo>>;
  extensionsInstallFromFile: () => Promise<ExtResult<BrowserExtensionInfo | null>>;
  extensionsInstallFromFolder: () => Promise<ExtResult<BrowserExtensionInfo | null>>;
  extensionsSetEnabled: (key: string, enabled: boolean) => Promise<ExtResult<BrowserExtensionInfo>>;
  extensionsRemove: (key: string) => Promise<ExtResult<boolean>>;
  extensionsOpenPopup: (key: string) => Promise<{ success: boolean; error?: string }>;
  extensionsOpenOptions: (key: string) => Promise<{ success: boolean; error?: string }>;
  extensionsOpenFolder: () => Promise<{ success: boolean }>;
}

const toMediaUrlHelper = (filePath: string) => {
  if (!filePath) return '';
  if (
    filePath.startsWith('http://') ||
    filePath.startsWith('https://') ||
    filePath.startsWith('media-file://') ||
    filePath.startsWith('media://') ||
    filePath.startsWith('data:') ||
    filePath.startsWith('blob:')
  ) {
    return filePath;
  }
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const encoded = normalized
    .split('/')
    .map((seg, idx) => {
      if (idx === 0 && /^[A-Za-z]:$/.test(seg)) return seg;
      return encodeURIComponent(seg);
    })
    .join('/');
  return `media-file:///${encoded}`;
};

const mediaUrlHelper = (filePath: string, transcode = false) => {
  if (!filePath) return '';
  if (
    filePath.startsWith('media://') ||
    filePath.startsWith('http://') ||
    filePath.startsWith('https://')
  ) {
    return filePath;
  }
  return `media://stream/${encodeURIComponent(filePath)}${transcode ? '?tr=1' : ''}`;
};

const electronAPI: ElectronAPI = {
  readDirectory: (dirPath: string) => ipcRenderer.invoke('read-directory', dirPath),
  openFolderDialog: () => ipcRenderer.invoke('open-folder-dialog'),
  selectFolders: () => ipcRenderer.invoke('dialog:selectFolders'),
  openFileDialog: (options) => ipcRenderer.invoke('open-file-dialog', options),
  readFileBuffer: (filePath: string) => ipcRenderer.invoke('read-file-buffer', filePath),
  saveFileDialog: (options) => ipcRenderer.invoke('save-file-dialog', options),
  nhentaiApi: (args) => ipcRenderer.invoke('nhentai-api', args),
  nhentaiLogin: () => ipcRenderer.invoke('nhentai:openLogin'),
  nhentaiLogout: () => ipcRenderer.invoke('nhentai:logout'),
  toMediaUrl: toMediaUrlHelper,
  videoStreamUrl: (filePath: string) => ipcRenderer.invoke('video:stream', filePath),
  getStreamUrl: (arg: string | { filePath: string; referer?: string }) => ipcRenderer.invoke('video:getStreamUrl', arg),
  scanVideos: (folders: string[]) => ipcRenderer.invoke('video:scanFolders', folders),
  fetchRepoUrl: (url: string) => ipcRenderer.invoke('repo:fetch', url),
  mediaUrl: mediaUrlHelper,
  getFirstImage: (folderPath: string) => ipcRenderer.invoke('folder:firstImage', folderPath),
  fileUrl: toMediaUrlHelper,
  pickFolder: () => ipcRenderer.invoke('open-folder-dialog'),
  expandFolders: (paths: string[], mediaType: 'video' | 'image') => ipcRenderer.invoke('folders:expand', paths, mediaType),
  selectCoverImage: () => ipcRenderer.invoke('dialog:selectCoverImage'),
  setFolderCover: (folderPath: string, imagePath: string) => ipcRenderer.invoke('folder:setCover', { folderPath, imagePath }),
  findCommonRoot: (paths: string[]) => ipcRenderer.invoke('folder:findCommonRoot', paths),
  saveLibrary: (source: 'manga' | 'video', data: any) => ipcRenderer.invoke('library:save', { source, data }),
  loadLibrary: (source: 'manga' | 'video') => ipcRenderer.invoke('library:load', source),
  factoryReset: () => ipcRenderer.invoke('app:factoryReset'),
  resetFactory: () => ipcRenderer.invoke('app:factoryReset'),
  extractChapterPages: (chapterUrl: string, mangaUrl?: string, sourceName?: string) =>
    ipcRenderer.invoke('chapter:extractPages', { chapterUrl, mangaUrl, sourceName }),
  extractMangaChapters: (mangaUrl: string, sourceName?: string) =>
    ipcRenderer.invoke('manga:extractChapters', { mangaUrl, sourceName }),
  resolveCover: (url: string, sourceName?: string) =>
    ipcRenderer.invoke('image:resolve', { url, sourceName }),
  extractVideoStream: (pageUrl: string, sourceName?: string) =>
    ipcRenderer.invoke('video:extractStream', { pageUrl, sourceName }),
  scrapeExtensionCatalog: (params: { baseUrl: string; query?: string; page?: number; sourceName?: string }) =>
    ipcRenderer.invoke('extension:scrapeCatalog', params),
  getAdblockStatus: () => ipcRenderer.invoke('adblock:getStatus'),
  toggleAdblock: (enable?: boolean) => ipcRenderer.invoke('adblock:toggle', enable),
  onAdblockCountUpdated: (callback: (count: number) => void) => {
    const handler = (_event: any, count: number) => callback(count);
    ipcRenderer.on('adblock:count-updated', handler);
    return () => ipcRenderer.removeListener('adblock:count-updated', handler);
  },
  setTitleBarOverlay: (opts) => ipcRenderer.invoke('window:setTitleBarOverlay', opts),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  onWebviewOpenUrl: (callback) => {
    const handler = (_event: any, payload: { url: string; sourceId: number; background: boolean }) => callback(payload);
    ipcRenderer.on('webview:open-url', handler);
    return () => ipcRenderer.removeListener('webview:open-url', handler);
  },
  onAppShortcut: (callback) => {
    const handler = (_event: any, payload: { key: string; shift: boolean }) => callback(payload);
    ipcRenderer.on('app:shortcut', handler);
    return () => ipcRenderer.removeListener('app:shortcut', handler);
  },
  downloadChapter: (args) => ipcRenderer.invoke('downloads:chapter', args),
  cancelDownload: (chapterUrl: string) => ipcRenderer.invoke('downloads:cancel', chapterUrl),
  getDownload: (chapterUrl: string) => ipcRenderer.invoke('downloads:get', chapterUrl),
  listDownloads: () => ipcRenderer.invoke('downloads:list'),
  deleteDownload: (chapterUrl: string) => ipcRenderer.invoke('downloads:delete', chapterUrl),
  openDownloadsFolder: () => ipcRenderer.invoke('downloads:openFolder'),
  onDownloadProgress: (callback) => {
    const handler = (_event: any, p: any) => callback(p);
    ipcRenderer.on('downloads:progress', handler);
    return () => ipcRenderer.removeListener('downloads:progress', handler);
  },
  logError: (payload) => ipcRenderer.send('log:write', payload),
  openLogsFolder: () => ipcRenderer.invoke('log:openFolder'),
  suwayomiGraphql: (args) => ipcRenderer.invoke('suwayomi:graphql', args),
  suwayomiSetAuth: (auth) => ipcRenderer.invoke('suwayomi:setAuth', auth),
  suwayomiStart: (exePath: string) => ipcRenderer.invoke('suwayomi:start', exePath),
  probeMedia: (filePath: string) => ipcRenderer.invoke('media:probe', filePath),
  extractSubtitle: (filePath: string, index: number) => ipcRenderer.invoke('media:extractSubtitle', { filePath, index }),
  probeRemoteDuration: (url: string, referer?: string) => ipcRenderer.invoke('media:probeRemoteDuration', { url, referer }),
  nuvioFetchText: (url: string, headers?: Record<string, string>) => ipcRenderer.invoke('nuvio:fetchText', { url, headers }),
  nuvioRunScraper: (args) => ipcRenderer.invoke('nuvio:runScraper', args),
  nuvioRegisterStream: (url: string, headers?: Record<string, string>) => ipcRenderer.invoke('nuvio:registerStream', { url, headers }),
  nuvioClearCache: () => ipcRenderer.invoke('nuvio:clearCache'),
  torrentAvailable: () => ipcRenderer.invoke('torrent:available'),
  torrentStart: (args) => ipcRenderer.invoke('torrent:start', args),
  torrentStatus: (infoHash: string) => ipcRenderer.invoke('torrent:status', infoHash),
  torrentStop: (infoHash: string) => ipcRenderer.invoke('torrent:stop', infoHash),
  videoThumbnail: (args) => ipcRenderer.invoke('media:thumbnail', args),
  secretGetSync: (name: string) => {
    try {
      return String(ipcRenderer.sendSync('secrets:getSync', name) || '');
    } catch {
      return '';
    }
  },
  secretSet: (name: string, value: string | null) => ipcRenderer.invoke('secrets:set', name, value),
  anilistLogin: () => ipcRenderer.invoke('anilist:login'),
  anilistLogout: () => ipcRenderer.invoke('anilist:logout'),
  adblockGetSettings: () => ipcRenderer.invoke('adblock:getSettings'),
  adblockSetSettings: (patch) => ipcRenderer.invoke('adblock:setSettings', patch),
  adblockUpdateLists: () => ipcRenderer.invoke('adblock:updateLists'),
  extensionsList: () => ipcRenderer.invoke('extensions:list'),
  extensionsInstallFromStore: (input: string) => ipcRenderer.invoke('extensions:installFromStore', input),
  extensionsInstallFromFile: () => ipcRenderer.invoke('extensions:installFromFile'),
  extensionsInstallFromFolder: () => ipcRenderer.invoke('extensions:installFromFolder'),
  extensionsSetEnabled: (key: string, enabled: boolean) => ipcRenderer.invoke('extensions:setEnabled', key, enabled),
  extensionsRemove: (key: string) => ipcRenderer.invoke('extensions:remove', key),
  extensionsOpenPopup: (key: string) => ipcRenderer.invoke('extensions:openPopup', key),
  extensionsOpenOptions: (key: string) => ipcRenderer.invoke('extensions:openOptions', key),
  extensionsOpenFolder: () => ipcRenderer.invoke('extensions:openFolder'),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
contextBridge.exposeInMainWorld('api', {
  selectFolders: () => electronAPI.selectFolders(),
  pickFolder: () => electronAPI.pickFolder(),
  toMediaUrl: toMediaUrlHelper,
  fileUrl: toMediaUrlHelper,
  getFirstImage: (folderPath: string) => ipcRenderer.invoke('folder:firstImage', folderPath),
  getStreamUrl: (p: string) => ipcRenderer.invoke('video:getStreamUrl', p),
  scanVideos: (folders: string[]) => ipcRenderer.invoke('video:scanFolders', folders),
  mediaUrl: mediaUrlHelper,
  expandFolders: (paths: string[], mediaType: 'video' | 'image') => electronAPI.expandFolders(paths, mediaType),
  selectCoverImage: () => electronAPI.selectCoverImage(),
  setFolderCover: (folderPath: string, imagePath: string) => electronAPI.setFolderCover(folderPath, imagePath),
  findCommonRoot: (paths: string[]) => electronAPI.findCommonRoot(paths),
  saveLibrary: (source: 'manga' | 'video', data: any) => electronAPI.saveLibrary(source, data),
  loadLibrary: (source: 'manga' | 'video') => electronAPI.loadLibrary(source),
  factoryReset: () => electronAPI.factoryReset(),
  resetFactory: () => electronAPI.resetFactory(),
  extractChapterPages: (chapterUrl: string, mangaUrl?: string, sourceName?: string) =>
    electronAPI.extractChapterPages(chapterUrl, mangaUrl, sourceName),
  resolveCover: (url: string, sourceName?: string) => electronAPI.resolveCover(url, sourceName),
});
