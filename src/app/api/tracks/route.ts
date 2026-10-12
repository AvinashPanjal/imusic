import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const filterHiRes = searchParams.get('hires') === 'true';

    const tracks = await prisma.track.findMany({
      where: filterHiRes
        ? {
            assets: {
              some: {
                isHiRes: true,
              },
            },
          }
        : undefined,
      include: {
        album: true,
        artists: { include: { artist: true } },
        assets: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const formatted = tracks.map((t) => ({
      id: t.id,
      title: t.title,
      duration: t.duration,
      trackNumber: t.trackNumber,
      genre: t.genre,
      hasLyrics: t.hasLyrics,
      lyricsSynced: t.lyricsSynced,
      lyricsPlain: t.lyricsPlain,
      playCount: t.playCount,
      album: t.album
        ? {
            id: t.album.id,
            title: t.album.title,
            coverImage: t.album.coverImage,
            releaseYear: t.album.releaseYear,
            isHiRes: t.album.isHiRes,
            isLossless: t.album.isLossless,
          }
        : null,
      artists: t.artists.map((a) => ({
        id: a.artist.id,
        name: a.artist.name,
        image: a.artist.image,
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
    }));

    return NextResponse.json({ tracks: formatted });
  } catch (error) {
    console.error('Error fetching tracks:', error);
    return NextResponse.json({ error: 'Failed to fetch tracks' }, { status: 500 });
  }
}
