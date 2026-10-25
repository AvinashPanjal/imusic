'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import Image from 'next/image';
import { usePlayerStore } from '@/store/playerStore';
import { AudioQualityBadge } from './AudioQualityBadge';
import { parseLrc, formatTime } from '@/lib/lyrics';
import {
  ChevronDown,
  ChevronLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  ListMusic,
  Mic2,
  Trash2,
  ArrowUp,
  ArrowDown,
  Music2,
  Volume2,
  VolumeX,
  Plus,
  X,
} from 'lucide-react';
import { extractAmbientColors, getFallbackPalette, type AmbientPalette } from '@/lib/colorExtractor';
import { LocalLibrary } from '@/lib/storage/localLibrary';
import { AddToPlaylistModal } from '@/components/music/AddToPlaylistModal';
import styles from './FullScreenPlayer.module.css';

export const FullScreenPlayer: React.FC = () => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    shuffle,
    repeatMode,
    queue,
    queueIndex,
    isFullScreenPlayerOpen,
    activeViewInPlayer,
    volume,
    isMuted,
    setVolume,
    toggleMute,
    togglePlay,
    nextTrack,
    previousTrack,
    seek,
    toggleShuffle,
    cycleRepeat,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    playTrack,
    closeFullScreenPlayer,
    setActiveViewInPlayer,
  } = usePlayerStore();

  const [mounted, setMounted] = useState(false);
  const [isFav, setIsFav] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekValue, setSeekValue] = useState(0);
  const [desktopTab, setDesktopTab] = useState<'lyrics' | 'queue'>('lyrics');
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [palette, setPalette] = useState<AmbientPalette>(() =>
    getFallbackPalette(currentTrack?.title || 'imusic')
  );

  const activeLyricRef = useRef<HTMLParagraphElement | null>(null);
  const desktopActiveLyricRef = useRef<HTMLParagraphElement | null>(null);
  const desktopLyricsContainerRef = useRef<HTMLDivElement | null>(null);

  // Close player when Escape key is pressed
  useEffect(() => {
    if (!isFullScreenPlayerOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeFullScreenPlayer();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullScreenPlayerOpen, closeFullScreenPlayer]);

  useEffect(() => {
    if (!currentTrack) return;
    let active = true;
    const artUrl = currentTrack.album?.coverImage || '/icons/default-artwork.png';
    const seed = `${currentTrack.title} ${currentTrack.artists?.[0]?.name || ''}`;

    extractAmbientColors(artUrl, seed).then((p) => {
      if (active) {
        setPalette(p);
      }
    });

    return () => {
      active = false;
    };
  }, [currentTrack?.id, currentTrack?.album?.coverImage, currentTrack?.title]);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Sync seek slider value
  useEffect(() => {
    if (!isSeeking) {
      setSeekValue(currentTime);
    }
  }, [currentTime, isSeeking]);

  // Sync favorite state
  useEffect(() => {
    if (currentTrack) {
      setIsFav(Boolean(currentTrack.isFavorite || LocalLibrary.isFavorite(currentTrack.id)));
    }
  }, [currentTrack]);

  // Parse synchronized lyrics
  const parsedLyrics = useMemo(() => {
    if (!currentTrack?.lyricsSynced) return [];
    return parseLrc(currentTrack.lyricsSynced);
  }, [currentTrack?.lyricsSynced]);

  // Determine active lyric index
  const currentLyricIndex = useMemo(() => {
    if (parsedLyrics.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (currentTime >= parsedLyrics[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [parsedLyrics, currentTime]);

  // Smooth scroll active lyric into view on mobile
  useEffect(() => {
    if (activeViewInPlayer === 'lyrics' && activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLyricIndex, activeViewInPlayer]);

  // Smooth scroll active lyric into view on desktop
  useEffect(() => {
    if (desktopTab === 'lyrics' && desktopActiveLyricRef.current) {
      desktopActiveLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentLyricIndex, desktopTab]);

  if (!mounted || !isFullScreenPlayerOpen || !currentTrack) {
    return null;
  }

  const handleFavoriteToggle = async () => {
    const nextState = !isFav;
    setIsFav(nextState);
    LocalLibrary.toggleFavorite(currentTrack);

    try {
      if (nextState) {
        fetch('/api/library/favorites', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId: currentTrack.id }),
        }).catch(() => {});
      } else {
        fetch(`/api/library/favorites/${currentTrack.id}`, {
          method: 'DELETE',
        }).catch(() => {});
      }
    } catch (err) {
      console.warn('Failed to update favorite on server', err);
    }
  };

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSeekValue(parseFloat(e.target.value));
  };

  const handleScrubberMouseDown = () => {
    setIsSeeking(true);
  };

  const handleScrubberMouseUp = () => {
    setIsSeeking(false);
    seek(seekValue);
  };

  const artworkUrl = currentTrack.album?.coverImage || '/icons/default-artwork.png';
  const artistNames = currentTrack.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
  const remainingTime = Math.max(0, (duration || 0) - (isSeeking ? seekValue : currentTime));
  const asset = currentTrack.assets?.[0];
  const specLabel = asset?.isHiRes
    ? `FLAC 24-BIT / ${asset.sampleRate ? `${asset.sampleRate / 1000}KHZ` : '96KHZ'}`
    : asset?.isLossless
    ? 'FLAC LOSSLESS • 16-BIT'
    : 'AAC 320KBPS • STUDIO STEREO';

  return (
    <>
      <div
        className={styles.overlay}
        role="dialog"
        aria-modal="true"
        aria-label="Now Playing Full Screen"
        style={{
          '--ambient-primary': palette.primary,
          '--ambient-secondary': palette.secondary,
          '--ambient-glow-1': palette.glow1,
          '--ambient-glow-2': palette.glow2,
          '--ambient-dark-bg': palette.darkBg,
        } as React.CSSProperties}
      >
        {/* Dynamic blurred ambient color grading */}
        <div
          className={styles.backdrop}
          style={{ backgroundImage: `url(${artworkUrl})` }}
        />
        <div className={styles.backdropMesh} />
        <div className={styles.backdropDim} />

        <div className={styles.container}>
          {/* =========================================================================
              MOBILE VIEW (< 1024px) - Untouched original experience
              ========================================================================= */}
          <div className={styles.mobileView}>
            {/* Top bar header */}
            <header className={styles.header}>
              <button
                type="button"
                className={styles.headerBtn}
                onClick={closeFullScreenPlayer}
                aria-label="Collapse player"
              >
                <ChevronDown size={28} />
              </button>

              <div className={styles.headerTitleContainer}>
                <span className={styles.headerSubtitle}>PLAYING FROM LIBRARY</span>
                <span className={styles.headerTitle}>
                  {currentTrack.album?.title || 'Single Track'}
                </span>
              </div>

              <div className={styles.viewTabs}>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeViewInPlayer === 'lyrics' ? styles.tabActive : ''}`}
                  onClick={() => setActiveViewInPlayer(activeViewInPlayer === 'lyrics' ? 'now-playing' : 'lyrics')}
                  aria-label="Toggle Lyrics"
                  title="Lyrics"
                >
                  <Mic2 size={18} />
                </button>
                <button
                  type="button"
                  className={`${styles.tabBtn} ${activeViewInPlayer === 'queue' ? styles.tabActive : ''}`}
                  onClick={() => setActiveViewInPlayer(activeViewInPlayer === 'queue' ? 'now-playing' : 'queue')}
                  aria-label="Toggle Queue"
                  title="Queue"
                >
                  <ListMusic size={20} />
                </button>
              </div>
            </header>

            {/* Dynamic View Body */}
            <div className={styles.body}>
              {activeViewInPlayer === 'now-playing' && (
                <div className={styles.nowPlayingView}>
                  {/* Large album artwork */}
                  <div className={styles.artworkContainer}>
                    <Image
                      src={artworkUrl}
                      alt={currentTrack.title}
                      width={340}
                      height={340}
                      priority
                      className={styles.mainArtwork}
                      unoptimized={artworkUrl.startsWith('http')}
                    />
                  </div>

                  {/* Title, Artist, Favorite, and Audio Quality Badge */}
                  <div className={styles.trackDetails}>
                    <div className={styles.trackInfoText}>
                      <h1 className={styles.trackTitle}>{currentTrack.title}</h1>
                      <p className={styles.trackArtist}>{artistNames}</p>
                    </div>
                    <div className={styles.trackActions}>
                      <button
                        type="button"
                        className={`${styles.favBtn} ${isFav ? styles.favActive : ''}`}
                        onClick={handleFavoriteToggle}
                        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Heart size={24} fill={isFav ? '#ef4444' : 'none'} color={isFav ? '#ef4444' : 'currentColor'} />
                      </button>
                    </div>
                  </div>

                  {/* Quality Pill */}
                  <div className={styles.qualityPillContainer}>
                    <AudioQualityBadge track={currentTrack} interactive={true} />
                  </div>

                  {/* Scrubber progress */}
                  <div className={styles.scrubberSection}>
                    <input
                      type="range"
                      min={0}
                      max={duration || 100}
                      step={0.1}
                      value={seekValue}
                      onChange={handleScrubberChange}
                      onMouseDown={handleScrubberMouseDown}
                      onTouchStart={handleScrubberMouseDown}
                      onMouseUp={handleScrubberMouseUp}
                      onTouchEnd={handleScrubberMouseUp}
                      className={styles.scrubber}
                      aria-label="Seek track position"
                    />
                    <div className={styles.timeRow}>
                      <span>{formatTime(isSeeking ? seekValue : currentTime)}</span>
                      <span>-{formatTime(remainingTime)}</span>
                    </div>
                  </div>

                  {/* Primary Transport Controls */}
                  <div className={styles.controlsRow}>
                    <button
                      type="button"
                      className={`${styles.subControlBtn} ${shuffle ? styles.activeAccent : ''}`}
                      onClick={toggleShuffle}
                      aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
                    >
                      <Shuffle size={20} />
                    </button>

                    <button
                      type="button"
                      className={styles.mainNavBtn}
                      onClick={previousTrack}
                      aria-label="Previous track"
                    >
                      <SkipBack size={28} />
                    </button>

                    <button
                      type="button"
                      className={styles.playPauseBtn}
                      onClick={togglePlay}
                      aria-label={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? (
                        <Pause size={32} />
                      ) : (
                        <Play size={32} className={styles.playOffset} />
                      )}
                    </button>

                    <button
                      type="button"
                      className={styles.mainNavBtn}
                      onClick={nextTrack}
                      aria-label="Next track"
                    >
                      <SkipForward size={28} />
                    </button>

                    <button
                      type="button"
                      className={`${styles.subControlBtn} ${repeatMode !== 'off' ? styles.activeAccent : ''}`}
                      onClick={cycleRepeat}
                      aria-label={`Repeat mode: ${repeatMode}`}
                    >
                      {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
                    </button>
                  </div>
                </div>
              )}

              {activeViewInPlayer === 'lyrics' && (
                <div className={styles.lyricsView}>
                  <div className={styles.lyricsHeader}>
                    <h2>Lyrics</h2>
                    <AudioQualityBadge track={currentTrack} interactive={false} />
                  </div>

                  {parsedLyrics.length > 0 ? (
                    <div className={styles.lyricsContainer}>
                      {parsedLyrics.map((line, idx) => (
                        <p
                          key={idx}
                          ref={idx === currentLyricIndex ? activeLyricRef : null}
                          className={`${styles.lyricLine} ${idx === currentLyricIndex ? styles.lyricActive : ''}`}
                          onClick={() => seek(line.time)}
                        >
                          {line.text || '♪'}
                        </p>
                      ))}
                    </div>
                  ) : currentTrack.lyricsPlain ? (
                    <div className={styles.plainLyricsContainer}>
                      <p className={styles.plainLyricsText}>{currentTrack.lyricsPlain}</p>
                    </div>
                  ) : (
                    <div className={styles.emptyLyrics}>
                      <Mic2 size={40} className={styles.emptyLyricsIcon} />
                      <h3>No synchronized lyrics available</h3>
                      <p>Lyrics are only displayed when provided by authorized sources or file tags.</p>
                    </div>
                  )}
                </div>
              )}

              {activeViewInPlayer === 'queue' && (
                <div className={styles.queueView}>
                  <div className={styles.queueHeader}>
                    <div>
                      <h2>Playing Next</h2>
                      <span className={styles.queueCount}>{queue.length} tracks in queue</span>
                    </div>
                    {queue.length > 1 && (
                      <button
                        type="button"
                        className={styles.clearQueueBtn}
                        onClick={clearQueue}
                      >
                        <Trash2 size={15} />
                        <span>Clear</span>
                      </button>
                    )}
                  </div>

                  <div className={styles.queueList}>
                    {queue.map((track, idx) => {
                      const isCurrent = idx === queueIndex;
                      return (
                        <div
                          key={`${track.id}-${idx}`}
                          className={`${styles.queueItem} ${isCurrent ? styles.queueItemActive : ''}`}
                          onClick={() => playTrack(track, queue, idx)}
                        >
                          <div className={styles.queueIndexNumber}>
                            {isCurrent ? <Music2 size={16} className={styles.activeSpeaker} /> : idx + 1}
                          </div>

                          <div className={styles.queueThumb}>
                            <Image
                              src={track.album?.coverImage || '/icons/default-artwork.png'}
                              alt={track.title}
                              width={40}
                              height={40}
                              unoptimized
                            />
                          </div>

                          <div className={styles.queueMeta}>
                            <span className={styles.queueTitle}>{track.title}</span>
                            <span className={styles.queueArtist}>
                              {track.artists?.map((a) => a.name).join(', ')}
                            </span>
                          </div>

                          <div className={styles.queueItemActions} onClick={(e) => e.stopPropagation()}>
                            {idx > 0 && (
                              <button
                                type="button"
                                className={styles.reorderBtn}
                                onClick={() => reorderQueue(idx, idx - 1)}
                                aria-label="Move track up"
                              >
                                <ArrowUp size={16} />
                              </button>
                            )}
                            {idx < queue.length - 1 && (
                              <button
                                type="button"
                                className={styles.reorderBtn}
                                onClick={() => reorderQueue(idx, idx + 1)}
                                aria-label="Move track down"
                              >
                                <ArrowDown size={16} />
                              </button>
                            )}
                            <button
                              type="button"
                              className={styles.removeQueueBtn}
                              onClick={() => removeFromQueue(idx)}
                              aria-label="Remove from queue"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* =========================================================================
              DESKTOP MASTER IMMERSIVE SPLIT-SCREEN REDESIGN (min-width: 1024px)
              ========================================================================= */}
          <div className={styles.desktopView}>
            {/* Desktop Top Bar */}
            <header className={styles.desktopHeader}>
              <button
                type="button"
                className={styles.desktopBackBtn}
                onClick={closeFullScreenPlayer}
                aria-label="Back to library"
              >
                <ChevronLeft size={18} />
                <span>Back to Library</span>
                <kbd className={styles.desktopKbd}>ESC</kbd>
              </button>

              <div className={styles.desktopHeaderCenter}>
                <span className={styles.desktopPlayingFrom}>PLAYING FROM LIBRARY</span>
                <span className={styles.desktopHeaderAlbum}>
                  {currentTrack.album?.title || 'Single Track'}
                </span>
              </div>

              <div className={styles.desktopHeaderRight}>
                <button
                  type="button"
                  className={`${styles.desktopTabPill} ${desktopTab === 'lyrics' ? styles.desktopTabPillActive : ''}`}
                  onClick={() => setDesktopTab('lyrics')}
                  aria-label="Show Lyrics"
                >
                  <Mic2 size={15} />
                  <span>Lyrics</span>
                </button>

                <button
                  type="button"
                  className={`${styles.desktopTabPill} ${desktopTab === 'queue' ? styles.desktopTabPillActive : ''}`}
                  onClick={() => setDesktopTab('queue')}
                  aria-label="Show Up Next Queue"
                >
                  <ListMusic size={16} />
                  <span>Up Next ({queue.length})</span>
                </button>

                <button
                  type="button"
                  className={styles.desktopCloseIconBtn}
                  onClick={closeFullScreenPlayer}
                  aria-label="Close full screen player"
                  title="Close (Esc)"
                >
                  <X size={18} />
                </button>
              </div>
            </header>

            {/* Desktop Split Content Grid */}
            <div className={styles.desktopSplitContent}>
              {/* Left Column: Artwork, Title/Artist, Audio Specs, Scrubber, Transport, Volume */}
              <div className={styles.desktopLeftCol}>
                <div className={styles.desktopArtworkWrapper}>
                  <Image
                    src={artworkUrl}
                    alt={currentTrack.title}
                    fill
                    sizes="380px"
                    priority
                    className={styles.desktopArtwork}
                    unoptimized={artworkUrl.startsWith('http')}
                  />
                </div>

                <div className={styles.desktopTrackInfo}>
                  <div className={styles.desktopTitleRow}>
                    <div className={styles.desktopTitleText}>
                      <h1 className={styles.desktopTrackTitle} title={currentTrack.title}>
                        {currentTrack.title}
                      </h1>
                      <p className={styles.desktopTrackArtist} title={artistNames}>
                        {artistNames}
                      </p>
                    </div>
                    <div className={styles.desktopTrackButtons}>
                      <button
                        type="button"
                        className={styles.desktopFavBtn}
                        onClick={handleFavoriteToggle}
                        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
                        aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Heart
                          size={20}
                          fill={isFav ? '#ef4444' : 'none'}
                          color={isFav ? '#ef4444' : 'currentColor'}
                        />
                      </button>
                      <button
                        type="button"
                        className={styles.desktopPlaylistBtn}
                        onClick={() => setShowPlaylistModal(true)}
                        title="Add to playlist"
                        aria-label="Add to playlist"
                      >
                        <Plus size={20} />
                      </button>
                    </div>
                  </div>

                  <div className={styles.desktopBadgeRow}>
                    <AudioQualityBadge track={currentTrack} interactive={true} />
                    <span className={styles.desktopSpecTag}>
                      {specLabel}
                    </span>
                  </div>
                </div>

                {/* Precision Scrubber */}
                <div className={styles.desktopScrubberArea}>
                  <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    step={0.1}
                    value={seekValue}
                    onChange={handleScrubberChange}
                    onMouseDown={handleScrubberMouseDown}
                    onMouseUp={handleScrubberMouseUp}
                    className={`${styles.scrubber} ${styles.desktopScrubber}`}
                    aria-label="Seek track position"
                  />
                  <div className={styles.desktopTimeRow}>
                    <span>{formatTime(isSeeking ? seekValue : currentTime)}</span>
                    <span>-{formatTime(remainingTime)}</span>
                  </div>
                </div>

                {/* Primary Transport Controls */}
                <div className={styles.desktopControlsArea}>
                  <button
                    type="button"
                    className={`${styles.desktopControlBtn} ${shuffle ? styles.activeAccent : ''}`}
                    onClick={toggleShuffle}
                    title={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
                    aria-label={shuffle ? 'Disable shuffle' : 'Enable shuffle'}
                  >
                    <Shuffle size={20} />
                  </button>

                  <button
                    type="button"
                    className={styles.desktopNavBtn}
                    onClick={previousTrack}
                    title="Previous (J)"
                    aria-label="Previous track"
                  >
                    <SkipBack size={26} />
                  </button>

                  <button
                    type="button"
                    className={styles.desktopHeroPlayBtn}
                    onClick={togglePlay}
                    title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                    aria-label={isPlaying ? 'Pause' : 'Play'}
                  >
                    {isPlaying ? (
                      <Pause size={30} />
                    ) : (
                      <Play size={30} className={styles.playOffset} />
                    )}
                  </button>

                  <button
                    type="button"
                    className={styles.desktopNavBtn}
                    onClick={nextTrack}
                    title="Next (L)"
                    aria-label="Next track"
                  >
                    <SkipForward size={26} />
                  </button>

                  <button
                    type="button"
                    className={`${styles.desktopControlBtn} ${repeatMode !== 'off' ? styles.activeAccent : ''}`}
                    onClick={cycleRepeat}
                    title={`Repeat: ${repeatMode}`}
                    aria-label={`Repeat mode: ${repeatMode}`}
                  >
                    {repeatMode === 'one' ? <Repeat1 size={20} /> : <Repeat size={20} />}
                  </button>
                </div>

                {/* Desktop Volume Bar */}
                <div className={styles.desktopVolumeRow}>
                  <button
                    type="button"
                    className={styles.desktopVolBtn}
                    onClick={toggleMute}
                    title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
                    aria-label={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={(e) => setVolume(parseFloat(e.target.value))}
                    className={`${styles.scrubber} ${styles.desktopVolSlider}`}
                    aria-label="Volume slider"
                  />
                  <span className={styles.desktopVolPct}>
                    {Math.round((isMuted ? 0 : volume) * 100)}%
                  </span>
                </div>
              </div>

              {/* Right Column: Synced Karaoke Lyrics OR Queue */}
              <div className={styles.desktopRightCol}>
                {desktopTab === 'lyrics' ? (
                  parsedLyrics.length > 0 ? (
                    <div className={styles.desktopLyricsContainer} ref={desktopLyricsContainerRef}>
                      {parsedLyrics.map((line, idx) => (
                        <p
                          key={idx}
                          ref={idx === currentLyricIndex ? desktopActiveLyricRef : null}
                          className={`${styles.desktopLyricLine} ${
                            idx === currentLyricIndex ? styles.desktopLyricActive : ''
                          }`}
                          onClick={() => seek(line.time)}
                        >
                          {line.text || '♪'}
                        </p>
                      ))}
                    </div>
                  ) : currentTrack.lyricsPlain ? (
                    <div className={styles.desktopLyricsContainer}>
                      <div className={styles.desktopPlainLyrics}>{currentTrack.lyricsPlain}</div>
                    </div>
                  ) : (
                    <div className={styles.desktopEmptyState}>
                      <Mic2 size={48} className={styles.desktopEmptyIcon} />
                      <h3 style={{ fontSize: 18, fontWeight: 700 }}>No Lyrics Found</h3>
                      <p style={{ maxWidth: 360, fontSize: 13, color: 'var(--text-tertiary)' }}>
                        We couldn&apos;t retrieve synchronized lyrics for this song. You can switch to the queue to see what&apos;s playing next.
                      </p>
                      <button
                        type="button"
                        className={styles.desktopSwitchQueueBtn}
                        onClick={() => setDesktopTab('queue')}
                      >
                        View Up Next Queue ({queue.length})
                      </button>
                    </div>
                  )
                ) : (
                  /* Desktop Queue List */
                  <div className={styles.desktopQueueContainer}>
                    <div className={styles.desktopQueueHeaderRow}>
                      <h3>Up Next ({queue.length} songs)</h3>
                      {queue.length > 1 && (
                        <button
                          type="button"
                          className={styles.desktopClearQueueBtn}
                          onClick={clearQueue}
                        >
                          <Trash2 size={14} />
                          <span>Clear queue</span>
                        </button>
                      )}
                    </div>

                    <div className={styles.desktopQueueList}>
                      {queue.map((track, idx) => {
                        const isCurrent = idx === queueIndex;
                        return (
                          <div
                            key={`${track.id}-${idx}`}
                            className={`${styles.desktopQueueItem} ${isCurrent ? styles.desktopQueueItemActive : ''}`}
                            onClick={() => playTrack(track, queue, idx)}
                          >
                            <span className={styles.desktopQueueIndex}>
                              {isCurrent ? <Music2 size={16} className={styles.activeSpeaker} /> : idx + 1}
                            </span>

                            <Image
                              src={track.album?.coverImage || '/icons/default-artwork.png'}
                              alt={track.title}
                              width={44}
                              height={44}
                              className={styles.desktopQueueThumb}
                              unoptimized
                            />

                            <div className={styles.desktopQueueMeta}>
                              <span className={styles.desktopQueueTitle}>{track.title}</span>
                              <span className={styles.desktopQueueArtist}>
                                {track.artists?.map((a) => a.name).join(', ')}
                              </span>
                            </div>

                            <button
                              type="button"
                              className={styles.desktopQueueRemoveBtn}
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromQueue(idx);
                              }}
                              title="Remove from queue"
                              aria-label="Remove from queue"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Playlist modal */}
      <AddToPlaylistModal
        track={currentTrack}
        isOpen={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
      />
    </>
  );
};
