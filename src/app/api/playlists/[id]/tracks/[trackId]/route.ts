import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; trackId: string } }
) {
  try {
    const { id: playlistId, trackId } = params;

    await prisma.playlistTrack.deleteMany({
      where: {
        playlistId,
        trackId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing track from playlist:', error);
    return NextResponse.json({ error: 'Failed to remove track from playlist' }, { status: 500 });
  }
}
