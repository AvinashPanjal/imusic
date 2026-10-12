import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const UpdatePlaylistSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: {
        tracks: {
          include: {
            track: {
              include: {
                album: true,
                artists: { include: { artist: true } },
                assets: true,
              },
            },
          },
          orderBy: { position: 'asc' },
        },
      },
    });

    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found' }, { status: 404 });
    }

    return NextResponse.json({
      playlist: {
        id: playlist.id,
        title: playlist.title,
        description: playlist.description,
        coverImage: playlist.coverImage,
        createdAt: playlist.createdAt.toISOString(),
        trackCount: playlist.tracks.length,
        tracks: playlist.tracks.map((pt) => ({
          position: pt.position,
          track: {
            id: pt.track.id,
            title: pt.track.title,
            duration: pt.track.duration,
            trackNumber: pt.track.trackNumber,
            genre: pt.track.genre,
            hasLyrics: pt.track.hasLyrics,
            lyricsPlain: pt.track.lyricsPlain,
            lyricsSynced: pt.track.lyricsSynced,
            album: pt.track.album
              ? {
                  id: pt.track.album.id,
                  title: pt.track.album.title,
                  coverImage: pt.track.album.coverImage,
                  releaseYear: pt.track.album.releaseYear,
                  isHiRes: pt.track.album.isHiRes,
                  isLossless: pt.track.album.isLossless,
                }
              : null,
            artists: pt.track.artists.map((a) => ({
              id: a.artist.id,
              name: a.artist.name,
            })),
            assets: pt.track.assets.map((ast) => ({
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
        })),
      },
    });
  } catch (error) {
    console.error('Error fetching playlist detail:', error);
    return NextResponse.json({ error: 'Failed to fetch playlist' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    const body = await request.json();
    const parsed = UpdatePlaylistSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation error', details: parsed.error.issues }, { status: 400 });
    }

    const updated = await prisma.playlist.update({
      where: { id },
      data: parsed.data,
    });

    return NextResponse.json({ playlist: updated });
  } catch (error) {
    console.error('Error updating playlist:', error);
    return NextResponse.json({ error: 'Failed to update playlist' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    await prisma.playlist.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting playlist:', error);
    return NextResponse.json({ error: 'Failed to delete playlist' }, { status: 500 });
  }
}
