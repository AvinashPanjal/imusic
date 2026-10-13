import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptMediaUrl, decodeHtmlEntities } from '@/lib/providers/IndianMusicProvider';
import { searchYouTubeVideos } from '@/lib/providers/YouTubeProvider';
import { TrackData, PlaylistData } from '@/types/music';
import { z } from 'zod';

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
}

// 1. Fetch & Parse Spotify Playlist or Album
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
            previewUrl: t.audioPreview?.url || null,
            coverImage,
          }));

          return {
            title: playlistName,
            description,
            coverImage,
            tracks,
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

// 2. Fetch & Parse JioSaavn Playlist or Album
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
    };
  } catch (err) {
    console.warn('Error parsing JioSaavn playlist:', err);
    return null;
  }
}

// 3. Fallback: Parse Plain Text Tracklist (e.g. "Song Name - Artist Name" per line)
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

    if (cleaned.includes(' - ')) {
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
  };
}

// Helper: Search JioSaavn to match a track and retrieve high quality 320 KBPS playable audio stream, with YouTube fallback
async function matchPlayableStream(title: string, artist: string) {
  const query = `${title} ${artist}`.trim();
  const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=5&q=${encodeURIComponent(query)}`;

  try {
    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (res.ok) {
      const data = await res.json();
      const results = (data.results || []) as any[];
      if (results.length > 0) {
        const top = results[0];
        let streamUrl = decryptMediaUrl(top.encrypted_media_url);
        if (streamUrl) {
          // Upgrade to 320 KBPS AAC
          streamUrl = streamUrl.replace(/_96\.(mp4|m4a)/i, '_320.$1').replace(/_160\.(mp4|m4a)/i, '_320.$1');
          return {
            streamUrl,
            matchedTitle: decodeHtmlEntities(top.song || top.title || title),
            matchedArtist: decodeHtmlEntities(top.primary_artists || top.singers || artist),
            albumTitle: decodeHtmlEntities(top.album || `${title} - Single`),
            coverImage: (top.image || '').replace('150x150', '500x500'),
            duration: top.duration ? parseInt(top.duration, 10) : 180,
            year: top.year ? parseInt(top.year, 10) : undefined,
            genre: top.language || 'Music',
            providerCode: 'saavn',
          };
        }
      }
    }
  } catch (err) {
    console.warn(`Could not match track "${query}" on JioSaavn:`, err);
  }

  // Fallback to YouTube for 100% catalog coverage
  try {
    const ytVideos = await searchYouTubeVideos(query, 1);
    if (ytVideos.length > 0) {
      const topYt = ytVideos[0];
      return {
        streamUrl: `youtube:${topYt.id}`,
        matchedTitle: topYt.title,
        matchedArtist: topYt.channel || artist,
        albumTitle: `${title} - Single`,
        coverImage: topYt.thumbnail,
        duration: 180,
        year: new Date().getFullYear(),
        genre: 'YouTube Music',
        providerCode: 'youtube',
        youtubeId: topYt.id,
      };
    }
  } catch (ytErr) {
    console.warn(`Could not match track "${query}" on YouTube:`, ytErr);
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
      // Only parse as plain text if it looks like a track list and not a broken URL
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

    // Process up to 50 tracks
    const tracksToProcess = parsedPlaylist.tracks.slice(0, 50);
    const fullTracks: TrackData[] = [];

    for (let i = 0; i < tracksToProcess.length; i++) {
      const item = tracksToProcess[i];
      try {
        const match = await matchPlayableStream(item.title, item.artist);

        const trackTitle = match?.matchedTitle || item.title;
        const artistName = match?.matchedArtist || item.artist || 'Unknown Artist';
        const albumName = match?.albumTitle || `${trackTitle} - Single`;
        const coverImage = match?.coverImage || item.coverImage || '/icons/default-artwork.png';
        const streamUrl = match?.streamUrl || item.previewUrl || '';
        const duration = match?.duration || item.duration || 180;
        const isYt = match?.providerCode === 'youtube' || streamUrl.startsWith('youtube:');

        if (!playlistFirstCover && coverImage && !coverImage.includes('default-artwork')) {
          playlistFirstCover = coverImage;
        }

        if (streamUrl) matchedCount++;

        const trackId = isYt
          ? `yt-${match?.youtubeId || streamUrl.replace('youtube:', '')}`
          : `track_${Date.now()}_${i}`;

        const trackObj: TrackData = {
          id: trackId,
          title: trackTitle,
          duration,
          trackNumber: i + 1,
          genre: match?.genre || 'Soundtrack',
          artists: [{ id: `art_${i}`, name: artistName, image: coverImage }],
          album: {
            id: `alb_${i}`,
            title: albumName,
            coverImage,
            releaseYear: match?.year || new Date().getFullYear(),
            isLossless: !isYt,
          },
          assets: streamUrl
            ? [
                {
                  id: `asset_${i}`,
                  trackId,
                  format: isYt ? 'm4a' : 'mp4',
                  codec: 'AAC',
                  bitrate: isYt ? 160 : 320,
                  isLossless: !isYt,
                  isHiRes: false,
                  storageType: 'remote_stream',
                  storageKey: streamUrl,
                  duration,
                },
              ]
            : [],
          streamUrl: streamUrl || undefined,
          providerCode: isYt ? 'youtube' : 'saavn',
          externalUrl: isYt ? `https://www.youtube.com/watch?v=${match?.youtubeId}` : undefined,
        };

        fullTracks.push(trackObj);
      } catch (trackErr) {
        console.warn(`Error processing track ${item.title}:`, trackErr);
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

    // Safely attempt to persist to Prisma if DB is available (never throws 500 if DB is down)
    try {
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

      // Upsert tracks in DB
      for (let i = 0; i < fullTracks.length; i++) {
        const t = fullTracks[i];
        try {
          const artistName = t.artists[0]?.name || 'Unknown Artist';
          let artist = await prisma.artist.findFirst({ where: { name: artistName } });
          if (!artist) {
            artist = await prisma.artist.create({
              data: { name: artistName, image: t.album?.coverImage },
            });
          }

          const albumName = t.album?.title || `${t.title} - Single`;
          let album = await prisma.album.findFirst({ where: { title: albumName, artistId: artist.id } });
          if (!album) {
            album = await prisma.album.create({
              data: {
                title: albumName,
                artistId: artist.id,
                coverImage: t.album?.coverImage,
                releaseYear: t.album?.releaseYear || new Date().getFullYear(),
                isLossless: true,
              },
            });
          }

          let dbTrack = await prisma.track.findFirst({
            where: { title: t.title, albumId: album.id },
          });

          if (!dbTrack) {
            dbTrack = await prisma.track.create({
              data: {
                title: t.title,
                albumId: album.id,
                duration: t.duration,
                genre: t.genre || 'Soundtrack',
                trackNumber: i + 1,
                artists: {
                  create: {
                    artistId: artist.id,
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
        } catch (dbTrackErr) {
          console.warn(`Could not persist track ${t.title} to DB:`, dbTrackErr);
        }
      }
    } catch (dbErr) {
      console.warn('Prisma DB not available on this host; playlist will be stored in client LocalLibrary:', dbErr);
    }

    return NextResponse.json({
      success: true,
      playlist: playlistResponse,
      totalRequested: parsedPlaylist.tracks.length,
      importedCount: fullTracks.length,
      matchedCount,
    });
  } catch (error: any) {
    console.error('Error importing playlist:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to import playlist. Please check link and try again.' },
      { status: 400 }
    );
  }
}
