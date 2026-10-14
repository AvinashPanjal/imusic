import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// On Vercel / AWS Lambda, use writable /tmp directory
const IS_SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const CACHE_DIR = IS_SERVERLESS
  ? path.join(os.tmpdir(), 'yt_audio')
  : path.join(process.cwd(), '.cache', 'yt_audio');

try {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
} catch (e) {
  console.warn('Could not initialize CACHE_DIR:', e);
}

// In-memory cache for resolved direct stream URLs (valid for 4 hours)
interface CachedUrl {
  url: string;
  expiresAt: number;
}
const streamUrlCache = new Map<string, CachedUrl>();
const ongoingResolves = new Map<string, Promise<string | null>>();

// Locate or provide yt-dlp binary safely across Windows, Linux, and Vercel Lambda
let cachedBinaryPath: string | null = null;

async function getExecutablePath(): Promise<string | null> {
  if (cachedBinaryPath && fs.existsSync(cachedBinaryPath)) {
    return cachedBinaryPath;
  }

  // 1. Check youtube-dl-exec bundled binary path
  try {
    const youtubedl = require('youtube-dl-exec');
    const binPath = youtubedl.constants?.YOUTUBE_DL_PATH;
    if (binPath && fs.existsSync(binPath)) {
      try {
        fs.chmodSync(binPath, 0o755);
      } catch {}
      cachedBinaryPath = binPath;
      return binPath;
    }
  } catch {}

  // 2. Check /tmp executable on Linux/Lambda
  const tmpBinName = process.platform === 'win32' ? 'yt-dlp.exe' : 'yt-dlp';
  const tmpBinPath = path.join(os.tmpdir(), tmpBinName);
  if (fs.existsSync(tmpBinPath)) {
    try {
      fs.chmodSync(tmpBinPath, 0o755);
    } catch {}
    cachedBinaryPath = tmpBinPath;
    return tmpBinPath;
  }

  // 3. Check system PATH
  try {
    const cmd = process.platform === 'win32' ? 'where yt-dlp' : 'which yt-dlp';
    const out = execSync(cmd, { stdio: 'pipe' }).toString().trim().split('\n')[0].trim();
    if (out && fs.existsSync(out)) {
      cachedBinaryPath = out;
      return out;
    }
  } catch {}

  // 4. On Linux / Vercel Lambda, automatically download standalone Linux binary to /tmp
  if (process.platform === 'linux') {
    try {
      console.log('Fetching standalone yt-dlp binary for Vercel Linux environment...');
      const downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
      const res = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        signal: AbortSignal.timeout(15000),
      });
      if (res.ok) {
        const buffer = await res.arrayBuffer();
        fs.writeFileSync(tmpBinPath, Buffer.from(buffer));
        fs.chmodSync(tmpBinPath, 0o755);
        cachedBinaryPath = tmpBinPath;
        console.log('Successfully provisioned yt-dlp binary at:', tmpBinPath);
        return tmpBinPath;
      }
    } catch (err) {
      console.warn('Failed to auto-provision yt-dlp binary in /tmp:', err);
    }
  }

  return 'yt-dlp';
}

// Fallback: Pure Node.js Innertube decipherer (zero binaries needed)
async function resolveViaInnertube(videoId: string): Promise<string | null> {
  try {
    const { Innertube, Platform, Log } = await import('youtubei.js');
    Log.setLevel(Log.Level.NONE);
    Platform.shim.eval = async (data: any) => new Function(data.output)();

    const yt = await Innertube.create();
    const info = await yt.getInfo(videoId, { client: 'YTMUSIC' });
    const fmt = info.chooseFormat({ type: 'audio', quality: 'best' });
    if (fmt) {
      const directUrl = await fmt.decipher(yt.session.player);
      if (directUrl && directUrl.startsWith('http')) {
        return directUrl;
      }
    }
  } catch (err) {
    console.warn('Innertube direct decipher failed:', err);
  }
  return null;
}

// Resolve direct audio stream URL with multi-layered fallbacks
async function resolveAudioStreamUrl(videoId: string): Promise<string | null> {
  // Check memory cache
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  // Deduplicate ongoing resolutions for the same video
  const ongoing = ongoingResolves.get(videoId);
  if (ongoing) {
    return ongoing;
  }

  const resolvePromise = (async () => {
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

    // Engine 1: youtube-dl-exec with iOS / VisionOS client (fastest, bypasses n-token throttling)
    try {
      const binPath = await getExecutablePath();
      const { create: createYoutubeDl } = require('youtube-dl-exec');
      const ytdl = binPath ? createYoutubeDl(binPath) : require('youtube-dl-exec');

      const direct = await ytdl(targetUrl, {
        getUrl: true,
        format: 'ba[ext=m4a]/ba',
        noWarnings: true,
        noCheckCertificates: true,
        preferFreeFormats: true,
      });

      const rawUrl = typeof direct === 'string' ? direct.trim() : '';
      if (rawUrl && rawUrl.startsWith('http')) {
        streamUrlCache.set(videoId, {
          url: rawUrl,
          expiresAt: Date.now() + 4 * 3600 * 1000, // 4 hours TTL
        });
        return rawUrl;
      }
    } catch (ytdlErr) {
      console.warn('youtube-dl-exec resolve failed, trying Innertube engine:', ytdlErr);
    }

    // Engine 2: Pure Node.js Innertube
    try {
      const innerUrl = await resolveViaInnertube(videoId);
      if (innerUrl && innerUrl.startsWith('http')) {
        streamUrlCache.set(videoId, {
          url: innerUrl,
          expiresAt: Date.now() + 4 * 3600 * 1000,
        });
        return innerUrl;
      }
    } catch (innerErr) {
      console.warn('Innertube resolve failed:', innerErr);
    }

    return null;
  })();

  ongoingResolves.set(videoId, resolvePromise);
  try {
    const result = await resolvePromise;
    return result;
  } finally {
    ongoingResolves.delete(videoId);
  }
}

// Background download helper to populate disk cache (non-blocking)
function triggerBackgroundCache(videoId: string, targetPath: string) {
  if (fs.existsSync(targetPath)) return;
  (async () => {
    try {
      const binPath = await getExecutablePath();
      const { create: createYoutubeDl } = require('youtube-dl-exec');
      const ytdl = binPath ? createYoutubeDl(binPath) : require('youtube-dl-exec');

      const tempPath = `${targetPath}.${Date.now()}.tmp`;
      await ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
        output: tempPath,
        format: 'ba[ext=m4a]/ba',
        noPlaylist: true,
        noWarnings: true,
        noCheckCertificates: true,
      });

      if (fs.existsSync(tempPath) && fs.statSync(tempPath).size > 10000) {
        fs.renameSync(tempPath, targetPath);
      } else {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      }
    } catch {}
  })();
}

export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('v') || searchParams.get('id');

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      return new NextResponse(null, { status: 400 });
    }

    const cachedFilePath = path.join(CACHE_DIR, `${videoId}.m4a`);
    if (fs.existsSync(cachedFilePath)) {
      const stat = fs.statSync(cachedFilePath);
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mp4',
          'Content-Length': String(stat.size),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=14400, immutable',
        },
      });
    }

    const directUrl = await resolveAudioStreamUrl(videoId);
    if (!directUrl) {
      return new NextResponse(null, { status: 404 });
    }

    try {
      const upstreamHead = await fetch(directUrl, {
        method: 'HEAD',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        signal: AbortSignal.timeout(3500),
      });

      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Type': upstreamHead.headers.get('content-type') || 'audio/mp4',
          'Content-Length': upstreamHead.headers.get('content-length') || '4000000',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=14400, immutable',
        },
      });
    } catch {
      return new NextResponse(null, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mp4',
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=14400',
        },
      });
    }
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

    // 1. Serve from disk cache if already downloaded
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

    // 2. Resolve direct audio stream URL
    const directUrl = await resolveAudioStreamUrl(videoId);
    if (!directUrl) {
      return NextResponse.json({ error: 'Could not resolve playable audio stream' }, { status: 404 });
    }

    // Trigger non-blocking background disk cache
    triggerBackgroundCache(videoId, cachedFilePath);

    // 3. Pipe direct stream with HTTP 206 Partial Content Range support
    const rangeHeader = request.headers.get('range');
    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    const upstreamRes = await fetch(directUrl, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', upstreamRes.headers.get('content-type') || 'audio/mp4');
    responseHeaders.set('Accept-Ranges', 'bytes');
    responseHeaders.set('Cache-Control', 'public, max-age=14400, immutable');

    if (upstreamRes.headers.get('content-length')) {
      responseHeaders.set('Content-Length', upstreamRes.headers.get('content-length')!);
    }
    if (upstreamRes.headers.get('content-range')) {
      responseHeaders.set('Content-Range', upstreamRes.headers.get('content-range')!);
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('YouTube audio streaming error:', error);
    return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
  }
}
