import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const PlayHistorySchema = z.object({
  trackId: z.string().min(1),
  durationPlayed: z.number().optional(),
  completed: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  try {
    const user = await prisma.user.findFirst();
    if (!user) {
      return NextResponse.json({ history: [] });
    }

    const history = await prisma.playHistory.findMany({
      where: { userId: user.id },
      include: {
        track: {
          include: {
            album: true,
            artists: { include: { artist: true } },
            assets: true,
          },
        },
      },
      orderBy: { playedAt: 'desc' },
      take: 20,
    });

    const formatted = history.map((h) => ({
      historyId: h.id,
      playedAt: h.playedAt.toISOString(),
      track: {
        id: h.track.id,
        title: h.track.title,
        duration: h.track.duration,
        trackNumber: h.track.trackNumber,
        genre: h.track.genre,
        album: h.track.album
          ? {
              id: h.track.album.id,
              title: h.track.album.title,
              coverImage: h.track.album.coverImage,
              releaseYear: h.track.album.releaseYear,
              isHiRes: h.track.album.isHiRes,
              isLossless: h.track.album.isLossless,
            }
          : null,
        artists: h.track.artists.map((a) => ({
          id: a.artist.id,
          name: a.artist.name,
        })),
        assets: h.track.assets.map((ast) => ({
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
    }));

    return NextResponse.json({ history: formatted });
  } catch (error) {
    console.error('Error fetching recently played history:', error);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = PlayHistorySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.issues }, { status: 400 });
    }

    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { email: 'listener@imusic.local', name: 'Audiophile' },
      });
    }

    const record = await prisma.playHistory.create({
      data: {
        userId: user.id,
        trackId: parsed.data.trackId,
        durationPlayed: parsed.data.durationPlayed,
        completed: parsed.data.completed ?? false,
      },
    });

    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    console.error('Error logging play history:', error);
    return NextResponse.json({ error: 'Failed to record history' }, { status: 500 });
  }
}
