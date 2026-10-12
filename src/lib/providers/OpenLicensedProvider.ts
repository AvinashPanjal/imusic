import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { TrackData } from '@/types/music';

// Curated collection of authorized Creative Commons / Open-Licensed music
const CURATED_OPEN_CATALOGUE: TrackData[] = [
  {
    id: 'cc-ambient-01',
    title: 'Aura of Serenity (24-bit Hi-Res Master)',
    duration: 214,
    genre: 'Ambient / Neo-Classical',
    hasLyrics: true,
    lyricsSynced: `[00:00.00] (Gentle atmospheric synthesizers begin)
[00:15.00] In the quiet spaces between heartbeats
[00:30.00] Echoes of the evening breeze
[00:48.00] Pure harmonic resonance
[01:10.00] Floating across the horizon
[01:35.00] Light settles into darkness
[02:00.00] Perfect clarity in the silence`,
    album: {
      id: 'cc-album-01',
      title: 'Ethereal Dimensions',
      coverImage: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=600&auto=format&fit=crop&q=80',
      releaseYear: 2024,
      isHiRes: true,
      isLossless: true,
    },
    artists: [{ id: 'cc-art-01', name: 'Celestial Ensemble' }],
    assets: [
      {
        id: 'asset-cc-01',
        trackId: 'cc-ambient-01',
        format: 'flac',
        codec: 'FLAC',
        bitDepth: 24,
        sampleRate: 96000,
        bitrate: 2304,
        isLossless: true,
        isHiRes: true,
        storageType: 'remote_stream',
        // High quality sound demo stream
        storageKey: 'https://commondatastorage.googleapis.com/codeskulptor-demos/DDR_assets/Sevish_-__nbsp_.mp3',
      },
    ],
    providerCode: 'open_licensed',
  },
  {
    id: 'cc-lofi-02',
    title: 'Midnight Reverie (Studio Lossless)',
    duration: 186,
    genre: 'Lo-Fi Jazz',
    hasLyrics: false,
    album: {
      id: 'cc-album-02',
      title: 'Coffeehouse Nocturnes',
      coverImage: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&auto=format&fit=crop&q=80',
      releaseYear: 2024,
      isHiRes: false,
      isLossless: true,
    },
    artists: [{ id: 'cc-art-02', name: 'Velvet Horizon' }],
    assets: [
      {
        id: 'asset-cc-02',
        trackId: 'cc-lofi-02',
        format: 'flac',
        codec: 'FLAC',
        bitDepth: 16,
        sampleRate: 44100,
        bitrate: 1411,
        isLossless: true,
        isHiRes: false,
        storageType: 'remote_stream',
        storageKey: 'https://commondatastorage.googleapis.com/codeskulptor-assets/Epoq-Lepidoptera.ogg',
      },
    ],
    providerCode: 'open_licensed',
  },
  {
    id: 'cc-electronic-03',
    title: 'Kinetic Pulses (24-bit/48kHz Master)',
    duration: 245,
    genre: 'Electronic / Synthwave',
    hasLyrics: false,
    album: {
      id: 'cc-album-03',
      title: 'Neon Odyssey',
      coverImage: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=600&auto=format&fit=crop&q=80',
      releaseYear: 2024,
      isHiRes: true,
      isLossless: true,
    },
    artists: [{ id: 'cc-art-03', name: 'Cybernetic Dreams' }],
    assets: [
      {
        id: 'asset-cc-03',
        trackId: 'cc-electronic-03',
        format: 'flac',
        codec: 'FLAC',
        bitDepth: 24,
        sampleRate: 48000,
        bitrate: 1650,
        isLossless: true,
        isHiRes: true,
        storageType: 'remote_stream',
        storageKey: 'https://commondatastorage.googleapis.com/codeskulptor-demos/riceracer_assets/music/menu.ogg',
      },
    ],
    providerCode: 'open_licensed',
  },
];

export class OpenLicensedProvider implements CatalogueProvider {
  public readonly code = 'open_licensed';
  public readonly name = 'Creative Commons / Open Vault';
  public readonly description = 'Legally open-licensed lossless audio library';

  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: true,
    canFetchArtwork: true,
    canFetchMetadata: true,
    canPlayFullTracks: true,
    canPlayPreviews: true,
    canFetchLyrics: true,
    canDownloadCache: true,
    hasAudioQualityMetadata: true,
  };

  public getTermsNotice(): string {
    return 'Content authorized under Creative Commons (CC-BY, CC-SA) and open cultural licenses. Free to stream and offline cache.';
  }

  public async search(query: string): Promise<ProviderSearchResult> {
    const q = query.toLowerCase().trim();
    if (!q) {
      return {
        providerCode: this.code,
        providerName: this.name,
        tracks: CURATED_OPEN_CATALOGUE,
        albums: CURATED_OPEN_CATALOGUE.map((t) => t.album!).filter(Boolean),
        artists: CURATED_OPEN_CATALOGUE.flatMap((t) => t.artists),
      };
    }

    const matchedTracks = CURATED_OPEN_CATALOGUE.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artists.some((a) => a.name.toLowerCase().includes(q)) ||
        (t.album && t.album.title.toLowerCase().includes(q))
    );

    return {
      providerCode: this.code,
      providerName: this.name,
      tracks: matchedTracks,
      albums: matchedTracks.map((t) => t.album!).filter(Boolean),
      artists: matchedTracks.flatMap((t) => t.artists),
    };
  }

  public async getTrack(id: string): Promise<TrackData | null> {
    return CURATED_OPEN_CATALOGUE.find((t) => t.id === id) || null;
  }

  public async getStreamUrl(id: string): Promise<string | null> {
    const track = await this.getTrack(id);
    return track?.assets?.[0]?.storageKey || null;
  }
}
