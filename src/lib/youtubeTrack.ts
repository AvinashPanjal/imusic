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

function cleanTitle(rawTitle: string, authorName?: string): { title: string; artist: string } {
  let text = (rawTitle || '').trim();

  // Strip common noisy video tags
  text = text
    .replace(/\s*\[(?:Official\s*)?(?:Music\s*)?(?:Video|Audio|HD|4K|Visualizer|Lyric\s*Video|Lyrics|Full\s*(?:Song|Video|Audio)|Lyrical|4K\s*Video)\]/gi, '')
    .replace(/\s*\((?:Official\s*)?(?:Music\s*)?(?:Video|Audio|HD|4K|Visualizer|Lyric\s*Video|Lyrics|Full\s*(?:Song|Video|Audio)|Lyrical|4K\s*Video)\)/gi, '')
    .trim();

  let title = text;
  let artist = authorName || 'YouTube';

  // 1. Pipe format e.g. "Song Name | Movie Name | Artists"
  const pipeParts = text.split('|').map((p) => p.trim()).filter(Boolean);
  if (pipeParts.length > 1) {
    title = pipeParts[0];
    artist = pipeParts.slice(1).join(', ');
  }

  // 2. Colon format e.g. "ANIMAL: SATRANGA" or "Leo: Badass"
  if (title.includes(':')) {
    const colonParts = title.split(':').map((p) => p.trim()).filter(Boolean);
    if (colonParts.length === 2) {
      title = colonParts[1];
      artist = colonParts[0] + (artist ? ', ' + artist : '');
    }
  }

  // 3. Hyphen format e.g. "Kaavaalaa - Lyric Video" or "Artist - Song"
  if (title.includes(' - ')) {
    const hypParts = title.split(' - ').map((p) => p.trim()).filter(Boolean);
    if (hypParts.length === 2) {
      if (/lyric|audio|video|teaser|trailer|song/i.test(hypParts[1])) {
        title = hypParts[0];
      } else if (/lyric|audio|video|teaser|trailer|song/i.test(hypParts[0])) {
        title = hypParts[1];
      } else if (authorName && authorName.toLowerCase().includes(hypParts[0].toLowerCase())) {
        artist = hypParts[0];
        title = hypParts[1];
      } else {
        title = hypParts[0];
      }
    }
  }

  return { title: title.trim() || 'YouTube Audio Track', artist: artist.trim() || 'YouTube' };
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
      const parsed = cleanTitle(data.title || '', data.author_name);
      title = parsed.title;
      artist = parsed.artist || data.author_name || 'YouTube';
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
