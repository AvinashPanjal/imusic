import { NextRequest, NextResponse } from 'next/server';
import {
  getGoogleSession,
  getGoogleSessionFromRequest,
  refreshGoogleAccessToken,
  setSessionCookieOnResponse,
} from '@/lib/auth/googleAuth';
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

function cleanYouTubeSongTitle(rawTitle: string, channelTitle?: string): { title: string; artist: string } {
  let text = (rawTitle || '').trim();

  // Strip common noisy video tags
  text = text
    .replace(/\s*\[(?:Official\s*)?(?:Music\s*)?(?:Video|Audio|HD|4K|Visualizer|Lyric\s*Video|Lyrics|Full\s*(?:Song|Video|Audio)|Lyrical|4K\s*Video)\]/gi, '')
    .replace(/\s*\((?:Official\s*)?(?:Music\s*)?(?:Video|Audio|HD|4K|Visualizer|Lyric\s*Video|Lyrics|Full\s*(?:Song|Video|Audio)|Lyrical|4K\s*Video)\)/gi, '')
    .trim();

  let title = text;
  let artist = channelTitle || '';

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
      } else if (channelTitle && channelTitle.toLowerCase().includes(hypParts[0].toLowerCase())) {
        artist = hypParts[0];
        title = hypParts[1];
      } else {
        title = hypParts[0];
      }
    }
  }

  return { title: title.trim(), artist: artist.trim() };
}

/**
 * Intelligent filter to distinguish music tracks/songs from general YouTube videos
 * (e.g., tech reviews, podcasts, tutorials, gameplay, vlogs)
 */
function isYouTubeMusicVideo(item: any): boolean {
  const snippet = item.snippet || {};
  const contentDetails = item.contentDetails || {};
  const topicDetails = item.topicDetails || {};

  // 1. YouTube Category ID 10 is exclusively "Music"
  if (snippet.categoryId === '10') {
    return true;
  }

  // 2. YouTube Topic Details: category Wikipedia ontology matches music
  const topicCategories: string[] = topicDetails.topicCategories || [];
  if (
    topicCategories.some((cat) =>
      /music|song|hip_hop|rock|pop_music|soundtrack|electronic|rhythm|asia|india/i.test(cat)
    )
  ) {
    return true;
  }

  // 3. Music labels, artists, or Topic channels
  const channel = (snippet.videoOwnerChannelTitle || snippet.channelTitle || '').toLowerCase();
  const musicChannelIndicators = [
    '- topic',
    'vevo',
    'music',
    'records',
    'audio',
    'soundtracks',
    't-series',
    'zee music',
    'sony music',
    'saregama',
    'muzik247',
    'think music',
    'aditya music',
    'speed audio',
    'tips official',
    'yrf',
    'lahari music',
    'anirudh ravichander',
    'sushin shyam',
    'ar rahman',
    'arijit singh',
    'shreya ghoshal',
    'diljit dosanjh',
  ];
  if (musicChannelIndicators.some((ind) => channel.includes(ind))) {
    return true;
  }

  // 4. Video title keywords that strongly denote a music release
  const rawTitle = (snippet.title || '').toLowerCase();
  const musicTitleKeywords = [
    'official video',
    'official music video',
    'official audio',
    'lyric video',
    'lyrics video',
    'full song',
    'full audio',
    'soundtrack',
    'song',
    'audio track',
    'original track',
    'remix',
    'lofi',
    'acoustic',
    'unplugged',
    'pattu',
    'paadal',
    'geetham',
    'bgm',
    'theme music',
    'feat.',
    'ft.',
    'prod.',
  ];
  if (musicTitleKeywords.some((kw) => rawTitle.includes(kw))) {
    return true;
  }

  // 5. Song-length duration heuristic (60s to 600s) + formatting
  const duration = parseISODuration(contentDetails.duration);
  if (duration >= 50 && duration <= 600 && (snippet.title?.includes(' - ') || snippet.title?.includes(' | '))) {
    return true;
  }

  return false;
}

export async function GET(request: NextRequest) {
  try {
    let session = getGoogleSessionFromRequest(request);
    if (!session) {
      session = await getGoogleSession(request);
    }
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

    let tokenRefreshed = false;
    const isExpired = session.expiresAt && Date.now() > session.expiresAt - 5 * 60 * 1000;
    if (isExpired && session.refreshToken) {
      try {
        const refreshed = await refreshGoogleAccessToken(session.refreshToken);
        if (refreshed.accessToken) {
          session.accessToken = refreshed.accessToken;
          session.expiresAt = Date.now() + refreshed.expiresIn * 1000;
          if (refreshed.refreshToken) session.refreshToken = refreshed.refreshToken;
          tokenRefreshed = true;
        }
      } catch (e) {
        console.warn('Pre-emptive token refresh failed:', e);
      }
    }

    const { searchParams } = new URL(request.url);
    const pageToken = searchParams.get('pageToken') || '';
    const filter = (searchParams.get('filter') || 'music').toLowerCase(); // 'music' (default) or 'all'
    const maxResults = Math.min(parseInt(searchParams.get('maxResults') || '50', 10), 50);

    // Primary: fetch user's liked videos with snippet, contentDetails, and topicDetails
    let ytApiUrl = `https://www.googleapis.com/youtube/v3/videos?myRating=like&part=snippet,contentDetails,topicDetails&maxResults=${maxResults}`;
    if (pageToken) ytApiUrl += `&pageToken=${encodeURIComponent(pageToken)}`;

    let res = await fetch(ytApiUrl, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      },
      next: { revalidate: 0 },
    });

    // If YouTube returned 401 (token expired), auto-refresh and retry once!
    if (res.status === 401 && session.refreshToken) {
      try {
        console.log('YouTube API returned 401. Refreshing token...');
        const refreshed = await refreshGoogleAccessToken(session.refreshToken);
        if (refreshed.accessToken) {
          session.accessToken = refreshed.accessToken;
          session.expiresAt = Date.now() + refreshed.expiresIn * 1000;
          if (refreshed.refreshToken) session.refreshToken = refreshed.refreshToken;
          tokenRefreshed = true;

          // Retry with fresh token
          res = await fetch(ytApiUrl, {
            headers: {
              Authorization: `Bearer ${session.accessToken}`,
              Accept: 'application/json',
            },
            next: { revalidate: 0 },
          });
        }
      } catch (retryErr) {
        console.warn('Token refresh on 401 failed:', retryErr);
      }
    }

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
    const totalLoaded = items.length;

    // Filter items if 'music' is requested
    const filteredItems = filter === 'all' ? items : items.filter(isYouTubeMusicVideo);

    const tracks: TrackData[] = filteredItems
      .map((item: any) => {
        const videoId =
          item.snippet?.resourceId?.videoId ||
          item.contentDetails?.videoId ||
          item.id?.videoId ||
          (typeof item.id === 'string' ? item.id : null);
        if (!videoId || typeof videoId !== 'string') return null;

        const snippet = item.snippet || {};
        const contentDetails = item.contentDetails || {};

        const rawTitle = snippet.title || 'Untitled Video';
        // Skip deleted or private videos
        if (rawTitle === 'Deleted video' || rawTitle === 'Private video') {
          return null;
        }

        const channelTitle = snippet.videoOwnerChannelTitle || snippet.channelTitle || 'YouTube Artist';
        const { title: parsedTitle, artist: parsedArtist } = cleanYouTubeSongTitle(rawTitle, channelTitle);
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
            isLossless: true,
          },
          // Leave streamUrl undefined so AudioEngine resolves it dynamically to Studio Lossless 320kbps
          assets: [
            {
              id: `yt-asset-${videoId}`,
              trackId: `yt-${videoId}`,
              format: 'mp4',
              codec: 'AAC',
              bitrate: 320,
              isLossless: true,
              isHiRes: false,
              storageType: 'remote_stream',
              storageKey: `/api/stream/yt?v=${videoId}`,
            },
          ],
          providerCode: 'youtube_liked',
          hasLyrics: false,
          playCount: 0,
        };

        return track;
      })
      .filter((t: TrackData | null): t is TrackData => t !== null);

    const jsonResponse = NextResponse.json({
      connected: true,
      user: session.user,
      tracks,
      filter,
      totalLoaded,
      musicCount: tracks.length,
      nextPageToken: data.nextPageToken || null,
      totalResults: data.pageInfo?.totalResults || tracks.length,
    });

    if (tokenRefreshed) {
      const isSecure = process.env.NODE_ENV === 'production';
      setSessionCookieOnResponse(jsonResponse, session, isSecure);
    }

    return jsonResponse;
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
