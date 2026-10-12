import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const artist = await prisma.artist.findUnique({
      where: { id },
      include: {
        albums: {
          include: { _count: { select: { tracks: true } } },
        },
        tracks: {
          include: {
            track: {
              include: {
                album: true,
                assets: true,
                artists: { include: { artist: true } },
              },
            },
          },
          take: 30,
        },
      },
    });

    if (!artist) {
      return NextResponse.json({ error: 'Artist not found' }, { status: 404 });
    }

    return NextResponse.json({
      artist: {
        id: artist.id,
        name: artist.name,
        bio: artist.bio,
        image: artist.image,
        heroImage: artist.heroImage,
        albums: artist.albums.map((al) => ({
          id: al.id,
          title: al.title,
          coverImage: al.coverImage,
          releaseYear: al.releaseYear,
          isHiRes: al.isHiRes,
          isLossless: al.isLossless,
          totalTracks: al._count.tracks,
        })),
        topTracks: artist.tracks.map((t) => ({
          id: t.track.id,
          title: t.track.title,
          duration: t.track.duration,
          hasLyrics: t.track.hasLyrics,
          album: t.track.album
            ? {
                id: t.track.album.id,
                title: t.track.album.title,
                coverImage: t.track.album.coverImage,
              }
            : null,
          artists: t.track.artists.map((a) => ({
            id: a.artist.id,
            name: a.artist.name,
          })),
          assets: t.track.assets.map((ast) => ({
            id: ast.id,
            codec: ast.codec,
            bitDepth: ast.bitDepth,
            sampleRate: ast.sampleRate,
            isHiRes: ast.isHiRes,
            isLossless: ast.isLossless,
          })),
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching artist detail:', error);
    return NextResponse.json({ error: 'Failed to fetch artist' }, { status: 500 });
  }
}
