import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { TrackData } from '@/types/music';

function cleanYouTubeTitle(title: string): string {
  if (!title) return 'Unknown Title';
  return title
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
}

function parseDurationToSeconds(durationText?: string): number {
  if (!durationText) return 180;
  const parts = durationText.split(':').map((p) => parseInt(p, 10));
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 180;
}

export async function searchYouTubeVideos(query: string, limit = 15): Promise<any[]> {
  try {
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&gl=IN&hl=en-GB`;
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-IN,en;q=0.9,ml;q=0.8,ta;q=0.7',
      },
      cache: 'no-store',
    });

    if (!res.ok) return [];

    const html = await res.text();
    const match =
      html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
      html.match(/ytInitialData\s*=\s*({[\s\S]*?});/);

    if (!match) return [];

    const data = JSON.parse(match[1]);
    const contents =
      data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer
        ?.contents?.[0]?.itemSectionRenderer?.contents || [];

    const videos: any[] = [];
    for (const item of contents) {
      if (item.videoRenderer) {
        const vr = item.videoRenderer;
        const videoId = vr.videoId;
        if (!videoId) continue;

        const rawTitle = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Unknown Video';
        const channelName =
          vr.ownerText?.runs?.[0]?.text || vr.shortBylineText?.runs?.[0]?.text || 'YouTube Creator';
        const durationText = vr.lengthText?.simpleText;
        const thumbnail =
          vr.thumbnail?.thumbnails?.slice(-1)[0]?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        videos.push({
          id: videoId,
          title: rawTitle,
          channel: channelName,
          durationText,
          thumbnail,
        });

        if (videos.length >= limit) break;
      }
    }

    return videos;
  } catch (err) {
    console.warn('Error scraping YouTube search:', err);
    return [];
  }
}

export class YouTubeProvider implements CatalogueProvider {
  public readonly code = 'youtube';
  public readonly name = 'YouTube Music';
  public readonly description = 'Infinite global music library: covers, live tracks, and all regional classics';
  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: true,
    canFetchArtwork: true,
    canFetchMetadata: true,
    canPlayFullTracks: true,
    canPlayPreviews: false,
    canFetchLyrics: false,
    canDownloadCache: false,
    hasAudioQualityMetadata: true,
  };

  public async search(query: string): Promise<ProviderSearchResult> {
    if (!query || query.trim().length === 0) {
      return {
        providerCode: this.code,
        providerName: this.name,
        tracks: [],
        albums: [],
        artists: [],
      };
    }

    const videos = await searchYouTubeVideos(query, 12);
    const tracks: TrackData[] = videos.map((v, i) => {
      const cleanTitle = cleanYouTubeTitle(v.title);
      const durationSeconds = parseDurationToSeconds(v.durationText);
      const trackId = `yt-${v.id}`;

      return {
        id: trackId,
        title: cleanTitle,
        duration: durationSeconds,
        streamUrl: `/api/stream/yt?v=${v.id}`,
        trackNumber: i + 1,
        genre: 'YouTube Music',
        artists: [
          {
            id: `yt-author-${encodeURIComponent(v.channel)}`,
            name: v.channel,
            image: v.thumbnail,
          },
        ],
        album: {
          id: `yt-album-${v.id}`,
          title: cleanTitle,
          coverImage: v.thumbnail,
          releaseYear: new Date().getFullYear(),
          isLossless: false,
          isHiRes: false,
        },
        assets: [
          {
            id: `yt-asset-${v.id}`,
            trackId,
            format: 'm4a',
            codec: 'AAC',
            bitrate: 160,
            isLossless: false,
            isHiRes: false,
            storageType: 'remote_stream',
            storageKey: `/api/stream/yt?v=${v.id}`,
            duration: durationSeconds,
          },
        ],
        providerCode: 'youtube',
        externalUrl: `https://www.youtube.com/watch?v=${v.id}`,
      };
    });

    return {
      providerCode: this.code,
      providerName: this.name,
      tracks,
      albums: [],
      artists: [],
    };
  }

  public async getTrack(externalId: string): Promise<TrackData | null> {
    const videoId = externalId.replace(/^yt-/, '');
    return {
      id: `yt-${videoId}`,
      title: 'YouTube Track',
      duration: 180,
      artists: [{ id: 'yt-channel', name: 'YouTube Creator' }],
      assets: [
        {
          id: `yt-asset-${videoId}`,
          trackId: `yt-${videoId}`,
          format: 'm4a',
          codec: 'AAC',
          bitrate: 160,
          isLossless: false,
          isHiRes: false,
          storageType: 'remote_stream',
          storageKey: `/api/stream/yt?v=${videoId}`,
        },
      ],
      providerCode: 'youtube',
      externalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  public async getStreamUrl(externalId: string): Promise<string | null> {
    const videoId = externalId.replace(/^yt-/, '');
    return `/api/stream/yt?v=${videoId}`;
  }

  public getTermsNotice(): string {
    return 'Music streamed via direct native high-quality audio stream. 100% Free.';
  }
}
