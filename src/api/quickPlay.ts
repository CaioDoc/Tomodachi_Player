// src/api/quickPlay.ts
// "Assistir" rápido de uma obra da biblioteca: pega o próximo episódio (ou o que estava em andamento)
// e toca no player do app. Sem link próprio (obras do AniList), procura em todas as fontes e toca a
// primeira que responder — o mesmo comportamento do botão Assistir da página da obra.

import type { LibraryItem, LibraryChapter } from '../components/MihonLibrary';
import { openVideoEpisode } from './openChapter';
import { openWatchSources } from './watchSources';
import { getResume } from '../utils/continueWatching';
import { getVideoPositionInfo } from '../utils/progress';

type OpenTabFn = (type: any, title: string, data?: any) => void;

const isLocalPath = (url: string) => /^[a-zA-Z]:[\\/]/.test(url) || url.startsWith('/') || url.startsWith('\\\\') || url.startsWith('media-file:');
/** Link que o player consegue abrir sozinho (arquivo local ou página de um site de vídeo) */
export const isPlayableUrl = (url: string) => isLocalPath(url) || (/^https?:\/\//i.test(url) && !/anilist\.co/i.test(url));

/** Próximo episódio: um em andamento, senão o primeiro não visto, senão o primeiro */
export function nextEpisodeOf(item: LibraryItem): LibraryChapter | null {
  const eps = [...(item.chapters || [])].sort((a, b) => (a.number || 0) - (b.number || 0));
  if (!eps.length) return null;
  return eps.find((c) => !c.read && (getVideoPositionInfo(c.url)?.t || 0) > 0) || eps.find((c) => !c.read) || eps[0];
}

/** Toca a obra agora (retoma de onde parou quando dá) */
export function quickPlay(item: LibraryItem, onOpenTab?: OpenTabFn) {
  const ep = nextEpisodeOf(item);
  const work = { url: item.url, title: item.title, sourceName: item.sourceName, source: item.source, cover: item.cover, chapters: item.chapters || [] };
  if (ep && isPlayableUrl(ep.url || '')) {
    // Mesma fonte, do ponto salvo
    const r = isLocalPath(ep.url) ? null : getResume(ep.url);
    if (r?.play) onOpenTab?.('video-player', r.title, r.play);
    else openVideoEpisode(work, ep, onOpenTab);
    return;
  }
  openWatchSources({
    autoPlay: true,
    title: item.title,
    year: (item as any).year,
    kind: (item.chapters?.length || 0) <= 1 && /movie|filme/i.test(String((item as any).format || '')) ? 'movie' : 'series',
    episode: ep?.number || 1,
    cover: item.cover,
    episodeUrl: ep?.url,
    workUrl: item.url,
    episodeUrls: Object.fromEntries((item.chapters || []).filter((c) => c.number > 0).map((c) => [String(c.number), c.url])),
    preferred: item.sourceName && !/anilist/i.test(item.sourceName) ? { extName: item.sourceName } : undefined,
  });
}
