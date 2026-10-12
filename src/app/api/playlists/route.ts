import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const CreatePlaylistSchema = z.object({
  title: z.string().min(1, 'Playlist title is required').max(100),
  description: z.string().max(500).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const playlists = await prisma.playlist.findMany({
      include: {
        _count: { select: { tracks: true } },
        tracks: {
          include: {
            track: {
              include: { album: true },
            },
          },
          take: 4,
          orderBy: { position: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    const formatted = playlists.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      coverImage: p.coverImage || p.tracks[0]?.track?.album?.coverImage || null,
      trackCount: p._count.tracks,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    return NextResponse.json({ playlists: formatted });
  } catch (error) {
    console.error('Error fetching playlists:', error);
    return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreatePlaylistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.issues }, { status: 400 });
    }

    // Find default demo user or create if not exists
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

    const playlist = await prisma.playlist.create({
      data: {
        title: parsed.data.title,
        description: parsed.data.description,
        userId: user.id,
      },
    });

    return NextResponse.json({ playlist }, { status: 201 });
  } catch (error) {
    console.error('Error creating playlist:', error);
    return NextResponse.json({ error: 'Failed to create playlist' }, { status: 500 });
  }
}
