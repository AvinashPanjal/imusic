import { PlaylistData, TrackData } from '@/types/music';

const PLAYLISTS_KEY = 'imusic_local_playlists';
const FAVORITES_KEY = 'imusic_local_favorites';

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export const LocalLibrary = {
  // --- PLAYLISTS ---
  getPlaylists(): PlaylistData[] {
    if (!isBrowser()) return [];
    try {
      const data = localStorage.getItem(PLAYLISTS_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to parse local playlists:', e);
      return [];
    }
  },

  getPlaylistById(id: string): PlaylistData | null {
    const list = this.getPlaylists();
    return list.find((p) => p.id === id) || null;
  },

  savePlaylist(playlist: PlaylistData): void {
    if (!isBrowser()) return;
    try {
      const list = this.getPlaylists();
      const existingIdx = list.findIndex((p) => p.id === playlist.id);
      if (existingIdx >= 0) {
        list[existingIdx] = playlist;
      } else {
        list.unshift(playlist);
      }
      localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to save local playlist:', e);
    }
  },

  deletePlaylist(id: string): void {
    if (!isBrowser()) return;
    try {
      const list = this.getPlaylists().filter((p) => p.id !== id);
      localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to delete local playlist:', e);
    }
  },

  // --- FAVORITES ---
  getFavorites(): TrackData[] {
    if (!isBrowser()) return [];
    try {
      const data = localStorage.getItem(FAVORITES_KEY);
      if (!data) return [];
      return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to parse local favorites:', e);
      return [];
    }
  },

  isFavorite(trackId: string): boolean {
    const favs = this.getFavorites();
    return favs.some((t) => t.id === trackId);
  },

  toggleFavorite(track: TrackData): boolean {
    if (!isBrowser()) return false;
    try {
      const favs = this.getFavorites();
      const idx = favs.findIndex((t) => t.id === track.id);
      let isFav = false;
      if (idx >= 0) {
        favs.splice(idx, 1);
        isFav = false;
      } else {
        favs.unshift({ ...track, isFavorite: true });
        isFav = true;
      }
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
      return isFav;
    } catch (e) {
      console.warn('Failed to toggle local favorite:', e);
      return false;
    }
  },
};
