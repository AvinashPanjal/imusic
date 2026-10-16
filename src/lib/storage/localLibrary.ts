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

  addTrackToPlaylist(playlistId: string, track: TrackData): boolean {
    if (!isBrowser()) return false;
    try {
      const list = this.getPlaylists();
      const pl = list.find((p) => p.id === playlistId);
      if (!pl) return false;
      if (!Array.isArray(pl.tracks)) pl.tracks = [];
      const alreadyExists = pl.tracks.some((t: any) => (t.track ? t.track.id === track.id : t.id === track.id));
      if (!alreadyExists) {
        pl.tracks.push({
          position: pl.tracks.length,
          track,
        });
        pl.trackCount = pl.tracks.length;
        if (!pl.coverImage && track.album?.coverImage && !track.album.coverImage.includes('default-artwork')) {
          pl.coverImage = track.album.coverImage;
        }
        localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
      }
      return true;
    } catch (e) {
      console.warn('Failed to add track to playlist:', e);
      return false;
    }
  },

  removeTrackFromPlaylist(playlistId: string, trackId: string): boolean {
    if (!isBrowser()) return false;
    try {
      const list = this.getPlaylists();
      const pl = list.find((p) => p.id === playlistId);
      if (!pl || !Array.isArray(pl.tracks)) return false;
      pl.tracks = pl.tracks.filter((t: any) => (t.track ? t.track.id !== trackId : t.id !== trackId));
      pl.trackCount = pl.tracks.length;
      localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.warn('Failed to remove track from playlist:', e);
      return false;
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

  addFavorite(track: TrackData): void {
    if (!isBrowser()) return;
    try {
      const favs = this.getFavorites();
      const idx = favs.findIndex((t) => t.id === track.id);
      if (idx === -1) {
        favs.unshift({ ...track, isFavorite: true });
        localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
      }
    } catch (e) {
      console.warn('Failed to add favorite:', e);
    }
  },

  removeFavorite(trackId: string): void {
    if (!isBrowser()) return;
    try {
      const favs = this.getFavorites().filter((t) => t.id !== trackId);
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    } catch (e) {
      console.warn('Failed to remove favorite:', e);
    }
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
