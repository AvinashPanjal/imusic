import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { FEATURED_SOUNDTRACKS } from '@/lib/constants/soundtracks';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filterHiRes = searchParams.get('hires') === 'true';

    let dbAlbums: any[] = [];
    try {
      dbAlbums = await prisma.album.findMany({
        where: filterHiRes ? { isHiRes: true } : undefined,
        include: {
          artist: true,
          _count: { select: { tracks: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
    } catch (e) {
      console.warn('Could not query DB albums, falling back to featured:', e);
    }

    const formattedDb = dbAlbums.map((al) => ({
      id: al.id,
      title: al.title,
      coverImage: al.coverImage,
      releaseYear: al.releaseYear,
      genre: al.genre,
      totalTracks: al._count?.tracks || 0,
      isHiRes: al.isHiRes,
      isLossless: al.isLossless,
      artist: {
        id: al.artist?.id || 'unknown',
        name: al.artist?.name || 'Various Artists',
      },
    }));

    // Include featured soundtracks alongside DB albums
    const combined = [...formattedDb, ...FEATURED_SOUNDTRACKS];

    return NextResponse.json({ albums: combined });
  } catch (error) {
    console.error('Error fetching albums:', error);
    return NextResponse.json({ albums: FEATURED_SOUNDTRACKS });
  }
}
