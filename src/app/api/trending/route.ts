import { NextRequest, NextResponse } from 'next/server';
import { TrackData, AlbumSummary } from '@/types/music';
import {
  decryptMediaUrl,
  decodeHtmlEntities,
  SAAVN_HEADERS,
} from '@/lib/providers/IndianMusicProvider';

export const dynamic = 'force-dynamic';

interface CachedFeed {
  timestamp: number;
  data: {
    spotlight: TrackData[];
    trendingAll: TrackData[];
    malayalam: TrackData[];
    tamil: TrackData[];
    hindi: TrackData[];
    newAlbums: AlbumSummary[];
  };
}

let cache: CachedFeed | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes cache

const SAAVN_API_BASE = 'https://www.jiosaavn.com/api.php';

function formatSaavnSong(item: any, languageFallback = 'INDIAN'): TrackData | null {
  if (!item || !item.id) return null;

  const encryptedMedia = item.encrypted_media_url || item.more_info?.encrypted_media_url;
  const streamUrl = decryptMediaUrl(encryptedMedia);
  if (!streamUrl) return null;

  const title = decodeHtmlEntities(item.song || item.title || 'Unknown Track');
  const albumName = decodeHtmlEntities(item.album || item.more_info?.album || title);
  const artistNames = decodeHtmlEntities(
    item.primary_artists || item.more_info?.music || item.singers || item.music || 'Various Artists'
  );

  const rawCover = item.image || '';
  const highResArtwork = rawCover
    ? rawCover.replace(/150x150\.jpg$/, '500x500.jpg').replace(/50x50\.jpg$/, '500x500.jpg')
    : '/icons/default-artwork.png';

  const year = parseInt(item.year || item.more_info?.year, 10) || 2026;
  const duration = parseInt(item.duration || item.more_info?.duration, 10) || 210;
  const lang = (item.language || languageFallback).toUpperCase();

  return {
    id: `saavn-${item.id}`,
    title,
    duration,
    genre: `${lang} / Trending`,
    playCount: parseInt(item.play_count || item.more_info?.play_count || '0', 10),
    album: {
      id: `saavn-album-${item.albumid || item.id}`,
      title: albumName,
      coverImage: highResArtwork,
      artistName: artistNames,
      releaseYear: year,
      isHiRes: false,
      isLossless: true,
    },
    artists: artistNames.split(',').map((name: string, i: number) => ({
      id: `saavn-art-${item.id}-${i}`,
      name: name.trim(),
    })),
    assets: [
      {
        id: `saavn-asset-${item.id}`,
        trackId: `saavn-${item.id}`,
        format: 'mp4',
        codec: 'AAC',
        bitDepth: 16,
        sampleRate: 44100,
        bitrate: 320,
        isLossless: true,
        isHiRes: false,
        storageType: 'remote_stream',
        storageKey: streamUrl,
      },
    ],
    streamUrl,
    providerCode: 'indian_music_vault',
  };
}

function formatSaavnAlbum(item: any, languageFallback = 'INDIAN'): AlbumSummary | null {
  if (!item) return null;
  const id = item.albumid || item.id;
  if (!id) return null;

  const title = decodeHtmlEntities(item.title || item.album || 'Untitled Album');
  const artistName = decodeHtmlEntities(item.music || item.artist || item.primary_artists || 'Various Artists');
  const rawCover = item.image || '';
  const coverImage = rawCover
    ? rawCover.replace(/150x150\.jpg$/, '500x500.jpg').replace(/50x50\.jpg$/, '500x500.jpg')
    : '/icons/default-artwork.png';
  const releaseYear = parseInt(item.year || item.release_date || '2026', 10) || 2026;
  const lang = (item.language || languageFallback).toUpperCase();

  return {
    id: `saavn-album-${id}`,
    title,
    artistName,
    coverImage,
    releaseYear,
    genre: `${lang} / Soundtrack`,
    isHiRes: false,
    isLossless: true,
  };
}

async function fetchPlaylistSongs(listid: string, langFallback: string): Promise<TrackData[]> {
  try {
    const url = `${SAAVN_API_BASE}?__call=playlist.getDetails&_format=json&_marker=0&cc=in&listid=${encodeURIComponent(
      listid
    )}`;
    const res = await fetch(url, { headers: SAAVN_HEADERS, next: { revalidate: 600 } });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const rawSongs = json.songs || [];
    return rawSongs
      .map((s: any) => formatSaavnSong(s, langFallback))
      .filter((t: TrackData | null): t is TrackData => t !== null);
  } catch (err) {
    console.warn(`Failed fetching playlist ${listid}:`, err);
    return [];
  }
}

async function fetchNewAlbums(query: string, langFallback: string): Promise<AlbumSummary[]> {
  try {
    const url = `${SAAVN_API_BASE}?__call=search.getAlbumResults&_format=json&_marker=0&cc=in&p=1&n=6&q=${encodeURIComponent(
      query
    )}`;
    const res = await fetch(url, { headers: SAAVN_HEADERS, next: { revalidate: 600 } });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const rawAlbums = json.results || [];
    return rawAlbums
      .map((a: any) => formatSaavnAlbum(a, langFallback))
      .filter((a: AlbumSummary | null): a is AlbumSummary => a !== null);
  } catch (err) {
    console.warn(`Failed fetching new albums for ${query}:`, err);
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const now = Date.now();
    if (cache && now - cache.timestamp < CACHE_TTL_MS) {
      return NextResponse.json(cache.data, {
        headers: {
          'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
        },
      });
    }

    // Parallel fetch:
    // 1. Malayalam Superhits Top 50 (listid: 1134705865)
    // 2. Tamil Trending (listid: 1268500351)
    // 3. Hindi Superhits Top 50 (listid: 1134543272)
    // 4. New 2026 albums in Malayalam, Tamil, Hindi
    const [malayalamTracks, tamilTracks, hindiTracks, malNewAlbums, tamNewAlbums, hinNewAlbums] =
      await Promise.all([
        fetchPlaylistSongs('1134705865', 'Malayalam'),
        fetchPlaylistSongs('1268500351', 'Tamil'),
        fetchPlaylistSongs('1134543272', 'Hindi'),
        fetchNewAlbums('Latest Malayalam Songs 2026', 'Malayalam'),
        fetchNewAlbums('Latest Tamil Songs 2026', 'Tamil'),
        fetchNewAlbums('Latest Hindi Songs 2026', 'Hindi'),
      ]);

    // Deduplicate and combine new albums (prioritizing Malayalam, Tamil, Hindi 2026 releases)
    const seenAlbumIds = new Set<string>();
    const combinedAlbums: AlbumSummary[] = [];
    const maxAlbums = Math.max(malNewAlbums.length, tamNewAlbums.length, hinNewAlbums.length);

    for (let i = 0; i < maxAlbums; i++) {
      if (malNewAlbums[i] && !seenAlbumIds.has(malNewAlbums[i].id)) {
        seenAlbumIds.add(malNewAlbums[i].id);
        combinedAlbums.push(malNewAlbums[i]);
      }
      if (tamNewAlbums[i] && !seenAlbumIds.has(tamNewAlbums[i].id)) {
        seenAlbumIds.add(tamNewAlbums[i].id);
        combinedAlbums.push(tamNewAlbums[i]);
      }
      if (hinNewAlbums[i] && !seenAlbumIds.has(hinNewAlbums[i].id)) {
        seenAlbumIds.add(hinNewAlbums[i].id);
        combinedAlbums.push(hinNewAlbums[i]);
      }
    }

    // Interleave trending tracks with priority: Malayalam #1, Tamil #2, Hindi #3
    const seenTrackIds = new Set<string>();
    const trendingAll: TrackData[] = [];
    const maxTracks = Math.max(malayalamTracks.length, tamilTracks.length, hindiTracks.length);

    for (let i = 0; i < maxTracks; i++) {
      // Malayalam prioritized first
      if (malayalamTracks[i] && !seenTrackIds.has(malayalamTracks[i].id)) {
        seenTrackIds.add(malayalamTracks[i].id);
        trendingAll.push(malayalamTracks[i]);
      }
      // Tamil prioritized second
      if (tamilTracks[i] && !seenTrackIds.has(tamilTracks[i].id)) {
        seenTrackIds.add(tamilTracks[i].id);
        trendingAll.push(tamilTracks[i]);
      }
      // Hindi prioritized third
      if (hindiTracks[i] && !seenTrackIds.has(hindiTracks[i].id)) {
        seenTrackIds.add(hindiTracks[i].id);
        trendingAll.push(hindiTracks[i]);
      }
    }

    // Spotlight songs (top 6 hottest tracks from Malayalam, Tamil, Hindi)
    const spotlight: TrackData[] = [];
    if (malayalamTracks[0]) spotlight.push(malayalamTracks[0]);
    if (tamilTracks[0]) spotlight.push(tamilTracks[0]);
    if (hindiTracks[0]) spotlight.push(hindiTracks[0]);
    if (malayalamTracks[1]) spotlight.push(malayalamTracks[1]);
    if (tamilTracks[1]) spotlight.push(tamilTracks[1]);
    if (hindiTracks[1]) spotlight.push(hindiTracks[1]);

    const feedData = {
      spotlight,
      trendingAll: trendingAll.slice(0, 40),
      malayalam: malayalamTracks.slice(0, 30),
      tamil: tamilTracks.slice(0, 30),
      hindi: hindiTracks.slice(0, 30),
      newAlbums: combinedAlbums.slice(0, 16),
    };

    cache = {
      timestamp: now,
      data: feedData,
    };

    return NextResponse.json(feedData, {
      headers: {
        'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
      },
    });
  } catch (error) {
    console.error('Trending feed error:', error);

    // If cache exists even if stale, return it on failure
    if (cache) {
      return NextResponse.json(cache.data);
    }

    return NextResponse.json(
      {
        spotlight: [],
        trendingAll: [],
        malayalam: [],
        tamil: [],
        hindi: [],
        newAlbums: [],
      },
      { status: 500 }
    );
  }
}
