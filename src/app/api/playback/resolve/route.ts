import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { decryptMediaUrl, getQueryVariants, decodeHtmlEntities } from '@/lib/providers/IndianMusicProvider';
import { searchYouTubeVideos } from '@/lib/providers/YouTubeProvider';
import {
  cleanSongTitle,
  isAccurateTitleMatch,
  isArtistCompatible,
  selectBestYouTubeCandidate,
} from '@/lib/trackMatching';
import { z } from 'zod';

const ResolveSchema = z.object({
  trackId: z.string().optional().nullable(),
  preferredQuality: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  artist: z.string().optional().nullable(),
  album: z.string().optional().nullable(),
});

async function resolveJioSaavnStream(
  rawId: string,
  candidateTitle?: string,
  candidateArtist?: string
) {
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
        const altArtist = alt.primary_artists || alt.singers || '';
        if (songTitle && !isAccurateTitleMatch(songTitle, altSong)) continue;
        if (candidateArtist && !isArtistCompatible(candidateArtist, altArtist)) continue;

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

// Universal Playable Stream Resolver: JioSaavn 320 KBPS Studio AAC first, verified YouTube audio stream fallback
async function resolveAnyPlayableStream(
  title?: string,
  artist?: string,
  album?: string
): Promise<{ streamUrl: string; title: string } | null> {
  const songTitle = title || '';
  if (!songTitle) return null;

  const clean = cleanSongTitle(songTitle);
  const primaryArtist = (artist || '')
    .split(/[,&/]/)[0]
    .trim()
    .replace(/\b(official|music|records|audio|channel|vevo|topic)\b/gi, '')
    .trim();
  const cleanAlbum = cleanSongTitle(album || '');

  const candidateQueries: string[] = [];

  // Priority 1: Song title + Album name (Direct hit for original film soundtrack releases!)
  if (clean && cleanAlbum && cleanAlbum.toLowerCase() !== clean.toLowerCase()) {
    candidateQueries.push(`${clean} ${cleanAlbum}`);
  }

  // Priority 2: Song title + Primary Artist
  if (clean && primaryArtist) {
    candidateQueries.push(`${clean} ${primaryArtist}`);
    candidateQueries.push(`${primaryArtist} ${clean}`);
  }

  // Priority 3: Song title alone
  if (clean) {
    candidateQueries.push(clean);
  }

  // Priority 4: Query variants (e.g. prefixing "The ", splitting hyphens)
  const variants = getQueryVariants(clean || songTitle);
  for (const v of variants) {
    if (!candidateQueries.includes(v)) candidateQueries.push(v);
  }

  const SAAVN_BASE = 'https://www.jiosaavn.com/api.php';
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    Accept: 'application/json, text/plain, */*',
  };

  // 1. Try JioSaavn for 320 KBPS CD Quality AAC
  for (const query of candidateQueries.slice(0, 5)) {
    try {
      const searchUrl = `${SAAVN_BASE}?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=8&q=${encodeURIComponent(query)}`;
      const sRes = await fetch(searchUrl, { headers });
      if (sRes.ok) {
        const data = await sRes.json();
        const results = (data.results || []) as any[];

        // Pass 1: Accurate title match AND compatible artist
        for (const item of results) {
          const itemSong = item.song || item.title || '';
          const itemArtist = item.primary_artists || item.singers || '';
          if (
            isAccurateTitleMatch(clean || songTitle, itemSong) &&
            isArtistCompatible(artist, itemArtist)
          ) {
            let directUrl = decryptMediaUrl(item.encrypted_media_url);
            if (directUrl) {
              directUrl = directUrl
                .replace(/_96\.(mp4|m4a)/i, '_320.$1')
                .replace(/_160\.(mp4|m4a)/i, '_320.$1');
              return {
                streamUrl: directUrl,
                title: decodeHtmlEntities(itemSong || songTitle),
              };
            }
          }
        }

        // Pass 2: Accurate title match (fallback if artist info wasn't in JioSaavn metadata)
        for (const item of results) {
          const itemSong = item.song || item.title || '';
          if (isAccurateTitleMatch(clean || songTitle, itemSong)) {
            let directUrl = decryptMediaUrl(item.encrypted_media_url);
            if (directUrl) {
              directUrl = directUrl
                .replace(/_96\.(mp4|m4a)/i, '_320.$1')
                .replace(/_160\.(mp4|m4a)/i, '_320.$1');
              return {
                streamUrl: directUrl,
                title: decodeHtmlEntities(itemSong || songTitle),
              };
            }
          }
        }
      }
    } catch {}
  }

  // 2. Fallback to YouTube with verified music candidate selection
  const ytQueries = [
    `${clean || songTitle} ${primaryArtist}`.trim(),
    `${clean || songTitle} ${cleanAlbum}`.trim(),
    clean || songTitle,
  ].filter((q) => q.length >= 2);

  for (const yq of ytQueries.slice(0, 2)) {
    try {
      const ytVideos = await searchYouTubeVideos(yq, 6);
      const best = selectBestYouTubeCandidate(clean || songTitle, artist, ytVideos);
      if (best?.id) {
        return {
          streamUrl: `/api/stream/yt?v=${best.id}`,
          title: best.title || songTitle,
        };
      }
    } catch {}
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = ResolveSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request body', details: parsed.error.issues }, { status: 400 });
    }

    const trackId = (parsed.data.trackId || '').trim();
    const preferredQuality = parsed.data.preferredQuality || 'auto';
    const title = (parsed.data.title || '').trim();
    const artist = (parsed.data.artist || '').trim();
    const album = (parsed.data.album || '').trim();

    if (!trackId && !title) {
      return NextResponse.json({ error: 'Either trackId or title is required' }, { status: 400 });
    }

    // If this is a YouTube track ID or verified foreign YouTube ID:
    if (trackId.startsWith('yt-') || (trackId.startsWith('foreign-') && /^[a-zA-Z0-9_-]{11}$/.test(trackId.replace('foreign-', '')))) {
      const vid = trackId.replace(/^(yt-|foreign-)/, '');
      const rawTitle = title || '';

      // Prefer verified direct studio 320kbps AAC stream (works in the background on iPhone PWA & Android lockscreen)
      if (rawTitle && rawTitle !== 'YouTube Audio Track') {
        try {
          const studioStream = await resolveAnyPlayableStream(rawTitle, artist, album);
          if (studioStream?.streamUrl && !studioStream.streamUrl.includes('/api/stream/yt')) {
            return NextResponse.json({
              streamUrl: studioStream.streamUrl,
              trackId,
              title: studioStream.title || rawTitle,
              recovered: true,
              asset: {
                id: `studio-direct-${vid}`,
                format: 'm4a',
                codec: 'AAC',
                bitrate: 320,
                isLossless: false,
                isHiRes: true,
              },
            });
          }
        } catch {}
      }

      // Direct native YouTube audio stream fallback
      return NextResponse.json({
        streamUrl: `/api/stream/yt?v=${vid}`,
        youtubeId: vid,
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
    if (trackId.startsWith('saavn-') || /^\d+$/.test(trackId)) {
      const rawId = trackId.replace('saavn-', '');
      const saavnResult = await resolveJioSaavnStream(rawId, title, artist);
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
      const fallback = await resolveAnyPlayableStream(title, artist, album);
      if (fallback) {
        const isYt = fallback.streamUrl.startsWith('/api/stream/yt');
        const ytId = isYt ? fallback.streamUrl.match(/v=([\w-]{11})/)?.[1] : undefined;
        return NextResponse.json({
          streamUrl: fallback.streamUrl,
          youtubeId: ytId,
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

    const track = trackId
      ? await prisma.track
          .findUnique({
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
          })
          .catch(() => null)
      : null;

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
            youtubeId: ytMatch[1],
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
      const albumName = track.album?.title || album;
      const resolved = await resolveAnyPlayableStream(track.title || title, artistName, albumName);
      if (resolved) {
        const isYt = resolved.streamUrl.startsWith('/api/stream/yt');
        const ytId = isYt ? resolved.streamUrl.match(/v=([\w-]{11})/)?.[1] : undefined;
        return NextResponse.json({
          streamUrl: resolved.streamUrl,
          youtubeId: ytId,
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
    // 1. Try JioSaavn direct / recovery ONLY if trackId is a JioSaavn ID
    if (trackId.startsWith('saavn-') || /^\d+$/.test(trackId)) {
      const saavnResult = await resolveJioSaavnStream(trackId.replace('saavn-', ''), title, artist);
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
    }

    // 2. Universal Playable Fallback via JioSaavn or YouTube search
    const resolved = await resolveAnyPlayableStream(title, artist, album);
    if (resolved) {
      const isYt = resolved.streamUrl.startsWith('/api/stream/yt');
      const ytId = isYt ? resolved.streamUrl.match(/v=([\w-]{11})/)?.[1] : undefined;
      return NextResponse.json({
        streamUrl: resolved.streamUrl,
        youtubeId: ytId,
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
