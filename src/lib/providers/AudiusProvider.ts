import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { TrackData } from '@/types/music';

const DISCOVERY_ENDPOINT = 'https://discoveryprovider.audius.co/v1';
const APP_NAME = 'imusic';

export class AudiusProvider implements CatalogueProvider {
  public readonly code = 'audius_online';
  public readonly name = 'Audius Online Vault (1M+ Free Tracks)';
  public readonly description = 'Ad-free online streaming of over 1,000,000 free tracks with direct in-app playback';

  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: true,
    canFetchArtwork: true,
    canFetchMetadata: true,
    canPlayFullTracks: true, // Plays directly inside the app's persistent audio player!
    canPlayPreviews: false,
    canFetchLyrics: false,
    canDownloadCache: true,  // Can download for offline listening!
    hasAudioQualityMetadata: true,
  };

  public getTermsNotice(): string {
    return 'Free, ad-free streaming powered by the decentralized Audius open audio protocol. 100% legal for personal listening.';
  }

  public async search(query: string): Promise<ProviderSearchResult> {
    const q = query.trim();

    try {
      let url: string;
      if (!q) {
        // Return top trending tracks when query is empty
        url = `${DISCOVERY_ENDPOINT}/tracks/trending?app_name=${APP_NAME}&limit=12`;
      } else {
        url = `${DISCOVERY_ENDPOINT}/tracks/search?query=${encodeURIComponent(q)}&app_name=${APP_NAME}&limit=20`;
      }

      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 300 }, // Cache for 5 mins
      });

      if (!res.ok) {
        console.warn('Audius API returned status:', res.status);
        return this.emptyResult();
      }

      const json = await res.json();
      const rawTracks = json.data || [];

      const tracks: TrackData[] = rawTracks.map((item: any) => {
        const streamUrl = `${DISCOVERY_ENDPOINT}/tracks/${item.id}/stream?app_name=${APP_NAME}`;
        const artworkUrl =
          item.artwork?.['480x480'] ||
          item.artwork?.['150x150'] ||
          'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80';

        const artistName = item.user?.name || 'Unknown Artist';
        const trackTitle = item.title || 'Untitled Track';

        return {
          id: `audius-${item.id}`,
          title: trackTitle,
          duration: item.duration || 180,
          genre: item.genre || 'Electronic / Pop',
          hasLyrics: false,
          album: {
            id: `audius-album-${item.id}`,
            title: item.album || `${trackTitle} (Single)`,
            coverImage: artworkUrl,
            artistName,
            releaseYear: new Date(item.release_date || Date.now()).getFullYear(),
            isHiRes: false,
            isLossless: false,
          },
          artists: [
            {
              id: `audius-user-${item.user?.id || '0'}`,
              name: artistName,
              image: item.user?.profile_picture?.['150x150'] || null,
            },
          ],
          assets: [
            {
              id: `asset-audius-${item.id}`,
              trackId: `audius-${item.id}`,
              format: 'mp3',
              codec: 'MP3',
              bitDepth: 16,
              sampleRate: 44100,
              bitrate: 320,
              isLossless: false,
              isHiRes: false,
              storageType: 'remote_stream',
              storageKey: streamUrl,
            },
          ],
          streamUrl,
          providerCode: this.code,
        };
      });

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
      console.error('Audius search error:', err);
      return this.emptyResult();
    }
  }

  public async getTrack(id: string): Promise<TrackData | null> {
    const rawId = id.replace(/^audius-/, '');
    try {
      const res = await fetch(`${DISCOVERY_ENDPOINT}/tracks/${rawId}?app_name=${APP_NAME}`);
      if (!res.ok) return null;
      const json = await res.json();
      const item = json.data;
      if (!item) return null;

      const streamUrl = `${DISCOVERY_ENDPOINT}/tracks/${item.id}/stream?app_name=${APP_NAME}`;
      const artworkUrl =
        item.artwork?.['480x480'] ||
        item.artwork?.['150x150'] ||
        '/icons/default-artwork.png';

      return {
        id: `audius-${item.id}`,
        title: item.title,
        duration: item.duration || 180,
        genre: item.genre,
        album: {
          id: `audius-album-${item.id}`,
          title: item.title,
          coverImage: artworkUrl,
          artistName: item.user?.name,
        },
        artists: [{ id: `audius-user-${item.user?.id}`, name: item.user?.name }],
        assets: [
          {
            id: `asset-audius-${item.id}`,
            trackId: `audius-${item.id}`,
            format: 'mp3',
            codec: 'MP3',
            bitrate: 320,
            isLossless: false,
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
    const rawId = id.replace(/^audius-/, '');
    return `${DISCOVERY_ENDPOINT}/tracks/${rawId}/stream?app_name=${APP_NAME}`;
  }

  private emptyResult(): ProviderSearchResult {
    return {
      providerCode: this.code,
      providerName: this.name,
      tracks: [],
      albums: [],
      artists: [],
    };
  }
}
