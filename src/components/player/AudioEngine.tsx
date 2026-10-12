'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/store/playerStore';

export const AudioEngine: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryCountRef = useRef<number>(0);
  const lastTrackIdRef = useRef<string | null>(null);

  const {
    currentTrack,
    isPlaying,
    currentTime,
    volume,
    isMuted,
    nextTrack,
    previousTrack,
    pause,
    resume,
    seek,
    setIsPlaying,
    setIsLoading,
    setError,
    setNetworkInterrupted,
    updatePlaybackProgress,
  } = usePlayerStore();

  // Helper to resolve playable URL
  const resolveTrackUrl = useCallback(async (track: typeof currentTrack): Promise<string | null> => {
    if (!track) return null;
    if (track.streamUrl) return track.streamUrl;

    // Check if track has an audio asset
    const primaryAsset = track.assets?.[0];
    if (primaryAsset) {
      if (primaryAsset.storageType === 'remote_stream') {
        return primaryAsset.storageKey;
      }
      return `/api/stream/${primaryAsset.id}`;
    }

    // Try resolving through the playback resolve endpoint
    try {
      const res = await fetch('/api/playback/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: track.id }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.streamUrl || null;
      }
    } catch (err) {
      console.error('Error resolving stream URL:', err);
    }
    return null;
  }, []);

  // Update Media Session API for iOS Lock Screen & Dynamic Island
  const updateMediaSession = useCallback((track: typeof currentTrack) => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !track) {
      return;
    }

    try {
      const artworkUrl = track.album?.coverImage || '/icons/icon-512x512.png';
      const artistNames = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

      navigator.mediaSession.metadata = new window.MediaMetadata({
        title: track.title,
        artist: artistNames,
        album: track.album?.title || '',
        artwork: [
          { src: artworkUrl, sizes: '96x96', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '128x128', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '192x192', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '256x256', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '384x384', type: 'image/jpeg' },
          { src: artworkUrl, sizes: '512x512', type: 'image/jpeg' },
        ],
      });

      // Register Media Session handlers safely
      const actionHandlers: [MediaSessionAction, MediaSessionActionHandler][] = [
        ['play', () => resume()],
        ['pause', () => pause()],
        ['previoustrack', () => previousTrack()],
        ['nexttrack', () => nextTrack()],
        ['seekto', (details) => {
          if (details.seekTime !== undefined && !isNaN(details.seekTime)) {
            seek(details.seekTime);
          }
        }],
        ['seekbackward', (details) => {
          const skip = details.seekOffset || 10;
          if (audioRef.current) {
            seek(Math.max(0, audioRef.current.currentTime - skip));
          }
        }],
        ['seekforward', (details) => {
          const skip = details.seekOffset || 10;
          if (audioRef.current) {
            seek(Math.min(audioRef.current.duration || 0, audioRef.current.currentTime + skip));
          }
        }],
      ];

      for (const [action, handler] of actionHandlers) {
        try {
          navigator.mediaSession.setActionHandler(action, handler);
        } catch {
          // Action might not be supported on this browser version
        }
      }
    } catch (e) {
      console.warn('Failed setting MediaSession metadata', e);
    }
  }, [resume, pause, previousTrack, nextTrack, seek]);

  // Update Media Session position state
  const updateMediaSessionPosition = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      !('mediaSession' in navigator) ||
      !('setPositionState' in navigator.mediaSession) ||
      !audioRef.current
    ) {
      return;
    }

    try {
      const audio = audioRef.current;
      if (!isNaN(audio.duration) && audio.duration > 0 && !isNaN(audio.currentTime)) {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate || 1,
          position: Math.min(audio.currentTime, audio.duration),
        });
      }
    } catch {
      // Ignore transient position state errors on rapid seeks
    }
  }, []);

  // Handle track source changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;

    if (lastTrackIdRef.current === currentTrack.id) {
      return;
    }

    lastTrackIdRef.current = currentTrack.id;
    retryCountRef.current = 0;
    setIsLoading(true);
    setError(null);

    // Fast path: if streamUrl is already known, load synchronously for instant background transitions
    if (currentTrack.streamUrl) {
      audio.src = currentTrack.streamUrl;
      audio.load();
      updateMediaSession(currentTrack);

      if (isPlaying) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (err.name === 'NotAllowedError') {
              console.warn('Playback blocked by browser autoplay policy');
              setIsPlaying(false);
            } else {
              console.warn('Audio play error:', err);
            }
          });
        }
      }
      return;
    }

    let active = true;

    resolveTrackUrl(currentTrack).then((url) => {
      if (!active || !audio) return;
      if (!url) {
        setError('Playback source not found or unavailable for this track');
        setIsLoading(false);
        return;
      }

      audio.src = url;
      audio.load();

      updateMediaSession(currentTrack);

      if (isPlaying) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (err.name === 'NotAllowedError') {
              console.warn('Playback blocked by browser autoplay policy');
              setIsPlaying(false);
            } else {
              console.warn('Audio play error:', err);
            }
          });
        }
      }
    });

    return () => {
      active = false;
    };
  }, [currentTrack, isPlaying, resolveTrackUrl, updateMediaSession, setError, setIsLoading, setIsPlaying]);

  // Handle play / pause toggle
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;

    if (isPlaying) {
      if (audio.paused) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (err.name === 'NotAllowedError') {
              setIsPlaying(false);
            }
          });
        }
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
    } else {
      if (!audio.paused) {
        audio.pause();
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    }
  }, [isPlaying, setIsPlaying]);

  // Handle seek synchronization
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (Math.abs(audio.currentTime - currentTime) > 1.0) {
      audio.currentTime = currentTime;
      updateMediaSessionPosition();
    }
  }, [currentTime, updateMediaSessionPosition]);

  // Handle volume / mute
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.volume = isMuted ? 0 : volume;
      audio.muted = isMuted;
    } catch {}
  }, [volume, isMuted]);

  // Setup audio event listeners and visibility recovery
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      updatePlaybackProgress(audio.currentTime, audio.duration || 0);
    };

    const handleDurationChange = () => {
      if (!isNaN(audio.duration)) {
        updatePlaybackProgress(audio.currentTime, audio.duration);
        updateMediaSessionPosition();
      }
    };

    const handlePlaying = () => {
      setIsPlaying(true);
      setIsLoading(false);
      setNetworkInterrupted(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      updateMediaSessionPosition();
    };

    const handlePause = () => {
      setIsPlaying(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
      setNetworkInterrupted(false);
    };

    const handleEnded = () => {
      nextTrack();
    };

    const handleError = async () => {
      console.warn('Audio playback error encountered:', audio.error);
      setIsLoading(false);

      // Attempt single retry recovery if URL expired
      if (retryCountRef.current === 0 && currentTrack) {
        retryCountRef.current += 1;
        console.log('Attempting stream recovery...');
        const newUrl = await resolveTrackUrl(currentTrack);
        if (newUrl && newUrl !== audio.src) {
          audio.src = newUrl;
          audio.load();
          if (isPlaying) {
            audio.play().catch(() => {});
          }
          return;
        }
      }

      setError('Audio stream failed to load. Please check connection or source.');
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    // Online / Offline network recovery
    const handleOnline = () => {
      setNetworkInterrupted(false);
      if (isPlaying && audio.paused) {
        audio.play().catch(() => {});
      }
    };

    const handleOffline = () => {
      setNetworkInterrupted(true);
    };

    // Ensure audio stays in sync when returning from background
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isPlaying && audio.paused) {
        audio.play().catch(() => {});
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('playing', handlePlaying);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    updatePlaybackProgress,
    updateMediaSessionPosition,
    setIsPlaying,
    setIsLoading,
    setNetworkInterrupted,
    setError,
    nextTrack,
    resolveTrackUrl,
    currentTrack,
    isPlaying,
  ]);

  return (
    <audio
      ref={audioRef}
      playsInline
      preload="auto"
      style={{
        position: 'fixed',
        top: '-9999px',
        left: '-9999px',
        width: '1px',
        height: '1px',
        opacity: 0.001,
        pointerEvents: 'none',
      }}
      aria-hidden="true"
    />
  );
};
