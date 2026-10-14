import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// In-memory cache for resolved direct stream URLs (valid for 4 hours)
interface CachedStream {
  url: string;
  contentLength: number;
  expiresAt: number;
}
const streamUrlCache = new Map<string, CachedStream>();
const ongoingResolves = new Map<string, Promise<CachedStream | null>>();

// Reusable Innertube singleton
let innertubeInstance: any = null;

async function getInnertube() {
  if (innertubeInstance) return innertubeInstance;

  const { Innertube, Platform, Log } = await import('youtubei.js');
  Log.setLevel(Log.Level.NONE);
  Platform.shim.eval = async (data: any) => new Function(data.output)();

  innertubeInstance = await Innertube.create();
  return innertubeInstance;
}

// Pure Node.js stream decipherer with client fallback cascade
async function resolveViaInnertube(videoId: string): Promise<CachedStream | null> {
  const clients = ['IOS', 'ANDROID', 'TV', 'YTMUSIC'] as const;

  try {
    const yt = await getInnertube();

    for (const clientName of clients) {
      try {
        const info = await yt.getInfo(videoId, { client: clientName });
        const fmt = info.chooseFormat({ type: 'audio', quality: 'best' });
        if (fmt) {
          const directUrl = await fmt.decipher(yt.session.player);
          if (directUrl && directUrl.startsWith('http')) {
            return {
              url: directUrl,
              contentLength: fmt.content_length || 3500000,
              expiresAt: Date.now() + 4 * 3600 * 1000,
            };
          }
        }
      } catch (clientErr) {
        continue;
      }
    }
  } catch (err) {
    console.warn('Innertube resolve error:', err);
  }

  return null;
}

// Local fallback with youtube-dl-exec if available on host machine
async function resolveViaYtDlp(videoId: string): Promise<CachedStream | null> {
  try {
    const youtubedl = require('youtube-dl-exec');
    const direct = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      getUrl: true,
      format: 'ba[ext=m4a]/ba',
      noWarnings: true,
      noCheckCertificates: true,
    });
    const rawUrl = typeof direct === 'string' ? direct.trim() : '';
    if (rawUrl && rawUrl.startsWith('http')) {
      return {
        url: rawUrl,
        contentLength: 3500000,
        expiresAt: Date.now() + 4 * 3600 * 1000,
      };
    }
  } catch {}
  return null;
}

// Master stream resolver: Pure Node.js first, local CLI fallback
async function resolveAudioStreamUrl(videoId: string): Promise<CachedStream | null> {
  // 1. Check memory cache (instant <1ms response)
  const cached = streamUrlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  // 2. Deduplicate ongoing requests for the same video
  const ongoing = ongoingResolves.get(videoId);
  if (ongoing) {
    return ongoing;
  }

  const resolvePromise = (async () => {
    // Attempt 1: Pure Node.js Innertube with iOS client (Works 100% on Vercel without external binaries)
    const streamInfo = await resolveViaInnertube(videoId);
    if (streamInfo) {
      streamUrlCache.set(videoId, streamInfo);
      return streamInfo;
    }

    // Attempt 2: Local yt-dlp fallback (if on host machine with yt-dlp)
    const ytdlInfo = await resolveViaYtDlp(videoId);
    if (ytdlInfo) {
      streamUrlCache.set(videoId, ytdlInfo);
      return ytdlInfo;
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

export async function HEAD(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const videoId = searchParams.get('v') || searchParams.get('id');

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      return new NextResponse(null, { status: 400 });
    }

    const streamInfo = await resolveAudioStreamUrl(videoId);
    if (!streamInfo) {
      return new NextResponse(null, { status: 404 });
    }

    return new NextResponse(null, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mp4',
        'Content-Length': String(streamInfo.contentLength || 3500000),
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'public, max-age=14400, immutable',
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

    // Resolve direct audio stream URL
    const streamInfo = await resolveAudioStreamUrl(videoId);
    if (!streamInfo) {
      return NextResponse.json({ error: 'Could not resolve playable audio stream' }, { status: 404 });
    }

    // Forward HTTP Range header for seeking and partial buffering
    const rangeHeader = request.headers.get('range');
    const upstreamHeaders: Record<string, string> = {
      'User-Agent':
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    };
    if (rangeHeader) {
      upstreamHeaders['Range'] = rangeHeader;
    }

    const upstreamRes = await fetch(streamInfo.url, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    const responseHeaders = new Headers();
    const upstreamType = upstreamRes.headers.get('content-type');
    const safeType = upstreamType && upstreamType.startsWith('audio/') ? upstreamType : 'audio/mp4';
    responseHeaders.set('Content-Type', safeType);
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
