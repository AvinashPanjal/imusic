import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterHiRes = searchParams.get('hires') === 'true';

    const albums = await prisma.album.findMany({
      where: filterHiRes ? { isHiRes: true } : undefined,
      include: {
        artist: true,
        _count: { select: { tracks: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    const formatted = albums.map((al) => ({
      id: al.id,
      title: al.title,
      coverImage: al.coverImage,
      releaseYear: al.releaseYear,
      genre: al.genre,
      totalTracks: al._count.tracks,
      isHiRes: al.isHiRes,
      isLossless: al.isLossless,
      artist: {
        id: al.artist.id,
        name: al.artist.name,
      },
    }));

    return NextResponse.json({ albums: formatted });
  } catch (error) {
    console.error('Error fetching albums:', error);
    return NextResponse.json({ error: 'Failed to fetch albums' }, { status: 500 });
  }
}
