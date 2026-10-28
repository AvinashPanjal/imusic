import { create } from 'zustand';
import { TrackData, PlaybackState, RepeatMode } from '@/types/music';
import { LocalLibrary } from '@/lib/storage/localLibrary';

const STORAGE_KEY = 'imusic_playback_state_v1';

interface PersistedState {
  queue: TrackData[];
  queueIndex: number;
  currentTrack: TrackData | null;
  volume: number;
  repeatMode: RepeatMode;
  shuffle: boolean;
}

const loadPersistedState = (): Partial<PersistedState> => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn('Could not load stored player state', err);
    return {};
  }
};

const savePersistedState = (state: PersistedState) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Could not save player state to localStorage', err);
  }
};

export const usePlayerStore = create<PlaybackState>((set, get) => {
  return {
    currentTrack: null,
    queue: [],
    queueIndex: -1,
    isPlaying: false,
    isLoading: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    isMuted: false,
    shuffle: false,
    repeatMode: 'off',
    isFullScreenPlayerOpen: false,
    activeViewInPlayer: 'now-playing',
    error: null,
    networkInterrupted: false,
    isHydrated: false,

    hydrate: () => {
      if (typeof window === 'undefined' || get().isHydrated) return;
      const persisted = loadPersistedState();
      set({
        currentTrack: persisted.currentTrack || null,
        queue: persisted.queue || [],
        queueIndex: persisted.queueIndex ?? -1,
        volume: persisted.volume ?? 1,
        repeatMode: persisted.repeatMode ?? 'off',
        shuffle: persisted.shuffle ?? false,
        isHydrated: true,
      });
    },

    playTrack: (track: TrackData, newQueue?: TrackData[], index?: number) => {
      let updatedQueue = newQueue ? [...newQueue] : get().queue;
      let targetIndex = index !== undefined ? index : -1;

      if (!newQueue && updatedQueue.length === 0) {
        updatedQueue = [track];
        targetIndex = 0;
      } else if (targetIndex === -1) {
        targetIndex = updatedQueue.findIndex((t) => t.id === track.id);
        if (targetIndex === -1) {
          updatedQueue = [...updatedQueue, track];
          targetIndex = updatedQueue.length - 1;
        }
      }

      set({
        currentTrack: track,
        queue: updatedQueue,
        queueIndex: targetIndex,
        isPlaying: true,
        isLoading: true,
        currentTime: 0,
        duration: track.duration || 0,
        error: null,
      });

      savePersistedState({
        queue: updatedQueue,
        queueIndex: targetIndex,
        currentTrack: track,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });

      try {
        LocalLibrary.addRecentlyPlayed(track);
      } catch (e) {
        console.warn('Failed recording recently played track:', e);
      }
    },

    togglePlay: () => {
      const { isPlaying, currentTrack, queue } = get();
      if (!currentTrack && queue.length > 0) {
        get().playTrack(queue[0], queue, 0);
        return;
      }
      set({ isPlaying: !isPlaying });
    },

    pause: () => {
      set({ isPlaying: false });
    },

    resume: () => {
      if (get().currentTrack) {
        set({ isPlaying: true });
      }
    },

    nextTrack: () => {
      const { queue, queueIndex, repeatMode, shuffle } = get();
      if (queue.length === 0) return;

      if (repeatMode === 'one') {
        // Replay current track
        set({ currentTime: 0, isPlaying: true });
        return;
      }

      let nextIndex: number;
      if (shuffle && queue.length > 1) {
        let randomIndex = Math.floor(Math.random() * queue.length);
        while (randomIndex === queueIndex && queue.length > 1) {
          randomIndex = Math.floor(Math.random() * queue.length);
        }
        nextIndex = randomIndex;
      } else {
        if (queueIndex < queue.length - 1) {
          nextIndex = queueIndex + 1;
        } else if (repeatMode === 'all') {
          nextIndex = 0;
        } else {
          // Reached end of queue without repeat
          set({ isPlaying: false, currentTime: 0 });
          return;
        }
      }

      const nextTrack = queue[nextIndex];
      set({
        currentTrack: nextTrack,
        queueIndex: nextIndex,
        currentTime: 0,
        duration: nextTrack.duration || 0,
        isPlaying: true,
        isLoading: true,
        error: null,
      });

      savePersistedState({
        queue,
        queueIndex: nextIndex,
        currentTrack: nextTrack,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });
    },

    previousTrack: () => {
      const { queue, queueIndex, currentTime } = get();
      if (queue.length === 0) return;

      // If more than 3 seconds in, restart track
      if (currentTime > 3) {
        set({ currentTime: 0 });
        return;
      }

      const prevIndex = queueIndex > 0 ? queueIndex - 1 : 0;
      const prevTrack = queue[prevIndex];

      set({
        currentTrack: prevTrack,
        queueIndex: prevIndex,
        currentTime: 0,
        duration: prevTrack.duration || 0,
        isPlaying: true,
        isLoading: true,
        error: null,
      });

      savePersistedState({
        queue,
        queueIndex: prevIndex,
        currentTrack: prevTrack,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });
    },

    seek: (seconds: number) => {
      set({ currentTime: seconds });
    },

    setVolume: (vol: number) => {
      const clamped = Math.max(0, Math.min(1, vol));
      set({ volume: clamped, isMuted: clamped === 0 });
      savePersistedState({
        queue: get().queue,
        queueIndex: get().queueIndex,
        currentTrack: get().currentTrack,
        volume: clamped,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });
    },

    toggleMute: () => {
      const { isMuted, volume } = get();
      if (isMuted) {
        set({ isMuted: false, volume: volume > 0 ? volume : 0.8 });
      } else {
        set({ isMuted: true });
      }
    },

    toggleShuffle: () => {
      const newShuffle = !get().shuffle;
      set({ shuffle: newShuffle });
      savePersistedState({
        queue: get().queue,
        queueIndex: get().queueIndex,
        currentTrack: get().currentTrack,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: newShuffle,
      });
    },

    cycleRepeat: () => {
      const current = get().repeatMode;
      const next: RepeatMode = current === 'off' ? 'all' : current === 'all' ? 'one' : 'off';
      set({ repeatMode: next });
      savePersistedState({
        queue: get().queue,
        queueIndex: get().queueIndex,
        currentTrack: get().currentTrack,
        volume: get().volume,
        repeatMode: next,
        shuffle: get().shuffle,
      });
    },

    addToQueue: (track: TrackData) => {
      const updatedQueue = [...get().queue, track];
      set({ queue: updatedQueue });
      savePersistedState({
        queue: updatedQueue,
        queueIndex: get().queueIndex,
        currentTrack: get().currentTrack,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });
    },

    playNext: (track: TrackData) => {
      const { queue, queueIndex } = get();
      const updatedQueue = [...queue];
      const insertAt = queueIndex >= 0 ? queueIndex + 1 : 0;
      updatedQueue.splice(insertAt, 0, track);
      set({ queue: updatedQueue });
      savePersistedState({
        queue: updatedQueue,
        queueIndex: get().queueIndex,
        currentTrack: get().currentTrack,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });
    },

    removeFromQueue: (index: number) => {
      const { queue, queueIndex, currentTrack } = get();
      if (index < 0 || index >= queue.length) return;

      const updatedQueue = queue.filter((_, i) => i !== index);
      let updatedIndex = queueIndex;

      if (index < queueIndex) {
        updatedIndex -= 1;
      } else if (index === queueIndex) {
        // If removing currently playing track
        if (updatedQueue.length > 0) {
          const nextTrackIndex = index < updatedQueue.length ? index : 0;
          set({
            queue: updatedQueue,
            queueIndex: nextTrackIndex,
            currentTrack: updatedQueue[nextTrackIndex],
          });
          return;
        } else {
          // Emptied queue
          set({
            queue: [],
            queueIndex: -1,
            currentTrack: null,
            isPlaying: false,
          });
          return;
        }
      }

      set({ queue: updatedQueue, queueIndex: updatedIndex });
      savePersistedState({
        queue: updatedQueue,
        queueIndex: updatedIndex,
        currentTrack,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });
    },

    reorderQueue: (sourceIndex: number, destinationIndex: number) => {
      const { queue, queueIndex, currentTrack } = get();
      if (
        sourceIndex < 0 ||
        sourceIndex >= queue.length ||
        destinationIndex < 0 ||
        destinationIndex >= queue.length
      ) {
        return;
      }

      const updatedQueue = [...queue];
      const [movedItem] = updatedQueue.splice(sourceIndex, 1);
      updatedQueue.splice(destinationIndex, 0, movedItem);

      // Adjust queueIndex if the moved item or surroundings affected it
      let updatedIndex = queueIndex;
      if (queueIndex === sourceIndex) {
        updatedIndex = destinationIndex;
      } else if (sourceIndex < queueIndex && destinationIndex >= queueIndex) {
        updatedIndex -= 1;
      } else if (sourceIndex > queueIndex && destinationIndex <= queueIndex) {
        updatedIndex += 1;
      }

      set({ queue: updatedQueue, queueIndex: updatedIndex });
      savePersistedState({
        queue: updatedQueue,
        queueIndex: updatedIndex,
        currentTrack,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });
    },

    clearQueue: () => {
      const { currentTrack } = get();
      // Keep only current playing track in queue
      const updatedQueue = currentTrack ? [currentTrack] : [];
      const updatedIndex = currentTrack ? 0 : -1;
      set({ queue: updatedQueue, queueIndex: updatedIndex });
      savePersistedState({
        queue: updatedQueue,
        queueIndex: updatedIndex,
        currentTrack,
        volume: get().volume,
        repeatMode: get().repeatMode,
        shuffle: get().shuffle,
      });
    },

    openFullScreenPlayer: (view = 'now-playing') => {
      set({ isFullScreenPlayerOpen: true, activeViewInPlayer: view });
    },

    closeFullScreenPlayer: () => {
      set({ isFullScreenPlayerOpen: false });
    },

    setActiveViewInPlayer: (view) => {
      set({ activeViewInPlayer: view });
    },

    updatePlaybackProgress: (currentTime: number, duration: number) => {
      set({ currentTime, duration: duration || get().duration });
    },

    setIsPlaying: (isPlaying: boolean) => {
      set({ isPlaying });
    },

    setIsLoading: (isLoading: boolean) => {
      set({ isLoading });
    },

    setError: (error: string | null) => {
      set({ error, isLoading: false, isPlaying: error ? false : get().isPlaying });
    },

    setNetworkInterrupted: (interrupted: boolean) => {
      set({ networkInterrupted: interrupted });
    },
  };
});
