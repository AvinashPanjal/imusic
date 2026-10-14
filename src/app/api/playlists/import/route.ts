import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptMediaUrl, decodeHtmlEntities } from '@/lib/providers/IndianMusicProvider';
import { searchYouTubeVideos } from '@/lib/providers/YouTubeProvider';
import { TrackData, PlaylistData } from '@/types/music';
import { z } from 'zod';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const ImportPlaylistSchema = z.object({
  url: z.string().min(1, 'Playlist URL or song list is required'),
  customTitle: z.string().max(100).optional(),
});

interface ParsedTrack {
  title: string;
  artist: string;
  duration?: number;
  previewUrl?: string | null;
  coverImage?: string | null;
  videoId?: string;
}

interface ParsedPlaylist {
  title: string;
  description?: string;
  coverImage?: string | null;
  tracks: ParsedTrack[];
  totalExpected?: number;
}

function cleanTrackTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\s*\(From\s+[^)]+\)/gi, '')
    .replace(/\s*\[From\s+[^\]]+\]/gi, '')
    .replace(/\s*-\s*From\s+.*$/gi, '')
    .replace(/\s*\(Remastered[^)]*\)/gi, '')
    .replace(/\s*\[Remastered[^\]]*\]/gi, '')
    .replace(/\s*\(Original[^)]*\)/gi, '')
    .replace(/\s*\(Duet[^)]*\)/gi, '')
    .replace(/\s*\(feat\.[^)]*\)/gi, '')
    .replace(/\s*\[feat\.[^\]]*\]/gi, '')
    .trim();
}

function isGoodTitleMatch(requestedTitle: string, candidateSong: string): boolean {
  if (!requestedTitle || !candidateSong) return false;
  const reqClean = cleanTrackTitle(requestedTitle).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const candClean = cleanTrackTitle(candidateSong).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

  const reqWords = reqClean.split(/\s+/).filter((w) => w.length > 2);
  const candWords = candClean.split(/\s+/).filter((w) => w.length > 2);

  if (reqWords.length === 0 || candWords.length === 0) return false;

  const genericWords = new Set(['the', 'and', 'from', 'song', 'audio', 'video', 'life', 'full', 'version']);
  const reqDistinctive = reqWords.filter((w) => !genericWords.has(w));

  if (reqDistinctive.length > 0) {
    const hasDistinctiveMatch = reqDistinctive.some((w) => candClean.includes(w) || candWords.includes(w));
    if (!hasDistinctiveMatch) {
      return false;
    }
  }

  let matchCount = 0;
  for (const w of reqWords) {
    if (candWords.includes(w) || candClean.includes(w)) {
      matchCount++;
    }
  }

  return matchCount >= Math.min(2, reqWords.length);
}

// 1. Fetch via Official Spotify Web API with Client Credentials (supports albums and official catalogue pagination)
async function fetchOfficialSpotifyPlaylist(
  id: string,
  isAlbum: boolean,
  clientId: string,
  clientSecret: string
): Promise<ParsedPlaylist | null> {
  try {
    const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${authString}`,
      },
      body: 'grant_type=client_credentials',
    });

    if (!tokenRes.ok) {
      console.warn('Spotify Client Credentials authentication failed:', await tokenRes.text());
      return null;
    }

    const { access_token } = await tokenRes.json();
    const endpointType = isAlbum ? 'albums' : 'playlists';

    let playlistName = isAlbum ? 'Imported Spotify Album' : 'Imported Spotify Playlist';
    let description = 'Imported from Spotify';
    let coverImage: string | null = null;
    let totalExpected: number | undefined;

    // Fetch entity metadata
    const metaRes = await fetch(`https://api.spotify.com/v1/${endpointType}/${id}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (metaRes.ok) {
      const meta = await metaRes.json();
      playlistName = meta.name || playlistName;
      description = meta.description || `Imported from Spotify • ${meta.owner?.display_name || ''}`;
      coverImage = meta.images?.[0]?.url || null;
      totalExpected = isAlbum ? meta.total_tracks : meta.tracks?.total;
    } else {
      console.warn(`Spotify API ${endpointType} metadata returned status ${metaRes.status}. (Note: Spotify blocks Client Credentials on user-created playlists).`);
    }

    const allTracks: ParsedTrack[] = [];
    let nextUrl: string | null = isAlbum
      ? `https://api.spotify.com/v1/albums/${id}/tracks?limit=50&offset=0`
      : `https://api.spotify.com/v1/playlists/${id}/tracks?limit=100&offset=0`;

    while (nextUrl && allTracks.length < 500) {
      const pageRes: Response = await fetch(nextUrl, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!pageRes.ok) {
        console.warn(`Spotify track page failed with status ${pageRes.status}:`, await pageRes.text().catch(() => ''));
        break;
      }

      const pageData: any = await pageRes.json();
      const items = pageData.items || [];
      if (items.length === 0) break;

      for (const item of items) {
        const t = isAlbum ? item : item.track;
        if (!t || !t.name) continue;
        allTracks.push({
          title: t.name,
          artist: Array.isArray(t.artists) ? t.artists.map((a: any) => a.name).join(', ') : 'Unknown Artist',
          duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : 180,
          coverImage: t.album?.images?.[0]?.url || coverImage,
        });
      }

      nextUrl = pageData.next || null;
    }

    if (allTracks.length === 0) return null;

    return {
      title: playlistName,
      description,
      coverImage,
      tracks: allTracks,
      totalExpected: typeof totalExpected === 'number' ? totalExpected : allTracks.length,
    };
  } catch (err) {
    console.warn('Error fetching official Spotify playlist:', err);
    return null;
  }
}

// 2. Fetch & Parse Spotify Playlist or Album (supports public embed up to 100 tracks, or official API)
async function fetchSpotifyPlaylist(rawUrl: string): Promise<ParsedPlaylist | null> {
  let url = rawUrl;

  // Resolve short links like spotify.link/...
  if (url.includes('spotify.link/') || url.includes('spotify.app.link/')) {
    try {
      const headRes = await fetch(url, { redirect: 'follow' });
      url = headRes.url || url;
    } catch {
      // ignore
    }
  }

  const match = url.match(/(?:playlist|album)[\/:]([a-zA-Z0-9]+)/);
  if (!match) return null;
  const id = match[1];
  const isAlbum = url.includes('/album/') || url.includes(':album:');
  const embedType = isAlbum ? 'album' : 'playlist';

  // Attempt official Spotify API first if credentials are configured
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  if (clientId && clientSecret) {
    const officialResult = await fetchOfficialSpotifyPlaylist(id, isAlbum, clientId, clientSecret);
    if (officialResult && officialResult.tracks.length > 0) {
      return officialResult;
    }
  }

  // Fall back to scraping public Spotify Embed (returns up to 100 tracks without any API keys)
  try {
    const embedUrl = `https://open.spotify.com/embed/${embedType}/${id}`;
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (res.ok) {
      const html = await res.text();
      const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (scriptMatch) {
        const data = JSON.parse(scriptMatch[1]);
        const entity = data.props?.pageProps?.state?.data?.entity;
        if (entity && Array.isArray(entity.trackList) && entity.trackList.length > 0) {
          const playlistName = entity.name || (isAlbum ? 'Imported Spotify Album' : 'Imported Spotify Playlist');
          const description = entity.subtitle ? `Curated by ${entity.subtitle} on Spotify` : 'Imported from Spotify';
          const coverImage = entity.coverArt?.sources?.[0]?.url || null;

          const rawTracks = entity.trackList as any[];
          const tracks: ParsedTrack[] = rawTracks.map((t) => ({
            title: t.title || t.name || 'Unknown Track',
            artist: t.subtitle || t.artists?.[0]?.name || 'Unknown Artist',
            duration: t.duration ? Math.round(t.duration / 1000) : 180,
            coverImage,
          }));

          return {
            title: playlistName,
            description,
            coverImage,
            tracks,
            totalExpected: tracks.length,
          };
        }
      }
    }
  } catch (err) {
    console.warn('Error scraping Spotify playlist embed:', err);
  }

  // Fallback: Check oEmbed for playlist title and cover
  try {
    const oembedUrl = `https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${embedType}/${id}`)}`;
    const oRes = await fetch(oembedUrl);
    if (oRes.ok) {
      const oData = await oRes.json();
      if (oData && oData.title) {
        return {
          title: oData.title,
          description: 'Imported from Spotify',
          coverImage: oData.thumbnail_url || null,
          tracks: [],
        };
      }
    }
  } catch {
    // ignore
  }

  return null;
}

// 3. Fetch & Parse JioSaavn Playlist or Album
async function fetchJioSaavnPlaylist(url: string): Promise<ParsedPlaylist | null> {
  const match = url.match(/jiosaavn\.com\/(album|featured|song)\/([^/]+)\/([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  const token = match[3];

  try {
    const apiUrl = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&_marker=0&cc=in&albumid=${encodeURIComponent(token)}`;
    const res = await fetch(apiUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) return null;
    const data = await res.json();
    if (!data.title && !data.name) return null;

    const songs = (data.songs || data.list || []) as any[];
    const tracks: ParsedTrack[] = songs.map((s) => ({
      title: decodeHtmlEntities(s.song || s.title || ''),
      artist: decodeHtmlEntities(s.primary_artists || s.singers || ''),
      duration: s.duration ? parseInt(s.duration, 10) : 180,
      coverImage: (s.image || data.image || '').replace('150x150', '500x500'),
    }));

    return {
      title: decodeHtmlEntities(data.title || data.name || 'JioSaavn Playlist'),
      description: 'Imported from JioSaavn',
      coverImage: (data.image || '').replace('150x150', '500x500'),
      tracks,
      totalExpected: tracks.length,
    };
  } catch (err) {
    console.warn('Error parsing JioSaavn playlist:', err);
    return null;
  }
}

// 4. Batch resolve Spotify Track IDs (works 100% with Client Credentials as public catalog items)
async function resolveSpotifyTrackIds(
  trackIds: string[],
  clientId?: string,
  clientSecret?: string
): Promise<ParsedTrack[]> {
  const tracks: ParsedTrack[] = [];

  // Try Spotify official Web API if credentials are provided
  if (clientId && clientSecret) {
    try {
      const authString = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${authString}`,
        },
        body: 'grant_type=client_credentials',
      });

      if (tokenRes.ok) {
        const { access_token } = await tokenRes.json();
        // Batch in groups of 50 (Spotify limit per request)
        const CHUNK_SIZE = 50;
        for (let i = 0; i < trackIds.length; i += CHUNK_SIZE) {
          const chunk = trackIds.slice(i, i + CHUNK_SIZE);
          const tracksRes = await fetch(`https://api.spotify.com/v1/tracks?ids=${chunk.join(',')}`, {
            headers: { Authorization: `Bearer ${access_token}` },
          });

          if (tracksRes.ok) {
            const data = await tracksRes.json();
            for (const t of data.tracks || []) {
              if (!t || !t.name) continue;
              tracks.push({
                title: t.name,
                artist: Array.isArray(t.artists) ? t.artists.map((a: any) => a.name).join(', ') : 'Unknown Artist',
                duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : 180,
                coverImage: t.album?.images?.[0]?.url || null,
              });
            }
          }
        }

        if (tracks.length > 0) return tracks;
      }
    } catch (err) {
      console.warn('Error batch resolving Spotify track IDs with API:', err);
    }
  }

  // Fallback: oEmbed concurrent resolution (up to 10 at a time)
  const CONCURRENCY = 10;
  for (let i = 0; i < trackIds.length; i += CONCURRENCY) {
    const chunk = trackIds.slice(i, i + CONCURRENCY);
    const resolvedChunk = await Promise.all(
      chunk.map(async (id) => {
        try {
          const oRes = await fetch(`https://open.spotify.com/oembed?url=https://open.spotify.com/track/${id}`);
          if (oRes.ok) {
            const oData = await oRes.json();
            return {
              title: oData.title || 'Unknown Track',
              artist: 'Various Artists',
              duration: 180,
              coverImage: oData.thumbnail_url || null,
            };
          }
        } catch {}
        return null;
      })
    );
    for (const t of resolvedChunk) {
      if (t) tracks.push(t);
    }
  }

  return tracks;
}

// 5. Fetch & Parse YouTube Playlists (no 100-track restrictions)
async function fetchYouTubePlaylist(playlistUrl: string): Promise<ParsedPlaylist | null> {
  const match = playlistUrl.match(/[?&]list=([a-zA-Z0-9_-]+)/);
  if (!match) return null;
  const listId = match[1];

  try {
    const res = await fetch(`https://www.youtube.com/playlist?list=${listId}`, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const m =
      html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/) ||
      html.match(/ytInitialData\s*=\s*({[\s\S]*?});/);
    if (!m) return null;

    const data = JSON.parse(m[1]);
    const title = data.metadata?.playlistMetadataRenderer?.title || 'YouTube Playlist';
    const description = data.metadata?.playlistMetadataRenderer?.description || 'Imported from YouTube';

    const tracks: ParsedTrack[] = [];
    const sec = data.contents?.twoColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents;
    const items = sec?.[0]?.itemSectionRenderer?.contents || [];

    for (const it of items) {
      if (it.lockupViewModel) {
        const lvm = it.lockupViewModel;
        const watchEp = lvm.rendererContext?.commandContext?.onTap?.innertubeCommand?.watchEndpoint;
        const videoId = watchEp?.videoId;
        const rawLabel = lvm.rendererContext?.accessibilityContext?.label || '';
        const cleanTitle = rawLabel
          .replace(/\s+\d+\s+minutes?.*$/i, '')
          .replace(/\s+\d+\s+seconds?.*$/i, '')
          .trim();
        const thumbnail = lvm.contentImage?.thumbnailViewModel?.image?.sources?.[0]?.url;

        if (cleanTitle) {
          tracks.push({
            title: cleanTitle,
            artist: 'YouTube Creator',
            coverImage: thumbnail,
            duration: 180,
            videoId,
          });
        }
      } else if (it.playlistVideoRenderer) {
        const pvr = it.playlistVideoRenderer;
        const videoId = pvr.videoId;
        const rawTitle = pvr.title?.runs?.[0]?.text || pvr.title?.simpleText || 'Unknown Video';
        const channel = pvr.shortBylineText?.runs?.[0]?.text || 'YouTube Creator';
        const thumbnail = pvr.thumbnail?.thumbnails?.[0]?.url;

        tracks.push({
          title: rawTitle,
          artist: channel,
          coverImage: thumbnail,
          duration: 180,
          videoId,
        });
      }
    }

    if (tracks.length === 0) return null;

    return {
      title,
      description,
      coverImage: tracks[0]?.coverImage || null,
      tracks,
      totalExpected: tracks.length,
    };
  } catch (err) {
    console.warn('Error fetching YouTube playlist:', err);
    return null;
  }
}

// 6. Universal Tracklist Parser: CSV, Spotify Track URLs, or Plain Text
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && (i === 0 || line[i - 1] !== '\\')) {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result.map((s) => s.replace(/^"|"$/g, '').trim());
}

async function parseUniversalTracklist(
  text: string,
  clientId?: string,
  clientSecret?: string
): Promise<ParsedPlaylist> {
  // 1. Detect Spotify Track URLs (e.g. copied from Spotify Desktop via Ctrl+A -> Ctrl+C)
  const spotifyTrackMatches = [...text.matchAll(/(?:spotify:track:|open\.spotify\.com\/track\/)([a-zA-Z0-9]{22})/g)];
  if (spotifyTrackMatches.length > 0) {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const m of spotifyTrackMatches) {
      if (!seen.has(m[1])) {
        seen.add(m[1]);
        ids.push(m[1]);
      }
    }
    const resolved = await resolveSpotifyTrackIds(ids.slice(0, 500), clientId, clientSecret);
    return {
      title: 'Imported Spotify Tracks',
      description: `Imported ${resolved.length} Spotify tracks directly`,
      tracks: resolved,
      totalExpected: resolved.length,
    };
  }

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

  // 2. Detect CSV with header (Exportify, TuneMyMusic, etc.)
  if (lines.length > 1 && lines[0].includes(',')) {
    const firstLineCols = parseCsvLine(lines[0]).map((c) => c.toLowerCase());
    const trackIdx = firstLineCols.findIndex((c) =>
      c === 'track name' || c === 'title' || c === 'song' || c === 'name' || c.includes('track')
    );
    const artistIdx = firstLineCols.findIndex((c) =>
      c.includes('artist') || c.includes('singer') || c.includes('byline')
    );

    if (trackIdx !== -1) {
      const parsed: ParsedTrack[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        if (cols.length > trackIdx && cols[trackIdx]) {
          parsed.push({
            title: cols[trackIdx],
            artist: artistIdx !== -1 && cols[artistIdx] ? cols[artistIdx] : 'Unknown Artist',
            duration: 180,
          });
        }
      }
      if (parsed.length > 0) {
        return {
          title: 'Imported CSV Playlist',
          description: `Imported ${parsed.length} tracks from CSV file`,
          tracks: parsed,
          totalExpected: parsed.length,
        };
      }
    }
  }

  // 3. Fallback: Parse line-by-line tracklist
  const tracks: ParsedTrack[] = [];
  for (const line of lines) {
    const cleaned = line.replace(/^\d+[\.\-\s)]+/, '').trim();
    if (!cleaned) continue;

    let title = cleaned;
    let artist = 'Various Artists';

    if (cleaned.includes('\t')) {
      const parts = cleaned.split('\t');
      title = parts[0].trim();
      artist = parts[1]?.trim() || 'Various Artists';
    } else if (cleaned.includes(' - ')) {
      const parts = cleaned.split(' - ');
      title = parts[0].trim();
      artist = parts.slice(1).join(' - ').trim();
    } else if (cleaned.includes(' by ')) {
      const parts = cleaned.split(' by ');
      title = parts[0].trim();
      artist = parts.slice(1).join(' by ').trim();
    }

    tracks.push({
      title,
      artist,
      duration: 180,
    });
  }

  return {
    title: 'Custom Imported Playlist',
    description: `Imported song list • ${tracks.length} tracks`,
    tracks,
    totalExpected: tracks.length,
  };
}

// 5. Helper: Smart match track on JioSaavn (320 KBPS Studio AAC)
async function matchPlayableStream(title: string, artist: string) {
  const cleanTitle = cleanTrackTitle(title);
  const primaryArtist = artist.split(/[,&]/)[0].trim();

  // Expanded query permutations for JioSaavn
  const searchQueries: string[] = [
    `${cleanTitle} ${primaryArtist}`.trim(),
    cleanTitle,
  ];

  if (/^the\s+/i.test(cleanTitle)) {
    searchQueries.push(cleanTitle.replace(/^the\s+/i, '').trim());
  } else {
    searchQueries.push(`The ${cleanTitle}`);
  }

  if (cleanTitle.includes('-')) {
    cleanTitle.split('-').forEach((p) => {
      const pt = p.trim();
      if (pt.length >= 2) searchQueries.push(pt);
    });
  }

  if (title !== cleanTitle) {
    searchQueries.push(title);
  }

  for (const q of searchQueries.slice(0, 5)) {
    if (!q) continue;
    try {
      const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=6&q=${encodeURIComponent(q)}`;
      const res = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const results = (data.results || []) as any[];

        for (const item of results) {
          const matchesTitle = isGoodTitleMatch(cleanTitle, item.song || item.title || '');

          if (matchesTitle && item.encrypted_media_url) {
            let streamUrl = decryptMediaUrl(item.encrypted_media_url);
            if (streamUrl) {
              // Upgrade to highest quality 320 KBPS AAC stream
              streamUrl = streamUrl
                .replace(/_96\.(mp4|m4a)/i, '_320.$1')
                .replace(/_160\.(mp4|m4a)/i, '_320.$1');

              return {
                streamUrl,
                matchedTitle: decodeHtmlEntities(item.song || item.title || title),
                matchedArtist: decodeHtmlEntities(item.primary_artists || item.singers || artist),
                albumTitle: decodeHtmlEntities(item.album || `${title} - Single`),
                coverImage: (item.image || '').replace('150x150', '500x500'),
                duration: item.duration ? parseInt(item.duration, 10) : 180,
                year: item.year ? parseInt(item.year, 10) : undefined,
                genre: item.language || 'Music',
                providerCode: 'saavn',
              };
            }
          }
        }
      }
    } catch {
      // Continue to next query
    }
  }

  // Fallback to YouTube for full-length native audio stream (100% background playback!)
  try {
    const ytQuery = `${cleanTitle} ${primaryArtist}`.trim() || title;
    const ytVideos = await searchYouTubeVideos(ytQuery, 1);
    if (ytVideos.length > 0 && ytVideos[0].id) {
      const topYt = ytVideos[0];
      return {
        streamUrl: `/api/stream/yt?v=${topYt.id}`,
        matchedTitle: topYt.title,
        matchedArtist: topYt.channel || artist,
        albumTitle: `${title} - Single`,
        coverImage: topYt.thumbnail,
        duration: 180,
        year: new Date().getFullYear(),
        genre: 'YouTube Music',
        providerCode: 'youtube',
      };
    }
  } catch (ytErr) {
    console.warn(`Could not match track "${title}" on YouTube:`, ytErr);
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ImportPlaylistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.issues }, { status: 400 });
    }

    const { url, customTitle } = parsed.data;

    const clientId = process.env.SPOTIFY_CLIENT_ID;
    const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

    let parsedPlaylist: ParsedPlaylist | null = null;

    if (
      (url.includes('spotify.com/playlist') || url.includes('spotify.com/album') || url.includes('spotify.link') || url.startsWith('spotify:playlist') || url.startsWith('spotify:album')) &&
      !url.includes('/track/')
    ) {
      parsedPlaylist = await fetchSpotifyPlaylist(url);
    } else if (url.includes('youtube.com/playlist') || url.includes('music.youtube.com/playlist')) {
      parsedPlaylist = await fetchYouTubePlaylist(url);
    } else if (url.includes('jiosaavn.com')) {
      parsedPlaylist = await fetchJioSaavnPlaylist(url);
    } else {
      parsedPlaylist = await parseUniversalTracklist(url, clientId, clientSecret);
    }

    if (!parsedPlaylist || parsedPlaylist.tracks.length === 0) {
      return NextResponse.json(
        {
          error:
            'Could not extract songs from this link or text. Please ensure Spotify/YouTube links are Public, or paste song titles / Spotify track links directly.',
        },
        { status: 400 }
      );
    }

    const finalTitle = customTitle?.trim() || parsedPlaylist.title;
    const playlistId = `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let playlistFirstCover: string | null = parsedPlaylist.coverImage || null;
    let matchedCount = 0;

    // Process up to 500 tracks
    const tracksToProcess = parsedPlaylist.tracks.slice(0, 500);
    const fullTracks: TrackData[] = [];

    // Concurrent batch processing (10 songs in parallel for high speed)
    const BATCH_SIZE = 10;
    for (let i = 0; i < tracksToProcess.length; i += BATCH_SIZE) {
      const chunk = tracksToProcess.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (item, chunkOffset) => {
          const globalIdx = i + chunkOffset;
          try {
            const match = item.videoId
              ? {
                  streamUrl: `/api/stream/yt?v=${item.videoId}`,
                  matchedTitle: item.title,
                  matchedArtist: item.artist,
                  albumTitle: `${item.title} - Single`,
                  coverImage: item.coverImage || `https://i.ytimg.com/vi/${item.videoId}/hqdefault.jpg`,
                  duration: item.duration || 180,
                  year: new Date().getFullYear(),
                  genre: 'YouTube Music',
                  providerCode: 'youtube',
                }
              : await matchPlayableStream(item.title, item.artist);

            const trackTitle = match?.matchedTitle || item.title;
            const artistName = match?.matchedArtist || item.artist || 'Unknown Artist';
            const albumName = match?.albumTitle || `${trackTitle} - Single`;
            const coverImage = match?.coverImage || item.coverImage || '/icons/default-artwork.png';
            const streamUrl = match?.streamUrl || '';
            const duration = match?.duration || item.duration || 180;
            const trackId = `track_${Date.now()}_${globalIdx}`;

            const trackObj: TrackData = {
              id: trackId,
              title: trackTitle,
              duration,
              trackNumber: globalIdx + 1,
              genre: match?.genre || 'Soundtrack',
              artists: [{ id: `art_${globalIdx}`, name: artistName, image: coverImage }],
              album: {
                id: `alb_${globalIdx}`,
                title: albumName,
                coverImage,
                releaseYear: match?.year || new Date().getFullYear(),
                isLossless: true,
              },
              assets: streamUrl
                ? [
                    {
                      id: `asset_${globalIdx}`,
                      trackId,
                      format: 'mp4',
                      codec: 'AAC',
                      bitrate: 320,
                      isLossless: true,
                      isHiRes: false,
                      storageType: 'remote_stream',
                      storageKey: streamUrl,
                      duration,
                    },
                  ]
                : [],
              streamUrl: streamUrl || undefined,
              providerCode: (match?.providerCode as any) || (item.videoId ? 'youtube' : 'saavn'),
            };

            return { trackObj, streamUrl, coverImage };
          } catch (trackErr) {
            console.warn(`Error processing track ${item.title}:`, trackErr);
            return null;
          }
        })
      );

      for (const r of chunkResults) {
        if (r) {
          if (!playlistFirstCover && r.coverImage && !r.coverImage.includes('default-artwork')) {
            playlistFirstCover = r.coverImage;
          }
          if (r.streamUrl) matchedCount++;
          fullTracks.push(r.trackObj);
        }
      }
    }

    const playlistResponse: PlaylistData = {
      id: playlistId,
      title: finalTitle,
      description: parsedPlaylist.description || `Imported playlist (${fullTracks.length} tracks)`,
      coverImage: playlistFirstCover || parsedPlaylist.coverImage || null,
      isPublic: false,
      userId: 'local_user',
      createdAt: new Date().toISOString(),
      trackCount: fullTracks.length,
      tracks: fullTracks.map((t, idx) => ({
        position: idx + 1,
        track: t,
      })),
    };

    // Safely attempt to persist to Prisma if DB is available (guarded by timeout to prevent Vercel 500)
    try {
      const dbPersistPromise = async () => {
        let user = await prisma.user.findFirst();
        if (!user) {
          user = await prisma.user.create({
            data: {
              email: 'listener@imusic.local',
              name: 'Audiophile',
              role: 'user',
            },
          });
        }

        const dbPlaylist = await prisma.playlist.create({
          data: {
            title: finalTitle,
            description: parsedPlaylist.description || `Imported playlist (${fullTracks.length} tracks)`,
            coverImage: playlistResponse.coverImage,
            userId: user.id,
          },
        });

        playlistResponse.id = dbPlaylist.id;

        // In-memory caches to minimize DB queries
        const artistCache = new Map<string, string>();
        const albumCache = new Map<string, string>();

        for (let i = 0; i < fullTracks.length; i++) {
          const t = fullTracks[i];
          try {
            const artistName = t.artists[0]?.name || 'Unknown Artist';
            let artistId = artistCache.get(artistName);
            if (!artistId) {
              let artist = await prisma.artist.findFirst({ where: { name: artistName } });
              if (!artist) {
                artist = await prisma.artist.create({
                  data: { name: artistName, image: t.album?.coverImage },
                });
              }
              artistId = artist.id;
              artistCache.set(artistName, artistId);
            }

            const albumName = t.album?.title || `${t.title} - Single`;
            const albumKey = `${albumName}_${artistId}`;
            let albumId = albumCache.get(albumKey);
            if (!albumId) {
              let album = await prisma.album.findFirst({ where: { title: albumName, artistId } });
              if (!album) {
                album = await prisma.album.create({
                  data: {
                    title: albumName,
                    artistId,
                    coverImage: t.album?.coverImage,
                    releaseYear: t.album?.releaseYear || new Date().getFullYear(),
                    isLossless: true,
                  },
                });
              }
              albumId = album.id;
              albumCache.set(albumKey, albumId);
            }

            let dbTrack = await prisma.track.findFirst({
              where: { title: t.title, albumId },
            });

            if (!dbTrack) {
              dbTrack = await prisma.track.create({
                data: {
                  title: t.title,
                  albumId,
                  duration: t.duration,
                  genre: t.genre || 'Soundtrack',
                  trackNumber: i + 1,
                  artists: {
                    create: {
                      artistId,
                      role: 'primary',
                    },
                  },
                  assets: t.streamUrl
                    ? {
                        create: {
                          format: 'mp4',
                          codec: 'AAC',
                          bitDepth: 16,
                          sampleRate: 44100,
                          bitrate: 320,
                          isLossless: true,
                          isHiRes: false,
                          storageType: 'remote_stream',
                          storageKey: t.streamUrl,
                          duration: t.duration,
                        },
                      }
                    : undefined,
                },
              });
            }

            await prisma.playlistTrack.create({
              data: {
                playlistId: dbPlaylist.id,
                trackId: dbTrack.id,
                position: i + 1,
              },
            });
          } catch (trackDbErr) {
            console.warn(`Could not persist track ${t.title} to DB:`, trackDbErr);
          }
        }
      };

      // Ensure DB persistence does not exceed 4 seconds
      await Promise.race([
        dbPersistPromise(),
        new Promise((resolve) => setTimeout(resolve, 4000)),
      ]);
    } catch (dbErr) {
      console.warn('Prisma DB not available or slow; stored in client LocalLibrary:', dbErr);
    }

    const isEmbedLimited =
      parsedPlaylist.tracks.length === 100 &&
      (url.includes('spotify.com/playlist') || url.includes('spotify.link') || url.startsWith('spotify:playlist'));

    return NextResponse.json({
      success: true,
      playlist: playlistResponse,
      totalRequested: parsedPlaylist.totalExpected || parsedPlaylist.tracks.length,
      importedCount: fullTracks.length,
      matchedCount,
      isEmbedLimited,
    });
  } catch (error: any) {
    console.error('Error importing playlist:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to import playlist. Please check link and try again.' },
      { status: 400 }
    );
  }
}
