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
    return rawUrl.replace(/_96\.mp4$/, '_320.mp4');
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
        ? [q]
        : [
            'Bethlehem Kudumba Unit',
            'Latest Malayalam Hits',
            'Tamil Trending Hits',
            'Latest Hindi Hits',
            'The Weeknd Trending',
          ];

      // Fetch songs and album results in parallel
      const searchPromises = queriesToRun.map(async (searchQuery) => {
        const songUrl = `${SAAVN_API_BASE}?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=18&q=${encodeURIComponent(
          searchQuery
        )}`;

        const albumUrl = `${SAAVN_API_BASE}?__call=search.getAlbumResults&_format=json&_marker=0&cc=in&p=1&n=10&q=${encodeURIComponent(
          searchQuery
        )}`;

        const headers = {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'application/json, text/plain, */*',
        };

        const [songRes, albumRes] = await Promise.all([
          fetch(songUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
          fetch(albumUrl, { headers, next: { revalidate: 300 } }).catch(() => null),
        ]);

        let rawSongs: any[] = [];
        let rawAlbums: any[] = [];

        if (songRes && songRes.ok) {
          const json = await songRes.json();
          rawSongs = json.results || [];
        }

        if (albumRes && albumRes.ok) {
          const json = await albumRes.json();
          rawAlbums = json.results || [];
        }

        return { rawSongs, rawAlbums };
      });

      const batchResults = await Promise.all(searchPromises);
      let rawResults = batchResults.flatMap((b) => b.rawSongs);
      let rawAlbumResults = batchResults.flatMap((b) => b.rawAlbums);

      // If specific search query provided, also query autocomplete.get for best official movie and song matches
      if (q) {
        try {
          const autoUrl = `${SAAVN_API_BASE}?__call=autocomplete.get&_format=json&_marker=0&cc=in&query=${encodeURIComponent(
            q
          )}`;
          const autoRes = await fetch(autoUrl, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              Accept: 'application/json, text/plain, */*',
            },
            next: { revalidate: 300 },
          });

          if (autoRes.ok) {
            const autoJson = await autoRes.json();
            const autoAlbums = (autoJson.albums?.data || []) as any[];
            const autoSongs = (autoJson.songs?.data || []) as any[];

            // Prepend autocomplete albums to ensure exact movie soundtrack matches are top-ranked
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

            // Check if top autocomplete songs need metadata fetching
            const existingSongIds = new Set(rawResults.map((s) => s.id));
            const missingSongIds = autoSongs
              .map((s) => s.id)
              .filter((id) => id && !existingSongIds.has(id));

            if (missingSongIds.length > 0) {
              const pidsUrl = `${SAAVN_API_BASE}?__call=song.getDetails&_format=json&_marker=0&cc=in&pids=${encodeURIComponent(
                missingSongIds.join(',')
              )}`;
              const pidsRes = await fetch(pidsUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' },
                next: { revalidate: 300 },
              }).then((r) => r.json()).catch(() => ({}));

              for (const id of missingSongIds) {
                if (pidsRes[id]) {
                  rawResults.unshift(pidsRes[id]);
                }
              }
            }
          }
        } catch (e) {
          console.warn('Autocomplete fetch error:', e);
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
