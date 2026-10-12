import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { TrackData } from '@/types/music';
import CryptoJS from 'crypto-js';

const SAAVN_API_BASE = 'https://www.jiosaavn.com/api.php';
const DES_KEY = '38346591';

function decodeHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function decryptMediaUrl(encryptedUrl: string | undefined | null): string | null {
  if (!encryptedUrl) return null;
  try {
    const key = CryptoJS.enc.Utf8.parse(DES_KEY);
    const decrypted = CryptoJS.DES.decrypt(encryptedUrl, key, {
      mode: CryptoJS.mode.ECB,
      padding: CryptoJS.pad.Pkcs7,
    });
    const rawUrl = decrypted.toString(CryptoJS.enc.Utf8);
    if (!rawUrl || !rawUrl.startsWith('http')) return null;

    // Prefer high-fidelity 320kbps AAC stream
    return rawUrl.replace(/_96\.mp4$/, '_320.mp4');
  } catch (err) {
    console.warn('Failed decrypting Saavn media URL:', err);
    return null;
  }
}

export class IndianMusicProvider implements CatalogueProvider {
  public readonly code = 'indian_music_vault';
  public readonly name = 'Mainstream Indian Vault (Tamil, Malayalam, Hindi)';
  public readonly description = 'Over 50 million latest Indian tracks with 320kbps high-fidelity in-app streaming';

  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: true,
    canFetchArtwork: true,
    canFetchMetadata: true,
    canPlayFullTracks: true, // 100% direct in-app audio stream!
    canPlayPreviews: false,
    canFetchLyrics: false,
    canDownloadCache: true,  // Can download to IndexedDB for offline listening!
    hasAudioQualityMetadata: true,
  };

  public getTermsNotice(): string {
    return 'Full-length 320kbps high-quality audio streams for personal ad-free playback.';
  }

  public async search(query: string): Promise<ProviderSearchResult> {
    const q = query.trim();

    try {
      const queriesToRun = q
        ? [q]
        : ['Tamil Trending', 'Malayalam Trending', 'Hindi Top Trending'];

      const searchPromises = queriesToRun.map(async (searchQuery) => {
        const url = `${SAAVN_API_BASE}?__call=search.getResults&_format=json&_marker=0&cc=in&p=1&n=12&q=${encodeURIComponent(
          searchQuery
        )}`;

        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'application/json, text/plain, */*',
          },
          next: { revalidate: 300 }, // Cache 5 min
        });

        if (!res.ok) return [];
        const json = await res.json();
        return (json.results || []) as any[];
      });

      const resultsArrays = await Promise.all(searchPromises);
      const rawResults = resultsArrays.flat();

      // Deduplicate by song ID
      const seenIds = new Set<string>();
      const tracks: TrackData[] = [];

      for (const item of rawResults) {
        if (!item.id || seenIds.has(item.id)) continue;
        seenIds.add(item.id);

        const streamUrl = decryptMediaUrl(item.encrypted_media_url);
        if (!streamUrl) continue;

        const title = decodeHtmlEntities(item.song);
        const albumName = decodeHtmlEntities(item.album || title);
        const artistNames = decodeHtmlEntities(
          item.primary_artists || item.singers || item.music || 'Various Artists'
        );

        // High resolution 500x500 cover art
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
          genre: `${item.language ? item.language.toUpperCase() : 'INDIAN'} / Film Soundtrack`,
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

      const albums = tracks.map((t) => t.album!).filter(Boolean);
      const artists = tracks.flatMap((t) => t.artists);

      return {
        providerCode: this.code,
        providerName: this.name,
        tracks,
        albums,
        artists,
      };
    } catch (err) {
      console.error('Indian music search error:', err);
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

      const title = decodeHtmlEntities(item.song);
      const albumName = decodeHtmlEntities(item.album || title);
      const artistNames = decodeHtmlEntities(
        item.primary_artists || item.singers || item.music || 'Various Artists'
      );
      const highResArtwork = (item.image || '').replace(/150x150\.jpg$/, '500x500.jpg');

      return {
        id: `saavn-${item.id}`,
        title,
        duration: parseInt(item.duration, 10) || 210,
        genre: `${item.language ? item.language.toUpperCase() : 'INDIAN'}`,
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
