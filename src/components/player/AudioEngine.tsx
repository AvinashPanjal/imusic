'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/store/playerStore';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

// Override Page Visibility API so YouTube's embedded player script does not detect app backgrounding/locking
if (typeof document !== 'undefined') {
  try {
    Object.defineProperties(document, {
      hidden: { value: false, writable: true, configurable: true },
      visibilityState: { value: 'visible', writable: true, configurable: true },
      webkitHidden: { value: false, writable: true, configurable: true },
      webkitVisibilityState: { value: 'visible', writable: true, configurable: true },
    });
  } catch {}
}

const SILENT_AUDIO = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAP8A/w==';

function extractYouTubeId(track: any): string | null {
  if (!track) return null;
  if (typeof track.id === 'string' && track.id.startsWith('yt-')) {
    return track.id.replace('yt-', '');
  }
  const checkUrl = (url?: string | null): string | null => {
    if (!url || typeof url !== 'string') return null;
    if (url.startsWith('youtube:')) return url.replace('youtube:', '');
    const m = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
    if (m) return m[1];
    const shortM = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
    if (shortM) return shortM[1];
    return null;
  };
  const fromStream = checkUrl(track.streamUrl);
  if (fromStream) return fromStream;
  if (Array.isArray(track.assets)) {
    for (const a of track.assets) {
      const fromAsset = checkUrl(a?.storageKey);
      if (fromAsset) return fromAsset;
    }
  }
  return null;
}

const isVercelEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('vercel.app') || window.location.hostname.includes('vercel');
};

export const AudioEngine: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isYtModeRef = useRef<boolean>(false);
  const isYtReadyRef = useRef<boolean>(false);
  const pendingYtVideoIdRef = useRef<string | null>(null);
  const directStreamFailedRef = useRef<boolean>(false);
  const retryCountRef = useRef<number>(0);
  const lastTrackIdRef = useRef<string | null>(null);
  const isManualPauseRef = useRef<boolean>(false);

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

  // Keep Web Audio hardware context active in the background
  const ensureAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current && typeof window !== 'undefined') {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioCtx) {
          const ctx = new AudioCtx();
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          gain.gain.value = 0.0001; // Inaudible
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.start();
          audioContextRef.current = ctx;
        }
      }
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
    } catch {}
  }, []);

  // Helper to update Media Session API for Lock Screen & Dynamic Island (iOS, Android, macOS, Windows)
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
          [
            'play',
            () => {
              isManualPauseRef.current = false;
              resume();
              if (isYtModeRef.current) {
                if (audioRef.current && audioRef.current.paused) {
                  try {
                    audioRef.current.play().catch(() => {});
                  } catch {}
                }
                if (ytPlayerRef.current) {
                  try {
                    ytPlayerRef.current.playVideo?.();
                  } catch {}
                }
              } else if (audioRef.current && audioRef.current.paused) {
                audioRef.current.play().catch(() => {});
              }
              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'playing';
              }
            },
          ],
          [
            'pause',
            () => {
              isManualPauseRef.current = true;
              pause();
              if (audioRef.current && !audioRef.current.paused) {
                try {
                  audioRef.current.pause();
                } catch {}
              }
              if (isYtModeRef.current && ytPlayerRef.current) {
                try {
                  ytPlayerRef.current.pauseVideo?.();
                } catch {}
              }
              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'paused';
              }
            },
          ],
          [
            'stop',
            () => {
              isManualPauseRef.current = true;
              pause();
              if (audioRef.current) {
                try {
                  audioRef.current.pause();
                  audioRef.current.currentTime = 0;
                } catch {}
              }
              if (isYtModeRef.current && ytPlayerRef.current) {
                try {
                  ytPlayerRef.current.pauseVideo?.();
                  ytPlayerRef.current.stopVideo?.();
                } catch {}
              }
              if ('mediaSession' in navigator) {
                navigator.mediaSession.playbackState = 'none';
              }
            },
          ],
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
              const cur = currentTime;
              seek(Math.max(0, cur - skip));
            },
          ],
          [
            'seekforward',
            (details) => {
              const skip = details.seekOffset || 10;
              const cur = currentTime;
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

  // Helper to play via client-side YouTube IFrame Player (bypasses datacenter blocks 100%)
  const playViaYouTubePlayer = useCallback(
    (videoId: string) => {
      isManualPauseRef.current = false;
      isYtModeRef.current = true;
      setIsLoading(true);
      setError(null);
      updateMediaSession(currentTrack);
      ensureAudioContext();

      // Maintain native audio context loop for mobile lock screen & background playback
      if (audioRef.current) {
        try {
          if (audioRef.current.src !== SILENT_AUDIO) {
            audioRef.current.src = SILENT_AUDIO;
            audioRef.current.loop = true;
          }
          audioRef.current.play().catch(() => {});
        } catch {}
      }

      if (ytPlayerRef.current && isYtReadyRef.current && typeof ytPlayerRef.current.loadVideoById === 'function') {
        try {
          const targetVol = isMuted ? 0 : Math.round(volume * 100);
          ytPlayerRef.current.setVolume?.(targetVol);
          if (isMuted) ytPlayerRef.current.mute?.();
          else ytPlayerRef.current.unMute?.();

          ytPlayerRef.current.loadVideoById({
            videoId,
            startSeconds: 0,
          });
          ytPlayerRef.current.playVideo?.();
        } catch (e) {
          console.warn('Error commanding YouTube player:', e);
        }
      } else {
        pendingYtVideoIdRef.current = videoId;
      }
    },
    [currentTrack, isMuted, volume, updateMediaSession, setIsLoading, setError, ensureAudioContext]
  );

  // Initialize YouTube IFrame API for client-side fallback (works on mobile & Vercel without PC)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const setupYtPlayer = () => {
      if (!window.YT || !window.YT.Player) return;
      if (ytPlayerRef.current) return;

      try {
        ytPlayerRef.current = new window.YT.Player('imusic-yt-player', {
          height: '200',
          width: '200',
          playerVars: {
            autoplay: 1,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            playsinline: 1,
            rel: 0,
            origin: window.location.origin,
          },
          events: {
            onReady: () => {
              isYtReadyRef.current = true;
              if (pendingYtVideoIdRef.current) {
                const idToPlay = pendingYtVideoIdRef.current;
                pendingYtVideoIdRef.current = null;
                playViaYouTubePlayer(idToPlay);
              }
            },
            onStateChange: (event: any) => {
              // 1: PLAYING, 2: PAUSED, 0: ENDED, 3: BUFFERING
              if (event.data === 1) {
                isManualPauseRef.current = false;
                setIsPlaying(true);
                setIsLoading(false);
                setNetworkInterrupted(false);
                if ('mediaSession' in navigator) {
                  navigator.mediaSession.playbackState = 'playing';
                }
              } else if (event.data === 2) {
                const shouldBePlaying = usePlayerStore.getState().isPlaying && !isManualPauseRef.current;
                if (shouldBePlaying && isYtModeRef.current && document.visibilityState === 'hidden') {
                  // If browser backgrounding caused YouTube iframe to pause, auto-resume
                  setTimeout(() => {
                    if (usePlayerStore.getState().isPlaying && !isManualPauseRef.current && isYtModeRef.current) {
                      try {
                        ytPlayerRef.current?.playVideo?.();
                      } catch {}
                    }
                  }, 120);
                } else {
                  if (audioRef.current && !audioRef.current.paused) {
                    try {
                      audioRef.current.pause();
                    } catch {}
                  }
                  if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'paused';
                  }
                }
              } else if (event.data === 0) {
                nextTrack();
              } else if (event.data === 3) {
                setIsLoading(true);
              }
            },
            onError: (event: any) => {
              console.warn('YouTube fallback player error:', event.data);
              setIsLoading(false);
              setError('Playback unavailable for this track');
              setTimeout(() => nextTrack(), 1500);
            },
          },
        });
      } catch (err) {
        console.warn('Error creating YouTube player:', err);
      }
    };

    if (window.YT && window.YT.Player) {
      setupYtPlayer();
    } else {
      if (!document.getElementById('yt-iframe-api-script')) {
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        tag.id = 'yt-iframe-api-script';
        document.head.appendChild(tag);
      }
      const prevCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (typeof prevCallback === 'function') prevCallback();
        setupYtPlayer();
      };
    }
  }, [setIsPlaying, setIsLoading, setNetworkInterrupted, setError, nextTrack, playViaYouTubePlayer]);

  // Prevent background pause on app switch or screen lock
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBackgroundEvent = (e: Event) => {
      if (isYtModeRef.current && usePlayerStore.getState().isPlaying && !isManualPauseRef.current) {
        try {
          e.stopImmediatePropagation();
        } catch {}
        setTimeout(() => {
          if (isYtModeRef.current && usePlayerStore.getState().isPlaying && !isManualPauseRef.current) {
            try {
              ytPlayerRef.current?.playVideo?.();
            } catch {}
          }
        }, 150);
      }
    };

    window.addEventListener('blur', handleBackgroundEvent, true);
    window.addEventListener('pagehide', handleBackgroundEvent, true);
    document.addEventListener('visibilitychange', handleBackgroundEvent, true);
    document.addEventListener('webkitvisibilitychange', handleBackgroundEvent, true);

    return () => {
      window.removeEventListener('blur', handleBackgroundEvent, true);
      window.removeEventListener('pagehide', handleBackgroundEvent, true);
      document.removeEventListener('visibilitychange', handleBackgroundEvent, true);
      document.removeEventListener('webkitvisibilitychange', handleBackgroundEvent, true);
    };
  }, []);

  // Polling interval to synchronize YouTube playback progress with the UI & MediaSession
  useEffect(() => {
    const interval = setInterval(() => {
      if (
        isYtModeRef.current &&
        ytPlayerRef.current &&
        typeof ytPlayerRef.current.getCurrentTime === 'function'
      ) {
        try {
          const cur = ytPlayerRef.current.getCurrentTime() || 0;
          const dur = ytPlayerRef.current.getDuration() || currentTrack?.duration || 0;
          if (dur > 0) {
            updatePlaybackProgress(cur, dur);
            if (
              'mediaSession' in navigator &&
              'setPositionState' in navigator.mediaSession
            ) {
              navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: 1,
                position: Math.min(cur, dur),
              });
            }
          }
        } catch {}
      }
    }, 500);

    return () => clearInterval(interval);
  }, [currentTrack, updatePlaybackProgress]);

  // Helper to resolve playable URL for standard audio
  const resolveTrackUrl = useCallback(
    async (track: typeof currentTrack, forceRefresh = false): Promise<string | null> => {
      if (!track) return null;

      // 1. YouTube direct stream URL or YouTube ID
      if (track.streamUrl && track.streamUrl.startsWith('/api/stream/yt')) {
        return track.streamUrl;
      }
      if (track.streamUrl && track.streamUrl.startsWith('youtube:')) {
        return `/api/stream/yt?v=${track.streamUrl.replace('youtube:', '')}`;
      }
      if (track.id && track.id.startsWith('yt-')) {
        return `/api/stream/yt?v=${track.id.replace('yt-', '')}`;
      }

      // 2. Direct standard audio URL (JioSaavn CDN, Audius, CC, etc.)
      if (track.streamUrl && !forceRefresh && !track.streamUrl.startsWith('youtube:')) {
        return track.streamUrl;
      }

      // 3. Audio asset
      if (!forceRefresh) {
        const primaryAsset = track.assets?.[0];
        if (primaryAsset) {
          if (primaryAsset.storageKey?.startsWith('/api/stream/yt')) {
            return primaryAsset.storageKey;
          }
          if (primaryAsset.storageKey?.startsWith('youtube:')) {
            return `/api/stream/yt?v=${primaryAsset.storageKey.replace('youtube:', '')}`;
          }
          if (primaryAsset.storageType === 'remote_stream') {
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
            trackId: track.id || '',
            title: track.title || '',
            artist: track.artists?.[0]?.name || '',
            album: track.album?.title || '',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.youtubeId) {
            return data.streamUrl || `/api/stream/yt?v=${data.youtubeId}`;
          }
          if (data.streamUrl) {
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

  // Update Media Session position state for standard audio
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

    const ytId = extractYouTubeId(currentTrack);
    const isVercel = isVercelEnvironment();

    // On Vercel / cloud hosts, YouTube tracks play synchronously via the client player engine
    // to preserve the mobile user-tap autoplay gesture and prevent browser autoplay blocking.
    if (ytId && (isVercel || directStreamFailedRef.current)) {
      console.log(`Streaming YouTube video ${ytId} via client player engine.`);
      playViaYouTubePlayer(ytId);
      return;
    }

    // If switching to a standard audio track (JioSaavn), ensure YouTube player is stopped
    if (!ytId && isYtModeRef.current) {
      isYtModeRef.current = false;
      try {
        ytPlayerRef.current?.stopVideo?.();
      } catch {}
      if (audio) {
        audio.loop = false;
      }
    }

    const startAudioPlayback = (streamUrl: string) => {
      if (!active || !audio) return;

      isManualPauseRef.current = false;
      isYtModeRef.current = false;
      audio.loop = false;
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

    // FAST PATH: Direct standard audio URL (JioSaavn CDN) or local YouTube stream on localhost
    if (currentTrack.streamUrl) {
      if (currentTrack.streamUrl.startsWith('youtube:')) {
        startAudioPlayback(`/api/stream/yt?v=${currentTrack.streamUrl.replace('youtube:', '')}`);
        return;
      }
      startAudioPlayback(currentTrack.streamUrl);
      return;
    }

    if (currentTrack.id?.startsWith('yt-')) {
      startAudioPlayback(`/api/stream/yt?v=${currentTrack.id.replace('yt-', '')}`);
      return;
    }

    // RESOLVE PATH: Resolve track to stream
    resolveTrackUrl(currentTrack).then((resolvedUrl) => {
      if (!active) return;
      if (!resolvedUrl) {
        if (ytId) {
          playViaYouTubePlayer(ytId);
          return;
        }
        setError('Audio stream unavailable for this track');
        setIsLoading(false);
        return;
      }

      const resYtId = extractYouTubeId({ streamUrl: resolvedUrl });
      if (resYtId && (isVercel || directStreamFailedRef.current)) {
        console.log(`Resolved stream is YouTube (${resYtId}). Playing via client player engine.`);
        playViaYouTubePlayer(resYtId);
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
    playViaYouTubePlayer,
    setError,
    setIsLoading,
    setIsPlaying,
    volume,
    isMuted,
  ]);

  // Handle play / pause toggle
  useEffect(() => {
    if (isYtModeRef.current) {
      if (!isPlaying) {
        isManualPauseRef.current = true;
        try {
          ytPlayerRef.current?.pauseVideo?.();
        } catch {}
        if (audioRef.current && !audioRef.current.paused) {
          try {
            audioRef.current.pause();
          } catch {}
        }
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      } else {
        isManualPauseRef.current = false;
        try {
          ytPlayerRef.current?.playVideo?.();
        } catch {}
        if (audioRef.current && audioRef.current.paused) {
          audioRef.current.play().catch(() => {});
        }
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing';
        }
      }
      return;
    }

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
    if (isYtModeRef.current && ytPlayerRef.current && typeof ytPlayerRef.current.getCurrentTime === 'function') {
      try {
        const cur = ytPlayerRef.current.getCurrentTime() || 0;
        if (Math.abs(cur - currentTime) > 1.5) {
          ytPlayerRef.current.seekTo?.(currentTime, true);
        }
      } catch {}
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;

    if (Math.abs(audio.currentTime - currentTime) > 1.0) {
      audio.currentTime = currentTime;
      updateMediaSessionPosition();
    }
  }, [currentTime, updateMediaSessionPosition]);

  // Handle volume / mute
  useEffect(() => {
    if (isYtModeRef.current && ytPlayerRef.current) {
      try {
        if (isMuted) {
          ytPlayerRef.current.mute?.();
        } else {
          ytPlayerRef.current.unMute?.();
          ytPlayerRef.current.setVolume?.(Math.round(volume * 100));
        }
      } catch {}
    }

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
      if (isYtModeRef.current) return;
      updatePlaybackProgress(audio.currentTime, audio.duration || 0);
    };

    const handleDurationChange = () => {
      if (isYtModeRef.current) return;
      if (!isNaN(audio.duration)) {
        updatePlaybackProgress(audio.currentTime, audio.duration);
        updateMediaSessionPosition();
      }
    };

    const handlePlaying = () => {
      if (isYtModeRef.current) return;
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
      if (isYtModeRef.current) return;
      if (!usePlayerStore.getState().isPlaying) {
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'paused';
        }
      }
    };

    const handleWaiting = () => {
      if (isYtModeRef.current) return;
      setIsLoading(true);
    };

    const handleCanPlay = () => {
      if (isYtModeRef.current) return;
      try {
        audio.volume = isMuted ? 0 : Math.max(0, Math.min(1, volume));
        audio.muted = isMuted;
      } catch {}
      setIsLoading(false);
      setNetworkInterrupted(false);
    };

    const handleEnded = () => {
      if (isYtModeRef.current) return;
      nextTrack();
    };

    const handleError = async () => {
      if (isYtModeRef.current) return;
      console.warn('Audio playback error encountered:', audio.error);
      setIsLoading(false);

      // If this track or current audio.src has a YouTube video ID, seamlessly switch to client YouTube player!
      const ytId = extractYouTubeId(currentTrack) || (audio.src ? extractYouTubeId({ streamUrl: audio.src }) : null);
      if (ytId) {
        console.log(`Direct audio stream failed for ${ytId}. Seamlessly switching to YouTube client engine.`);
        directStreamFailedRef.current = true;
        playViaYouTubePlayer(ytId);
        return;
      }

      if (retryCountRef.current === 0 && currentTrack) {
        retryCountRef.current += 1;
        console.log(`Attempting stream recovery for track: ${currentTrack.title}`);
        try {
          const freshUrl = await resolveTrackUrl(currentTrack, true);
          if (freshUrl) {
            const freshYt = extractYouTubeId({ streamUrl: freshUrl });
            if (freshYt && (isVercelEnvironment() || directStreamFailedRef.current)) {
              console.log(`Alternative stream recovered as YouTube (${freshYt}). Seamlessly switching to client player.`);
              directStreamFailedRef.current = true;
              playViaYouTubePlayer(freshYt);
              return;
            }
            if (audio) {
              console.log(`Recovered alternative stream URL: ${freshUrl.substring(0, 45)}...`);
              audio.src = freshUrl;
              audio.load();
              audio.play().catch(() => {});
              return;
            }
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
      if (state.isPlaying && audio.paused && audio.src && !isYtModeRef.current) {
        audio.play().catch(() => {});
      }
    };

    const handleOffline = () => {
      setNetworkInterrupted(true);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const state = usePlayerStore.getState();
        if (state.isPlaying && audioRef.current && audioRef.current.paused && audioRef.current.src && !isYtModeRef.current) {
          audioRef.current.play().catch(() => {});
        }
      }
    };

    const handlePopState = () => {
      const state = usePlayerStore.getState();
      if (state.isPlaying && audioRef.current && audioRef.current.paused && audioRef.current.src && !isYtModeRef.current) {
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
    playViaYouTubePlayer,
  ]);

  return (
    <>
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
      <div
        id="imusic-yt-persistent-container"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          width: '200px',
          height: '200px',
          opacity: 0.001,
          pointerEvents: 'none',
          zIndex: -1,
        }}
        aria-hidden="true"
      >
        <div id="imusic-yt-player" />
      </div>
    </>
  );
};
