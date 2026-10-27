import type { ElectronAPI, VideoItem } from '../../electron/preload';

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
    api: {
      selectFolders: () => Promise<string[]>;
      pickFolder?: () => Promise<string | null>;
      toMediaUrl: (p: string) => string;
      fileUrl?: (filePath: string) => string;
      getFirstImage?: (folderPath: string) => Promise<string | null>;
      getStreamUrl: (p: string) => Promise<string | null>;
      scanVideos: (folders: string[]) => Promise<VideoItem[]>;
      mediaUrl: (filePath: string, transcode?: boolean) => string;
      expandFolders?: (paths: string[], mediaType: 'video' | 'image') => Promise<string[]>;
      selectCoverImage?: () => Promise<string | null>;
      setFolderCover?: (folderPath: string, imagePath: string) => Promise<{ success: boolean; coverPath?: string; error?: string }>;
      findCommonRoot?: (paths: string[]) => Promise<string | null>;
      saveLibrary?: (source: 'manga' | 'video', data: any) => Promise<{ success: boolean; error?: string }>;
      loadLibrary?: (source: 'manga' | 'video') => Promise<{ success: boolean; data?: any; error?: string }>;
      factoryReset?: () => Promise<{ success: boolean; error?: string }>;
      resetFactory?: () => Promise<{ success: boolean; error?: string }>;
    };
  }
}

export type { VideoItem };
export type LocalVideo = VideoItem;

export type MediaKind = 'image' | 'video';

export type RepoType = 'manga' | 'anime';

export type TabType = 
  | 'mangas'
  | 'videos'
  | 'mangadex'
  | 'nhentai'
  | 'repo-manga'
  | 'repo-anime'
  | 'repos'
  | 'manga-local'
  | 'manga-backup'
  | 'video-local'
  | 'video-backup'
  | 'mangadex-reader'
  | 'nhentai-reader'
  | 'manga-reader' 
  | 'manga-detail'
  | 'anime-detail'
  | 'extension-catalog'
  | 'source-browse'
  | 'video-player' 
  | 'webview' 
  | 'backup-viewer'
  | 'settings-repos';

export interface SubTab {
  id: string;
  title: string;
  type: 'catalog' | 'reader' | 'detail' | 'search';
  data?: any;
}

export interface TabItem {
  id: string;
  title: string;
  type: TabType;
  data?: any;
  subTabs?: SubTab[];
  activeSubTab?: string;
}

export interface WebBookmark {
  id: string;
  title: string;
  url: string;
  dateAdded?: number;
  favicon?: string;
  /** Pasta onde está (vazio = raiz / barra de favoritos) */
  parentId?: string;
  /** Ordem dentro da pasta */
  pos?: number;
}

export interface WebBookmarkFolder {
  id: string;
  title: string;
  parentId?: string;
  dateAdded?: number;
  pos?: number;
}

export interface ExtensionRepo {
  name: string;
  baseUrl: string;
  pkg: string;
  versionName: string;
  lang: string;
  nsfw: boolean;
  apk: string;
  icon?: string;
}

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

export interface GalleryTag {
  id: number;
  type: string;
  name: string;
  url?: string;
  count?: number;
}

export interface GalleryPageInfo {
  number: number;
  path: string;
  width: number;
  height: number;
  thumbnail?: string;
}

export interface GalleryItem {
  id: number;
  media_id: string;
  english_title?: string;
  japanese_title?: string;
  title?: {
    english?: string;
    japanese?: string;
    pretty?: string;
  };
  thumbnail?: string;
  cover?: string;
  pages?: GalleryPageInfo[];
  images?: {
    pages?: { t: 'j' | 'p' | 'w'; w: number; h: number }[];
    cover?: { t: 'j' | 'p' | 'w'; w: number; h: number };
  };
  tags?: GalleryTag[];
  tag_ids?: number[];
  num_pages: number;
  num_favorites?: number;
  upload_date?: number;
}

export interface AnimeMetadata {
  id: number;
  title: {
    romaji: string;
    english?: string;
    native?: string;
  };
  coverImage: {
    extraLarge?: string;
    large?: string;
    medium?: string;
    color?: string;
  };
  bannerImage?: string;
  description?: string;
  episodes?: number;
  status?: string;
  genres?: string[];
  averageScore?: number;
  format?: string;
  startDate?: {
    year?: number;
  };
  trailer?: {
    id?: string;
    site?: string;
  };
}

export interface BackupChapter {
  url: string;
  name: string;
  chapterNumber?: number;
  read?: boolean;
  lastPageRead?: number;
  dateFetch?: string | number;
  dateUpload?: string | number;
}

export interface BackupManga {
  source: string | number;
  url: string;
  title?: string;
  artist?: string;
  author?: string;
  description?: string;
  genre?: string[];
  status?: number;
  thumbnailUrl?: string;
  chapters?: BackupChapter[];
  categories?: number[];
  customTitle?: string;
}

export interface BackupEpisode {
  url: string;
  name: string;
  episodeNumber?: number;
  seen?: boolean;
}

export interface BackupAnime {
  source: string | number;
  url: string;
  title?: string;
  artist?: string;
  author?: string;
  description?: string;
  genre?: string[];
  status?: number;
  thumbnailUrl?: string;
  episodes?: BackupEpisode[];
  categories?: number[];
}

export interface BackupCategory {
  name: string;
  order?: number;
  flags?: number;
}

export interface BackupSource {
  name: string;
  sourceId: string | number;
}

export interface TachiyomiBackupResult {
  backupManga?: BackupManga[];
  backupAnime?: BackupAnime[];
  backupCategories?: BackupCategory[];
  backupAnimeCategories?: BackupCategory[];
  backupSources?: BackupSource[];
  backupAnimeSources?: BackupSource[];
}
