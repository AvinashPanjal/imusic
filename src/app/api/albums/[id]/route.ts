import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
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
