import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptMediaUrl, getQueryVariants, decodeHtmlEntities } from '@/lib/providers/IndianMusicProvider';
import { cleanSongTitle } from '@/lib/constants/soundtracks';
import { searchYouTubeVideos } from '@/lib/providers/YouTubeProvider';
import { z } from 'zod';

const ResolveSchema = z.object({
  trackId: z.string().min(1),
  preferredQuality: z.enum(['auto', 'standard', 'high', 'lossless', 'hires']).optional(),
  title: z.string().optional(),
  artist: z.string().optional(),
});

// Strict title verification helper to prevent picking the wrong song (e.g. "Life of Ram" instead of "Life of Prince")
function isGoodTitleMatch(requestedTitle: string, candidateSong: string): boolean {
  if (!requestedTitle || !candidateSong) return false;
  const reqClean = cleanSongTitle(requestedTitle).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const candClean = cleanSongTitle(candidateSong).toLowerCase().replace(/[^a-z0-9\s]/g, ' ');

  const reqWords = reqClean.split(/\s+/).filter((w) => w.length > 2);
  const candWords = candClean.split(/\s+/).filter((w) => w.length > 2);

  if (reqWords.length === 0 || candWords.length === 0) return false;

  const genericWords = new Set(['the', 'and', 'from', 'song', 'audio', 'video', 'life', 'full', 'version']);
  const reqDistinctive = reqWords.filter((w) => !genericWords.has(w));

  // If there are distinctive words (like "prince", "maayunnallo"), at least one MUST be in the candidate!
  if (reqDistinctive.length > 0) {
    const hasDistinctiveMatch = reqDistinctive.some((w) => candClean.includes(w) || candWords.includes(w));
    if (!hasDistinctiveMatch) {
      return false;
    }
  }

  let matchCount = 0;
  for (const w of reqWords) {
    if (candWords.includes(w) || candClean.includes(w)) {
      matchCount++;
    }
  }

  return matchCount >= Math.min(2, reqWords.length);
}

async function resolveJioSaavnStream(rawId: string, candidateTitle?: string) {
  const SAAVN_BASE = 'https://www.jiosaavn.com/api.php';
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
  };

  let songTitle = candidateTitle || '';

  // 1. Check direct song metadata
  try {
    const detailsUrl = `${SAAVN_BASE}?__call=song.getDetails&_format=json&_marker=0&cc=in&pids=${encodeURIComponent(rawId)}`;
    const detailsRes = await fetch(detailsUrl, { headers }).then((r) => r.json()).catch(() => ({}));
    const item = detailsRes[rawId];
    if (item) {
      songTitle = songTitle || item.song || item.title || '';
      const directUrl = decryptMediaUrl(item.encrypted_media_url);
      if (directUrl) {
        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2000);
          const head = await fetch(directUrl, { method: 'HEAD', signal: ctrl.signal });
          clearTimeout(timer);
          if (head.status === 200) {
            return { streamUrl: directUrl, title: songTitle, recovered: false };
          }
        } catch {
          // Fall through to alternative recovery
        }
      }
    }
  } catch {}

  // 2. Recover working stream from alternative releases (e.g. original film album instead of 404 compilation)
  const clean = cleanSongTitle(songTitle);
  if (clean && clean.length >= 2) {
    try {
      const searchUrl = `${SAAVN_BASE}?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=8&q=${encodeURIComponent(clean)}`;
      const searchRes = await fetch(searchUrl, { headers }).then((r) => r.json()).catch(() => ({}));
      const results = (searchRes.results || []) as any[];

      for (const alt of results) {
        if (alt.id === rawId) continue;
        const altSong = alt.song || alt.title || '';
        if (songTitle && !isGoodTitleMatch(songTitle, altSong)) continue;

        const altUrl = decryptMediaUrl(alt.encrypted_media_url);
        if (!altUrl) continue;

        try {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), 2000);
          const head = await fetch(altUrl, { method: 'HEAD', signal: ctrl.signal });
          clearTimeout(timer);
          if (head.status === 200) {
            return {
              streamUrl: altUrl,
              title: altSong,
              recovered: true,
            };
          }
        } catch {}
      }
    } catch {}
  }

  return null;
}

// Universal Playable Stream Resolver: JioSaavn 320 KBPS Studio AAC first, YouTube direct audio stream fallback
async function resolveAnyPlayableStream(
  title?: string,
  artist?: string
): Promise<{ streamUrl: string; title: string } | null> {
  const songTitle = title || '';
  if (!songTitle) return null;

  const clean = cleanSongTitle(songTitle);
  const candidateQueries = new Set<string>();

  if (clean && clean.length >= 2) {
    candidateQueries.add(clean);
    if (/^the\s+/i.test(clean)) {
      candidateQueries.add(clean.replace(/^the\s+/i, '').trim());
    } else {
      candidateQueries.add(`The ${clean}`);
    }
    if (clean.includes('-')) {
      clean.split('-').forEach((p) => {
        const pt = p.trim();
        if (pt.length >= 2) candidateQueries.add(pt);
      });
    }
  }

  const variants = getQueryVariants(clean || songTitle);
  for (const v of variants) {
    candidateQueries.add(v);
  }

  if (artist && clean) {
    const cleanArtist = artist.replace(/\b(official|music|records|audio|channel|vevo|topic)\b/gi, '').trim();
    if (cleanArtist) {
      candidateQueries.add(`${clean} ${cleanArtist}`);
      candidateQueries.add(`${cleanArtist} ${clean}`);
    }
  }

  // 1. Try JioSaavn for 320 KBPS CD Quality AAC
  for (const query of Array.from(candidateQueries).slice(0, 6)) {
    try {
      const searchUrl = `https://www.jiosaavn.com/api.php?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=8&q=${encodeURIComponent(query)}`;
      const sRes = await fetch(searchUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (sRes.ok) {
        const data = await sRes.json();
        const results = (data.results || []) as any[];
        const matchingResult = results.find((item) =>
          isGoodTitleMatch(songTitle, item.song || item.title || '')
        );

        if (matchingResult) {
          let directUrl = decryptMediaUrl(matchingResult.encrypted_media_url);
          if (directUrl) {
            directUrl = directUrl.replace(/_96\.(mp4|m4a)/i, '_320.$1').replace(/_160\.(mp4|m4a)/i, '_320.$1');
            return {
              streamUrl: directUrl,
              title: decodeHtmlEntities(matchingResult.song || matchingResult.title || songTitle),
            };
          }
        }
      }
    } catch {}
  }

  // 2. Fallback to YouTube for full-length native audio stream
  const ytQuery = `${clean || songTitle} ${artist || ''}`.trim();
  if (ytQuery.length >= 2) {
    try {
      const ytVideos = await searchYouTubeVideos(ytQuery, 1);
      if (ytVideos.length > 0 && ytVideos[0].id) {
        return {
          streamUrl: `/api/stream/yt?v=${ytVideos[0].id}`,
          title: ytVideos[0].title || songTitle,
        };
      }
    } catch {}
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = ResolveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }

    const { trackId, preferredQuality = 'auto', title, artist } = parsed.data;

    // If this is a YouTube track ID or foreign imported track:
    if (trackId.startsWith('yt-') || trackId.startsWith('foreign-')) {
      const vid = trackId.replace(/^yt-/, '');
      const rawTitle = title || '';

      // 1. Try to upgrade to 320 KBPS Studio AAC on JioSaavn if exact song exists
      if (rawTitle) {
        const candidate = await resolveAnyPlayableStream(rawTitle, artist);
        if (candidate && !candidate.streamUrl.startsWith('/api/stream/yt')) {
          return NextResponse.json({
            streamUrl: candidate.streamUrl,
            trackId,
            title: candidate.title,
            recovered: true,
            asset: {
              id: `asset-${trackId}`,
              format: 'mp4',
              codec: 'AAC',
              bitDepth: 16,
              sampleRate: 44100,
              bitrate: 320,
              isLossless: true,
              isHiRes: false,
            },
          });
        }
      }

      // 2. Direct native YouTube audio stream
      return NextResponse.json({
        streamUrl: `/api/stream/yt?v=${vid}`,
        trackId,
        title: rawTitle || 'YouTube Audio Track',
        recovered: false,
        asset: {
          id: `yt-asset-${vid}`,
          format: 'm4a',
          codec: 'AAC',
          bitrate: 160,
          isLossless: false,
          isHiRes: false,
        },
      });
    }

    // Check if this is a JioSaavn external track
    if (trackId.startsWith('saavn-') || !trackId) {
      const rawId = trackId.replace('saavn-', '');
      const saavnResult = await resolveJioSaavnStream(rawId, title);
      if (saavnResult?.streamUrl) {
        return NextResponse.json({
          streamUrl: saavnResult.streamUrl,
          trackId,
          title: saavnResult.title || title || 'Audio Track',
          recovered: saavnResult.recovered,
          asset: {
            id: `asset-${rawId}`,
            format: 'mp4',
            codec: 'AAC',
            bitDepth: 16,
            sampleRate: 44100,
            bitrate: 320,
            isLossless: true,
            isHiRes: false,
          },
        });
      }

      // If JioSaavn ID failed, fallback to universal search across JioSaavn or YouTube
      const fallback = await resolveAnyPlayableStream(title, artist);
      if (fallback) {
        const isYt = fallback.streamUrl.startsWith('/api/stream/yt');
        return NextResponse.json({
          streamUrl: fallback.streamUrl,
          trackId,
          title: fallback.title || title || 'Audio Track',
          recovered: true,
          asset: {
            id: `recovered-asset-${rawId}`,
            format: 'mp4',
            codec: 'AAC',
            bitrate: isYt ? 160 : 320,
            isLossless: !isYt,
            isHiRes: false,
          },
        });
      }
    }

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

    if (track) {
      // Record play count and history
      await prisma.track
        .update({
          where: { id: trackId },
          data: { playCount: { increment: 1 } },
        })
        .catch(() => {});

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
          streamUrl = selectedAsset.storageKey.startsWith('youtube:')
            ? `/api/stream/yt?v=${selectedAsset.storageKey.replace('youtube:', '')}`
            : selectedAsset.storageKey;

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

      // Check if externalUrl points to YouTube
      const externalLink = track.providerLinks.find((p) => p.externalUrl)?.externalUrl;
      if (externalLink) {
        const ytMatch = externalLink.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
        if (ytMatch) {
          return NextResponse.json({
            streamUrl: `/api/stream/yt?v=${ytMatch[1]}`,
            trackId: track.id,
            title: track.title,
            asset: {
              id: `yt-link-${ytMatch[1]}`,
              format: 'm4a',
              codec: 'AAC',
              bitrate: 160,
              isLossless: false,
              isHiRes: false,
            },
          });
        }
      }

      // Universal Playable Fallback for tracks without direct assets or marked as handoff:
      const artistName = track.artists?.[0]?.artist?.name || artist;
      const resolved = await resolveAnyPlayableStream(track.title || title, artistName);
      if (resolved) {
        const isYt = resolved.streamUrl.startsWith('/api/stream/yt');
        return NextResponse.json({
          streamUrl: resolved.streamUrl,
          trackId: track.id,
          title: resolved.title || track.title,
          recovered: true,
          asset: {
            id: `resolved-${track.id}`,
            format: 'mp4',
            codec: 'AAC',
            bitrate: isYt ? 160 : 320,
            isLossless: !isYt,
            isHiRes: false,
          },
        });
      }
    }

    // If track is not in local DB (e.g. client imported playlist item or foreign ID):
    // 1. Try JioSaavn direct / recovery
    const saavnResult = await resolveJioSaavnStream(trackId.replace('saavn-', ''), title);
    if (saavnResult?.streamUrl) {
      return NextResponse.json({
        streamUrl: saavnResult.streamUrl,
        trackId,
        title: saavnResult.title || title || 'Audio Track',
        recovered: saavnResult.recovered,
        asset: {
          id: `recovered-asset-${trackId}`,
          format: 'mp4',
          codec: 'AAC',
          bitDepth: 16,
          sampleRate: 44100,
          bitrate: 320,
          isLossless: true,
          isHiRes: false,
        },
      });
    }

    // 2. Universal Playable Fallback via JioSaavn or YouTube search
    const resolved = await resolveAnyPlayableStream(title, artist);
    if (resolved) {
      const isYt = resolved.streamUrl.startsWith('/api/stream/yt');
      return NextResponse.json({
        streamUrl: resolved.streamUrl,
        trackId,
        title: resolved.title || title || 'Audio Track',
        recovered: true,
        asset: {
          id: `resolved-${trackId}`,
          format: 'mp4',
          codec: 'AAC',
          bitrate: isYt ? 160 : 320,
          isLossless: !isYt,
          isHiRes: false,
        },
      });
    }

    return NextResponse.json({
      error: 'No playable audio stream available for this track',
    }, { status: 404 });
  } catch (error) {
    console.error('Resolve error:', error);
    return NextResponse.json({ error: 'Internal playback resolve error' }, { status: 500 });
  }
}
