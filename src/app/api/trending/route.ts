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
    dailyNewReleases: TrackData[];
    trendingAll: TrackData[];
    malayalam: TrackData[];
    tamil: TrackData[];
    hindi: TrackData[];
    newAlbums: AlbumSummary[];
  };
}

let cache: CachedFeed | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache for fresh daily drops

const SAAVN_API_BASE = 'https://www.jiosaavn.com/api.php';

function formatSaavnSong(item: any, languageFallback = 'INDIAN'): (TrackData & { releaseDate?: string }) | null {
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

  const rawReleaseDate = item.release_date || item.more_info?.release_date || '';
  const year = parseInt(item.year || item.more_info?.year || rawReleaseDate.slice(0, 4), 10) || 2026;
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
    releaseDate: rawReleaseDate,
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

async function fetchPlaylistSongs(listid: string, langFallback: string): Promise<(TrackData & { releaseDate?: string })[]> {
  try {
    const url = `${SAAVN_API_BASE}?__call=playlist.getDetails&_format=json&_marker=0&cc=in&listid=${encodeURIComponent(
      listid
    )}`;
    const res = await fetch(url, { headers: SAAVN_HEADERS, next: { revalidate: 300 } });
    if (!res.ok) return [];
    const json = await res.json().catch(() => ({}));
    const rawSongs = json.songs || [];
    return rawSongs
      .map((s: any) => formatSaavnSong(s, langFallback))
      .filter((t: any): t is TrackData & { releaseDate?: string } => t !== null);
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
    const res = await fetch(url, { headers: SAAVN_HEADERS, next: { revalidate: 300 } });
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
          'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
        },
      });
    }

    // Parallel fetch:
    // 1. Official Daily New Releases:
    //    - Hindi/All: "Taaza Tunes" (listid: 6689255)
    //    - Tamil: "Pudhu Tunes" (listid: 10763385)
    //    - Malayalam: "New Indie - Malayalam" (listid: 1219251930)
    // 2. Official Superhits Top 50 Charts:
    //    - Malayalam Top 50 (listid: 1134705865)
    //    - Tamil Trending (listid: 1268500351)
    //    - Hindi Top 50 (listid: 1134543272)
    // 3. New 2026 Soundtrack Albums via Search
    const [
      dailyHindi,
      dailyTamil,
      dailyMalayalam,
      malayalamChart,
      tamilChart,
      hindiChart,
      malNewAlbums,
      tamNewAlbums,
      hinNewAlbums,
    ] = await Promise.all([
      fetchPlaylistSongs('6689255', 'Hindi'),
      fetchPlaylistSongs('10763385', 'Tamil'),
      fetchPlaylistSongs('1219251930', 'Malayalam'),
      fetchPlaylistSongs('1134705865', 'Malayalam'),
      fetchPlaylistSongs('1268500351', 'Tamil'),
      fetchPlaylistSongs('1134543272', 'Hindi'),
      fetchNewAlbums('Latest Malayalam Songs 2026', 'Malayalam'),
      fetchNewAlbums('Latest Tamil Songs 2026', 'Tamil'),
      fetchNewAlbums('Latest Hindi Songs 2026', 'Hindi'),
    ]);

    // 1. Compile Day-by-Day New Releases:
    // Combine daily feeds with Malayalam, Tamil, Hindi prioritization and sort by release date
    const allDaily = [...dailyMalayalam, ...dailyTamil, ...dailyHindi];
    allDaily.sort((a, b) => {
      const dateA = a.releaseDate || '2026-01-01';
      const dateB = b.releaseDate || '2026-01-01';
      return dateB.localeCompare(dateA);
    });

    const seenDailyIds = new Set<string>();
    const dailyNewReleases: TrackData[] = [];
    for (const t of allDaily) {
      if (!seenDailyIds.has(t.id)) {
        seenDailyIds.add(t.id);
        dailyNewReleases.push(t);
      }
    }

    // 2. Extract AlbumSummaries directly from the freshest daily new releases
    const dynamicAlbumsFromDaily: AlbumSummary[] = [];
    const seenDynamicAlbumIds = new Set<string>();
    for (const track of dailyNewReleases) {
      if (track.album && !seenDynamicAlbumIds.has(track.album.id)) {
        seenDynamicAlbumIds.add(track.album.id);
        dynamicAlbumsFromDaily.push({
          id: track.album.id,
          title: track.album.title,
          coverImage: track.album.coverImage,
          artistName: track.album.artistName || track.artists?.[0]?.name || 'Various Artists',
          releaseYear: track.album.releaseYear || 2026,
          genre: track.genre || 'Soundtrack',
          isHiRes: false,
          isLossless: true,
        });
      }
    }

    // Merge dynamic daily albums with searched albums
    const combinedAlbums: AlbumSummary[] = [];
    const seenAllAlbumIds = new Set<string>();

    for (const album of [...dynamicAlbumsFromDaily, ...malNewAlbums, ...tamNewAlbums, ...hinNewAlbums]) {
      if (!seenAllAlbumIds.has(album.id)) {
        seenAllAlbumIds.add(album.id);
        combinedAlbums.push(album);
      }
    }

    // 3. Compile Top Trending Releases:
    // Interleave Malayalam (#1), Tamil (#2), Hindi (#3)
    const seenTrackIds = new Set<string>();
    const trendingAll: TrackData[] = [];
    const maxTracks = Math.max(malayalamChart.length, tamilChart.length, hindiChart.length);

    for (let i = 0; i < maxTracks; i++) {
      if (malayalamChart[i] && !seenTrackIds.has(malayalamChart[i].id)) {
        seenTrackIds.add(malayalamChart[i].id);
        trendingAll.push(malayalamChart[i]);
      }
      if (tamilChart[i] && !seenTrackIds.has(tamilChart[i].id)) {
        seenTrackIds.add(tamilChart[i].id);
        trendingAll.push(tamilChart[i]);
      }
      if (hindiChart[i] && !seenTrackIds.has(hindiChart[i].id)) {
        seenTrackIds.add(hindiChart[i].id);
        trendingAll.push(hindiChart[i]);
      }
    }

    // 4. Spotlight tracks: Top daily & chart hits
    const spotlight: TrackData[] = [];
    if (dailyMalayalam[0]) spotlight.push(dailyMalayalam[0]);
    if (dailyTamil[0]) spotlight.push(dailyTamil[0]);
    if (dailyHindi[0]) spotlight.push(dailyHindi[0]);
    if (malayalamChart[0]) spotlight.push(malayalamChart[0]);
    if (tamilChart[0]) spotlight.push(tamilChart[0]);
    if (hindiChart[0]) spotlight.push(hindiChart[0]);

    const feedData = {
      spotlight,
      dailyNewReleases: dailyNewReleases.slice(0, 35),
      trendingAll: trendingAll.slice(0, 45),
      malayalam: [...dailyMalayalam, ...malayalamChart].slice(0, 30),
      tamil: [...dailyTamil, ...tamilChart].slice(0, 30),
      hindi: [...dailyHindi, ...hindiChart].slice(0, 30),
      newAlbums: combinedAlbums.slice(0, 20),
    };

    cache = {
      timestamp: now,
      data: feedData,
    };

    return NextResponse.json(feedData, {
      headers: {
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (error) {
    console.error('Trending feed error:', error);

    if (cache) {
      return NextResponse.json(cache.data);
    }

    return NextResponse.json(
      {
        spotlight: [],
        dailyNewReleases: [],
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
