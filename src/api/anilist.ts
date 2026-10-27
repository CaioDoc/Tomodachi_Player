import type { AnimeMetadata } from '../types';

export function cleanSearchQuery(rawName: string): string {
  let cleaned = rawName;
  // Remove file extension
  cleaned = cleaned.replace(/\.(mp4|mkv|webm|avi|mov|wmv|flv)$/i, '');
  // Remove release groups and tags in brackets [SubsPlease], (1080p), [HEVC], etc.
  cleaned = cleaned.replace(/\[.*?\]|\(.*?\)/g, ' ');
  // Remove episode patterns: " - 01", " E01", " Episode 1", " 01 "
  cleaned = cleaned.replace(/\b(e|ep|episode)?\s*\d{1,3}\b/i, ' ');
  // Remove common video metadata words
  cleaned = cleaned.replace(/\b(1080p|720p|480p|4k|2160p|bdrip|web-dl|x264|x265|hevc|aac)\b/gi, ' ');
  // Replace underscores and dots with spaces
  cleaned = cleaned.replace(/[._]/g, ' ');
  // Collapse whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

const ANILIST_QUERY = `
query ($search: String) {
  Media (search: $search, type: ANIME) {
    id
    title {
      romaji
      english
      native
    }
    coverImage {
      extraLarge
      large
      medium
      color
    }
    bannerImage
    description
    episodes
    status
    genres
    averageScore
    format
    startDate {
      year
    }
    trailer {
      id
      site
    }
  }
}
`;

export async function fetchAnimeMetadata(searchQuery: string): Promise<AnimeMetadata | null> {
  const cleaned = cleanSearchQuery(searchQuery);
  if (!cleaned) return null;

  try {
    const res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        query: ANILIST_QUERY,
        variables: { search: cleaned }
      })
    });

    if (!res.ok) {
      console.warn(`AniList request returned status: ${res.status}`);
      return null;
    }

    const data = await res.json();
    return data?.data?.Media || null;
  } catch (err) {
    console.error('Error fetching AniList metadata:', err);
    return null;
  }
}

export async function fetchAnimePoster(searchQuery: string): Promise<string | null> {
  const meta = await fetchAnimeMetadata(searchQuery);
  return meta?.coverImage?.extraLarge || meta?.coverImage?.large || null;
}
