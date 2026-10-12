export type AudioCodec = 'FLAC' | 'ALAC' | 'AAC' | 'MP3' | 'WAV' | 'OPUS';

export type StreamingQuality = 'auto' | 'standard' | 'high' | 'lossless' | 'hires';

export interface AudioAssetData {
  id: string;
  trackId: string;
  format: string;
  codec: AudioCodec;
  bitDepth?: number | null; // e.g. 16, 24
  sampleRate?: number | null; // e.g. 44100, 48000, 96000, 192000
  bitrate?: number | null; // e.g. 1411, 320, 256
  fileSize?: number | null;
  isLossless: boolean;
  isHiRes: boolean;
  storageType: 'local' | 's3' | 'remote_stream';
  storageKey: string;
  duration?: number | null;
}

export interface ArtistSummary {
  id: string;
  name: string;
  image?: string | null;
  role?: string;
}

export interface AlbumSummary {
  id: string;
  title: string;
  coverImage?: string | null;
  releaseYear?: number | null;
  artistName?: string;
  isHiRes?: boolean;
  isLossless?: boolean;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface TrackData {
  id: string;
  title: string;
  duration: number; // seconds
  trackNumber?: number | null;
  discNumber?: number;
  genre?: string | null;
  explicit?: boolean;
  hasLyrics?: boolean;
  lyricsPlain?: string | null;
  lyricsSynced?: string | null; // serialized LRC or JSON
  playCount?: number;
  album?: AlbumSummary | null;
  albumId?: string | null;
  artists: ArtistSummary[];
  assets: AudioAssetData[];
  // Resolved playback URL if available
  streamUrl?: string;
  isFavorite?: boolean;
  providerCode?: string;
  externalUrl?: string | null;
}

export interface PlaylistData {
  id: string;
  title: string;
  description?: string | null;
  coverImage?: string | null;
  isPublic: boolean;
  userId: string;
  createdAt: string;
  trackCount: number;
  tracks?: {
    position: number;
    track: TrackData;
  }[];
}

export type RepeatMode = 'off' | 'all' | 'one';

export interface PlaybackState {
  currentTrack: TrackData | null;
  queue: TrackData[];
  queueIndex: number;
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  shuffle: boolean;
  repeatMode: RepeatMode;
  isFullScreenPlayerOpen: boolean;
  activeViewInPlayer: 'now-playing' | 'lyrics' | 'queue';
  error: string | null;
  networkInterrupted: boolean;
  // Actions
  playTrack: (track: TrackData, newQueue?: TrackData[], index?: number) => void;
  togglePlay: () => void;
  pause: () => void;
  resume: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  seek: (seconds: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (track: TrackData) => void;
  playNext: (track: TrackData) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (sourceIndex: number, destinationIndex: number) => void;
  clearQueue: () => void;
  openFullScreenPlayer: (view?: 'now-playing' | 'lyrics' | 'queue') => void;
  closeFullScreenPlayer: () => void;
  setActiveViewInPlayer: (view: 'now-playing' | 'lyrics' | 'queue') => void;
  updatePlaybackProgress: (currentTime: number, duration: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setIsLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  setNetworkInterrupted: (interrupted: boolean) => void;
}
