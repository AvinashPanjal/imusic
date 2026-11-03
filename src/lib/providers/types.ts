import { TrackData, AlbumSummary, ArtistSummary } from '@/types/music';
import type { AISearchAnalysis } from '@/lib/ai/searchSupervisor';

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

export interface SearchOptions {
  aiAnalysis?: AISearchAnalysis;
}

export interface CatalogueProvider {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly capabilities: ProviderCapabilities;

  search(query: string, options?: SearchOptions): Promise<ProviderSearchResult>;
  getTrack(externalId: string): Promise<TrackData | null>;
  getStreamUrl(externalId: string): Promise<string | null>;
  getTermsNotice(): string;
}
