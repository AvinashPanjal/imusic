'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { usePlayerStore } from '@/store/playerStore';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: any;
  }
}

export const AudioEngine: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ytPlayerRef = useRef<any>(null);
  const isYtReadyRef = useRef<boolean>(false);
  const pendingYtVideoIdRef = useRef<string | null>(null);
  const ytProgressIntervalRef = useRef<any>(null);

  const retryCountRef = useRef<number>(0);
  const lastTrackIdRef = useRef<string | null>(null);
  const activeEngineRef = useRef<'audio' | 'yt' | null>(null);

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
    isFullScreenPlayerOpen,
  } = usePlayerStore();

  const isYouTubeTrack = useCallback((track: typeof currentTrack): boolean => {
    if (!track) return false;
    return Boolean(
      track.id?.startsWith('yt-') ||
      track.providerCode === 'youtube' ||
      track.streamUrl?.startsWith('youtube:') ||
      track.assets?.[0]?.storageKey?.startsWith('youtube:') ||
      (track.externalUrl && /(?:youtu\.be\/|youtube\.com)/.test(track.externalUrl))
    );
  }, []);

  const getYouTubeVideoId = useCallback((track: typeof currentTrack): string | null => {
    if (!track) return null;
    if (track.streamUrl?.startsWith('youtube:')) {
      return track.streamUrl.replace('youtube:', '');
    }
    const assetKey = track.assets?.[0]?.storageKey;
    if (assetKey?.startsWith('youtube:')) {
      return assetKey.replace('youtube:', '');
    }
    if (track.id?.startsWith('yt-')) {
      return track.id.replace('yt-', '');
    }
    if (track.externalUrl) {
      const match = track.externalUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/);
      if (match) return match[1];
    }
    return null;
  }, []);

  // Helper to resolve playable URL for standard audio
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

      // Try resolving through the playback resolve endpoint
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
          return data.streamUrl || null;
        }
      } catch (err) {
        console.error('Error resolving stream URL:', err);
      }
      return null;
    },
    []
  );

  // Update Media Session API for iOS Lock Screen & Dynamic Island
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
      const isYt = isYouTubeTrack(currentTrack);
      const cur = isYt && ytPlayerRef.current?.getCurrentTime ? ytPlayerRef.current.getCurrentTime() : audioRef.current?.currentTime;
      const dur = isYt && ytPlayerRef.current?.getDuration ? ytPlayerRef.current.getDuration() : audioRef.current?.duration;

      if (!isNaN(dur) && dur > 0 && !isNaN(cur)) {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: 1,
          position: Math.min(cur, dur),
        });
      }
    } catch {}
  }, [currentTrack, isYouTubeTrack]);

  // Helper to ensure persistent container for YouTube exists and is configured
  const ensureYtContainer = useCallback(() => {
    if (typeof window === 'undefined') return null;
    let container = document.getElementById('imusic-yt-persistent-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'imusic-yt-persistent-container';
      container.style.position = 'fixed';
      container.style.bottom = '84px';
      container.style.right = '16px';
      container.style.width = '280px';
      container.style.height = '158px';
      container.style.zIndex = '95';
      container.style.borderRadius = '12px';
      container.style.overflow = 'hidden';
      container.style.boxShadow = '0 12px 32px rgba(0,0,0,0.65), 0 0 0 1px rgba(255,255,255,0.12)';
      container.style.background = '#0a0a0f';
      container.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
      container.style.display = 'none';

      // Header bar with label and minimize button
      const header = document.createElement('div');
      header.id = 'imusic-yt-header';
      header.style.position = 'absolute';
      header.style.top = '0';
      header.style.left = '0';
      header.style.right = '0';
      header.style.height = '26px';
      header.style.background = 'linear-gradient(to bottom, rgba(0,0,0,0.85), transparent)';
      header.style.display = 'flex';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.padding = '0 8px';
      header.style.zIndex = '10';
      header.style.pointerEvents = 'auto';

      const titleBadge = document.createElement('span');
      titleBadge.textContent = '▶ YouTube Video';
      titleBadge.style.fontSize = '11px';
      titleBadge.style.fontWeight = '600';
      titleBadge.style.color = '#fff';
      titleBadge.style.letterSpacing = '0.4px';

      const minBtn = document.createElement('button');
      minBtn.textContent = '–';
      minBtn.style.background = 'none';
      minBtn.style.border = 'none';
      minBtn.style.color = '#fff';
      minBtn.style.fontSize = '16px';
      minBtn.style.cursor = 'pointer';
      minBtn.style.padding = '0 4px';
      minBtn.title = 'Minimize/Expand video';

      let isMinimized = false;
      minBtn.onclick = (e) => {
        e.stopPropagation();
        isMinimized = !isMinimized;
        if (isMinimized) {
          container!.style.height = '28px';
          container!.style.width = '140px';
          minBtn.textContent = '+';
        } else {
          container!.style.height = '158px';
          container!.style.width = '280px';
          minBtn.textContent = '–';
        }
      };

      header.appendChild(titleBadge);
      header.appendChild(minBtn);
      container.appendChild(header);

      const placeholder = document.createElement('div');
      placeholder.id = 'imusic-yt-iframe';
      placeholder.style.width = '100%';
      placeholder.style.height = '100%';
      container.appendChild(placeholder);
      document.body.appendChild(container);
    }
    return container;
  }, []);

  // Helper to initialize or load a video into the YouTube player
  const createOrPlayYouTube = useCallback(
    (videoId: string) => {
      if (typeof window === 'undefined' || !videoId) return;

      const container = ensureYtContainer();
      if (container) {
        container.style.display = 'block';
      }

      // Check if YouTube Player instance already exists
      if (ytPlayerRef.current) {
        if (isYtReadyRef.current && ytPlayerRef.current.loadVideoById) {
          try {
            ytPlayerRef.current.loadVideoById({
              videoId,
              startSeconds: 0,
            });
            const state = usePlayerStore.getState();
            const targetVol = state.isMuted ? 0 : Math.round(state.volume * 100);
            ytPlayerRef.current.setVolume(targetVol);
            ytPlayerRef.current.playVideo();
          } catch (playErr) {
            console.warn('Error loading video on existing player:', playErr);
          }
        } else {
          pendingYtVideoIdRef.current = videoId;
        }
        return;
      }

      // If window.YT.Player is ready, create player with this video ID directly
      if (window.YT && window.YT.Player) {
        try {
          ytPlayerRef.current = new window.YT.Player('imusic-yt-iframe', {
            height: '100%',
            width: '100%',
            videoId,
            playerVars: {
              autoplay: 1,
              controls: 1,
              playsinline: 1,
              enablejsapi: 1,
              origin: typeof window !== 'undefined' ? window.location.origin : '',
              widget_referrer: typeof window !== 'undefined' ? window.location.origin : '',
              rel: 0,
              modestbranding: 1,
              iv_load_policy: 3,
              fs: 1,
            },
            events: {
              onReady: (event: any) => {
                isYtReadyRef.current = true;
                const vidToPlay = pendingYtVideoIdRef.current || videoId;
                pendingYtVideoIdRef.current = null;
                try {
                  if (vidToPlay && event.target.loadVideoById) {
                    event.target.loadVideoById({ videoId: vidToPlay, startSeconds: 0 });
                  }
                  const state = usePlayerStore.getState();
                  const targetVol = state.isMuted ? 0 : Math.round(state.volume * 100);
                  event.target.setVolume(targetVol);
                  event.target.playVideo();
                } catch (readyErr) {
                  console.warn('Error in YT onReady play:', readyErr);
                }
              },
              onStateChange: (event: any) => {
                // 1: PLAYING, 2: PAUSED, 0: ENDED, 3: BUFFERING
                if (event.data === 1) {
                  setIsPlaying(true);
                  setIsLoading(false);
                  setNetworkInterrupted(false);
                  if ('mediaSession' in navigator) {
                    navigator.mediaSession.playbackState = 'playing';
                  }
                } else if (event.data === 2) {
                  if (!usePlayerStore.getState().isPlaying) {
                    if ('mediaSession' in navigator) {
                      navigator.mediaSession.playbackState = 'paused';
                    }
                  }
                } else if (event.data === 3) {
                  setIsLoading(true);
                } else if (event.data === 0) {
                  nextTrack();
                }
              },
              onError: async (err: any) => {
                console.warn('YouTube playback error event:', err);
                setIsLoading(false);

                const curr = usePlayerStore.getState().currentTrack;
                if (curr && retryCountRef.current === 0) {
                  retryCountRef.current += 1;
                  console.log(`YouTube playback error encountered, attempting recovery for: ${curr.title}`);
                  try {
                    const resolved = await resolveTrackUrl(curr, true);
                    // ONLY use HTML5 audio if resolved is a real HTTP/HTTPS stream! NEVER assign youtube: to audio.src!
                    if (resolved && !resolved.startsWith('youtube:') && audioRef.current) {
                      console.log('Successfully recovered YouTube track via alternative audio stream!');
                      if (container) container.style.display = 'none';
                      activeEngineRef.current = 'audio';
                      audioRef.current.src = resolved;
                      audioRef.current.load();
                      audioRef.current.play().catch(() => {});
                      return;
                    }
                  } catch (recErr) {
                    console.warn('Recovery attempt failed:', recErr);
                  }
                }

                // If playback error 101/150 (copyright owner disallows third-party embedding):
                setError('This video cannot be played on third-party sites due to YouTube copyright restrictions.');
              },
            },
          });
        } catch (e) {
          console.warn('Could not initialize YouTube player:', e);
        }
      } else {
        // Queue video until YT Iframe API script loads
        pendingYtVideoIdRef.current = videoId;
        if (!document.getElementById('yt-iframe-api-script')) {
          const tag = document.createElement('script');
          tag.id = 'yt-iframe-api-script';
          tag.src = 'https://www.youtube.com/iframe_api';
          const first = document.getElementsByTagName('script')[0];
          first?.parentNode?.insertBefore(tag, first);
        }
      }
    },
    [ensureYtContainer, isMuted, nextTrack, resolveTrackUrl, setError, setIsLoading, setIsPlaying, setNetworkInterrupted, volume]
  );

  // Initialize YouTube IFrame Player Script and ready callback
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const prevCallback = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (prevCallback) prevCallback();
      if (pendingYtVideoIdRef.current) {
        createOrPlayYouTube(pendingYtVideoIdRef.current);
      }
    };

    if (!document.getElementById('yt-iframe-api-script')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api-script';
      tag.src = 'https://www.youtube.com/iframe_api';
      const first = document.getElementsByTagName('script')[0];
      first?.parentNode?.insertBefore(tag, first);
    }

    return () => {
      if (ytProgressIntervalRef.current) clearInterval(ytProgressIntervalRef.current);
    };
  }, [createOrPlayYouTube]);

  // Adjust YouTube player container based on FullScreenPlayer state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const container = document.getElementById('imusic-yt-persistent-container');
    if (!container) return;

    if (activeEngineRef.current !== 'yt') {
      container.style.display = 'none';
      return;
    }

    container.style.display = 'block';

    if (isFullScreenPlayerOpen) {
      // Center in FullScreenPlayer
      container.style.top = '90px';
      container.style.bottom = 'auto';
      container.style.left = '50%';
      container.style.right = 'auto';
      container.style.transform = 'translateX(-50%)';
      container.style.width = 'min(92vw, 420px)';
      container.style.height = 'min(52vw, 236px)';
      container.style.zIndex = '1001';
    } else {
      // Dock in bottom-right corner above player bar
      container.style.top = 'auto';
      container.style.bottom = '84px';
      container.style.left = 'auto';
      container.style.right = '16px';
      container.style.transform = 'none';
      container.style.width = '280px';
      container.style.height = '158px';
      container.style.zIndex = '95';
    }
  }, [isFullScreenPlayerOpen]);

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

    // Helper to start YouTube playback
    const startYouTubePlayback = (vid: string) => {
      if (!active) return;
      activeEngineRef.current = 'yt';
      if (audio) {
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
      }

      updateMediaSession(currentTrack);
      createOrPlayYouTube(vid);

      if (ytProgressIntervalRef.current) clearInterval(ytProgressIntervalRef.current);
      ytProgressIntervalRef.current = setInterval(() => {
        if (ytPlayerRef.current?.getCurrentTime) {
          try {
            const cur = ytPlayerRef.current.getCurrentTime() || 0;
            const dur = ytPlayerRef.current.getDuration() || currentTrack.duration || 180;
            updatePlaybackProgress(cur, dur);
            updateMediaSessionPosition();
          } catch {}
        }
      }, 350);
    };

    // Helper to start standard HTML5 audio playback (320 KBPS AAC)
    const startAudioPlayback = (streamUrl: string) => {
      if (!active || !audio) return;
      activeEngineRef.current = 'audio';

      // Hide YouTube container when audio is active
      const container = document.getElementById('imusic-yt-persistent-container');
      if (container) {
        container.style.display = 'none';
      }

      if (ytProgressIntervalRef.current) clearInterval(ytProgressIntervalRef.current);
      if (isYtReadyRef.current && ytPlayerRef.current?.pauseVideo) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }

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

    // RESOLVE PATH: Resolve track to studio AAC stream or YouTube stream
    resolveTrackUrl(currentTrack).then((resolvedUrl) => {
      if (!active) return;
      if (!resolvedUrl) {
        const vid = getYouTubeVideoId(currentTrack);
        if (vid) {
          startYouTubePlayback(vid);
        } else {
          setError('Playback source not found or unavailable for this track');
          setIsLoading(false);
        }
        return;
      }

      if (resolvedUrl.startsWith('youtube:')) {
        const vid = resolvedUrl.replace('youtube:', '');
        startYouTubePlayback(vid);
      } else {
        startAudioPlayback(resolvedUrl);
      }
    });

    return () => {
      active = false;
    };
  }, [
    currentTrack,
    isPlaying,
    isYouTubeTrack,
    getYouTubeVideoId,
    resolveTrackUrl,
    createOrPlayYouTube,
    updateMediaSession,
    updatePlaybackProgress,
    updateMediaSessionPosition,
    setError,
    setIsLoading,
    setIsPlaying,
    volume,
    isMuted,
  ]);

  // Handle play / pause toggle
  useEffect(() => {
    if (!isPlaying) {
      // Unconditionally pause BOTH engines to guarantee playback stops immediately
      if (audioRef.current && !audioRef.current.paused) {
        try {
          audioRef.current.pause();
        } catch {}
      }
      if (ytPlayerRef.current?.pauseVideo) {
        try {
          ytPlayerRef.current.pauseVideo();
        } catch {}
      }
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'paused';
      }
      return;
    }

    // isPlaying is true: resume whichever engine is active
    if (activeEngineRef.current === 'yt') {
      if (isYtReadyRef.current && ytPlayerRef.current?.playVideo) {
        try {
          ytPlayerRef.current.playVideo();
          if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing';
        } catch {}
      }
    } else {
      const audio = audioRef.current;
      if (audio && audio.src && audio.paused) {
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
    }
  }, [isPlaying, setIsPlaying]);

  // Handle seek synchronization
  useEffect(() => {
    if (activeEngineRef.current === 'yt') {
      if (isYtReadyRef.current && ytPlayerRef.current?.seekTo) {
        try {
          const cur = ytPlayerRef.current.getCurrentTime() || 0;
          if (Math.abs(cur - currentTime) > 1.5) {
            ytPlayerRef.current.seekTo(currentTime, true);
          }
        } catch {}
      }
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
    if (activeEngineRef.current === 'yt') {
      if (isYtReadyRef.current && ytPlayerRef.current?.setVolume) {
        try {
          const targetVol = isMuted ? 0 : Math.round(volume * 100);
          ytPlayerRef.current.setVolume(targetVol);
        } catch {}
      }
      return;
    }

    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.volume = isMuted ? 0 : volume;
      audio.muted = isMuted;
    } catch {}
  }, [volume, isMuted]);

  // Setup standard audio event listeners
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
      // CRITICAL: Ignore HTML5 audio error events if currently playing a YouTube track!
      if (activeEngineRef.current === 'yt') {
        return;
      }

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
        if (state.isPlaying) {
          if (activeEngineRef.current === 'yt' && ytPlayerRef.current?.playVideo) {
            try {
              ytPlayerRef.current.playVideo();
            } catch {}
          } else if (audioRef.current && audioRef.current.paused && audioRef.current.src) {
            audioRef.current.play().catch(() => {});
          }
        }
      }
    };

    const handlePopState = () => {
      // Keep playing uninterrupted when user navigates back / forward in browser history
      const state = usePlayerStore.getState();
      if (state.isPlaying) {
        if (activeEngineRef.current === 'yt' && ytPlayerRef.current?.playVideo) {
          try {
            ytPlayerRef.current.playVideo();
          } catch {}
        } else if (audioRef.current && audioRef.current.paused && audioRef.current.src) {
          audioRef.current.play().catch(() => {});
        }
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
    isYouTubeTrack,
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
