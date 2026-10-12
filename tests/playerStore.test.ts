import { describe, it, expect, beforeEach } from 'vitest';
import { usePlayerStore } from '../src/store/playerStore';
import { TrackData } from '../src/types/music';

const mockTrack1: TrackData = {
  id: 't-1',
  title: 'Track One',
  duration: 180,
  artists: [{ id: 'a-1', name: 'Artist One' }],
  assets: [],
};

const mockTrack2: TrackData = {
  id: 't-2',
  title: 'Track Two',
  duration: 210,
  artists: [{ id: 'a-2', name: 'Artist Two' }],
  assets: [],
};

const mockTrack3: TrackData = {
  id: 't-3',
  title: 'Track Three',
  duration: 240,
  artists: [{ id: 'a-3', name: 'Artist Three' }],
  assets: [],
};

describe('Player Store & Queue Management', () => {
  beforeEach(() => {
    usePlayerStore.setState({
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
      error: null,
    });
  });

  it('playing a track sets it as current and initiates playback', () => {
    const store = usePlayerStore.getState();
    store.playTrack(mockTrack1, [mockTrack1, mockTrack2], 0);

    const updated = usePlayerStore.getState();
    expect(updated.currentTrack?.id).toBe('t-1');
    expect(updated.isPlaying).toBe(true);
    expect(updated.queue).toHaveLength(2);
    expect(updated.queueIndex).toBe(0);
  });

  it('togglePlay switches playback state between play and pause', () => {
    const store = usePlayerStore.getState();
    store.playTrack(mockTrack1, [mockTrack1], 0);

    store.togglePlay();
    expect(usePlayerStore.getState().isPlaying).toBe(false);

    store.togglePlay();
    expect(usePlayerStore.getState().isPlaying).toBe(true);
  });

  it('nextTrack advances sequentially through queue', () => {
    const store = usePlayerStore.getState();
    store.playTrack(mockTrack1, [mockTrack1, mockTrack2, mockTrack3], 0);

    store.nextTrack();
    expect(usePlayerStore.getState().currentTrack?.id).toBe('t-2');
    expect(usePlayerStore.getState().queueIndex).toBe(1);

    store.nextTrack();
    expect(usePlayerStore.getState().currentTrack?.id).toBe('t-3');
    expect(usePlayerStore.getState().queueIndex).toBe(2);
  });

  it('nextTrack respects repeat all mode by looping to index 0 at end of queue', () => {
    const store = usePlayerStore.getState();
    store.playTrack(mockTrack3, [mockTrack1, mockTrack2, mockTrack3], 2);
    usePlayerStore.setState({ repeatMode: 'all' });

    store.nextTrack();
    expect(usePlayerStore.getState().queueIndex).toBe(0);
    expect(usePlayerStore.getState().currentTrack?.id).toBe('t-1');
  });

  it('previousTrack restarts current track if played past 3 seconds', () => {
    const store = usePlayerStore.getState();
    store.playTrack(mockTrack2, [mockTrack1, mockTrack2], 1);
    usePlayerStore.setState({ currentTime: 15 });

    store.previousTrack();
    expect(usePlayerStore.getState().currentTrack?.id).toBe('t-2');
    expect(usePlayerStore.getState().currentTime).toBe(0);
  });

  it('reordering queue updates position without losing playing index reference', () => {
    const store = usePlayerStore.getState();
    store.playTrack(mockTrack1, [mockTrack1, mockTrack2, mockTrack3], 0);

    // Move track 2 to position 0
    store.reorderQueue(1, 0);

    const state = usePlayerStore.getState();
    expect(state.queue[0].id).toBe('t-2');
    expect(state.queue[1].id).toBe('t-1');
    expect(state.queueIndex).toBe(1); // Track 1 is now at index 1
  });

  it('removing track from queue handles currently active track gracefully', () => {
    const store = usePlayerStore.getState();
    store.playTrack(mockTrack1, [mockTrack1, mockTrack2], 0);

    store.removeFromQueue(0);

    const state = usePlayerStore.getState();
    expect(state.queue).toHaveLength(1);
    expect(state.currentTrack?.id).toBe('t-2');
    expect(state.queueIndex).toBe(0);
  });

  it('cycleRepeat transitions through off, all, and one modes', () => {
    const store = usePlayerStore.getState();
    expect(store.repeatMode).toBe('off');

    store.cycleRepeat();
    expect(usePlayerStore.getState().repeatMode).toBe('all');

    store.cycleRepeat();
    expect(usePlayerStore.getState().repeatMode).toBe('one');

    store.cycleRepeat();
    expect(usePlayerStore.getState().repeatMode).toBe('off');
  });
});
