import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { StorageService } from '@/lib/storage';
import { Readable } from 'stream';

const MIME_MAP: Record<string, string> = {
  flac: 'audio/flac',
  alac: 'audio/mp4',
  aac: 'audio/mp4',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  opus: 'audio/opus',
};

export async function GET(
  request: NextRequest,
  { params }: { params: { assetId: string } }
) {
  try {
    const { assetId } = params;
    const asset = await prisma.audioAsset.findUnique({
      where: { id: assetId },
      include: { track: true },
    });

    if (!asset) {
      return NextResponse.json({ error: 'Audio asset not found' }, { status: 404 });
    }

    // Handle remote streams
    if (asset.storageType === 'remote_stream') {
      return NextResponse.redirect(asset.storageKey, 307);
    }

    // Handle local storage with HTTP 206 Range support
    const meta = StorageService.getLocalFileMeta(asset.storageKey);
    if (!meta.exists) {
      return NextResponse.json(
        { error: 'Audio file not found on local storage' },
        { status: 404 }
      );
    }

    const fileSize = meta.size;
    const ext = asset.format.toLowerCase();
    const contentType = MIME_MAP[ext] || 'audio/mpeg';

    const rangeHeader = request.headers.get('range');

    if (rangeHeader) {
      // Range header format: "bytes=start-end"
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (isNaN(start) || start >= fileSize || (parts[1] && end < start)) {
        return new Response(null, {
          status: 416,
          headers: {
            'Content-Range': `bytes */${fileSize}`,
          },
        });
      }

      const chunkLength = end - start + 1;
      const nodeStream = StorageService.createLocalReadStream(asset.storageKey, start, end);
      const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

      return new Response(webStream, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkLength.toString(),
          'Content-Type': contentType,
          'Cache-Control': 'private, max-age=86400',
        },
      });
    }

    // No range header provided: return full stream
    const nodeStream = StorageService.createLocalReadStream(asset.storageKey);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;

    return new Response(webStream, {
      status: 200,
      headers: {
        'Accept-Ranges': 'bytes',
        'Content-Length': fileSize.toString(),
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      },
    });
  } catch (error) {
    console.error('Streaming error:', error);
    return NextResponse.json({ error: 'Internal streaming error' }, { status: 500 });
  }
}
