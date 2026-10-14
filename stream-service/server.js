const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());

// In-memory cache for resolved direct stream URLs (valid for 4 hours)
const urlCache = new Map();

function resolveWithYtDlp(videoId) {
  return new Promise((resolve, reject) => {
    const cached = urlCache.get(videoId);
    if (cached && cached.expiresAt > Date.now()) {
      return resolve(cached);
    }

    const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
      '-g',
      '--extractor-args',
      'youtube:player_client=android,web',
      '-f',
      'bestaudio[ext=m4a]/bestaudio/18/b/best',
      '--no-warnings',
      '--no-check-certificates',
    ];

    if (process.env.YOUTUBE_COOKIE) {
      args.push('--add-header', `Cookie:${process.env.YOUTUBE_COOKIE}`);
    }

    args.push(videoUrl);

    const proc = spawn('yt-dlp', args);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('close', (code) => {
      if (code === 0 && stdout.trim().startsWith('http')) {
        const streamUrl = stdout.trim().split('\n')[0].trim();
        const info = {
          url: streamUrl,
          expiresAt: Date.now() + 4 * 3600 * 1000,
        };
        urlCache.set(videoId, info);
        resolve(info);
      } else {
        // Fallback without extractorArgs in case android client is ever throttled
        const fallbackProc = spawn('yt-dlp', [
          '-g',
          '-f',
          'ba/b/18/best',
          '--no-warnings',
          videoUrl,
        ]);

        let fbStdout = '';
        fallbackProc.stdout.on('data', (c) => { fbStdout += c.toString(); });
        fallbackProc.on('close', (fbCode) => {
          if (fbCode === 0 && fbStdout.trim().startsWith('http')) {
            const streamUrl = fbStdout.trim().split('\n')[0].trim();
            const info = {
              url: streamUrl,
              expiresAt: Date.now() + 4 * 3600 * 1000,
            };
            urlCache.set(videoId, info);
            resolve(info);
          } else {
            reject(new Error(`yt-dlp failed (code ${code}): ${stderr || 'No stream URL produced'}`));
          }
        });
        fallbackProc.on('error', (fbErr) => reject(fbErr));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

// Health check endpoint for Render/Koyeb uptime monitors
app.get('/', (req, res) => {
  res.json({
    service: 'imusic-stream-service',
    status: 'online',
    version: '1.1.0',
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
    const info = await resolveWithYtDlp(videoId);
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

// Direct audio streaming proxy with HTTP Range support for mobile background playback
app.get('/stream', async (req, res) => {
  const videoId = req.query.v || req.query.id;
  if (!videoId || !/^[\w-]{11}$/.test(videoId)) {
    return res.status(400).json({ error: 'Valid 11-character YouTube video ID required (?v=...)' });
  }

  // Redirect mode if requested
  if (req.query.redirect === 'true') {
    try {
      const info = await resolveWithYtDlp(videoId);
      return res.redirect(302, info.url);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  try {
    const info = await resolveWithYtDlp(videoId);
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
      return res.status(upstreamRes.status).send('Upstream stream error');
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
