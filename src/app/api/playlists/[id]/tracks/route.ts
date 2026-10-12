import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const AddTrackSchema = z.object({
  trackId: z.string().min(1),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id: playlistId } = params;
    const body = await request.json();
    const parsed = AddTrackSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.issues }, { status: 400 });
    }

    const { trackId } = parsed.data;

    // Check if playlist exists
    const playlist = await prisma.playlist.findUnique({
      where: { id: playlistId },
      include: { tracks: { orderBy: { position: 'desc' }, take: 1 } },
    });

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    const nextPosition = (playlist.tracks[0]?.position ?? -1) + 1;

    const playlistTrack = await prisma.playlistTrack.create({
      data: {
        playlistId,
        trackId,
        position: nextPosition,
      },
    });

    return NextResponse.json({ playlistTrack }, { status: 201 });
  } catch (error) {
    console.error('Error adding track to playlist:', error);
    return NextResponse.json({ error: 'Failed to add track to playlist' }, { status: 500 });
  }
}
