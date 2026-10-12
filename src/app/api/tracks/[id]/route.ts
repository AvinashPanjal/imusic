import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const track = await prisma.track.findUnique({
      where: { id },
      include: {
        album: true,
        artists: { include: { artist: true } },
        assets: true,
      },
    });

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    return NextResponse.json({
      track: {
        id: track.id,
        title: track.title,
        duration: track.duration,
        trackNumber: track.trackNumber,
        genre: track.genre,
        hasLyrics: track.hasLyrics,
        lyricsSynced: track.lyricsSynced,
        lyricsPlain: track.lyricsPlain,
        playCount: track.playCount,
        album: track.album
          ? {
              id: track.album.id,
              title: track.album.title,
              coverImage: track.album.coverImage,
              releaseYear: track.album.releaseYear,
              isHiRes: track.album.isHiRes,
              isLossless: track.album.isLossless,
            }
          : null,
        artists: track.artists.map((a) => ({
          id: a.artist.id,
          name: a.artist.name,
          image: a.artist.image,
        })),
        assets: track.assets.map((ast) => ({
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
      },
    });
  } catch (error) {
    console.error('Error fetching track by ID:', error);
    return NextResponse.json({ error: 'Failed to fetch track' }, { status: 500 });
  }
}
