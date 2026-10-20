/**
 * AVMusic - YouTube Audio Streaming Proxy Worker
 * 
 * 100% Free Cloudflare Worker (100,000 requests/day, 0 server cost, no credit card).
 * Resolves YouTube audio streams via YouTube's mobile InnerTube API (Android client)
 * and streams the raw 128kbps AAC/M4A audio chunks directly with full HTTP Range support
 * so iOS Safari, iPhone PWA lock screen, and Android background playback work flawlessly.
 */

// In-memory cache for resolved direct stream URLs (valid 4 hours)
const urlCache = new Map();

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Accept, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // 2. Health & Status Check
    if (url.pathname === '/' || url.pathname === '/health' || url.pathname === '/status') {
      return new Response(
        JSON.stringify(
          {
            status: 'ok',
            service: 'AVMusic YouTube Stream Proxy',
            message: 'Cloudflare Worker is running and ready to stream YouTube audio',
            endpoints: {
              resolve: '/resolve?v=<videoId>',
              stream: '/stream?v=<videoId>',
            },
          },
          null,
          2
        ),
        {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        }
      );
    }

    // Extract videoId from query parameters (?v= or ?id=)
    const videoId = url.searchParams.get('v') || url.searchParams.get('id');

    // 3. /resolve Endpoint: Returns stream metadata and playable stream URL
    if (url.pathname === '/resolve') {
      if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
        return new Response(JSON.stringify({ error: 'Missing or invalid ?v= video ID' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      try {
        const streamInfo = await resolveAudioStream(videoId);
        return new Response(
          JSON.stringify({
            videoId,
            title: streamInfo.title,
            duration: streamInfo.duration,
            streamUrl: `${url.origin}/stream?v=${videoId}`,
            directUrl: streamInfo.url,
            contentLength: streamInfo.contentLength,
            mimeType: streamInfo.mimeType,
          }),
          {
            status: 200,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          }
        );
      } catch (err) {
        return new Response(
          JSON.stringify({ error: 'Failed to resolve YouTube audio stream', details: err.message }),
          { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    // 4. /stream Endpoint: Redirects (307) directly to Google Video CDN for seamless mobile streaming
    if (url.pathname === '/stream' || url.pathname.startsWith('/stream/')) {
      const directTarget = url.searchParams.get('url');
      let targetAudioUrl = directTarget;

      if (!targetAudioUrl) {
        if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
          return new Response(JSON.stringify({ error: 'Missing or invalid ?v= video ID' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        try {
          const streamInfo = await resolveAudioStream(videoId);
          targetAudioUrl = streamInfo.url;
        } catch (err) {
          return new Response(
            JSON.stringify({ error: 'Could not resolve audio stream', details: err.message }),
            { status: 404, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Default: Return 307 Temporary Redirect to the direct Google Video CDN URL.
      // The mobile phone's native player (AVPlayer on iOS Safari, ExoPlayer on Android)
      // follows this redirect and downloads audio directly from Google's edge cache
      // using the phone's mobile carrier / WiFi connection without Cloudflare CPU/timeout limits.
      const shouldProxy = url.searchParams.get('proxy') === 'true';
      if (!shouldProxy) {
        return new Response(null, {
          status: 307,
          headers: {
            ...CORS_HEADERS,
            Location: targetAudioUrl,
            'Cache-Control': 'public, max-age=14400, immutable',
          },
        });
      }

      // Optional proxy mode for environments where direct redirects are prohibited
      const clientRange = request.headers.get('range') || 'bytes=0-';

      try {
        let upstreamRes = await fetch(targetAudioUrl, {
          method: 'GET',
          headers: {
            Range: clientRange,
            'User-Agent':
              'com.google.android.youtube/20.10.38 (Linux; U; Android 11; Pixel 5 Build/RD2A.211001.002) gzip',
            Accept: '*/*',
          },
        });

        // If upstream URL expired (403), invalidate memory cache and retry once
        if (upstreamRes.status === 403 && videoId) {
          urlCache.delete(videoId);
          const freshInfo = await resolveAudioStream(videoId);
          upstreamRes = await fetch(freshInfo.url, {
            method: 'GET',
            headers: {
              Range: clientRange,
              'User-Agent':
                'com.google.android.youtube/20.10.38 (Linux; U; Android 11; Pixel 5 Build/RD2A.211001.002) gzip',
            },
          });
        }

        return buildProxyResponse(upstreamRes);
      } catch (streamErr) {
        return new Response(
          JSON.stringify({ error: 'Stream upstream error', details: streamErr.message }),
          { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },
};

/**
 * Resolves the 128kbps AAC/M4A audio stream using YouTube's mobile InnerTube API.
 */
async function resolveAudioStream(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expires > Date.now()) {
    return cached;
  }

  const payload = {
    context: {
      client: {
        clientName: 'ANDROID',
        clientVersion: '20.10.38',
        androidSdkVersion: 30,
        hl: 'en',
        gl: 'US',
      },
    },
    videoId,
  };

  const res = await fetch('https://www.youtube.com/youtubei/v1/player', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'com.google.android.youtube/20.10.38 (Linux; U; Android 11; Pixel 5 Build/RD2A.211001.002) gzip',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`InnerTube HTTP status ${res.status}`);
  }

  const data = await res.json();
  const playStatus = data.playabilityStatus?.status;
  if (playStatus && playStatus !== 'OK') {
    throw new Error(
      `YouTube playability error: ${playStatus} (${data.playabilityStatus?.reason || 'restricted'})`
    );
  }

  const formats = data.streamingData?.adaptiveFormats || [];
  const audios = formats.filter((f) => (f.mimeType || '').includes('audio'));

  // Priority 1: itag 140 (128kbps AAC / M4A - 100% natively supported on iOS Safari and Android Chrome)
  // Priority 2: Any audio format with a direct URL
  const bestFormat =
    audios.find((f) => f.itag === 140 && f.url) ||
    audios.find((f) => f.url) ||
    audios[0];

  if (!bestFormat || !bestFormat.url) {
    throw new Error('No direct stream URL available for this video');
  }

  const result = {
    url: bestFormat.url,
    title: data.videoDetails?.title || '',
    duration: parseInt(data.videoDetails?.lengthSeconds || '0', 10),
    contentLength: parseInt(bestFormat.contentLength || '3500000', 10),
    mimeType: bestFormat.mimeType || 'audio/mp4',
    expires: Date.now() + 4 * 3600 * 1000, // 4 hours in-memory cache
  };

  urlCache.set(videoId, result);
  return result;
}

/**
 * Builds the HTTP response piping the audio stream back to the client.
 */
function buildProxyResponse(upstreamRes) {
  const headers = new Headers();

  const contentType = upstreamRes.headers.get('content-type') || 'audio/mp4';
  headers.set('Content-Type', contentType.startsWith('audio/') ? contentType : 'audio/mp4');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Range, Content-Type');
  headers.set('Cache-Control', 'public, max-age=14400, immutable');

  if (upstreamRes.headers.get('content-length')) {
    headers.set('Content-Length', upstreamRes.headers.get('content-length'));
  }
  if (upstreamRes.headers.get('content-range')) {
    headers.set('Content-Range', upstreamRes.headers.get('content-range'));
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers,
  });
}
