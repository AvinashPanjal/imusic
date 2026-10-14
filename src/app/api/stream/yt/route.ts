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

// In-memory promise tracker to prevent duplicate concurrent downloads for the same video
const ongoingDownloads = new Map<string, Promise<string>>();

function downloadTrack(videoId: string, targetPath: string): Promise<string> {
  const existing = ongoingDownloads.get(videoId);
  if (existing) {
    return existing;
  }

  const promise = new Promise<string>((resolve, reject) => {
    const tempPath = `${targetPath}.${Date.now()}.tmp`;

    const proc = spawn('yt-dlp', [
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificates',
      '--concurrent-fragments',
      '4',
      '-f',
      'ba[ext=m4a]/ba',
      '-o',
      tempPath,
      `https://www.youtube.com/watch?v=${videoId}`,
    ]);

    let stderr = '';
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('close', (code) => {
      ongoingDownloads.delete(videoId);
      if (code === 0 && fs.existsSync(tempPath) && fs.statSync(tempPath).size > 10000) {
        try {
          fs.renameSync(tempPath, targetPath);
          resolve(targetPath);
        } catch (err) {
          reject(err);
        }
      } else {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch {}
        reject(new Error(`yt-dlp failed (code ${code}): ${stderr.slice(0, 200)}`));
      }
    });

    proc.on('error', (err) => {
      ongoingDownloads.delete(videoId);
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch {}
      reject(err);
    });
  });

  ongoingDownloads.set(videoId, promise);
  return promise;
}

export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('v') || searchParams.get('id');

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      return new NextResponse(null, { status: 400 });
    }

    const cachedFilePath = path.join(CACHE_DIR, `${videoId}.m4a`);

    if (!fs.existsSync(cachedFilePath)) {
      await downloadTrack(videoId, cachedFilePath);
    }

    const stat = fs.statSync(cachedFilePath);

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Length': String(stat.size),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=604800, immutable',
      },
    });
  } catch (err) {
    console.error('HEAD stream error:', err);
    return new NextResponse(null, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('v') || searchParams.get('id');

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      return NextResponse.json({ error: 'Invalid or missing YouTube video ID' }, { status: 400 });
    }

    const cachedFilePath = path.join(CACHE_DIR, `${videoId}.m4a`);

    // Ensure audio file is downloaded to cache
    if (!fs.existsSync(cachedFilePath)) {
      await downloadTrack(videoId, cachedFilePath);
    }

    const stat = fs.statSync(cachedFilePath);
    const fileSize = stat.size;
    const range = request.headers.get('range');

    // Handle HTTP 206 Partial Content for byte-range seeking
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

    // Full file stream
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
  } catch (error) {
    console.error('YouTube audio streaming error:', error);
    return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
  }
}
