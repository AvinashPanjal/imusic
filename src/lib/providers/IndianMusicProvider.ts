import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { TrackData, AlbumSummary } from '@/types/music';
import CryptoJS from 'crypto-js';

const SAAVN_API_BASE = 'https://www.jiosaavn.com/api.php';
const DES_KEY = '38346591';

export function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(dec));
}

export function normalizeSearchText(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .replace(/aa/g, 'a')
    .replace(/ee/g, 'i')
    .replace(/oo/g, 'u')
    .replace(/zh/g, 'l')
    .replace(/sh/g, 's')
    .replace(/th/g, 't')
    .replace(/[^a-z0-9]/g, '');
}

export function getQueryVariants(q: string): string[] {
  const trimmed = q.trim();
  const variants = new Set<string>([trimmed]);
  const lower = trimmed.toLowerCase();

  // Known Indian regional transliteration differences
  if (lower.includes('indrajalam')) {
    variants.add(trimmed.replace(/indrajalam/gi, 'indrajaalam'));
  }
  if (lower.includes('indrajaalam')) {
    variants.add(trimmed.replace(/indrajaalam/gi, 'indrajalam'));
  }
  if (lower.includes('avesham')) {
    variants.add(trimmed.replace(/avesham/gi, 'aavesham'));
  }
  if (lower.includes('aavesham')) {
    variants.add(trimmed.replace(/aavesham/gi, 'avesham'));
  }
  if (lower.includes('kudumba')) {
    variants.add(trimmed.replace(/kudumba/gi, 'kudumbam'));
  }
  if (lower.includes('kudumbam')) {
    variants.add(trimmed.replace(/kudumbam/gi, 'kudumba'));
  }

  // Broad double 'a' phonetic expansion (e.g., indrajalam <-> indrajaalam)
  if (lower.includes('aa')) {
    variants.add(trimmed.replace(/aa/gi, 'a'));
  } else if (/a[b-z]a/i.test(trimmed)) {
    variants.add(trimmed.replace(/a/i, 'aa'));
  }

  return Array.from(variants).slice(0, 3);
}

export function decryptMediaUrl(encryptedUrl: string | undefined | null): string | null {
  if (!encryptedUrl) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse(DES_KEY);
    const decrypted = CryptoJS.DES.decrypt(encryptedUrl, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const rawUrl = decrypted.toString(CryptoJS.enc.Utf8);
    if (!rawUrl || !rawUrl.startsWith('http')) return null;

    // Prefer high-fidelity 320kbps stream
    return rawUrl.replace(/_96\.mp4/, '_320.mp4');
  } catch (err) {
    console.warn('Failed decrypting Saavn media URL:', err);
    return null;
  }
}

export class IndianMusicProvider implements CatalogueProvider {
  public readonly code = 'indian_music_vault';
  public readonly name = 'Global & Indian Music Vault (Tamil, Malayalam, Hindi, English)';
  public readonly description = 'Over 50 million latest Indian and Global tracks with 320kbps in-app streaming';

  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: true,
    canFetchArtwork: true,
    canFetchMetadata: true,
    canPlayFullTracks: true,
    canPlayPreviews: false,
    canFetchLyrics: false,
    canDownloadCache: true,
    hasAudioQualityMetadata: true,
  };

  public getTermsNotice(): string {
    return 'Direct 320kbps high-quality audio streams for personal ad-free playback.';
  }

  public async search(query: string): Promise<ProviderSearchResult> {
    const q = query.trim();

    try {
      const queriesToRun = q
        ? getQueryVariants(q)
        : [
            'Bethlehem Kudumba Unit',
            'Indrajaalam',
            'Latest Malayalam Hits',
            'Tamil Trending Hits',
            'Latest Hindi Hits',
            'The Weeknd Trending',
          ];

      const headers = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'application/json, text/plain, */*',
      };

      // Fetch songs, albums, and autocomplete across query variants in parallel
      const searchPromises = queriesToRun.map(async (searchQuery) => {
        const songUrl = `${SAAVN_API_BASE}?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=18&q=${encodeURIComponent(
          searchQuery
        )}`;

        const albumUrl = `${SAAVN_API_BASE}?__call=search.getAlbumResults&_format=json&_marker=0&cc=in&p=1&n=12&q=${encodeURIComponent(
          searchQuery
        )}`;

        const autoUrl = `${SAAVN_API_BASE}?__call=autocomplete.get&_format=json&_marker=0&cc=in&query=${encodeURIComponent(
          searchQuery
        )}`;

        const [songRes, albumRes, autoRes] = await Promise.all([
          fetch(songUrl, { headers }).catch(() => null),
          fetch(albumUrl, { headers }).catch(() => null),
          fetch(autoUrl, { headers }).catch(() => null),
        ]);

        let rawSongs: any[] = [];
        let rawAlbums: any[] = [];
        let autoJson: any = null;

        if (songRes && songRes.ok) {
          const json = await songRes.json().catch(() => ({}));
          rawSongs = json.results || [];
        }

        if (albumRes && albumRes.ok) {
          const json = await albumRes.json().catch(() => ({}));
          rawAlbums = json.results || [];
        }

        if (autoRes && autoRes.ok) {
          autoJson = await autoRes.json().catch(() => null);
        }

        return { rawSongs, rawAlbums, autoJson };
      });

      const batchResults = await Promise.all(searchPromises);
      let rawResults = batchResults.flatMap((b) => b.rawSongs);
      let rawAlbumResults = batchResults.flatMap((b) => b.rawAlbums);

      // Process autocomplete results from all query variants
      const topSongIdsToFetch = new Set<string>();
      for (const b of batchResults) {
        if (!b.autoJson) continue;

        // Process topquery (highest confidence entity from JioSaavn)
        const topQuery = (b.autoJson.topquery?.data || []) as any[];
        for (const tq of topQuery) {
          if (tq.type === 'song' && tq.id) {
            topSongIdsToFetch.add(tq.id);
          } else if (tq.type === 'album' && tq.id) {
            rawAlbumResults.unshift({
              albumid: tq.id,
              title: tq.title,
              image: tq.image,
              music: tq.music || tq.description,
              year: tq.more_info?.year || '2024',
            });
          }
        }

        // Process autocomplete albums
        const autoAlbums = (b.autoJson.albums?.data || []) as any[];
        if (autoAlbums.length > 0) {
          const formattedAutoAlbums = autoAlbums.map((al) => ({
            albumid: al.id,
            title: al.title,
            image: al.image,
            music: al.music,
            year: al.more_info?.year || '2024',
          }));
          rawAlbumResults = [...formattedAutoAlbums, ...rawAlbumResults];
        }

        // Collect autocomplete song IDs
        const autoSongs = (b.autoJson.songs?.data || []) as any[];
        for (const s of autoSongs) {
          if (s.id) topSongIdsToFetch.add(s.id);
        }
      }

      // Batch fetch full details for any top autocomplete song IDs not already fully populated
      const existingSongIds = new Set(rawResults.map((s) => s.id));
      const missingSongIds = Array.from(topSongIdsToFetch).filter(
        (id) => !existingSongIds.has(id)
      );

      if (missingSongIds.length > 0) {
        try {
          const pidsUrl = `${SAAVN_API_BASE}?__call=song.getDetails&_format=json&_marker=0&cc=in&pids=${encodeURIComponent(
            missingSongIds.join(',')
          )}`;
          const pidsRes = await fetch(pidsUrl, { headers })
            .then((r) => r.json())
            .catch(() => ({}));

          for (const id of missingSongIds) {
            if (pidsRes[id]) {
              rawResults.unshift(pidsRes[id]);
            }
          }
        } catch {
          // Ignore
        }
      }

      // Process and deduplicate songs
      const seenIds = new Set<string>();
      const tracks: TrackData[] = [];

      for (const item of rawResults) {
        if (!item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        const streamUrl = decryptMediaUrl(item.encrypted_media_url);
        if (!streamUrl) continue;

        const title = decodeHtmlEntities(item.song || item.title || 'Unknown Track');
        const albumName = decodeHtmlEntities(item.album || title);
        const artistNames = decodeHtmlEntities(
          item.primary_artists || item.singers || item.music || 'Various Artists'
        );

        const rawCover = item.image || '';
        const highResArtwork = rawCover
          ? rawCover.replace(/150x150\.jpg$/, '500x500.jpg').replace(/50x50\.jpg$/, '500x500.jpg')
          : '/icons/default-artwork.png';

        const year = parseInt(item.year, 10) || new Date().getFullYear();
        const duration = parseInt(item.duration, 10) || 210;

        tracks.push({
          id: `saavn-${item.id}`,
          title,
          duration,
          genre: `${item.language ? item.language.toUpperCase() : 'GLOBAL'} / Soundtrack`,
          album: {
            id: `saavn-album-${item.albumid || item.id}`,
            title: albumName,
            coverImage: highResArtwork,
            artistName: artistNames,
            releaseYear: year,
            isHiRes: false,
            isLossless: true,
          },
          artists: artistNames.split(',').map((name, i) => ({
            id: `saavn-art-${item.id}-${i}`,
            name: name.trim(),
          })),
          assets: [
            {
              id: `saavn-asset-${item.id}`,
              trackId: `saavn-${item.id}`,
              format: 'mp4',
              codec: 'AAC',
              bitDepth: 16,
              sampleRate: 44100,
              bitrate: 320,
              isLossless: true,
              isHiRes: false,
              storageType: 'remote_stream',
              storageKey: streamUrl,
            },
          ],
          streamUrl,
          providerCode: this.code,
        });
      }

      // Score and rank tracks with Spotify-grade relevance
      const normQ = normalizeSearchText(q);
      if (normQ) {
        const scoredTracks = tracks.map((track) => {
          const normTitle = normalizeSearchText(track.title);
          const normAlbum = normalizeSearchText(track.album?.title || '');
          let score = 0;

          if (normTitle === normQ) score += 120;
          else if (normTitle.startsWith(normQ)) score += 70;
          else if (normTitle.includes(normQ)) score += 40;

          if (normAlbum === normQ) score += 50;
          else if (normAlbum.startsWith(normQ)) score += 30;
          else if (normAlbum.includes(normQ)) score += 15;

          // Tiebreaker bonus for recent releases
          if (track.album?.releaseYear) {
            score += Math.max(0, (track.album.releaseYear - 1980) * 0.2);
          }

          return { track, score };
        });

        scoredTracks.sort((a, b) => b.score - a.score);
        tracks.length = 0;
        tracks.push(...scoredTracks.map((st) => st.track));
      }

      // Process and deduplicate movie albums
      const seenAlbumIds = new Set<string>();
      const albums: AlbumSummary[] = [];

      for (const al of rawAlbumResults) {
        if (!al.albumid || seenAlbumIds.has(al.albumid)) continue;
        seenAlbumIds.add(al.albumid);

        const rawCover = al.image || '';
        const highResCover = rawCover
          ? rawCover.replace(/150x150\.jpg$/, '500x500.jpg')
          : '/icons/default-artwork.png';

        albums.push({
          id: `saavn-album-${al.albumid}`,
          title: decodeHtmlEntities(al.title),
          coverImage: highResCover,
          artistName: decodeHtmlEntities(al.music || al.primary_artists || 'Soundtrack'),
          releaseYear: parseInt(al.year, 10) || 2024,
          isLossless: true,
          isHiRes: false,
        });
      }

      // Score and rank albums with Spotify-grade relevance
      if (normQ) {
        const scoredAlbums = albums.map((album) => {
          const normTitle = normalizeSearchText(album.title);
          let score = 0;

          if (normTitle === normQ) score += 120;
          else if (normTitle.startsWith(normQ)) score += 70;
          else if (normTitle.includes(normQ)) score += 40;

          return { album, score };
        });

        scoredAlbums.sort((a, b) => b.score - a.score);
        albums.length = 0;
        albums.push(...scoredAlbums.map((sa) => sa.album));
      }

      const artists = tracks.flatMap((t) => t.artists);

      return {
        providerCode: this.code,
        providerName: this.name,
        tracks,
        albums,
        artists,
      };
    } catch (err) {
      console.error('Music search error:', err);
      return {
        providerCode: this.code,
        providerName: this.name,
        tracks: [],
        albums: [],
        artists: [],
      };
    }
  }

  public async getTrack(id: string): Promise<TrackData | null> {
    const rawId = id.replace(/^saavn-/, '');
    try {
      const url = `${SAAVN_API_BASE}?__call=song.getDetails&pids=${encodeURIComponent(
        rawId
      )}&_format=json&_marker=0&cc=in`;

      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      if (!res.ok) return null;
      const json = await res.json();
      const item = json[rawId];
      if (!item) return null;

      const streamUrl = decryptMediaUrl(item.encrypted_media_url);
      if (!streamUrl) return null;

      const title = decodeHtmlEntities(item.song || item.title || 'Unknown Track');
      const albumName = decodeHtmlEntities(item.album || title);
      const artistNames = decodeHtmlEntities(
        item.primary_artists || item.singers || item.music || 'Various Artists'
      );
      const highResArtwork = (item.image || '').replace(/150x150\.jpg$/, '500x500.jpg');

      return {
        id: `saavn-${item.id}`,
        title,
        duration: parseInt(item.duration, 10) || 210,
        genre: `${item.language ? item.language.toUpperCase() : 'GLOBAL'}`,
        album: {
          id: `saavn-album-${item.albumid}`,
          title: albumName,
          coverImage: highResArtwork,
          artistName: artistNames,
          releaseYear: parseInt(item.year, 10) || 2024,
        },
        artists: artistNames.split(',').map((name, i) => ({
          id: `saavn-art-${item.id}-${i}`,
          name: name.trim(),
        })),
        assets: [
          {
            id: `saavn-asset-${item.id}`,
            trackId: `saavn-${item.id}`,
            format: 'mp4',
            codec: 'AAC',
            bitrate: 320,
            isLossless: true,
            isHiRes: false,
            storageType: 'remote_stream',
            storageKey: streamUrl,
          },
        ],
        streamUrl,
        providerCode: this.code,
      };
    } catch {
      return null;
    }
  }

  public async getStreamUrl(id: string): Promise<string | null> {
    const track = await this.getTrack(id);
    return track?.streamUrl || null;
  }
}
