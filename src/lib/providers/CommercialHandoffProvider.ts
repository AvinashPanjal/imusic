import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { TrackData } from '@/types/music';

// Sample curated metadata for commercial catalogue handoffs
const COMMERCIAL_SAMPLE_METADATA: TrackData[] = [
  {
    id: 'comm-track-01',
    title: 'Starboy (Hi-Res Master Available on Apple Music)',
    duration: 230,
    genre: 'R&B / Pop',
    album: {
      id: 'comm-album-01',
      title: 'Starboy',
      coverImage: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=600&auto=format&fit=crop&q=80',
      releaseYear: 2016,
      artistName: 'The Weeknd',
      isHiRes: true,
      isLossless: true,
    },
    artists: [{ id: 'comm-art-01', name: 'The Weeknd' }, { id: 'comm-art-02', name: 'Daft Punk' }],
    assets: [],
    externalUrl: 'https://music.apple.com/us/album/starboy/1440871441',
    providerCode: 'commercial_handoff',
  },
  {
    id: 'comm-track-02',
    title: 'Blinding Lights (Dolby Atmos / 24-bit on Apple Music)',
    duration: 200,
    genre: 'Synthpop',
    album: {
      id: 'comm-album-02',
      title: 'After Hours',
      coverImage: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=600&auto=format&fit=crop&q=80',
      releaseYear: 2020,
      artistName: 'The Weeknd',
      isHiRes: true,
      isLossless: true,
    },
    artists: [{ id: 'comm-art-01', name: 'The Weeknd' }],
    assets: [],
    externalUrl: 'https://music.apple.com/us/album/after-hours/1499378108',
    providerCode: 'commercial_handoff',
  },
];

export class CommercialHandoffProvider implements CatalogueProvider {
  public readonly code = 'commercial_handoff';
  public readonly name = 'Apple Music / Spotify Handoff';
  public readonly description = 'Mainstream commercial catalogue metadata and official application handoffs';

  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: true,
    canFetchArtwork: true,
    canFetchMetadata: true,
    canPlayFullTracks: false, // Explicitly declared: web PWA cannot pirate or stream DRM tracks!
    canPlayPreviews: false,
    canFetchLyrics: false,
    canDownloadCache: false,
    hasAudioQualityMetadata: true,
  };

  public getTermsNotice(): string {
    return 'Mainstream commercial recordings are protected by copyright and DRM. Direct ad-free playback requires the official provider application. Tap to hand off to Apple Music or Spotify.';
  }

  public async search(query: string): Promise<ProviderSearchResult> {
    const q = query.toLowerCase().trim();
    if (!q) {
      return {
        providerCode: this.code,
        providerName: this.name,
        tracks: COMMERCIAL_SAMPLE_METADATA,
        albums: COMMERCIAL_SAMPLE_METADATA.map((t) => t.album!).filter(Boolean),
        artists: COMMERCIAL_SAMPLE_METADATA.flatMap((t) => t.artists),
      };
    }

    const matched = COMMERCIAL_SAMPLE_METADATA.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artists.some((a) => a.name.toLowerCase().includes(q))
    );

    return {
      providerCode: this.code,
      providerName: this.name,
      tracks: matched,
      albums: matched.map((t) => t.album!).filter(Boolean),
      artists: matched.flatMap((t) => t.artists),
    };
  }

  public async getTrack(id: string): Promise<TrackData | null> {
    return COMMERCIAL_SAMPLE_METADATA.find((t) => t.id === id) || null;
  }

  public async getStreamUrl(): Promise<string | null> {
    // Commercial DRM music cannot be streamed arbitrarily through web audio element
    return null;
  }
}
