import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptMediaUrl, decodeHtmlEntities } from '@/lib/providers/IndianMusicProvider';
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
async function fetchSpotifyPlaylist(url: string): Promise<ParsedPlaylist | null> {
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

    if (!res.ok) return null;
    const html = await res.text();
    const scriptMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!scriptMatch) return null;

    const data = JSON.parse(scriptMatch[1]);
    const entity = data.props?.pageProps?.state?.data?.entity;
    if (!entity) return null;

    const playlistName = entity.name || (isAlbum ? 'Imported Spotify Album' : 'Imported Spotify Playlist');
    const description = entity.subtitle ? `Curated by ${entity.subtitle} on Spotify` : 'Imported from Spotify';
    const coverImage = entity.coverArt?.sources?.[0]?.url || null;

    const rawTracks = (entity.trackList || []) as any[];
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
  } catch (err) {
    console.error('Error scraping Spotify playlist:', err);
    return null;
  }
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
    console.error('Error parsing JioSaavn playlist:', err);
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
    // Remove leading numbering like "1. ", "01 - "
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

// Helper: Search JioSaavn to match a track and retrieve high quality 320 KBPS playable audio stream
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
          // Upgrade to 320 KBPS
          streamUrl = streamUrl.replace(/_96\.(mp4|m4a)/i, '_320.$1').replace(/_160\.(mp4|m4a)/i, '_320.$1');
        }
        return {
          streamUrl,
          matchedTitle: decodeHtmlEntities(top.song || top.title || title),
          matchedArtist: decodeHtmlEntities(top.primary_artists || top.singers || artist),
          albumTitle: decodeHtmlEntities(top.album || `${title} - Single`),
          coverImage: (top.image || '').replace('150x150', '500x500'),
          duration: top.duration ? parseInt(top.duration, 10) : 180,
          year: top.year ? parseInt(top.year, 10) : undefined,
          genre: top.language || 'Music',
        };
      }
    }
  } catch (err) {
    console.warn(`Could not match track "${query}":`, err);
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

    if (url.includes('spotify.com') || url.startsWith('spotify:')) {
      parsedPlaylist = await fetchSpotifyPlaylist(url);
    } else if (url.includes('jiosaavn.com')) {
      parsedPlaylist = await fetchJioSaavnPlaylist(url);
    }

    // Fallback: plain text list of songs
    if (!parsedPlaylist || parsedPlaylist.tracks.length === 0) {
      parsedPlaylist = parseRawTracklist(url);
    }

    if (!parsedPlaylist || parsedPlaylist.tracks.length === 0) {
      return NextResponse.json(
        { error: 'Could not extract any songs from this playlist link. Please verify the URL or paste song titles.' },
        { status: 422 }
      );
    }

    // Default user
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

    const finalTitle = customTitle?.trim() || parsedPlaylist.title;

    // Create the playlist in DB
    const playlist = await prisma.playlist.create({
      data: {
        title: finalTitle,
        description: parsedPlaylist.description || `Imported playlist (${parsedPlaylist.tracks.length} tracks)`,
        coverImage: parsedPlaylist.coverImage,
        userId: user.id,
      },
    });

    let matchedCount = 0;
    let playlistFirstCover: string | null = parsedPlaylist.coverImage || null;

    // Process & match tracks up to 50 tracks to keep request responsive
    const tracksToProcess = parsedPlaylist.tracks.slice(0, 50);

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

        if (!playlistFirstCover && coverImage && !coverImage.includes('default-artwork')) {
          playlistFirstCover = coverImage;
        }

        // Upsert Artist
        let artist = await prisma.artist.findFirst({
          where: { name: artistName },
        });
        if (!artist) {
          artist = await prisma.artist.create({
            data: { name: artistName, image: coverImage },
          });
        }

        // Upsert Album
        let album = await prisma.album.findFirst({
          where: { title: albumName, artistId: artist.id },
        });
        if (!album) {
          album = await prisma.album.create({
            data: {
              title: albumName,
              artistId: artist.id,
              coverImage,
              releaseYear: match?.year || new Date().getFullYear(),
              isLossless: true,
            },
          });
        }

        // Upsert Track
        let track = await prisma.track.findFirst({
          where: { title: trackTitle, albumId: album.id },
        });

        if (!track) {
          track = await prisma.track.create({
            data: {
              title: trackTitle,
              albumId: album.id,
              duration,
              genre: match?.genre || 'Soundtrack',
              trackNumber: i + 1,
              artists: {
                create: {
                  artistId: artist.id,
                  role: 'primary',
                },
              },
              assets: streamUrl
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
                      storageKey: streamUrl,
                      duration,
                    },
                  }
                : undefined,
            },
          });
        }

        if (streamUrl) matchedCount++;

        // Connect track to playlist
        await prisma.playlistTrack.create({
          data: {
            playlistId: playlist.id,
            trackId: track.id,
            position: i + 1,
          },
        });
      } catch (trackErr) {
        console.warn(`Error importing track ${item.title}:`, trackErr);
      }
    }

    // If playlist cover wasn't set originally, set from first matched cover
    if (playlistFirstCover && !playlist.coverImage) {
      await prisma.playlist.update({
        where: { id: playlist.id },
        data: { coverImage: playlistFirstCover },
      });
    }

    return NextResponse.json({
      success: true,
      playlist: {
        id: playlist.id,
        title: playlist.title,
        trackCount: tracksToProcess.length,
        coverImage: playlistFirstCover || playlist.coverImage,
      },
      totalRequested: parsedPlaylist.tracks.length,
      importedCount: tracksToProcess.length,
      matchedCount,
    });
  } catch (error) {
    console.error('Error importing playlist:', error);
    return NextResponse.json({ error: 'Failed to import playlist' }, { status: 500 });
  }
}
