import { openDB, DBSchema } from 'idb';
import { TrackData } from '@/types/music';

interface OfflineDB extends DBSchema {
  tracks: {
    key: string;
    value: {
      id: string;
      trackData: TrackData;
      audioBlob: Blob;
      downloadedAt: number;
      size: number;
    };
  };
}

const DB_NAME = 'imusic_offline_vault';
const DB_VERSION = 1;

async function getDB() {
  return openDB<OfflineDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('tracks')) {
        db.createObjectStore('tracks', { keyPath: 'id' });
      }
    },
  });
}

export class OfflineDownloadManager {
  /**
   * Check if track is already cached offline
   */
  public static async isTrackDownloaded(trackId: string): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    try {
      const db = await getDB();
      const existing = await db.get('tracks', trackId);
      return Boolean(existing);
    } catch {
      return false;
    }
  }

  /**
   * Download track audio file for offline listening
   */
  public static async downloadTrack(
    track: TrackData,
    onProgress?: (percent: number) => void
  ): Promise<void> {
    if (typeof window === 'undefined') return;

    // Check permission - commercial handoffs cannot be downloaded
    if (track.providerCode === 'commercial_handoff') {
      throw new Error('Commercial copyright protected streams cannot be downloaded offline');
    }

    // Resolve streaming URL
    let streamUrl = track.streamUrl;
    if (!streamUrl) {
      const res = await fetch('/api/playback/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: track.id, preferredQuality: 'lossless' }),
      });
      if (!res.ok) throw new Error('Could not resolve download stream');
      const data = await res.json();
      streamUrl = data.streamUrl;
    }

    if (!streamUrl) throw new Error('No audio URL available to download');

    // Fetch with download progress monitoring
    const response = await fetch(streamUrl);
    if (!response.ok) throw new Error('Download failed with network error');

    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    let loaded = 0;
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.length;
          if (total > 0 && onProgress) {
            onProgress(Math.round((loaded / total) * 100));
          }
        }
      }
    } else {
      const blob = await response.blob();
      chunks.push(new Uint8Array(await blob.arrayBuffer()));
      loaded = blob.size;
    }

    const audioBlob = new Blob(chunks as unknown as BlobPart[], {
      type: response.headers.get('content-type') || 'audio/flac',
    });

    const db = await getDB();
    await db.put('tracks', {
      id: track.id,
      trackData: track,
      audioBlob,
      downloadedAt: Date.now(),
      size: audioBlob.size,
    });
  }

  /**
   * Delete offline cached track
   */
  public static async deleteDownloadedTrack(trackId: string): Promise<void> {
    if (typeof window === 'undefined') return;
    const db = await getDB();
    await db.delete('tracks', trackId);
  }

  /**
   * Retrieves blob object URL for offline playback
   */
  public static async getOfflineTrackUrl(trackId: string): Promise<string | null> {
    if (typeof window === 'undefined') return null;
    try {
      const db = await getDB();
      const item = await db.get('tracks', trackId);
      if (!item) return null;
      return URL.createObjectURL(item.audioBlob);
    } catch {
      return null;
    }
  }

  /**
   * List all tracks stored offline
   */
  public static async getAllDownloadedTracks(): Promise<TrackData[]> {
    if (typeof window === 'undefined') return [];
    try {
      const db = await getDB();
      const records = await db.getAll('tracks');
      return records.map((r) => r.trackData);
    } catch {
      return [];
    }
  }

  /**
   * Estimate storage usage via navigator.storage.estimate()
   */
  public static async getStorageEstimate(): Promise<{ usedBytes: number; quotaBytes: number }> {
    if (typeof window !== 'undefined' && 'storage' in navigator && 'estimate' in navigator.storage) {
      try {
        const est = await navigator.storage.estimate();
        return {
          usedBytes: est.usage || 0,
          quotaBytes: est.quota || 0,
        };
      } catch {
        // Fallback
      }
    }
    return { usedBytes: 0, quotaBytes: 0 };
  }
}
