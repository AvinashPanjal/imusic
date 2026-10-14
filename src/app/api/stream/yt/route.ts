import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'yt_audio');

try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch {}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('v') || searchParams.get('id');

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      return NextResponse.json({ error: 'Invalid or missing YouTube video ID' }, { status: 400 });
    }

    const cachedFilePath = path.join(CACHE_DIR, `${videoId}.m4a`);

    // 1. If audio file is already cached locally, stream it with Range request support (HTTP 206)
    if (fs.existsSync(cachedFilePath)) {
      const stat = fs.statSync(cachedFilePath);
      const fileSize = stat.size;
      const range = request.headers.get('range');

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunkSize = end - start + 1;

        const fileStream = fs.createReadStream(cachedFilePath, { start, end });
        const webStream = new ReadableStream({
          start(controller) {
            fileStream.on('data', (chunk) => controller.enqueue(chunk));
            fileStream.on('end', () => controller.close());
            fileStream.on('error', (err) => controller.error(err));
          },
          cancel() {
            fileStream.destroy();
          },
        });

        return new NextResponse(webStream, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${fileSize}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': 'audio/mp4',
            'Cache-Control': 'public, max-age=604800, immutable',
          },
        });
      }

      // Full file stream from cache
      const fileStream = fs.createReadStream(cachedFilePath);
      const webStream = new ReadableStream({
        start(controller) {
          fileStream.on('data', (chunk) => controller.enqueue(chunk));
          fileStream.on('end', () => controller.close());
          fileStream.on('error', (err) => controller.error(err));
        },
        cancel() {
          fileStream.destroy();
        },
      });

      return new NextResponse(webStream, {
        status: 200,
        headers: {
          'Content-Length': String(fileSize),
          'Content-Type': 'audio/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=604800, immutable',
        },
      });
    }

    // 2. Not cached: Stream live audio via yt-dlp and cache simultaneously
    const tempFilePath = path.join(CACHE_DIR, `${videoId}.tmp`);
    let fileWriteStream: fs.WriteStream | null = null;
    try {
      fileWriteStream = fs.createWriteStream(tempFilePath);
    } catch {}

    const proc = spawn('yt-dlp', [
      '--no-playlist',
      '--no-cache-dir',
      '--no-check-certificates',
      '--no-warnings',
      '-f',
      'ba[ext=m4a]/ba',
      '-o',
      '-',
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    let isClosed = false;

    const liveStream = new ReadableStream({
      start(controller) {
        proc.stdout.on('data', (chunk: Buffer) => {
          try {
            controller.enqueue(new Uint8Array(chunk));
            if (fileWriteStream && !fileWriteStream.destroyed) {
              fileWriteStream.write(chunk);
            }
          } catch {}
        });

        proc.stdout.on('end', () => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.close();
            } catch {}
          }
          if (fileWriteStream) {
            fileWriteStream.end(() => {
              try {
                if (fs.existsSync(tempFilePath) && fs.statSync(tempFilePath).size > 10000) {
                  fs.renameSync(tempFilePath, cachedFilePath);
                }
              } catch {}
            });
          }
        });

        proc.on('error', (err) => {
          if (!isClosed) {
            isClosed = true;
            try {
              controller.error(err);
            } catch {}
          }
          if (fileWriteStream) {
            fileWriteStream.destroy();
            try {
              if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            } catch {}
          }
        });
      },
      cancel() {
        if (!isClosed) {
          isClosed = true;
          proc.kill('SIGTERM');
        }
        if (fileWriteStream) {
          fileWriteStream.destroy();
          try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
          } catch {}
        }
      },
    });

    return new NextResponse(liveStream, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mp4',
        'Transfer-Encoding': 'chunked',
        'Cache-Control': 'public, max-age=86400',
        'Accept-Ranges': 'bytes',
      },
    });
  } catch (error) {
    console.error('YouTube audio streaming error:', error);
    return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
  }
}
