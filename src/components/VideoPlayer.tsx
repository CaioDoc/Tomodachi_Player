import { SeekBar, type SeekPreviewSource } from './SeekBar';
import { OnlineSubtitlesDialog } from './OnlineSubtitlesDialog';
import React, { useState, useRef, useEffect } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  Camera, 
  Sparkles, 
  RotateCcw, 
  RotateCw,
  Film,
  Info,
  Check,
  Download,
  AlertCircle,
  Globe,
  FolderPlus,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { captureFrameFromElement } from '../api/mediaMeta';
import { fetchAnimeMetadata } from '../api/anilist';
import { toMediaUrl } from '../utils/mediaUrl';
import type { AnimeMetadata, TabType } from '../types';
import { useIsTabActive, isTypingTarget } from '../context/TabContext';
import { getVideoPosition, saveVideoPosition, updateChapterProgress } from '../utils/progress';
import { recordResume } from '../utils/continueWatching';
import { parseSubtitles, decodeSubtitleBytes, siblingSubtitleCandidates, type SubtitleCue } from '../utils/subtitles';
import { Captions, CaptionsOff, SkipForward, AudioLines, ChevronRight, Radio } from 'lucide-react';
import { openWatchSources } from '../api/watchSources';
import { t, tMaybe } from '../i18n';

export interface EpisodeContext {
  workTitle: string;
  episodes: Array<{ url: string; name?: string; number?: number }>;
}

// Faixa de legenda criada por elemento <video> (o elemento é recriado quando a fonte muda)
const subtitleTracks = new WeakMap<HTMLVideoElement, TextTrack>();

const PLAYER_PREFS_KEY = 'tp_player_prefs';
const loadPlayerPrefs = (): { volume: number; muted: boolean; speed: number } => {
  try {
    const p = JSON.parse(localStorage.getItem(PLAYER_PREFS_KEY) || '{}');
    return {
      volume: typeof p.volume === 'number' ? Math.min(1, Math.max(0, p.volume)) : 1,
      muted: !!p.muted,
      speed: typeof p.speed === 'number' && p.speed > 0 ? p.speed : 1,
    };
  } catch {
    return { volume: 1, muted: false, speed: 1 };
  }
};

/* Idioma preferido de áudio/legenda (lembrado entre episódios) */
const TRACK_PREFS_KEY = 'tp_player_tracks';
const loadTrackPrefs = (): { audioLang?: string; subLang?: string } => {
  try {
    return JSON.parse(localStorage.getItem(TRACK_PREFS_KEY) || '{}') || {};
  } catch {
    return {};
  }
};
const saveTrackPrefs = (patch: { audioLang?: string; subLang?: string }) => {
  try {
    localStorage.setItem(TRACK_PREFS_KEY, JSON.stringify({ ...loadTrackPrefs(), ...patch }));
  } catch {
    /* ignore */
  }
};

const LANG_NAMES: Record<string, string> = {
  jpn: t('Japonês'), ja: t('Japonês'), por: t('Português'), pt: t('Português'), 'pt-br': t('Português (BR)'), pob: t('Português (BR)'),
  eng: t('Inglês'), en: t('Inglês'), spa: t('Espanhol'), es: t('Espanhol'), fre: t('Francês'), fra: t('Francês'), ger: t('Alemão'), deu: t('Alemão'),
  ita: t('Italiano'), kor: t('Coreano'), chi: t('Chinês'), zho: t('Chinês'), rus: t('Russo'), ara: t('Árabe'),
};

interface ProbeTrack {
  index: number;
  lang?: string;
  title?: string;
  codec: string;
  isDefault: boolean;
  isText?: boolean;
}
interface ProbeInfo {
  duration: number;
  audio: ProbeTrack[];
  subtitles: ProbeTrack[];
}

const trackLabel = (track: ProbeTrack, kind: 'Faixa' | 'Legenda') => {
  const lang = track.lang ? LANG_NAMES[track.lang.toLowerCase()] || track.lang.toUpperCase() : '';
  if (track.title && lang && !track.title.toLowerCase().includes(lang.toLowerCase())) return `${track.title} (${lang})`;
  return track.title || lang || (kind === 'Faixa' ? t('Faixa {n}', { n: track.index + 1 }) : t('Legenda {n}', { n: track.index + 1 }));
};
const isPortuguese = (lang?: string) => !!lang && /^(por|pt|pob|pt-br)$/i.test(lang);

const MEDIA_ERRORS: Record<number, string> = {
  1: t('Carregamento abortado pelo usuário'),
  2: t('Erro de rede — arquivo inacessível'),
  3: t('Erro de decodificação — formato/codec de vídeo incompatível'),
  4: t('Formato não suportado diretamente pelo player'),
};

interface VideoPlayerProps {
  item?: { path: string; name?: string };
  video?: { path: string; name?: string };
  title?: string;
  filePath?: string;
  onClose?: () => void;
  onOpenTab?: (type: TabType | any, title: string, data?: any) => void;
  /** URL do episódio na biblioteca (para marcar como visto) */
  episodeUrl?: string;
  /** Lista de episódios da obra (habilita "próximo episódio") */
  episodeContext?: EpisodeContext;
  /** Link direto de vídeo (ex.: plugins do Nuvio), mesmo sem extensão no endereço */
  directStream?: boolean;
  /** Referer exigido pelo stream (usado na conversão pelo FFmpeg) */
  streamReferer?: string;
  /** Legendas oferecidas pela fonte */
  remoteSubtitles?: { url: string; name?: string; language?: string }[];
  /** ID no formato do Stremio (para achar legendas online do episódio certo) */
  stremioRef?: { type: 'movie' | 'series'; id: string };
  /** Dados da aba (para "Continuar assistindo" reabrir o mesmo vídeo) */
  playData?: Record<string, any>;
  /** Obra (capa e título no "Continuar assistindo") */
  work?: { title?: string; url?: string; cover?: string };
  onTitleChange?: (title: string) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  item,
  video,
  title,
  filePath,
  onClose,
  onOpenTab,
  episodeUrl,
  episodeContext,
  onTitleChange,
  directStream,
  streamReferer,
  remoteSubtitles,
  stremioRef,
  playData,
  work,
}) => {
  const isTabActive = useIsTabActive();
  const [currentEpisodeUrl, setCurrentEpisodeUrl] = useState<string | undefined>(episodeUrl);
  const [episodeTitle, setEpisodeTitle] = useState<string | null>(null);
  const [nextCountdown, setNextCountdown] = useState<number | null>(null);
  const [subCues, setSubCues] = useState<SubtitleCue[] | null>(null);
  const [subName, setSubName] = useState<string | null>(null);
  const [subsEnabled, setSubsEnabled] = useState(true);
  /** Qual legenda está carregada: arquivo externo ou faixa embutida (emb:N) */
  const [subSource, setSubSource] = useState<string | null>(null);
  const [subLoading, setSubLoading] = useState(false);
  // Início do trecho atual quando o vídeo é convertido em tempo real (MKV etc.)
  const offsetRef = useRef(0);
  const initialPrefs = React.useMemo(loadPlayerPrefs, []);
  const actualPath = video?.path || item?.path || filePath || '';
  const [localOverridePath, setLocalOverridePath] = useState<string | null>(null);
  const activeVideoPath = localOverridePath || actualPath;

  // Posição salva pelo episódio (estável), não pelo link do vídeo (que muda a cada fonte/sessão)
  const posKey = currentEpisodeUrl || activeVideoPath;
  const readPos = () => getVideoPosition(posKey) || (posKey !== activeVideoPath ? getVideoPosition(activeVideoPath) : 0);

  const actualTitle = episodeTitle || video?.name || item?.name || title || (activeVideoPath.split(/[\\/]/).pop() || t('Player de Vídeo'));

  /* ── Episódios: anterior / próximo ── */
  const orderedEpisodes = React.useMemo(() => {
    const list = episodeContext?.episodes || [];
    return list
      .map((e, i) => ({ e, i }))
      .sort((a, b) => {
        const na = Number(a.e.number);
        const nb = Number(b.e.number);
        if (isFinite(na) && isFinite(nb) && na !== nb) return na - nb;
        return a.i - b.i;
      })
      .map((x) => x.e);
  }, [episodeContext]);
  const episodeIndex = currentEpisodeUrl ? orderedEpisodes.findIndex((e) => e.url === currentEpisodeUrl) : -1;
  const nextEpisode = episodeIndex >= 0 ? orderedEpisodes[episodeIndex + 1] : undefined;

  const goToEpisode = (ep: { url: string; name?: string; number?: number }) => {
    setNextCountdown(null);
    const label = ep.name?.trim() || t('Episódio {n}', { n: ep.number ?? '' }).trim();
    const newTitle = episodeContext?.workTitle ? `${episodeContext.workTitle} - ${label}` : label;
    setLocalOverridePath(ep.url);
    setCurrentEpisodeUrl(ep.url);
    setEpisodeTitle(newTitle);
    onTitleChange?.(newTitle);
    setSubCues(null);
    setSubName(null);
    setSubSource(null);
    markedSeenRef.current = false;
  };

  // Contagem regressiva para o próximo episódio ao terminar
  useEffect(() => {
    if (nextCountdown === null) return;
    if (!isTabActive) {
      setNextCountdown(null);
      return;
    }
    if (nextCountdown <= 0) {
      if (nextEpisode) goToEpisode(nextEpisode);
      else setNextCountdown(null);
      return;
    }
    const t = window.setTimeout(() => setNextCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCountdown, isTabActive]);

  /* ── Legendas ── */
  const applySubtitles = (v: HTMLVideoElement | null) => {
    if (!v) return;
    try {
      let track = subtitleTracks.get(v);
      if (!track && subCues && subCues.length > 0) {
        track = v.addTextTrack('subtitles', t('Legenda'), 'pt');
        subtitleTracks.set(v, track);
      }
      if (!track) return;
      // Limpa as falas anteriores
      const existing = track.cues ? Array.from(track.cues) : [];
      for (const c of existing) track.removeCue(c);
      if (subCues) {
        const off = offsetRef.current || 0;
        for (const c of subCues) {
          if (c.end <= off) continue;
          try {
            track.addCue(new VTTCue(Math.max(0, c.start - off), c.end - off, c.text));
          } catch {
            /* fala inválida: ignora */
          }
        }
      }
      track.mode = subCues && subsEnabled ? 'showing' : 'hidden';
    } catch (err) {
      console.warn('Falha ao aplicar legendas:', err);
    }
  };

  useEffect(() => {
    applySubtitles(videoRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subCues, subsEnabled]);

  const loadSubtitleFile = async (path: string, silent = false): Promise<boolean> => {
    if (!window.electronAPI?.readFileBuffer) return false;
    try {
      const res = await window.electronAPI.readFileBuffer(path);
      if (!res.success || !res.data) return false;
      const bytes = res.data instanceof Uint8Array ? res.data : new Uint8Array(res.data as any);
      const cues = parseSubtitles(decodeSubtitleBytes(bytes), path);
      if (cues.length === 0) {
        if (!silent) setError(t('Não foi possível ler falas neste arquivo de legenda.'));
        return false;
      }
      setSubCues(cues);
      setSubName(path.split(/[\\/]/).pop() || t('Legenda'));
      setSubSource('file');
      setSubsEnabled(true);
      return true;
    } catch {
      return false;
    }
  };

  const handlePickSubtitle = async () => {
    if (!window.electronAPI?.openFileDialog) return;
    const picked = await window.electronAPI.openFileDialog({
      title: t('Selecionar arquivo de legenda'),
      filters: [
        { name: t('Legendas'), extensions: ['srt', 'vtt', 'ass', 'ssa'] },
        { name: t('Todos os arquivos'), extensions: ['*'] },
      ],
    });
    if (picked) await loadSubtitleFile(picked);
  };


  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(initialPrefs.volume);
  const [isMuted, setIsMuted] = useState(initialPrefs.muted);
  const [playbackSpeed, setPlaybackSpeed] = useState(initialPrefs.speed);
  const [resumeNotice, setResumeNotice] = useState<string | null>(null);
  const markedSeenRef = useRef(false);
  const lastSavedRef = useRef(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [capturedFrame, setCapturedFrame] = useState<string | null>(null);
  const [savingFrame, setSavingFrame] = useState(false);
  const [frameSavedNotice, setFrameSavedNotice] = useState(false);

  // AniList metadata state
  const [metadata, setMetadata] = useState<AnimeMetadata | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [showMetaPanel, setShowMetaPanel] = useState(false);

  // Streaming URL and auto-transcoding fallback
  const [transcode, setTranscode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Extração automática de stream e reprodutor embutido
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedMedia, setExtractedMedia] = useState<{
    type: 'embed' | 'stream';
    url: string;
    referer?: string;
    servers?: Array<{ name: string; url: string }>;
  } | null>(null);
  const [transcodedUrl, setTranscodedUrl] = useState<string | null>(null);

  /* ── Faixas de áudio/legenda e busca em vídeos convertidos em tempo real ── */
  const isLocalFile = !!activeVideoPath && !/^(https?|blob|data|media):/i.test(activeVideoPath);
  const [probe, setProbe] = useState<{ path: string; info: ProbeInfo } | null>(null);
  const probeInfo = probe && probe.path === activeVideoPath ? probe.info : null;
  // Estados "presos" ao arquivo atual: ao trocar de episódio voltam ao padrão sem recarregar duas vezes
  const [audioSel, setAudioSel] = useState<{ path: string; index: number } | null>(null);
  const audioIndex = audioSel && audioSel.path === activeVideoPath ? audioSel.index : 0;
  const [pipeFor, setPipeFor] = useState<string | null>(null);
  const [seekSel, setSeekSel] = useState<{ path: string; offset: number } | null>(null);
  const initialOffsets = useRef<Record<string, number>>({});
  if (activeVideoPath && initialOffsets.current[activeVideoPath] === undefined) {
    const saved = readPos();
    initialOffsets.current[activeVideoPath] = saved > 5 ? Math.floor(saved) : 0;
  }
  const pipedOffset = seekSel && seekSel.path === activeVideoPath ? seekSel.offset : initialOffsets.current[activeVideoPath] || 0;
  const autoPlayRef = useRef(true);
  const resumeShownRef = useRef<string | null>(null);
  const [tracksMenuOpen, setTracksMenuOpen] = useState(false);
  const [onlineSubsOpen, setOnlineSubsOpen] = useState(false);

  const loadEmbeddedSubtitle = async (index: number, info: ProbeInfo | null, silent = false): Promise<boolean> => {
    const track = info?.subtitles[index];
    if (!track || !window.electronAPI?.extractSubtitle) return false;
    const pathAtStart = activeVideoPath;
    setSubLoading(true);
    try {
      const res = await window.electronAPI.extractSubtitle(pathAtStart, index);
      if (pathAtStart !== activeVideoPathRef.current) return false;
      if (!res.success || !res.text) {
        if (!silent) setError(tMaybe(res.error) || t('Não foi possível extrair a legenda.'));
        return false;
      }
      const cues = parseSubtitles(res.text, `legenda.${res.format || 'srt'}`);
      if (cues.length === 0) {
        if (!silent) setError(t('A legenda embutida está vazia.'));
        return false;
      }
      setSubCues(cues);
      setSubName(trackLabel(track, 'Legenda'));
      setSubSource(`emb:${index}`);
      setSubsEnabled(true);
      return true;
    } catch {
      return false;
    } finally {
      setSubLoading(false);
    }
  };

  const activeVideoPathRef = useRef(activeVideoPath);
  activeVideoPathRef.current = activeVideoPath;

  // Ao abrir um arquivo local: lê as faixas, escolhe o áudio preferido e procura legendas
  useEffect(() => {
    if (!isLocalFile) return;
    let cancelled = false;
    (async () => {
      let info: ProbeInfo | null = null;
      if (window.electronAPI?.probeMedia) {
        try {
          const res = await window.electronAPI.probeMedia(activeVideoPath);
          if (res.success && res.data) info = res.data as ProbeInfo;
        } catch {
          /* ignore */
        }
      }
      if (cancelled) return;
      if (info) {
        setProbe({ path: activeVideoPath, info });
        // Idioma de áudio preferido (ex.: sempre japonês)
        const prefs = loadTrackPrefs();
        if (info.audio.length > 1) {
          const wanted =
            (prefs.audioLang && info.audio.find((a) => a.lang?.toLowerCase() === prefs.audioLang)) ||
            info.audio.find((a) => a.isDefault) ||
            info.audio[0];
          if (wanted && wanted.index !== 0) {
            const native = /\.(mp4|webm|m4v)$/i.test(activeVideoPath);
            if (native) setPipeFor(activeVideoPath);
            setAudioSel({ path: activeVideoPath, index: wanted.index });
          }
        }
      }
      // 1) Legenda externa com o mesmo nome do vídeo
      for (const candidate of siblingSubtitleCandidates(activeVideoPath)) {
        if (cancelled) return;
        if (await loadSubtitleFile(candidate, true)) return;
      }
      // 2) Legenda embutida (MKV), respeitando a preferência
      if (cancelled || !info) return;
      const prefs = loadTrackPrefs();
      if (prefs.subLang === 'off') return;
      const text = info.subtitles.filter((t) => t.isText);
      const pick =
        (prefs.subLang && text.find((t) => t.lang?.toLowerCase() === prefs.subLang)) ||
        text.find((t) => isPortuguese(t.lang)) ||
        (!prefs.subLang ? text.find((t) => t.isDefault) : undefined);
      if (pick) await loadEmbeddedSubtitle(pick.index, info, true);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideoPath]);

  // Identifica se é uma página web (ex: link de portal/episódio da web) ao invés de arquivo direto
  const isWebUrl = React.useMemo(() => {
    if (!activeVideoPath) return false;
    if (directStream && activeVideoPath === actualPath) return false;
    if (activeVideoPath.startsWith('http://') || activeVideoPath.startsWith('https://')) {
      const lower = activeVideoPath.toLowerCase().split('?')[0];
      const isDirectMedia =
        lower.endsWith('.mp4') ||
        lower.endsWith('.webm') ||
        lower.endsWith('.mkv') ||
        lower.endsWith('.m3u8') ||
        lower.endsWith('.mpd');
      return !isDirectMedia;
    }
    return false;
  }, [activeVideoPath]);

  // Identifica se há trailer do YouTube nos metadados ou na URL
  // O trailer só substitui o player quando o link é do YouTube ou uma página do
  // AniList (sem vídeo próprio). Arquivos locais e episódios nunca são trocados.
  const youtubeTrailerId = React.useMemo(() => {
    if (activeVideoPath && (activeVideoPath.includes('youtube.com') || activeVideoPath.includes('youtu.be'))) {
      const match = activeVideoPath.match(/(?:youtu\.be\/|watch\?v=|embed\/)([\w-]{11})/);
      if (match) return match[1];
    }
    const isAniListPage = /^https?:\/\/(www\.)?anilist\.co\//i.test(activeVideoPath || '');
    if (isAniListPage && metadata?.trailer?.site?.toLowerCase() === 'youtube' && metadata.trailer.id) {
      return metadata.trailer.id;
    }
    return null;
  }, [metadata, activeVideoPath]);

  useEffect(() => {
    setTranscode(false);
    setError(null);
    setTranscodedUrl(null);
    setExtractedMedia(null);

    if (isWebUrl && !youtubeTrailerId) {
      if (window.electronAPI?.extractVideoStream) {
        setIsExtracting(true);
        window.electronAPI
          .extractVideoStream(activeVideoPath)
          .then(async (res) => {
            const extractedUrl = res?.url || res?.streamUrl || res?.embedUrl;
            if (res?.success && extractedUrl) {
              if (res.type === 'stream' && window.electronAPI?.getStreamUrl) {
                try {
                  const transcoded = await window.electronAPI.getStreamUrl({
                    filePath: extractedUrl,
                    referer: res.referer || activeVideoPath,
                  });
                  if (transcoded) {
                    setTranscodedUrl(transcoded);
                  }
                } catch (e) {
                  console.warn('Erro ao conectar ao servidor de streaming:', e);
                }
              }

              setExtractedMedia({
                type: res.type || 'embed',
                url: extractedUrl,
                referer: res.referer || activeVideoPath,
                servers: res.servers,
              });
            } else {
              setExtractedMedia({
                type: 'embed',
                url: activeVideoPath,
                referer: activeVideoPath,
              });
            }
          })
          .catch((err) => {
            console.warn('Erro ao extrair vídeo da web:', err);
            setExtractedMedia({
              type: 'embed',
              url: activeVideoPath,
              referer: activeVideoPath,
            });
          })
          .finally(() => {
            setIsExtracting(false);
          });
      } else {
        setExtractedMedia({
          type: 'embed',
          url: activeVideoPath,
          referer: activeVideoPath,
        });
      }
    } else if (directStream && /^https?:\/\//i.test(activeVideoPath) && /m3u8/i.test(activeVideoPath) && window.electronAPI?.getStreamUrl) {
      // HLS não toca direto no Chromium: converte já de início (com busca pelo ?ss=)
      let alive = true;
      window.electronAPI
        .getStreamUrl({ filePath: activeVideoPath, referer: streamReferer })
        .then((u) => {
          if (alive && typeof u === 'string' && u) setTranscodedUrl(u);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideoPath, isWebUrl, youtubeTrailerId]);

  // Legendas enviadas pela fonte (plugins): carrega a do idioma preferido
  useEffect(() => {
    if (!remoteSubtitles?.length || !window.electronAPI?.nuvioFetchText) return;
    let alive = true;
    const prefs = loadTrackPrefs();
    const want = (prefs.subLang && prefs.subLang !== 'off' ? [prefs.subLang] : []).concat(['pob', 'pt-br', 'por', 'pt', 'en', 'eng']);
    const score = (s: { language?: string; name?: string }) => {
      const l = `${s.language || ''} ${s.name || ''}`.toLowerCase();
      const i = want.findIndex((w) => l.includes(w));
      return i < 0 ? 99 : i;
    };
    const pick = [...remoteSubtitles].sort((a, b) => score(a) - score(b))[0];
    window.electronAPI
      .nuvioFetchText(pick.url)
      .then((res) => {
        if (!alive || !res?.success || !res.text) return;
        const cues = parseSubtitles(res.text, pick.url.split('?')[0]);
        if (cues.length === 0) return;
        setSubCues(cues);
        setSubName(pick.name || pick.language || t('Legenda'));
        setSubSource('file');
        setSubsEnabled(true);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remoteSubtitles]);

  const baseSrc = React.useMemo(() => {
    if (transcodedUrl) return transcodedUrl;
    if (extractedMedia?.type === 'stream') return extractedMedia.url;
    if (!activeVideoPath) return '';
    if (isWebUrl) return '';

    if (
      activeVideoPath.startsWith('http://') ||
      activeVideoPath.startsWith('https://') ||
      activeVideoPath.startsWith('blob:') ||
      activeVideoPath.startsWith('data:')
    ) {
      return activeVideoPath;
    }

    // Para arquivos MP4 e WebM locais: usa media-file:// direto (nativo, sem transcode, com seek)
    // (exceto quando o usuário escolheu outra faixa de áudio, que exige o FFmpeg)
    const ext = activeVideoPath.split('.').pop()?.toLowerCase();
    if (!transcode && pipeFor !== activeVideoPath && (ext === 'mp4' || ext === 'webm' || ext === 'm4v')) {
      if (typeof window !== 'undefined' && window.electronAPI?.toMediaUrl) {
        return window.electronAPI.toMediaUrl(activeVideoPath);
      }
    }

    if (typeof window !== 'undefined' && window.electronAPI?.mediaUrl) {
      return window.electronAPI.mediaUrl(activeVideoPath, transcode);
    }
    return `media://stream/${encodeURIComponent(activeVideoPath)}${transcode ? '?tr=1' : ''}`;
  }, [activeVideoPath, transcode, isWebUrl, transcodedUrl, extractedMedia, pipeFor]);

  // Vídeos convertidos pelo FFmpeg (media://) não permitem busca nativa: cada salto
  // reinicia a conversão a partir do ponto escolhido (?ss=) com a faixa de áudio escolhida (?a=).
  // O mesmo vale para o servidor local do FFmpeg (streams online convertidos, ex.: HLS): ?ss=
  const isServerStream = /^http:\/\/127\.0\.0\.1:\d+\/stream\?/.test(baseSrc);
  const isPiped = baseSrc.startsWith('media://') || isServerStream;
  const streamOffset = isPiped ? pipedOffset : 0;
  offsetRef.current = streamOffset;

  // Origem do stream convertido pelo servidor (para descobrir a duração e gerar prévias)
  const serverInput = React.useMemo(() => {
    if (!isServerStream) return null;
    try {
      const u = new URL(baseSrc);
      const input = u.searchParams.get('path') || '';
      return input ? { input, referer: u.searchParams.get('referer') || undefined } : null;
    } catch {
      return null;
    }
  }, [baseSrc, isServerStream]);

  const [remoteDuration, setRemoteDuration] = useState<{ input: string; d: number } | null>(null);
  useEffect(() => {
    if (!serverInput || !/^https?:/i.test(serverInput.input) || !window.electronAPI?.probeRemoteDuration) return;
    if (remoteDuration?.input === serverInput.input) return;
    let alive = true;
    window.electronAPI
      .probeRemoteDuration(serverInput.input, serverInput.referer)
      .then((res) => {
        if (alive && res?.success && res.duration) setRemoteDuration({ input: serverInput.input, d: res.duration });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverInput?.input, serverInput?.referer]);
  const pipedDuration =
    probeInfo?.duration || (remoteDuration && serverInput && remoteDuration.input === serverInput.input ? remoteDuration.d : 0);

  const src = React.useMemo(() => {
    if (!isPiped) return baseSrc;
    const params: string[] = [];
    if (streamOffset > 0) params.push(`ss=${streamOffset}`);
    if (audioIndex > 0 && !isServerStream) params.push(`a=${audioIndex}`);
    if (params.length === 0) return baseSrc;
    return `${baseSrc}${baseSrc.includes('?') ? '&' : '?'}${params.join('&')}`;
  }, [baseSrc, isPiped, isServerStream, streamOffset, audioIndex]);


  const handleError = async (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const v = e.currentTarget;
    const code = v.error?.code;

    // Erros de decodificação ou formato incompatível: transcodifica via FFmpeg ultrafast
    if (!transcodedUrl && (code === 3 || code === 4 || !code)) {
      // Arquivos locais: conversão completa pelo protocolo media:// (mantém busca e faixas)
      if (isLocalFile && !transcode) {
        setError(t('Convertendo o vídeo em tempo real (FFmpeg)…'));
        setSeekSel({ path: activeVideoPath, offset: Math.floor(getPos()) });
        setTranscode(true);
        return;
      }
      setError(t('Ajustando codecs em tempo real (FFmpeg H.264/AAC)...'));
      if (window.electronAPI?.getStreamUrl) {
        try {
          const target = extractedMedia?.url || activeVideoPath;
          const ref = streamReferer || extractedMedia?.referer || (target.startsWith('http') ? target : undefined);
          const streamUrl = await window.electronAPI.getStreamUrl({ filePath: target, referer: ref });
          if (typeof streamUrl === 'string' && streamUrl) {
            setTranscodedUrl(streamUrl);
            setError(null);
            return;
          }
        } catch (err) {
          console.warn('Erro ao acionar servidor FFmpeg:', err);
        }
      }
      setTranscode(true);
    } else if (v.error) {
      setError(MEDIA_ERRORS[v.error.code] || t('Erro de reprodução ({code})', { code: v.error.code }));
    }
  };

  // Load AniList metadata on mount
  useEffect(() => {
    if (activeVideoPath || actualTitle) {
      const searchTarget = actualTitle || activeVideoPath.split(/[\\/]/).pop() || '';
      if (searchTarget) {
        setLoadingMeta(true);
        fetchAnimeMetadata(searchTarget)
          .then((meta) => setMetadata(meta))
          .catch(() => {})
          .finally(() => setLoadingMeta(false));
      }
    }
  }, [activeVideoPath, actualTitle]);

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  // Posição/duração reais (somando o início do trecho convertido)
  const displayDuration = isPiped && pipedDuration ? pipedDuration : isFinite(duration) ? duration : 0;
  const durationRef = useRef(0);
  durationRef.current = displayDuration;
  const isPipedRef = useRef(false);
  isPipedRef.current = isPiped;
  const getPos = () => {
    const p = (videoRef.current?.currentTime || 0) + (isPipedRef.current ? offsetRef.current : 0);
    const d = durationRef.current;
    return d > 0 ? Math.min(p, d) : p;
  };
  const scrubUntilRef = useRef(0);
  const scrubTimerRef = useRef<number | null>(null);

  const seekTo = (t: number) => {
    const v = videoRef.current;
    const dur = durationRef.current;
    const target = Math.max(0, dur > 0 ? Math.min(t, dur - 1) : t);
    setCurrentTime(target);
    if (!isPipedRef.current) {
      if (v) v.currentTime = target;
      return;
    }
    // Dentro do trecho já convertido: busca direto, sem reiniciar a conversão
    const rel = target - offsetRef.current;
    // (só quando o navegador aceita buscar ali: em streams sem "Range" ele voltaria ao início)
    const inRanges = (r: TimeRanges) => {
      for (let i = 0; i < r.length; i++) if (rel >= r.start(i) && rel <= r.end(i) - 0.5) return true;
      return false;
    };
    if (v && rel >= 0 && inRanges(v.buffered) && inRanges(v.seekable)) {
      v.currentTime = rel;
      return;
    }
    autoPlayRef.current = v ? !v.paused : true;
    scrubUntilRef.current = Date.now() + 1500;
    setSeekSel({ path: activeVideoPathRef.current, offset: Math.floor(target) });
  };

  /** Salva a posição (por episódio) e atualiza o "Continuar assistindo" */
  const persistPos = (pos: number, dur: number, notify = false) => {
    saveVideoPosition(posKey, pos, dur);
    if (posKey !== activeVideoPath) saveVideoPosition(activeVideoPath, pos, dur);
    if (!activeVideoPath || youtubeTrailerId) return;
    const base = playData || { filePath: activeVideoPath, item: { path: activeVideoPath, name: actualTitle }, title: actualTitle, episodeUrl: currentEpisodeUrl };
    // Trocou de episódio dentro do player: reabre o episódio atual, não o primeiro
    const play =
      localOverridePath || (currentEpisodeUrl && base.episodeUrl && currentEpisodeUrl !== base.episodeUrl)
        ? { ...base, torrent: undefined, filePath: activeVideoPath, item: { path: activeVideoPath, name: actualTitle }, title: actualTitle, episodeUrl: currentEpisodeUrl }
        : base;
    recordResume(
      {
        key: posKey,
        title: actualTitle,
        workTitle: work?.title || episodeContext?.workTitle,
        workUrl: work?.url,
        cover: work?.cover || (typeof metadata?.coverImage === 'string' ? metadata.coverImage : metadata?.coverImage?.large || metadata?.coverImage?.extraLarge) || undefined,
        t: pos,
        d: dur,
        play,
      },
      notify
    );
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const pos = getPos();
    const dur = durationRef.current || (isFinite(v.duration) ? v.duration : 0);
    if (Date.now() > scrubUntilRef.current) setCurrentTime(pos);
    const now = Date.now();
    if (now - lastSavedRef.current > 5000) {
      lastSavedRef.current = now;
      persistPos(pos, dur);
    }
    // Marca o episódio como visto ao passar de 90%
    if (currentEpisodeUrl && !markedSeenRef.current && dur > 0 && pos / dur > 0.9) {
      markedSeenRef.current = true;
      updateChapterProgress('video', { [currentEpisodeUrl]: { read: true } });
    }
  };

  const handleLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v) return;
    setDuration(v.duration);
    v.volume = volume;
    v.muted = isMuted;
    v.playbackRate = playbackSpeed;
    applySubtitles(v);
    if (!autoPlayRef.current) {
      v.pause();
      autoPlayRef.current = true;
    }
    if (isPiped) {
      // A retomada já foi feita ao iniciar a conversão no ponto salvo
      if (streamOffset > 0 && resumeShownRef.current !== activeVideoPath && streamOffset === initialOffsets.current[activeVideoPath]) {
        resumeShownRef.current = activeVideoPath;
        setResumeNotice(t('Retomando de {time}', { time: formatTime(streamOffset) }));
        window.setTimeout(() => setResumeNotice(null), 3500);
      }
      return;
    }
    // Retoma de onde parou (somente na primeira carga desta mídia)
    const saved = readPos();
    if (saved > 5 && isFinite(v.duration) && saved < v.duration - 10 && v.currentTime < 1) {
      v.currentTime = saved;
      setResumeNotice(t('Retomando de {time}', { time: formatTime(saved) }));
      window.setTimeout(() => setResumeNotice(null), 3500);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    setCurrentTime(time);
    if (!isPiped) {
      if (videoRef.current) videoRef.current.currentTime = time;
      return;
    }
    // Arrastando a barra: só reinicia a conversão quando o usuário para
    scrubUntilRef.current = Date.now() + 2000;
    if (scrubTimerRef.current) window.clearTimeout(scrubTimerRef.current);
    scrubTimerRef.current = window.setTimeout(() => seekTo(time), 300);
  };

  // Ao soltar a barra em vídeos convertidos: aplica a busca na hora (sem esperar o atraso do arraste)
  const handleSeekCommit = (time: number) => {
    if (!isPiped || !Number.isFinite(time)) return;
    if (scrubTimerRef.current) window.clearTimeout(scrubTimerRef.current);
    scrubTimerRef.current = null;
    seekTo(time);
  };

  // Prévia da cena ao passar o mouse na barra
  const seekPreview: SeekPreviewSource = React.useMemo(() => {
    if (!src || !displayDuration) return null;
    if (isServerStream) return serverInput ? { mode: 'ffmpeg', input: serverInput.input, referer: serverInput.referer } : null;
    if (isPiped) return isLocalFile ? { mode: 'ffmpeg', input: activeVideoPath } : null;
    return { mode: 'video', src: baseSrc };
  }, [src, baseSrc, displayDuration, isServerStream, serverInput, isPiped, isLocalFile, activeVideoPath]);

  const selectAudioTrack = (index: number) => {
    setTracksMenuOpen(false);
    if (index === audioIndex) return;
    const track = probeInfo?.audio[index];
    if (track?.lang) saveTrackPrefs({ audioLang: track.lang.toLowerCase() });
    const v = videoRef.current;
    autoPlayRef.current = v ? !v.paused : true;
    const dur = durationRef.current;
    const pos = Math.floor(dur > 0 ? Math.min(getPos(), dur - 1) : getPos());
    if (!isPiped) setPipeFor(activeVideoPath);
    setSeekSel({ path: activeVideoPath, offset: pos });
    setAudioSel({ path: activeVideoPath, index });
  };

  const selectSubtitle = async (choice: 'off' | 'file' | number) => {
    setTracksMenuOpen(false);
    if (choice === 'off') {
      setSubsEnabled(false);
      saveTrackPrefs({ subLang: 'off' });
      return;
    }
    if (choice === 'file') {
      await handlePickSubtitle();
      return;
    }
    const track = probeInfo?.subtitles[choice];
    if (subSource === `emb:${choice}` && subCues) {
      setSubsEnabled(true);
    } else if (!(await loadEmbeddedSubtitle(choice, probeInfo))) {
      return;
    }
    saveTrackPrefs({ subLang: track?.lang?.toLowerCase() || undefined });
  };

  const setVolumeLevel = (val: number) => {
    const v = Math.min(1, Math.max(0, val));
    setVolume(v);
    setIsMuted(v === 0);
    if (videoRef.current) {
      videoRef.current.volume = v;
      videoRef.current.muted = v === 0;
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => setVolumeLevel(Number(e.target.value));

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    if (videoRef.current) {
      videoRef.current.muted = next;
      if (!next && videoRef.current.volume === 0) {
        videoRef.current.volume = 0.5;
        setVolume(0.5);
      }
    }
  };

  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
    }
  };

  // Persiste volume e velocidade
  useEffect(() => {
    try {
      localStorage.setItem(PLAYER_PREFS_KEY, JSON.stringify({ volume, muted: isMuted, speed: playbackSpeed }));
    } catch {
      /* ignore */
    }
  }, [volume, isMuted, playbackSpeed]);

  const skipTime = (seconds: number) => {
    if (!videoRef.current) return;
    seekTo(getPos() + seconds);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement && document.fullscreenElement === containerRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  // Ao trocar de aba: pausa o vídeo e salva a posição
  useEffect(() => {
    if (isTabActive) return;
    const v = videoRef.current;
    if (v && !v.paused) v.pause();
    if (v) persistPos(getPos(), durationRef.current, true);
    if (document.fullscreenElement && document.fullscreenElement === containerRef.current) {
      document.exitFullscreen().catch(() => {});
    }
  }, [isTabActive, activeVideoPath]);

  // Salva a posição ao fechar a aba
  useEffect(() => {
    return () => {
      const v = videoRef.current;
      if (v) persistPos(getPos(), durationRef.current, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeVideoPath]);

  // Atalhos de teclado (somente na aba ativa)
  useEffect(() => {
    if (!isTabActive) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const v = videoRef.current;
      if (!v) return;
      switch (e.key) {
        case ' ':
        case 'k':
        case 'K':
          e.preventDefault();
          if (v.paused) v.play().catch(() => {});
          else v.pause();
          break;
        case 'ArrowRight':
        case 'l':
        case 'L':
          e.preventDefault();
          seekTo(getPos() + (e.shiftKey ? 30 : e.key === 'ArrowRight' ? 5 : 10));
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          e.preventDefault();
          seekTo(getPos() - (e.shiftKey ? 30 : e.key === 'ArrowLeft' ? 5 : 10));
          break;
        case 'ArrowUp':
          e.preventDefault();
          setVolumeLevel((isMuted ? 0 : volume) + 0.05);
          break;
        case 'ArrowDown':
          e.preventDefault();
          setVolumeLevel((isMuted ? 0 : volume) - 0.05);
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          toggleMute();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          toggleFullscreen();
          break;
        case 'c':
        case 'C':
          e.preventDefault();
          setSubsEnabled((x) => !x);
          break;
        case 'n':
        case 'N':
          if (nextEpisode) {
            e.preventDefault();
            goToEpisode(nextEpisode);
          }
          break;
        case '>':
          e.preventDefault();
          handleSpeedChange(Math.min(3, Math.round((playbackSpeed + 0.25) * 100) / 100));
          break;
        case '<':
          e.preventDefault();
          handleSpeedChange(Math.max(0.25, Math.round((playbackSpeed - 0.25) * 100) / 100));
          break;
        default:
          if (/^[0-9]$/.test(e.key) && durationRef.current > 0) {
            e.preventDefault();
            seekTo((durationRef.current * Number(e.key)) / 10);
          }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTabActive, volume, isMuted, playbackSpeed, nextEpisode]);

  // Capture frame from canvas
  const handleCaptureFrame = async () => {
    if (!videoRef.current) return;
    try {
      setSavingFrame(true);
      const frameBase64 = captureFrameFromElement(videoRef.current);
      setCapturedFrame(frameBase64);

      if (window.electronAPI?.saveFileDialog) {
        const defaultName = `${actualTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_thumb.jpg`;
        const res = await window.electronAPI.saveFileDialog({
          defaultName,
          dataBase64: frameBase64
        });
        if (res.success) {
          setFrameSavedNotice(true);
          setTimeout(() => setFrameSavedNotice(false), 3000);
        }
      }
    } catch (err) {
      console.error('Frame capture error:', err);
    } finally {
      setSavingFrame(false);
    }
  };

  const handlePickLocalFile = async () => {
    if (window.electronAPI?.openFileDialog) {
      try {
        const picked = await window.electronAPI.openFileDialog({
          title: t('Selecionar arquivo de vídeo para reproduzir'),
          filters: [
            { name: t('Arquivos de Vídeo'), extensions: ['mp4', 'mkv', 'avi', 'webm', 'mov', 'flv', 'wmv', 'm4v'] },
            { name: t('Todos os arquivos'), extensions: ['*'] }
          ]
        });
        if (picked) {
          setLocalOverridePath(picked);
          setError(null);
          setTranscode(false);
        }
      } catch (err) {
        console.error('Erro ao selecionar arquivo local:', err);
      }
    }
  };

  const handleOpenWebview = () => {
    const target = activeVideoPath;
    if (onOpenTab) {
      onOpenTab('webview', actualTitle, {
        url: target,
        initialUrl: target,
      });
    }
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full w-full bg-canvas text-fg-2 select-none overflow-hidden relative"
    >
      {onlineSubsOpen && (
        <OnlineSubtitlesDialog
          name={actualTitle}
          stremio={stremioRef}
          onClose={() => setOnlineSubsOpen(false)}
          onLoad={(text, label) => {
            const cues = parseSubtitles(text, 'online.srt');
            if (cues.length === 0) return false;
            setSubCues(cues);
            setSubName(label);
            setSubSource('file');
            setSubsEnabled(true);
            return true;
          }}
        />
      )}
      {/* Top Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-surface border-b border-line text-xs z-10">
        <div className="flex items-center gap-2 truncate max-w-lg">
          <Film size={16} className="text-purple-400 flex-shrink-0" />
          <span className="font-semibold text-fg truncate">{actualTitle}</span>
          {frameSavedNotice && (
            <span className="flex items-center gap-1 text-[11px] bg-emerald-950 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
              <Check size={12} /> {t('Capa Salva!')}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {nextEpisode && (
            <button
              type="button"
              onClick={() => goToEpisode(nextEpisode)}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-accent hover:bg-accent-hover text-accent-fg rounded transition-colors cursor-pointer"
              title={t('Próximo: {name}', { name: nextEpisode.name || t('Episódio {n}', { n: nextEpisode.number ?? '' }).trim() })}
            >
              <SkipForward size={14} />
              <span className="text-xs font-semibold hidden sm:inline">{t('Próximo episódio')}</span>
            </button>
          )}

          {!isLocalFile && !!currentEpisodeUrl && !youtubeTrailerId && (
            <button
              type="button"
              onClick={() => {
                const ctxEp = orderedEpisodes.find((e) => e.url === currentEpisodeUrl);
                const n = Number(ctxEp?.number) || Number((actualTitle.match(/(?:Epis[oó]dio|\bE)\s*(\d{1,4})\b/i) || [])[1]) || 1;
                const workTitle = work?.title || episodeContext?.workTitle || actualTitle.split(' - ')[0];
                if (String(work?.url || '').startsWith('nuvio:')) {
                  onOpenTab?.('anime-detail', workTitle, { anime: { url: work!.url, title: workTitle, cover: work?.cover }, focusEpisode: currentEpisodeUrl });
                  return;
                }
                openWatchSources({
                  title: workTitle,
                  kind: stremioRef?.type === 'movie' ? 'movie' : 'series',
                  episode: n,
                  cover: work?.cover,
                  episodeUrl: currentEpisodeUrl,
                  workUrl: work?.url,
                  episodeUrls: orderedEpisodes.length ? Object.fromEntries(orderedEpisodes.filter((e) => e.number != null).map((e) => [String(e.number), e.url])) : undefined,
                });
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-subtle hover:bg-elevated text-fg-2 hover:text-white rounded border border-line transition-colors cursor-pointer"
              title={t('Trocar de fonte: procurar este episódio em outros sites, plugins e addons')}
            >
              <Radio size={14} />
              <span className="text-xs font-medium hidden sm:inline">{t('Outras fontes')}</span>
            </button>
          )}

          {!isWebUrl && (
            <button
              type="button"
              onClick={handlePickSubtitle}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-subtle hover:bg-elevated text-fg-2 hover:text-white rounded border border-line transition-colors cursor-pointer"
              title={subName ? t('Legenda: {name} — clique para trocar', { name: subName }) : t('Carregar legenda (.srt, .vtt, .ass)')}
            >
              <Captions size={14} className={subName ? 'text-accent' : ''} />
              <span className="text-xs font-medium hidden sm:inline max-w-[140px] truncate">{subName ? t('Trocar legenda') : t('Legenda')}</span>
            </button>
          )}

          {/* Vincular Vídeo Local */}
          <button
            type="button"
            onClick={handlePickLocalFile}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-subtle hover:bg-elevated text-fg-2 hover:text-white rounded border border-line transition-colors cursor-pointer"
            title={t('Trocar ou vincular arquivo de vídeo local do computador')}
          >
            <FolderPlus size={14} className="text-accent" />
            <span className="text-xs font-medium hidden sm:inline">{t('Vincular Arquivo')}</span>
          </button>

          {/* Capture Frame Button (disponível quando houver vídeo nativo) */}
          {!isWebUrl && (
            <button
              type="button"
              onClick={handleCaptureFrame}
              disabled={savingFrame}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-subtle hover:bg-elevated text-fg-2 hover:text-white rounded border border-line transition-colors cursor-pointer"
              title={t('Capturar frame atual para capa')}
            >
              <Camera size={14} className="text-amber-400" />
              <span className="text-xs font-medium hidden sm:inline">{t('Extrair Capa')}</span>
            </button>
          )}

          {/* AniList Metadata Toggle */}
          <button
            type="button"
            onClick={() => setShowMetaPanel(!showMetaPanel)}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded border transition-colors cursor-pointer ${
              showMetaPanel || metadata
                ? 'bg-subtle text-accent border-accent'
                : 'text-fg-muted hover:text-white border-line hover:bg-subtle'
            }`}
            title={t('Metadados do Anime (AniList)')}
          >
            <Sparkles size={14} />
            <span className="text-xs font-medium">AniList</span>
          </button>

          {/* Optional Close Button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs text-fg-muted hover:text-white px-2.5 py-1 rounded border border-line hover:bg-subtle transition-colors cursor-pointer"
            >
              {t('Fechar')}
            </button>
          )}
        </div>
      </div>

      {/* Main Player & Sidebar Container */}
      <div className="flex-1 flex overflow-hidden relative bg-black">
        {isExtracting ? (
          <div className="flex-1 flex flex-col items-center justify-center bg-canvas p-8 gap-3 text-center">
            <Loader2 size={36} className="text-accent animate-spin" />
            <h3 className="text-sm font-semibold text-fg">{t('Preparando reprodutor integrado...')}</h3>
            <p className="text-xs text-fg-muted">{t('Sincronizando fluxo da obra e inicializando player na plataforma.')}</p>
          </div>
        ) : youtubeTrailerId ? (
          <div className="w-full h-full max-w-5xl flex flex-col gap-3 mx-auto p-4">
            <div className="flex-1 rounded-lg overflow-hidden border border-line shadow-2xl bg-black min-h-[300px]">
              <iframe
                src={`https://www.youtube.com/embed/${youtubeTrailerId}?autoplay=1&enablejsapi=1`}
                title={actualTitle}
                className="w-full h-full border-0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-fg-muted px-1 bg-surface p-3 rounded-lg border border-line">
              <span className="text-left">
                {t('Reproduzindo trailer oficial do anime via YouTube.')}
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePickLocalFile}
                  className="px-3.5 py-1.5 bg-success hover:bg-success-hover text-white rounded-md font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
                >
                  <FolderPlus size={13} />
                  <span>{t('Vincular Vídeo Local')}</span>
                </button>
              </div>
            </div>
          </div>
        ) : extractedMedia?.type === 'embed' ? (
          <div className="flex-1 w-full h-full relative bg-black flex flex-col">
            {extractedMedia.servers && extractedMedia.servers.length > 1 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border-b border-line overflow-x-auto shrink-0 text-xs z-10">
                <span className="text-fg-muted font-semibold mr-1 flex items-center gap-1">
                  <Play size={11} className="text-accent fill-current" /> {t('Servidores:')}
                </span>
                {extractedMedia.servers.map((srv, idx) => {
                  const isActive = extractedMedia.url === srv.url;
                  return (
                    <button
                      key={srv.url + idx}
                      type="button"
                      onClick={() => setExtractedMedia({ ...extractedMedia, url: srv.url })}
                      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer shrink-0 border ${
                        isActive
                          ? 'bg-success text-white border-success shadow-sm'
                          : 'bg-subtle text-fg-2 hover:text-white border-line hover:bg-elevated'
                      }`}
                    >
                      {srv.name}
                    </button>
                  );
                })}
              </div>
            )}
            <iframe
              key={extractedMedia.url}
              src={extractedMedia.url}
              title={actualTitle}
              className="w-full h-full border-0 flex-1"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
            />
          </div>
        ) : (
          /* Video Element Nativo / Stream direto / Transcode FFmpeg */
          <div className="flex-1 relative flex items-center justify-center">
            <video
              key={src}
              ref={videoRef}
              src={src}
              controls={false}
              autoPlay={isTabActive}
              preload="metadata"
              style={{ width: '100%', height: '100%', background: '#000' }}
              onPlay={() => setIsPlaying(true)}
              onPlaying={() => setError(null)}
              onPause={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onError={handleError}
              onClick={togglePlay}
              onDoubleClick={toggleFullscreen}
              onEnded={() => {
                if (nextEpisode) setNextCountdown(8);
              }}
              className="max-h-full max-w-full cursor-pointer"
            />

            {nextCountdown !== null && nextEpisode && (
              <div className="absolute bottom-6 right-6 z-30 w-72 rounded-xl bg-surface/95 border border-line shadow-pop p-4 animate-tp-slide-up">
                <div className="text-[11px] uppercase tracking-wider text-fg-muted mb-1">{t('Próximo episódio em {n}s', { n: nextCountdown })}</div>
                <div className="text-[13px] font-medium text-fg truncate mb-3">{nextEpisode.name || t('Episódio {n}', { n: nextEpisode.number ?? '' }).trim()}</div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setNextCountdown(null)} className="flex-1 h-8 rounded-md bg-subtle hover:bg-elevated text-fg-2 text-xs font-medium cursor-pointer">
                    {t('Cancelar')}
                  </button>
                  <button type="button" onClick={() => goToEpisode(nextEpisode)} className="flex-1 h-8 rounded-md bg-accent hover:bg-accent-hover text-accent-fg text-xs font-semibold cursor-pointer inline-flex items-center justify-center gap-1">
                    <SkipForward size={13} /> {t('Assistir agora')}
                  </button>
                </div>
              </div>
            )}

            {resumeNotice && (
              <div className="absolute bottom-4 left-4 z-20 px-3 py-1.5 rounded-md bg-surface/90 border border-line text-xs text-fg shadow-pop pointer-events-none animate-tp-fade-in">
                {resumeNotice}
              </div>
            )}

            {error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-surface/95 border border-warning/60 text-warning px-4 py-2 rounded-lg shadow-xl text-xs z-20 max-w-lg text-center pointer-events-none backdrop-blur-sm">
                <AlertCircle size={16} className="text-warning shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Center Play Overlay when Paused */}
            {!isPlaying && (
              <div 
                onClick={togglePlay}
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
              >
                <div className="w-16 h-16 rounded-full bg-surface/90 border border-line flex items-center justify-center text-accent hover:scale-110 transition-transform">
                  <Play size={28} className="ml-1" />
                </div>
              </div>
            )}
          </div>
        )}

        {/* AniList Metadata Side Drawer */}
        {showMetaPanel && (
          <aside className="w-80 bg-surface border-l border-line p-4 overflow-y-auto flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-line pb-2">
              <span className="text-xs font-semibold text-fg flex items-center gap-1.5">
                <Sparkles size={14} className="text-accent" /> {t('Metadados AniList')}
              </span>
              <button
                onClick={() => setShowMetaPanel(false)}
                className="text-fg-muted hover:text-white text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            {loadingMeta ? (
              <div className="text-xs text-fg-muted py-8 text-center">{t('Buscando no AniList...')}</div>
            ) : metadata ? (
              <div className="flex flex-col gap-3 text-xs">
                {/* Cover poster */}
                {metadata.coverImage?.extraLarge && (
                  <img
                    src={metadata.coverImage.extraLarge}
                    alt={metadata.title.romaji}
                    className="w-full h-48 object-cover rounded-md shadow border border-line"
                  />
                )}

                <div>
                  <h4 className="font-bold text-fg text-sm leading-snug">
                    {metadata.title.romaji}
                  </h4>
                  {metadata.title.english && (
                    <p className="text-fg-muted text-[11px] italic mt-0.5">
                      {metadata.title.english}
                    </p>
                  )}
                </div>

                {/* Badges */}
                <div className="flex flex-wrap gap-1">
                  {metadata.format && (
                    <span className="bg-subtle text-accent px-2 py-0.5 rounded text-[10px] font-mono border border-line">
                      {metadata.format}
                    </span>
                  )}
                  {!!metadata.episodes && (
                    <span className="bg-subtle text-success-fg px-2 py-0.5 rounded text-[10px] font-mono border border-line">
                      {t('{n} eps', { n: metadata.episodes })}
                    </span>
                  )}
                  {!!metadata.averageScore && (
                    <span className="bg-subtle text-warning px-2 py-0.5 rounded text-[10px] font-mono border border-line">
                      ★ {metadata.averageScore}%
                    </span>
                  )}
                  {metadata.startDate?.year && (
                    <span className="bg-subtle text-fg-muted px-2 py-0.5 rounded text-[10px] font-mono border border-line">
                      {metadata.startDate.year}
                    </span>
                  )}
                </div>

                {/* Genres */}
                {metadata.genres && metadata.genres.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {metadata.genres.map((g) => (
                      <span key={g} className="bg-canvas text-fg-muted px-1.5 py-0.5 rounded text-[10px] border border-line">
                        {g}
                      </span>
                    ))}
                  </div>
                )}

                {/* Synopsis */}
                {metadata.description && (
                  <div 
                    className="text-fg-muted text-[11px] leading-relaxed max-h-48 overflow-y-auto bg-canvas p-2.5 rounded border border-line"
                    dangerouslySetInnerHTML={{ __html: metadata.description }}
                  />
                )}
              </div>
            ) : (
              <div className="text-xs text-fg-muted text-center py-8">
                {t('Nenhum resultado encontrado para esta mídia no AniList.')}
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Video Controls Bar para mídia nativa */}
      {!youtubeTrailerId && !isExtracting && extractedMedia?.type !== 'embed' && (
        <div className="px-4 py-2.5 bg-surface border-t border-line flex flex-col gap-2">
          {/* Progress Bar / Scrubber */}
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono text-fg-muted w-12 text-right">
              {formatTime(currentTime)}
            </span>
            <SeekBar
              currentTime={currentTime}
              duration={displayDuration}
              onSeekInput={handleSeek}
              onSeekCommit={handleSeekCommit}
              preview={seekPreview}
              formatTime={formatTime}
              ariaLabel={t('Posição do vídeo')}
            />
            <span className="text-[11px] font-mono text-fg-muted w-12">
              {formatTime(displayDuration)}
            </span>
          </div>

          {/* Buttons and Settings */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Play/Pause */}
              <button
                type="button"
                onClick={togglePlay}
                className="p-1.5 bg-subtle hover:bg-elevated text-white rounded transition-colors cursor-pointer"
              >
                {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
              </button>

              {/* Skip -10s / +10s */}
              <button
                type="button"
                onClick={() => skipTime(-10)}
                className="p-1 text-fg-muted hover:text-white transition-colors cursor-pointer"
                title={t('Voltar 10s')}
              >
                <RotateCcw size={15} />
              </button>
              <button
                type="button"
                onClick={() => skipTime(10)}
                className="p-1 text-fg-muted hover:text-white transition-colors cursor-pointer"
                title={t('Avançar 10s')}
              >
                <RotateCw size={15} />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5 ml-2">
                <button
                  type="button"
                  onClick={toggleMute}
                  className="p-1 text-fg-muted hover:text-white transition-colors cursor-pointer"
                >
                  {isMuted || volume === 0 ? <VolumeX size={16} /> : <Volume2 size={16} />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-16 accent-accent h-1 bg-elevated rounded cursor-pointer"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Playback speed selector */}
              <div className="flex items-center gap-1 bg-canvas px-2 py-0.5 rounded border border-line text-[11px]">
                {[0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSpeedChange(s)}
                    className={`px-1 rounded cursor-pointer ${
                      playbackSpeed === s ? 'text-accent font-bold' : 'text-fg-muted hover:text-white'
                    }`}
                  >
                    {s}x
                  </button>
                ))}
              </div>

              {(
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTracksMenuOpen((o) => !o)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded transition-colors cursor-pointer text-xs ${tracksMenuOpen ? 'bg-subtle text-fg' : 'text-fg-muted hover:text-white hover:bg-subtle'}`}
                    title={t('Faixas de áudio e legendas')}
                    aria-haspopup="menu"
                    aria-expanded={tracksMenuOpen}
                  >
                    {subLoading ? <Loader2 size={15} className="animate-spin" /> : <AudioLines size={15} />}
                    <span className="hidden md:inline">{isLocalFile && probeInfo && probeInfo.audio.length > 1 ? t('Áudio e legendas') : t('Legendas')}</span>
                  </button>
                  {tracksMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setTracksMenuOpen(false)} aria-hidden />
                      <div role="menu" className="absolute bottom-full right-0 mb-2 z-40 w-72 max-h-[60vh] overflow-y-auto rounded-xl bg-elevated border border-line shadow-pop p-1.5 text-xs animate-tp-fade-in">
                        {probeInfo && probeInfo.audio.length > 0 && (
                          <>
                            <div className="px-2.5 pt-1.5 pb-1 text-[10px] uppercase tracking-wider text-fg-muted font-semibold">{t('Áudio')}</div>
                            {probeInfo.audio.map((tr) => (
                              <button
                                key={`a${tr.index}`}
                                type="button"
                                role="menuitemradio"
                                aria-checked={audioIndex === tr.index}
                                onClick={() => selectAudioTrack(tr.index)}
                                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-subtle text-left cursor-pointer"
                              >
                                <span className="w-4 shrink-0 text-accent">{audioIndex === tr.index && <Check size={13} />}</span>
                                <span className="flex-1 truncate text-fg">{trackLabel(tr, 'Faixa')}</span>
                                <span className="text-[10px] text-fg-muted font-mono uppercase">{tr.codec}</span>
                              </button>
                            ))}
                          </>
                        )}
                        <div className="px-2.5 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-fg-muted font-semibold">{t('Legendas')}</div>
                        <button
                          type="button"
                          role="menuitemradio"
                          aria-checked={!subCues || !subsEnabled}
                          onClick={() => selectSubtitle('off')}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-subtle text-left cursor-pointer"
                        >
                          <span className="w-4 shrink-0 text-accent">{(!subCues || !subsEnabled) && <Check size={13} />}</span>
                          <span className="flex-1 text-fg">{t('Desativadas')}</span>
                        </button>
                        {(probeInfo?.subtitles || []).map((tr) => {
                          const active = !!subCues && subsEnabled && subSource === `emb:${tr.index}`;
                          return (
                            <button
                              key={`s${tr.index}`}
                              type="button"
                              role="menuitemradio"
                              aria-checked={active}
                              disabled={!tr.isText || subLoading}
                              onClick={() => selectSubtitle(tr.index)}
                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-subtle text-left cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                              title={tr.isText ? undefined : t('Legenda em imagem (PGS/VobSub) — não suportada')}
                            >
                              <span className="w-4 shrink-0 text-accent">{active && <Check size={13} />}</span>
                              <span className="flex-1 truncate text-fg">{trackLabel(tr, 'Legenda')}</span>
                              <span className="text-[10px] text-fg-muted font-mono uppercase">{tr.isText ? tr.codec.replace('subrip', 'srt') : t('imagem')}</span>
                            </button>
                          );
                        })}
                        {subSource === 'file' && subCues && (
                          <div className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left">
                            <span className="w-4 shrink-0 text-accent">{subsEnabled && <Check size={13} />}</span>
                            <span className="flex-1 truncate text-fg">{subName}</span>
                            <span className="text-[10px] text-fg-muted">{t('arquivo')}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setTracksMenuOpen(false);
                            setOnlineSubsOpen(true);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-subtle text-left cursor-pointer text-fg-2"
                        >
                          <span className="w-4 shrink-0" />
                          <span className="flex-1">{t('Buscar legendas online…')}</span>
                          <ChevronRight size={13} className="text-fg-muted" />
                        </button>
                        <button
                          type="button"
                          onClick={() => selectSubtitle('file')}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-subtle text-left cursor-pointer text-fg-2"
                        >
                          <span className="w-4 shrink-0" />
                          <span className="flex-1">{t('Carregar arquivo de legenda…')}</span>
                          <ChevronRight size={13} className="text-fg-muted" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {subCues && (
                <button
                  type="button"
                  onClick={() => setSubsEnabled((v) => !v)}
                  className={`p-1.5 rounded transition-colors cursor-pointer ${subsEnabled ? 'text-accent hover:bg-subtle' : 'text-fg-muted hover:text-white hover:bg-subtle'}`}
                  title={subsEnabled ? t('Ocultar legendas (C)') : t('Mostrar legendas (C)')}
                >
                  {subsEnabled ? <Captions size={16} /> : <CaptionsOff size={16} />}
                </button>
              )}

              {/* Fullscreen */}
              <button
                type="button"
                onClick={toggleFullscreen}
                className="p-1.5 text-fg-muted hover:text-white hover:bg-subtle rounded transition-colors cursor-pointer"
                title={t('Tela Cheia')}
              >
                {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
