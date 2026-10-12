import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const FavoriteSchema = z.object({
  trackId: z.string().min(1),
});

export async function GET(request: NextRequest) {
  try {
    let user = await prisma.user.findFirst();
    if (!user) {
      return NextResponse.json({ favorites: [] });
    }

    const favorites = await prisma.favorite.findMany({
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
      orderBy: { createdAt: 'desc' },
    });

    const formatted = favorites.map((f) => ({
      id: f.track.id,
      title: f.track.title,
      duration: f.track.duration,
      trackNumber: f.track.trackNumber,
      genre: f.track.genre,
      hasLyrics: f.track.hasLyrics,
      isFavorite: true,
      album: f.track.album
        ? {
            id: f.track.album.id,
            title: f.track.album.title,
            coverImage: f.track.album.coverImage,
            releaseYear: f.track.album.releaseYear,
            isHiRes: f.track.album.isHiRes,
            isLossless: f.track.album.isLossless,
          }
        : null,
      artists: f.track.artists.map((a) => ({
        id: a.artist.id,
        name: a.artist.name,
      })),
      assets: f.track.assets.map((ast) => ({
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

    return NextResponse.json({ favorites: formatted });
  } catch (error) {
    console.error('Error fetching favorites:', error);
    return NextResponse.json({ error: 'Failed to fetch favorites' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = FavoriteSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.issues }, { status: 400 });
    }

    const { trackId } = parsed.data;

    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { email: 'listener@imusic.local', name: 'Audiophile' },
      });
    }

    const favorite = await prisma.favorite.upsert({
      where: {
        userId_trackId: {
          userId: user.id,
          trackId,
        },
      },
      create: {
        userId: user.id,
        trackId,
      },
      update: {},
    });

    return NextResponse.json({ favorite }, { status: 201 });
  } catch (error) {
    console.error('Error creating favorite:', error);
    return NextResponse.json({ error: 'Failed to add favorite' }, { status: 500 });
  }
}
