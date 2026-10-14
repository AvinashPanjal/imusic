const express = require('express');
const cors = require('cors');
const { Innertube, Platform, Log } = require('youtubei.js');

Log.setLevel(Log.Level.NONE);
Platform.shim.eval = async (data) => new Function(data.output)();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

let innertube = null;
async function getInnertube() {
  if (innertube) return innertube;
  const options = {};
  if (process.env.YOUTUBE_COOKIE) {
    options.cookie = process.env.YOUTUBE_COOKIE;
  }
  innertube = await Innertube.create(options);
  return innertube;
}

const urlCache = new Map();

async function resolveDirectAudio(videoId) {
  const cached = urlCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  const yt = await getInnertube();
  const clients = ['MWEB', 'TV_SIMPLY', 'IOS', 'ANDROID'];
  let lastErr = null;

  for (const client of clients) {
    try {
      const info = await yt.getInfo(videoId, { client });
      const fmt =
        info.chooseFormat({ type: 'audio', quality: 'best' }) ||
        info.chooseFormat({ format: 18 }) ||
        info.chooseFormat({ quality: 'best' });

      if (fmt) {
        const streamUrl = await fmt.decipher(yt.session.player);
        if (streamUrl && streamUrl.startsWith('http')) {
          const item = {
            url: streamUrl,
            contentLength: fmt.content_length || 4500000,
            expiresAt: Date.now() + 4 * 3600 * 1000,
          };
          urlCache.set(videoId, item);
          return item;
        }
      }
    } catch (e) {
      lastErr = e;
    }
  }

  throw lastErr || new Error(`Could not resolve audio format for ${videoId}`);
}

// Health check endpoint for Render/Koyeb uptime monitors
app.get('/', (req, res) => {
  res.json({
    service: 'imusic-stream-service',
    status: 'online',
    version: '1.2.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// JSON resolver endpoint
app.get('/resolve', async (req, res) => {
  const videoId = req.query.v || req.query.id;
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Valid 11-character YouTube video ID required (?v=...)' });
  }

  try {
    const info = await resolveDirectAudio(videoId);
    res.json({
      status: 'ok',
      videoId,
      streamUrl: info.url,
      expiresAt: info.expiresAt,
    });
  } catch (err) {
    console.error(`Resolve error for ${videoId}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// Direct audio streaming endpoint for HTML5 <audio>
app.get('/stream', async (req, res) => {
  const videoId = req.query.v || req.query.id;
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Valid 11-character YouTube video ID required (?v=...)' });
  }

  try {
    const info = await resolveDirectAudio(videoId);

    // If client requested 302 redirect for direct CDN streaming
    if (req.query.redirect === 'true') {
      return res.redirect(302, info.url);
    }

    const clientRange = req.headers.range || 'bytes=0-';
    const upstreamHeaders = {
      Range: clientRange,
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };

    const upstreamRes = await fetch(info.url, {
      method: 'GET',
      headers: upstreamHeaders,
    });

    if (!upstreamRes.ok && upstreamRes.status >= 400) {
      urlCache.delete(videoId);
      // Fallback: Redirect directly
      return res.redirect(302, info.url);
    }

    const upstreamType = upstreamRes.headers.get('content-type') || 'audio/mp4';
    const contentLength = upstreamRes.headers.get('content-length');
    const contentRange = upstreamRes.headers.get('content-range');

    res.status(upstreamRes.status);
    res.setHeader('Content-Type', upstreamType.startsWith('video/') ? 'video/mp4' : (upstreamType.startsWith('audio/') ? upstreamType : 'audio/mp4'));
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=14400, immutable');

    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentRange) res.setHeader('Content-Range', contentRange);

    const reader = upstreamRes.body.getReader();

    const pump = async () => {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const ok = res.write(Buffer.from(value));
          if (!ok) {
            await new Promise((r) => res.once('drain', r));
          }
        }
        res.end();
      } catch {
        res.end();
      }
    };

    pump();

    req.on('close', () => {
      reader.cancel().catch(() => {});
    });
  } catch (err) {
    console.error(`Stream error for ${videoId}:`, err.message);
    urlCache.delete(videoId);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`iMusic Stream Service running on http://0.0.0.0:${PORT}`);
});
