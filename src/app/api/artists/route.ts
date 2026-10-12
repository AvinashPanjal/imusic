import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const artists = await prisma.artist.findMany({
      include: {
        _count: { select: { albums: true, tracks: true } },
      },
      orderBy: { name: 'asc' },
      take: 50,
    });

    const formatted = artists.map((ar) => ({
      id: ar.id,
      name: ar.name,
      bio: ar.bio,
      image: ar.image,
      albumCount: ar._count.albums,
      trackCount: ar._count.tracks,
    }));

    return NextResponse.json({ artists: formatted });
  } catch (error) {
    console.error('Error fetching artists:', error);
    return NextResponse.json({ error: 'Failed to fetch artists' }, { status: 500 });
  }
}
