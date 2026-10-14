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

// 1. Fetch via Official Spotify Web API with Client Credentials (supports 200+ songs pagination)
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

    const metaRes = await fetch(`https://api.spotify.com/v1/${endpointType}/${id}`, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    if (!metaRes.ok) return null;
    const meta = await metaRes.json();
    const playlistName = meta.name || (isAlbum ? 'Imported Spotify Album' : 'Imported Spotify Playlist');
    const description = meta.description || `Imported from Spotify • ${meta.owner?.display_name || ''}`;
    const coverImage = meta.images?.[0]?.url || null;
    const totalExpected = isAlbum ? meta.total_tracks : meta.tracks?.total;

    const allTracks: ParsedTrack[] = [];
    let offset = 0;
    const limit = 100;
    let hasMore = true;

    while (hasMore && allTracks.length < 500) {
      const pageUrl = isAlbum
        ? `https://api.spotify.com/v1/albums/${id}/tracks?limit=${limit}&offset=${offset}`
        : `https://api.spotify.com/v1/playlists/${id}/tracks?limit=${limit}&offset=${offset}&fields=items(track(name,artists(name),duration_ms,album(name,images))),next,total`;

      const pageRes = await fetch(pageUrl, {
        headers: { Authorization: `Bearer ${access_token}` },
      });

      if (!pageRes.ok) break;
      const pageData = await pageRes.json();
      const items = pageData.items || [];

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

      if (pageData.next && items.length === limit) {
        offset += limit;
      } else {
        hasMore = false;
      }
    }

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

// 4. Fallback: Parse Plain Text Tracklist (e.g. "Song Name - Artist Name" or pasted list)
function parseRawTracklist(text: string): ParsedPlaylist {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));

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

    let parsedPlaylist: ParsedPlaylist | null = null;

    if (url.includes('spotify.com') || url.includes('spotify.link') || url.startsWith('spotify:')) {
      parsedPlaylist = await fetchSpotifyPlaylist(url);
    } else if (url.includes('jiosaavn.com')) {
      parsedPlaylist = await fetchJioSaavnPlaylist(url);
    }

    // Fallback: plain text list of songs
    if (!parsedPlaylist || parsedPlaylist.tracks.length === 0) {
      if (!url.startsWith('http://') && !url.startsWith('https://')) {
        parsedPlaylist = parseRawTracklist(url);
      }
    }

    if (!parsedPlaylist || parsedPlaylist.tracks.length === 0) {
      return NextResponse.json(
        {
          error:
            'Could not extract songs from this Spotify link. Please ensure the playlist is Public (not Private) in Spotify, or paste the song titles directly.',
        },
        { status: 400 }
      );
    }

    const finalTitle = customTitle?.trim() || parsedPlaylist.title;
    const playlistId = `pl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let playlistFirstCover: string | null = parsedPlaylist.coverImage || null;
    let matchedCount = 0;

    // Process up to 300 tracks (removed arbitrary 50 limit)
    const tracksToProcess = parsedPlaylist.tracks.slice(0, 300);
    const fullTracks: TrackData[] = [];

    // Concurrent batch processing (8 songs in parallel for high speed)
    const BATCH_SIZE = 8;
    for (let i = 0; i < tracksToProcess.length; i += BATCH_SIZE) {
      const chunk = tracksToProcess.slice(i, i + BATCH_SIZE);
      const chunkResults = await Promise.all(
        chunk.map(async (item, chunkOffset) => {
          const globalIdx = i + chunkOffset;
          try {
            const match = await matchPlayableStream(item.title, item.artist);

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
              providerCode: 'saavn',
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
      !process.env.SPOTIFY_CLIENT_ID &&
      (url.includes('spotify.com') || url.includes('spotify.link'));

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
