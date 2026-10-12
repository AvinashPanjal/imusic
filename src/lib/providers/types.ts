import { TrackData, AlbumSummary, ArtistSummary } from '@/types/music';

export interface ProviderCapabilities {
  canSearchMetadata: boolean;
  canFetchArtwork: boolean;
  canFetchMetadata: boolean;
  canPlayFullTracks: boolean;
  canPlayPreviews: boolean;
  canFetchLyrics: boolean;
  canDownloadCache: boolean;
  hasAudioQualityMetadata: boolean;
}

export interface ProviderSearchResult {
  providerCode: string;
  providerName: string;
  tracks: TrackData[];
  albums: AlbumSummary[];
  artists: ArtistSummary[];
}

export interface CatalogueProvider {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: ProviderCapabilities;

  search(query: string): Promise<ProviderSearchResult>;
  getTrack(externalId: string): Promise<TrackData | null>;
  getStreamUrl(externalId: string): Promise<string | null>;
  getTermsNotice(): string;
}
