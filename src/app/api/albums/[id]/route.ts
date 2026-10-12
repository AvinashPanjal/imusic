import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptMediaUrl } from '@/lib/providers/IndianMusicProvider';
import { TrackData } from '@/types/music';

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&copy;/g, '©');
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    // Handle online soundtrack / movie albums from JioSaavn
    if (id.startsWith('saavn-album-')) {
      const albumId = id.replace('saavn-album-', '');
      const url = `https://www.jiosaavn.com/api.php?__call=content.getAlbumDetails&_format=json&_marker=0&cc=in&albumid=${encodeURIComponent(
        albumId
      )}`;

      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
        },
        next: { revalidate: 3600 }, // Cache for 1 hour
      });

      if (!res.ok) {
        return NextResponse.json({ error: 'Album not found' }, { status: 404 });
      }

      const albumData = await res.json();
      if (!albumData || (!albumData.title && !albumData.name)) {
        return NextResponse.json({ error: 'Album not found' }, { status: 404 });
      }

      const albumTitle = decodeHtmlEntities(albumData.title || albumData.name || 'Soundtrack');
      const rawCover = albumData.image || '';
      const highResCover = rawCover
        ? rawCover.replace(/150x150\.jpg$/, '500x500.jpg')
        : '/icons/default-artwork.png';
      const artistName = decodeHtmlEntities(
        albumData.primary_artists || albumData.music || 'Soundtrack'
      );
      const releaseYear = parseInt(albumData.year, 10) || 2024;
      const recordLabel = decodeHtmlEntities(albumData.label || 'Original Soundtrack');

      const rawSongs = (albumData.songs || []) as any[];
      const tracks: TrackData[] = [];

      rawSongs.forEach((s, idx) => {
        const streamUrl = decryptMediaUrl(s.encrypted_media_url);
        if (!streamUrl) return;

        const songTitle = decodeHtmlEntities(s.song || s.title || `Track ${idx + 1}`);
        const songArtists = decodeHtmlEntities(
          s.singers || s.primary_artists || s.music || artistName
        );
        const songCover = (s.image || rawCover).replace(/150x150\.jpg$/, '500x500.jpg');
        const duration = parseInt(s.duration, 10) || 210;

        tracks.push({
          id: `saavn-${s.id}`,
          title: songTitle,
          duration,
          genre: `${albumData.language ? albumData.language.toUpperCase() : 'SOUNDTRACK'}`,
          trackNumber: idx + 1,
          discNumber: 1,
          hasLyrics: s.has_lyrics === 'true',
          lyricsPlain: s.lyrics_snippet || null,
          lyricsSynced: null,
          streamUrl,
          providerCode: 'indian_music_vault',
          album: {
            id,
            title: albumTitle,
            coverImage: highResCover,
            releaseYear,
            artistName,
            isHiRes: false,
            isLossless: true,
          },
          artists: songArtists.split(',').map((name, i) => ({
            id: `saavn-art-${s.id}-${i}`,
            name: name.trim(),
          })),
          assets: [
            {
              id: `saavn-asset-${s.id}`,
              trackId: `saavn-${s.id}`,
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
        });
      });

      return NextResponse.json({
        album: {
          id,
          title: albumTitle,
          coverImage: highResCover,
          releaseYear,
          genre: `${albumData.language ? albumData.language.toUpperCase() : 'SOUNDTRACK'}`,
          recordLabel,
          isHiRes: false,
          isLossless: true,
          artist: {
            id: `saavn-artist-${albumData.primary_artists_id || 'soundtrack'}`,
            name: artistName,
            image: highResCover,
          },
          tracks,
        },
      });
    }

    // Default library album lookup in database
    const album = await prisma.album.findUnique({
      where: { id },
      include: {
        artist: true,
        tracks: {
          include: {
            artists: { include: { artist: true } },
            assets: true,
          },
          orderBy: { trackNumber: 'asc' },
        },
      },
    });

    if (!album) {
      return NextResponse.json({ error: 'Album not found' }, { status: 404 });
    }

    return NextResponse.json({
      album: {
        id: album.id,
        title: album.title,
        coverImage: album.coverImage,
        releaseYear: album.releaseYear,
        genre: album.genre,
        recordLabel: album.recordLabel,
        isHiRes: album.isHiRes,
        isLossless: album.isLossless,
        artist: {
          id: album.artist.id,
          name: album.artist.name,
          image: album.artist.image,
        },
        tracks: album.tracks.map((t) => ({
          id: t.id,
          title: t.title,
          duration: t.duration,
          trackNumber: t.trackNumber,
          discNumber: t.discNumber,
          hasLyrics: t.hasLyrics,
          lyricsPlain: t.lyricsPlain,
          lyricsSynced: t.lyricsSynced,
          album: {
            id: album.id,
            title: album.title,
            coverImage: album.coverImage,
            releaseYear: album.releaseYear,
            isHiRes: album.isHiRes,
            isLossless: album.isLossless,
          },
          artists: t.artists.map((a) => ({
            id: a.artist.id,
            name: a.artist.name,
          })),
          assets: t.assets.map((ast) => ({
            id: ast.id,
            format: ast.format,
            codec: ast.codec,
            bitDepth: ast.bitDepth,
            sampleRate: ast.sampleRate,
            bitrate: ast.bitrate,
            isLossless: ast.isLossless,
            isHiRes: ast.isHiRes,
            storageType: ast.storageType,
            storageKey: ast.storageKey,
          })),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching album details:', error);
    return NextResponse.json({ error: 'Failed to fetch album' }, { status: 500 });
  }
}
