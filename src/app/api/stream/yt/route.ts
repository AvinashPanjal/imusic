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

let lastResolveError: string = '';

// Pure Node.js stream decipherer with multi-client format fallback
async function resolveViaInnertube(videoId: string): Promise<CachedStream | null> {
  // Benchmark tested: YTMUSIC (738ms), ANDROID_VR (752ms), IOS (1584ms), VISIONOS (1171ms)
  const clients = ['YTMUSIC', 'ANDROID_VR', 'IOS', 'VISIONOS'] as const;

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
          } else {
            lastResolveError += `[${clientName} no directUrl: ${String(directUrl)}] `;
          }
        } else {
          lastResolveError += `[${clientName} no audio fmt] `;
        }
      } catch (clientErr: any) {
        lastResolveError += `[${clientName}: ${clientErr?.message || clientErr}] `;
        continue;
      }
    }
  } catch (err: any) {
    lastResolveError += `[Innertube outer: ${err?.message || err}] `;
    console.warn('Innertube resolve error:', err);
    innertubeInstance = null; // Recreate session on next call if it became invalid
  }

  return null;
}

// Fallback with rotating public proxy instances (Invidious / Piped) to bypass datacenter IP restrictions
const PUBLIC_PROXIES = [
  'https://invidious.f5.si',
  'https://invidious.perennialte.ch',
  'https://inv.nadeko.net',
  'https://api.piped.private.coffee',
];

async function resolveViaProxy(videoId: string): Promise<CachedStream | null> {
  const randomized = [...PUBLIC_PROXIES].sort(() => Math.random() - 0.5);
  for (const inst of randomized) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 4000);

      if (inst.includes('invidious') || inst.includes('nadeko')) {
        const res = await fetch(`${inst}/api/v1/videos/${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          const audios = (data.adaptiveFormats || []).filter((f: any) =>
            (f.type || '').includes('audio')
          );
          const best = audios.find((f: any) => (f.type || '').includes('mp4a')) || audios[0];
          if (best && best.url) {
            return {
              url: best.url,
              contentLength: parseInt(best.contentLength || best.clen || '3500000', 10),
              expiresAt: Date.now() + 4 * 3600 * 1000,
            };
          }
        }
      } else {
        const res = await fetch(`${inst}/streams/${videoId}`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: ctrl.signal,
        });
        clearTimeout(timer);
        if (res.ok) {
          const data = await res.json();
          const audios = data.audioStreams || [];
          const best = audios.find((s: any) => (s.mimeType || '').includes('mp4a')) || audios[0];
          if (best && best.url) {
            return {
              url: best.url,
              contentLength: parseInt(best.contentLength || '3500000', 10),
              expiresAt: Date.now() + 4 * 3600 * 1000,
            };
          }
        }
      }
    } catch (e: any) {
      lastResolveError += `[Proxy ${inst}: ${e?.message || e}] `;
    }
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

// Master stream resolver: Cloudflare Worker first, Innertube, Proxies, yt-dlp fallback
async function resolveAudioStreamUrl(videoId: string, forceRefresh = false): Promise<CachedStream | null> {
  // 1. Check memory cache (instant <1ms response)
  if (!forceRefresh) {
    const cached = streamUrlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached;
    }
  } else {
    streamUrlCache.delete(videoId);
  }

  // 2. Deduplicate ongoing requests for the same video
  const ongoing = ongoingResolves.get(videoId);
  if (ongoing && !forceRefresh) {
    return ongoing;
  }

  const resolvePromise = (async () => {
    // Attempt 0: Dedicated stream microservice (on Cloudflare Worker) - 100% bypasses datacenter blocks
    const streamServer =
      process.env.STREAM_SERVER_URL ||
      process.env.EXTERNAL_STREAM_URL ||
      'https://avmusic-streamer.efootballpes2012.workers.dev';
    if (streamServer) {
      try {
        const cleanServer = streamServer.replace(/\/$/, '');
        const res = await fetch(`${cleanServer}/resolve?v=${videoId}`, {
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          const targetUrl = data.directUrl || data.streamUrl;
          if (targetUrl) {
            const serverInfo: CachedStream = {
              url: targetUrl,
              contentLength: data.contentLength || 3500000,
              expiresAt: Date.now() + 4 * 3600 * 1000,
            };
            streamUrlCache.set(videoId, serverInfo);
            return serverInfo;
          }
        }
      } catch (serverErr: any) {
        lastResolveError += `[STREAM_SERVER: ${serverErr?.message || serverErr}] `;
      }
    }

    // Attempt 1: Pure Node.js Innertube with multi-client fallback
    const streamInfo = await resolveViaInnertube(videoId);
    if (streamInfo) {
      streamUrlCache.set(videoId, streamInfo);
      return streamInfo;
    }

    // Attempt 2: Public rotated proxy fallback (Invidious / Piped)
    const proxyInfo = await resolveViaProxy(videoId);
    if (proxyInfo) {
      streamUrlCache.set(videoId, proxyInfo);
      return proxyInfo;
    }

    // Attempt 3: Local yt-dlp fallback (if on host machine with yt-dlp)
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
    if (!streamInfo || !streamInfo.url) {
      return new NextResponse(null, { status: 404 });
    }

    return NextResponse.redirect(streamInfo.url, {
      status: 307,
      headers: {
        'Cache-Control': 'public, max-age=14400, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
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
    const refresh = searchParams.get('refresh') === '1' || searchParams.get('refresh') === 'true';

    if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
      return NextResponse.json({ error: 'Invalid or missing YouTube video ID' }, { status: 400 });
    }

    // Resolve direct audio stream URL (cached or fresh from Cloudflare worker)
    const streamInfo = await resolveAudioStreamUrl(videoId, refresh);
    if (!streamInfo || !streamInfo.url) {
      return NextResponse.json({
        error: 'Could not resolve playable audio stream',
        diagnostics: lastResolveError || 'no resolver succeeded',
      }, { status: 404 });
    }

    // Return 307 Temporary Redirect pointing directly to Google Video CDN URL.
    // The mobile phone's native media player (AVPlayer on iOS / ExoPlayer on Android)
    // follows this redirect and streams audio directly over the user's mobile carrier / WiFi connection.
    // This enables native lock screen controls, background playback when phone is locked, and avoids Vercel lambda timeouts.
    const redirectHeaders = new Headers();
    redirectHeaders.set('Cache-Control', 'public, max-age=14400, immutable');
    redirectHeaders.set('Access-Control-Allow-Origin', '*');
    redirectHeaders.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    redirectHeaders.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    return NextResponse.redirect(streamInfo.url, {
      status: 307,
      headers: redirectHeaders,
    });
  } catch (error) {
    console.error('YouTube audio streaming error:', error);
    return NextResponse.json({ error: 'Failed to stream audio' }, { status: 500 });
  }
}
