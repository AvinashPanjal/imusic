import { TrackData } from '@/types/music';

/**
 * Robust YouTube URL parser & ID extractor
 * Matches standard videos, youtu.be, music.youtube.com, embeds, and shorts.
 */
export function extractYouTubeVideoId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // If already an 11-character YouTube video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  // Handle prefix if present (e.g. yt-...)
  if (trimmed.startsWith('yt-')) {
    const raw = trimmed.replace('yt-', '');
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
  }

  // Regex for all YouTube URL variants
  const patterns = [
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/i,
    /[?&]v=([a-zA-Z0-9_-]{11})/i,
  ];

  for (const regex of patterns) {
    const match = trimmed.match(regex);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

function cleanTitle(title: string): { title: string; artist: string } {
  if (!title) return { title: 'YouTube Audio Track', artist: 'YouTube' };
  
  // Clean standard noise
  let cleaned = title
    .replace(/\s*\(Official\s*(?:Music\s*)?(?:Video|Audio|Lyric\s*Video|HD|4K|Visualizer)?\)/gi, '')
    .replace(/\s*\[Official\s*(?:Music\s*)?(?:Video|Audio|Lyric\s*Video|HD|4K|Visualizer)?\]/gi, '')
    .replace(/\s*\(Full\s*(?:Song|Video|Audio)\)/gi, '')
    .replace(/\s*\[Full\s*(?:Song|Video|Audio)\]/gi, '')
    .replace(/\s*\(Lyric\s*Video\)/gi, '')
    .replace(/\s*\[Lyric\s*Video\]/gi, '')
    .replace(/\s*\(Audio\)/gi, '')
    .replace(/\s*\[Audio\]/gi, '')
    .replace(/\s*\(Video\)/gi, '')
    .replace(/\s*\[Video\]/gi, '')
    .replace(/\s*\|.*$/g, '')
    .trim();

  // Often titles are formatted as "Artist - Song Name"
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts.length >= 2) {
      const art = parts[0].trim();
      const song = parts.slice(1).join(' - ').trim();
      if (art && song) {
        return { title: song, artist: art };
      }
    }
  }

  return { title: cleaned, artist: 'YouTube' };
}

/**
 * Fetches video metadata via YouTube oEmbed without requiring any API keys
 */
export async function fetchYouTubeTrackInfo(urlOrId: string): Promise<TrackData | null> {
  const videoId = extractYouTubeVideoId(urlOrId);
  if (!videoId) return null;

  const standardThumb = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
  let title = 'YouTube Audio Track';
  let artist = 'YouTube';
  let thumbnail = standardThumb;

  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      const parsed = cleanTitle(data.title || '');
      title = parsed.title;
      artist = data.author_name || parsed.artist;
      thumbnail = data.thumbnail_url || standardThumb;
    }
  } catch (err) {
    console.warn('Could not fetch oembed for YouTube video:', err);
  }

  const track: TrackData = {
    id: `yt-${videoId}`,
    title,
    duration: 210,
    artists: [
      {
        id: `yt_art_${videoId}`,
        name: artist,
        image: thumbnail,
      },
    ],
    album: {
      id: `yt_alb_${videoId}`,
      title: 'YouTube Stream',
      coverImage: thumbnail,
      releaseYear: new Date().getFullYear(),
      isLossless: false,
    },
    streamUrl: `/api/stream/yt?v=${videoId}`,
    providerCode: 'youtube',
    assets: [
      {
        id: `yt_asset_${videoId}`,
        trackId: `yt-${videoId}`,
        format: 'm4a',
        codec: 'AAC',
        bitrate: 160,
        isLossless: false,
        isHiRes: false,
        storageType: 'remote_stream',
        storageKey: `/api/stream/yt?v=${videoId}`,
        duration: 210,
      },
    ],
  };

  return track;
}
