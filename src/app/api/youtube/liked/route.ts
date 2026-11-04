import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSession } from '@/lib/auth/googleAuth';
import { TrackData } from '@/types/music';

export const dynamic = 'force-dynamic';

function parseISODuration(durationStr?: string): number {
  if (!durationStr) return 210;
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 210;
  const hours = parseInt(match[1] || '0', 10);
  const minutes = parseInt(match[2] || '0', 10);
  const seconds = parseInt(match[3] || '0', 10);
  return hours * 3600 + minutes * 60 + seconds;
}

function cleanYouTubeSongTitle(rawTitle: string): { title: string; artist: string } {
  let title = rawTitle
    .replace(/\[(Official\s*(?:Music\s*)?Video|Audio|HD|4K|Lyrics?|Visualizer|Lyric\s*Video)\]/gi, '')
    .replace(/\((Official\s*(?:Music\s*)?Video|Audio|HD|4K|Lyrics?|Visualizer|Lyric\s*Video)\)/gi, '')
    .trim();

  // If title has "Artist - Song Title" or "Song Title - Artist"
  if (title.includes(' - ')) {
    const parts = title.split(' - ');
    if (parts.length >= 2) {
      return {
        artist: parts[0].trim(),
        title: parts.slice(1).join(' - ').trim(),
      };
    }
  } else if (title.includes(' | ')) {
    const parts = title.split(' | ');
    if (parts.length >= 2) {
      return {
        title: parts[0].trim(),
        artist: parts[1].trim(),
      };
    }
  }

  return { title, artist: '' };
}

export async function GET(request: NextRequest) {
  try {
    const session = await getGoogleSession();
    if (!session || !session.accessToken) {
      return NextResponse.json(
        {
          connected: false,
          tracks: [],
          error: 'Please sign in with Google to view your YouTube liked songs.',
        },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const pageToken = searchParams.get('pageToken') || '';
    const maxResults = Math.min(parseInt(searchParams.get('maxResults') || '50', 10), 50);

    // Primary: fetch user's liked videos from YouTube Data API v3
    let ytApiUrl = `https://www.googleapis.com/youtube/v3/videos?myRating=like&part=snippet,contentDetails&maxResults=${maxResults}`;
    if (pageToken) ytApiUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

    let res = await fetch(ytApiUrl, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
      next: { revalidate: 0 },
    });

    let data = await res.json();

    // Fallback: If myRating=like returns 404 or 403, try the personal Liked Videos playlist ("LL")
    if (!res.ok && (res.status === 404 || res.status === 403)) {
      let playlistUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,contentDetails&playlistId=LL&maxResults=${maxResults}`;
      if (pageToken) playlistUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

      const fallbackRes = await fetch(playlistUrl, {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/json',
        },
      });

      if (fallbackRes.ok) {
        data = await fallbackRes.json();
      } else {
        const errText = await fallbackRes.text();
        console.error('YouTube API error (fallback LL):', errText);
        return NextResponse.json(
          {
            connected: true,
            tracks: [],
            error: data.error?.message || 'Failed to fetch liked songs from YouTube.',
          },
          { status: 500 }
        );
      }
    } else if (!res.ok) {
      console.error('YouTube API error (videos myRating=like):', data);
      return NextResponse.json(
        {
          connected: true,
          tracks: [],
          error: data.error?.message || 'Failed to fetch liked songs from YouTube.',
        },
        { status: res.status }
      );
    }

    const items = data.items || [];
    const tracks: TrackData[] = items
      .map((item: any) => {
        const videoId = item.id?.videoId || item.id || item.contentDetails?.videoId;
        if (!videoId || typeof videoId !== 'string') return null;

        const snippet = item.snippet || {};
        const contentDetails = item.contentDetails || {};

        const rawTitle = snippet.title || 'Untitled Video';
        // Skip deleted or private videos
        if (rawTitle === 'Deleted video' || rawTitle === 'Private video') {
          return null;
        }

        const channelTitle = snippet.videoOwnerChannelTitle || snippet.channelTitle || 'YouTube Artist';
        const { title: parsedTitle, artist: parsedArtist } = cleanYouTubeSongTitle(rawTitle);
        const finalTitle = parsedTitle || rawTitle;
        const finalArtist = parsedArtist || channelTitle;

        const thumbnails = snippet.thumbnails || {};
        const coverImage =
          thumbnails.maxres?.url ||
          thumbnails.standard?.url ||
          thumbnails.high?.url ||
          thumbnails.medium?.url ||
          thumbnails.default?.url ||
          `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        const durationSeconds = parseISODuration(contentDetails.duration);

        const track: TrackData = {
          id: `yt-${videoId}`,
          title: finalTitle,
          duration: durationSeconds,
          trackNumber: 1,
          artists: [
            {
              id: snippet.channelId ? `yt-channel-${snippet.channelId}` : `yt-artist-${videoId}`,
              name: finalArtist,
            },
          ],
          album: {
            id: 'yt-liked-album',
            title: 'YouTube Liked Songs',
            coverImage,
            releaseYear: snippet.publishedAt ? new Date(snippet.publishedAt).getFullYear() : undefined,
          },
          assets: [
            {
              id: `yt-asset-${videoId}`,
              trackId: `yt-${videoId}`,
              format: 'aac',
              codec: 'AAC',
              bitrate: 256,
              isLossless: false,
              isHiRes: false,
              storageType: 'remote_stream',
              storageKey: `/api/stream/yt?v=${videoId}`,
            },
          ],
          streamUrl: `/api/stream/yt?v=${videoId}`,
          hasLyrics: false,
          playCount: 0,
        };

        return track;
      })
      .filter((t: TrackData | null): t is TrackData => t !== null);

    return NextResponse.json({
      connected: true,
      user: session.user,
      tracks,
      nextPageToken: data.nextPageToken || null,
      totalResults: data.pageInfo?.totalResults || tracks.length,
    });
  } catch (error: any) {
    console.error('Error fetching YouTube liked songs:', error);
    return NextResponse.json(
      {
        connected: false,
        tracks: [],
        error: error?.message || 'Unexpected server error while fetching liked songs',
      },
      { status: 500 }
    );
  }
}
