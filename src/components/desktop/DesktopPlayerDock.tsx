'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { usePlayerStore } from '@/store/playerStore';
import { formatTime } from '@/lib/lyrics';
import { extractAmbientColors } from '@/lib/colorExtractor';
import { LocalLibrary } from '@/lib/storage/localLibrary';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Volume2,
  Volume1,
  VolumeX,
  ListMusic,
  Maximize2,
  Sparkles,
  Plus,
} from 'lucide-react';
import { AddToPlaylistModal } from '@/components/music/AddToPlaylistModal';
import styles from './DesktopPlayerDock.module.css';

interface DesktopPlayerDockProps {
  onToggleQueue: () => void;
  isQueueOpen: boolean;
}

export const DesktopPlayerDock: React.FC<DesktopPlayerDockProps> = ({
  onToggleQueue,
  isQueueOpen,
}) => {
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
    previousTrack,
    seek,
    volume,
    setVolume,
    toggleMute,
    isMuted,
    shuffle,
    toggleShuffle,
    repeatMode,
    cycleRepeat,
    openFullScreenPlayer,
  } = usePlayerStore();

  const [mounted, setMounted] = useState(false);
  const [dockGlow, setDockGlow] = useState('rgba(124, 58, 237, 0.35)');
  const [isFav, setIsFav] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number>(0);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);

  const scrubberRef = useRef<HTMLDivElement | null>(null);
  const volumeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const artworkUrl = currentTrack?.album?.coverImage || '/icons/default-artwork.png';
  const artistNames = currentTrack?.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  useEffect(() => {
    if (!currentTrack) return;
    let active = true;
    extractAmbientColors(artworkUrl, currentTrack.title).then((p) => {
      if (active) setDockGlow(p.glow1);
    });
    setIsFav(Boolean(currentTrack.isFavorite || LocalLibrary.isFavorite(currentTrack.id)));
    return () => {
      active = false;
    };
  }, [artworkUrl, currentTrack]);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentTrack) return;
    LocalLibrary.toggleFavorite(currentTrack);
    setIsFav((prev) => !prev);
  };

  // Scrubber click/drag
  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || duration <= 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetTime = (clickX / rect.width) * duration;
    seek(targetTime);
  };

  const handleScrubberMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!scrubberRef.current || duration <= 0) return;
    const rect = scrubberRef.current.getBoundingClientRect();
    const mouseX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const time = (mouseX / rect.width) * duration;
    setHoverTime(time);
    setHoverX(mouseX);
  };

  const handleScrubberMouseLeave = () => {
    setHoverTime(null);
  };

  // Volume slider click/drag
  const handleVolumeClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!volumeRef.current) return;
    const rect = volumeRef.current.getBoundingClientRect();
    const clickX = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const targetVol = clickX / rect.width;
    setVolume(targetVol);
  };

  if (!mounted || !currentTrack) {
    return null;
  }

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;
  const effectiveVolume = isMuted ? 0 : volume;
  const isHiRes = currentTrack.assets?.[0]?.isHiRes;
  const isLossless = currentTrack.assets?.[0]?.isLossless || currentTrack.assets?.[0]?.codec === 'FLAC';

  return (
    <>
      <footer
        className={styles.dock}
        style={{ '--dock-glow': dockGlow } as React.CSSProperties}
        aria-label="Desktop Studio Player Dock"
      >
        {/* 1. LEFT ZONE: Artwork, Title, Artist, Quality & Favorite */}
        <div className={styles.leftZone}>
          <div
            className={styles.artworkWrapper}
            onClick={() => openFullScreenPlayer()}
            title="Expand Fullscreen Player (F)"
          >
            <Image
              src={artworkUrl}
              alt={currentTrack.title}
              width={58}
              height={58}
              className={styles.artwork}
              unoptimized={artworkUrl.startsWith('http')}
            />
          </div>

          <div className={styles.trackDetails}>
            <div className={styles.titleRow}>
              <span
                className={styles.title}
                onClick={() => openFullScreenPlayer()}
                title={currentTrack.title}
              >
                {currentTrack.title}
              </span>
              {isHiRes ? (
                <span className={`${styles.badgeQuality} ${styles.badgeHiRes}`} title="24-bit Hi-Res">
                  Hi-Res
                </span>
              ) : isLossless ? (
                <span className={`${styles.badgeQuality} ${styles.badgeLossless}`} title="Lossless AAC">
                  Lossless
                </span>
              ) : null}
            </div>

            <div className={styles.artistRow}>
              <span className={styles.artist}>{artistNames}</span>
              {currentTrack.album?.title && <span>• {currentTrack.album.title}</span>}
            </div>
          </div>

          <div className={styles.quickActionBtns}>
            <button
              type="button"
              className={`${styles.iconBtn} ${isFav ? styles.iconBtnFavActive : ''}`}
              onClick={handleToggleFavorite}
              title={isFav ? 'Remove from Favorites' : 'Add to Favorites'}
              aria-label="Favorite"
            >
              <Heart size={16} fill={isFav ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setShowPlaylistModal(true)}
              title="Add to Playlist"
              aria-label="Add to Playlist"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* 2. CENTER ZONE: Transport controls & Waveform Scrubber */}
        <div className={styles.centerZone}>
          <div className={styles.transportRow}>
            {/* Shuffle */}
            <button
              type="button"
              className={`${styles.controlBtn} ${shuffle ? styles.controlBtnActive : ''}`}
              onClick={toggleShuffle}
              title={`Shuffle ${shuffle ? 'On' : 'Off'} (S)`}
              aria-label="Shuffle"
            >
              <Shuffle size={16} />
              {shuffle && <span className={styles.activeDot} />}
            </button>

            {/* Previous */}
            <button
              type="button"
              className={styles.controlBtn}
              onClick={previousTrack}
              title="Previous Track (Shift + P)"
              aria-label="Previous track"
            >
              <SkipBack size={18} />
            </button>

            {/* Hero Play/Pause */}
            <button
              type="button"
              className={styles.heroPlayBtn}
              onClick={togglePlay}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause size={22} fill="currentColor" /> : <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />}
            </button>

            {/* Next */}
            <button
              type="button"
              className={styles.controlBtn}
              onClick={nextTrack}
              title="Next Track (Shift + N)"
              aria-label="Next track"
            >
              <SkipForward size={18} />
            </button>

            {/* Repeat */}
            <button
              type="button"
              className={`${styles.controlBtn} ${repeatMode !== 'off' ? styles.controlBtnActive : ''}`}
              onClick={cycleRepeat}
              title={`Repeat: ${repeatMode.toUpperCase()} (R)`}
              aria-label="Repeat mode"
            >
              {repeatMode === 'one' ? <Repeat1 size={17} /> : <Repeat size={17} />}
              {repeatMode !== 'off' && <span className={styles.activeDot} />}
            </button>
          </div>

          {/* Precision Scrubber */}
          <div className={styles.scrubberRow}>
            <span className={styles.timestamp}>{formatTime(currentTime)}</span>
            <div
              ref={scrubberRef}
              className={styles.scrubberWrapper}
              onClick={handleScrubberClick}
              onMouseMove={handleScrubberMouseMove}
              onMouseLeave={handleScrubberMouseLeave}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={duration}
              aria-valuenow={currentTime}
              aria-label="Seek track"
            >
              <div className={styles.scrubberTrack}>
                <div
                  className={styles.scrubberProgress}
                  style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
                >
                  <span className={styles.scrubberThumb} />
                </div>
              </div>

              {hoverTime !== null && (
                <div className={styles.hoverTooltip} style={{ left: hoverX }}>
                  {formatTime(hoverTime)}
                </div>
              )}
            </div>
            <span className={styles.timestamp}>{formatTime(duration)}</span>
          </div>
        </div>

        {/* 3. RIGHT ZONE: Equalizer, Volume, Queue & Fullscreen */}
        <div className={styles.rightZone}>
          {/* Real-time dancing Equalizer bars */}
          <div className={styles.eqBox} title="Live Audio Output">
            <span
              className={styles.eqBar}
              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
            />
            <span
              className={styles.eqBar}
              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
            />
            <span
              className={styles.eqBar}
              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
            />
            <span
              className={styles.eqBar}
              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
            />
            <span
              className={styles.eqBar}
              style={{ animationPlayState: isPlaying ? 'running' : 'paused' }}
            />
          </div>

          {/* Volume control */}
          <div className={styles.volumeBox}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={toggleMute}
              title={isMuted ? 'Unmute (M)' : 'Mute (M)'}
              aria-label="Toggle mute"
            >
              {isMuted || effectiveVolume === 0 ? (
                <VolumeX size={17} />
              ) : effectiveVolume < 0.5 ? (
                <Volume1 size={17} />
              ) : (
                <Volume2 size={17} />
              )}
            </button>

            <div
              ref={volumeRef}
              className={styles.volumeSliderWrapper}
              onClick={handleVolumeClick}
              title={`Volume ${Math.round(effectiveVolume * 100)}%`}
              role="slider"
              aria-valuemin={0}
              aria-valuemax={1}
              aria-valuenow={effectiveVolume}
              aria-label="Volume slider"
            >
              <div className={styles.volumeTrack}>
                <div
                  className={styles.volumeFill}
                  style={{ width: `${Math.round(effectiveVolume * 100)}%` }}
                />
              </div>
            </div>
          </div>

          {/* Queue Drawer Button */}
          <button
            type="button"
            className={`${styles.iconBtn} ${isQueueOpen ? styles.controlBtnActive : ''}`}
            onClick={onToggleQueue}
            title="Toggle Queue Panel (Q)"
            aria-label="Queue Drawer"
          >
            <ListMusic size={18} />
          </button>

          {/* Fullscreen Expand */}
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => openFullScreenPlayer()}
            title="Immersive Fullscreen (F)"
            aria-label="Fullscreen player"
          >
            <Maximize2 size={16} />
          </button>
        </div>
      </footer>

      <AddToPlaylistModal
        track={currentTrack}
        isOpen={showPlaylistModal}
        onClose={() => setShowPlaylistModal(false)}
      />
    </>
  );
};
