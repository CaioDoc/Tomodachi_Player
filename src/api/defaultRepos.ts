import type { RepoType } from '../types';

export interface RepoEntry {
  url: string;
  label: string;
}

export type DefaultRepo = RepoEntry;

export const DEFAULT_REPOS: Record<RepoType, RepoEntry[]> = {
  manga: [
    { label: 'Keiyoushi (Mihon)', url: 'https://raw.githubusercontent.com/keiyoushi/extensions/repo/index.pb' },
    { label: 'Suwayomi (Tachiyomi)', url: 'https://raw.githubusercontent.com/Suwayomi/tachiyomi-extension/repo/index.min.json' },
    { label: 'Kareadita (Tachiyomi)', url: 'https://raw.githubusercontent.com/Kareadita/tach-extension/repo/index.min.json' },
  ],
  anime: [
    { label: 'Aniyomi (Secozzi)', url: 'https://raw.githubusercontent.com/Secozzi/aniyomi-extensions/repo/index.min.json' },
    { label: 'Anime Repo (Yuzono)', url: 'https://raw.githubusercontent.com/yuzono/anime-repo/repo/index.min.json' },
  ],
};
