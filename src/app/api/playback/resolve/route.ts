import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const ResolveSchema = z.object({
  trackId: z.string().min(1),
  preferredQuality: z.enum(['auto', 'standard', 'high', 'lossless', 'hires']).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ResolveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }

    const { trackId, preferredQuality = 'auto' } = parsed.data;

    const track = await prisma.track.findUnique({
      where: { id: trackId },
      include: {
        assets: true,
        providerLinks: {
          include: { provider: true },
        },
        artists: {
          include: { artist: true },
        },
        album: true,
      },
    });

    if (!track) {
      return NextResponse.json({ error: 'Track not found' }, { status: 404 });
    }

    // Record play count and history
    await prisma.track.update({
      where: { id: trackId },
      data: { playCount: { increment: 1 } },
    });

    // Check assets
    if (track.assets.length > 0) {
      let selectedAsset = track.assets[0];

      if (preferredQuality === 'hires') {
        const hiresAsset = track.assets.find((a) => a.isHiRes);
        if (hiresAsset) selectedAsset = hiresAsset;
      } else if (preferredQuality === 'lossless') {
        const losslessAsset = track.assets.find((a) => a.isLossless);
        if (losslessAsset) selectedAsset = losslessAsset;
      } else if (preferredQuality === 'standard' || preferredQuality === 'high') {
        const compressedAsset = track.assets.find((a) => !a.isLossless);
        if (compressedAsset) selectedAsset = compressedAsset;
      }

      let streamUrl = `/api/stream/${selectedAsset.id}`;
      if (selectedAsset.storageType === 'remote_stream') {
        streamUrl = selectedAsset.storageKey;
      }

      return NextResponse.json({
        streamUrl,
        trackId: track.id,
        title: track.title,
        asset: {
          id: selectedAsset.id,
          format: selectedAsset.format,
          codec: selectedAsset.codec,
          bitDepth: selectedAsset.bitDepth,
          sampleRate: selectedAsset.sampleRate,
          bitrate: selectedAsset.bitrate,
          isLossless: selectedAsset.isLossless,
          isHiRes: selectedAsset.isHiRes,
        },
      });
    }

    // Check provider mappings
    const playableMapping = track.providerLinks.find((p) => p.isPlayable && p.previewUrl);
    if (playableMapping && playableMapping.previewUrl) {
      return NextResponse.json({
        streamUrl: playableMapping.previewUrl,
        trackId: track.id,
        title: track.title,
        asset: {
          id: playableMapping.id,
          format: 'aac',
          codec: 'AAC',
          bitrate: 256,
          isLossless: false,
          isHiRes: false,
        },
      });
    }

    // Check official handoffs
    const handoff = track.providerLinks.find((p) => p.externalUrl);
    if (handoff) {
      return NextResponse.json({
        error: 'Full playback requires official provider handoff',
        handoffUrl: handoff.externalUrl,
        provider: handoff.provider.name,
      }, { status: 403 });
    }

    return NextResponse.json({
      error: 'No playable audio stream available for this track',
    }, { status: 404 });
  } catch (error) {
    console.error('Resolve error:', error);
    return NextResponse.json({ error: 'Internal playback resolve error' }, { status: 500 });
  }
}
