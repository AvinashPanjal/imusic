import { CatalogueProvider, ProviderCapabilities, ProviderSearchResult } from './types';
import { TrackData } from '@/types/music';

export class CommercialHandoffProvider implements CatalogueProvider {
  public readonly code = 'commercial_handoff';
  public readonly name = 'Apple Music / Spotify Handoff';
  public readonly description = 'Mainstream commercial catalogue metadata and official application handoffs';

  public readonly capabilities: ProviderCapabilities = {
    canSearchMetadata: false, // Don't hijack live search queries from playable providers
    canFetchArtwork: false,
    canFetchMetadata: false,
    canPlayFullTracks: false,
    canPlayPreviews: false,
    canFetchLyrics: false,
    canDownloadCache: false,
    hasAudioQualityMetadata: false,
  };

  public getTermsNotice(): string {
    return 'Official provider handoff for external platform integration.';
  }

  public async search(): Promise<ProviderSearchResult> {
    // Return empty so live playable providers (IndianMusicProvider, Audius) deliver actual playable 320kbps streams
    return {
      providerCode: this.code,
      providerName: this.name,
      tracks: [],
      albums: [],
      artists: [],
    };
  }

  public async getTrack(): Promise<TrackData | null> {
    return null;
  }

  public async getStreamUrl(): Promise<string | null> {
    return null;
  }
}
