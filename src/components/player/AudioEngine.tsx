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

  // Clean up any lingering YouTube iframe containers from prior sessions
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const oldContainer = document.getElementById('imusic-yt-persistent-container');
    if (oldContainer) {
      oldContainer.remove();
    }
    const ytScript = document.getElementById('yt-iframe-api-script');
    if (ytScript) {
      ytScript.remove();
    }
  }, []);

  // Helper to resolve playable URL for standard audio (320 KBPS Studio AAC)
  const resolveTrackUrl = useCallback(
    async (track: typeof currentTrack, forceRefresh = false): Promise<string | null> => {
      if (!track) return null;
      if (track.streamUrl && !forceRefresh && !track.streamUrl.startsWith('youtube:')) {
        return track.streamUrl;
      }

      // Check if track has an audio asset (when not forcing remote refresh)
      if (!forceRefresh) {
        const primaryAsset = track.assets?.[0];
        if (primaryAsset) {
          if (primaryAsset.storageType === 'remote_stream' && !primaryAsset.storageKey.startsWith('youtube:')) {
            return primaryAsset.storageKey;
          }
          if (primaryAsset.id) {
            return `/api/stream/${primaryAsset.id}`;
          }
        }
      }

      // Resolve through the playback resolve endpoint
      try {
        const res = await fetch('/api/playback/resolve', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trackId: track.id,
            title: track.title,
            artist: track.artists?.[0]?.name,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.streamUrl && !data.streamUrl.startsWith('youtube:')) {
            return data.streamUrl;
          }
        }
      } catch (err) {
        console.error('Error resolving stream URL:', err);
      }
      return null;
    },
    []
  );

  // Update Media Session API for Lock Screen & Dynamic Island (iOS, Android, macOS, Windows)
  const updateMediaSession = useCallback(
    (track: typeof currentTrack) => {
      if (typeof window === 'undefined' || !('mediaSession' in navigator) || !track) {
        return;
      }

      try {
        const rawArt = track.album?.coverImage || '/icons/default-artwork.png';
        const toAbsoluteUrl = (url: string) => {
          if (!url) return '';
          if (url.startsWith('http://') || url.startsWith('https://')) return url;
          if (typeof window !== 'undefined') {
            return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`;
          }
          return url;
        };
        const artworkUrl = toAbsoluteUrl(rawArt);
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
          [
            'seekto',
            (details) => {
              if (details.seekTime !== undefined && !isNaN(details.seekTime)) {
                seek(details.seekTime);
              }
            },
          ],
          [
            'seekbackward',
            (details) => {
              const skip = details.seekOffset || 10;
              const cur = audioRef.current?.currentTime || currentTime;
              seek(Math.max(0, cur - skip));
            },
          ],
          [
            'seekforward',
            (details) => {
              const skip = details.seekOffset || 10;
              const cur = audioRef.current?.currentTime || currentTime;
              seek(cur + skip);
            },
          ],
        ];

        for (const [action, handler] of actionHandlers) {
          try {
            navigator.mediaSession.setActionHandler(action, handler);
          } catch {}
        }
      } catch (e) {
        console.warn('Failed setting MediaSession metadata', e);
      }
    },
    [resume, pause, previousTrack, nextTrack, seek, currentTime]
  );

  // Update Media Session position state
  const updateMediaSessionPosition = useCallback(() => {
    if (
      typeof window === 'undefined' ||
      !('mediaSession' in navigator) ||
      !('setPositionState' in navigator.mediaSession)
    ) {
      return;
    }

    try {
      const cur = audioRef.current?.currentTime;
      const dur = audioRef.current?.duration;

      if (dur !== undefined && !isNaN(dur) && dur > 0 && cur !== undefined && !isNaN(cur)) {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: 1,
          position: Math.min(cur, dur),
        });
      }
    } catch {}
  }, []);

  // Handle track source changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!currentTrack) return;

    if (lastTrackIdRef.current === currentTrack.id) {
      return;
    }

    lastTrackIdRef.current = currentTrack.id;
    retryCountRef.current = 0;
    setIsLoading(true);
    setError(null);

    let active = true;

    const startAudioPlayback = (streamUrl: string) => {
      if (!active || !audio) return;

      const targetVol = isMuted ? 0 : Math.max(0, Math.min(1, volume));
      try {
        audio.volume = targetVol;
        audio.muted = isMuted;
      } catch {}

      audio.src = streamUrl;
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
    };

    // FAST PATH: Direct standard audio URL already known
    if (currentTrack.streamUrl && !currentTrack.streamUrl.startsWith('youtube:')) {
      startAudioPlayback(currentTrack.streamUrl);
      return;
    }

    // RESOLVE PATH: Resolve track to studio AAC stream
    resolveTrackUrl(currentTrack).then((resolvedUrl) => {
      if (!active) return;
      if (!resolvedUrl || resolvedUrl.startsWith('youtube:')) {
        setError('Audio stream unavailable for this track');
        setIsLoading(false);
        return;
      }

      startAudioPlayback(resolvedUrl);
    });

    return () => {
      active = false;
    };
  }, [
    currentTrack,
    isPlaying,
    resolveTrackUrl,
    updateMediaSession,
    setError,
    setIsLoading,
    setIsPlaying,
    volume,
    isMuted,
  ]);

  // Handle play / pause toggle
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!isPlaying) {
      if (!audio.paused) {
        try {
          audio.pause();
        } catch {}
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      return;
    }

    // isPlaying is true
    if (audio.src && audio.paused) {
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          if (err.name === 'NotAllowedError') {
            setIsPlaying(false);
          }
        });
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
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

  // Setup standard HTML5 audio event listeners
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
      try {
        audio.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
        audio.muted = isMuted;
      } catch {}
      setIsPlaying(true);
      setIsLoading(false);
      setNetworkInterrupted(false);
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing';
      }
      updateMediaSessionPosition();
    };

    const handlePause = () => {
      if (!usePlayerStore.getState().isPlaying) {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      }
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handleCanPlay = () => {
      try {
        audio.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
        audio.muted = isMuted;
      } catch {}
      setIsLoading(false);
      setNetworkInterrupted(false);
    };

    const handleEnded = () => {
      nextTrack();
    };

    const handleError = async () => {
      console.warn('Audio playback error encountered:', audio.error);
      setIsLoading(false);

      if (retryCountRef.current === 0 && currentTrack) {
        retryCountRef.current += 1;
        console.log(`Attempting stream recovery for track: ${currentTrack.title}`);
        try {
          const freshUrl = await resolveTrackUrl(currentTrack, true);
          if (freshUrl && audio) {
            console.log(`Recovered alternative stream URL: ${freshUrl.substring(0, 45)}...`);
            audio.src = freshUrl;
            audio.load();
            audio.play().catch(() => {});
            return;
          }
        } catch (recoverErr) {
          console.warn('Alternative stream recovery attempt failed:', recoverErr);
        }
      }

      setError('Audio stream unavailable. Skipping to next track...');
      setTimeout(() => {
        nextTrack();
      }, 1500);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('playing', handlePlaying);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    const handleOnline = () => {
      setNetworkInterrupted(false);
      const state = usePlayerStore.getState();
      if (state.isPlaying && audio.paused && audio.src) {
        audio.play().catch(() => {});
      }
    };

    const handleOffline = () => {
      setNetworkInterrupted(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const state = usePlayerStore.getState();
        if (state.isPlaying && audioRef.current && audioRef.current.paused && audioRef.current.src) {
          audioRef.current.play().catch(() => {});
        }
      }
    };

    const handlePopState = () => {
      const state = usePlayerStore.getState();
      if (state.isPlaying && audioRef.current && audioRef.current.paused && audioRef.current.src) {
        audioRef.current.play().catch(() => {});
      }
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('popstate', handlePopState);

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
      window.removeEventListener('popstate', handlePopState);
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
    isMuted,
    volume,
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
