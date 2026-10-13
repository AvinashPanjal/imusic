'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { usePlayerStore } from '@/store/playerStore';
import { Play, Pause, SkipForward } from 'lucide-react';
import { extractAmbientColors } from '@/lib/colorExtractor';
import styles from './MiniPlayer.module.css';

export const MiniPlayer: React.FC = () => {
  const [mounted, setMounted] = useState(false);
  const [miniGlow, setMiniGlow] = useState('rgba(124, 58, 237, 0.35)');
  const {
    currentTrack,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    nextTrack,
    openFullScreenPlayer,
  } = usePlayerStore();

  useEffect(() => {
    setMounted(true);
  }, []);

  const artworkUrl = currentTrack?.album?.coverImage || '/icons/default-artwork.png';

  useEffect(() => {
    if (!currentTrack) return;
    let active = true;
    extractAmbientColors(artworkUrl, currentTrack.title).then((p) => {
      if (active) setMiniGlow(p.glow1);
    });
    return () => {
      active = false;
    };
  }, [artworkUrl, currentTrack?.title]);

  if (!mounted || !currentTrack) {
    return null;
  }

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const artistNames = currentTrack.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  return (
    <div
      className={styles.miniPlayer}
      onClick={() => openFullScreenPlayer()}
      role="region"
      aria-label="Now playing bar"
      style={{ '--mini-glow': miniGlow } as React.CSSProperties}
    >
      {/* Top progress indicator line */}
      <div className={styles.progressBarContainer}>
        <div
          className={styles.progressBar}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>

      <div className={styles.content}>
        {/* Artwork */}
        <div className={styles.artworkWrapper}>
          <Image
            src={artworkUrl}
            alt={currentTrack.title}
            width={48}
            height={48}
            className={styles.artwork}
            unoptimized={artworkUrl.startsWith('http')}
          />
        </div>

        {/* Metadata */}
        <div className={styles.meta}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{currentTrack.title}</span>
            {isPlaying && (
              <div className={styles.eqWave} aria-hidden="true" title="Playing">
                <span className={styles.eqBar} />
                <span className={styles.eqBar} />
                <span className={styles.eqBar} />
              </div>
            )}
          </div>
          <div className={styles.artist}>{artistNames}</div>
        </div>

        {/* Action Controls */}
        <div className={styles.actions} onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className={styles.controlBtn}
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={22} className={styles.icon} />
            ) : (
              <Play size={22} className={`${styles.icon} ${styles.playIcon}`} />
            )}
          </button>

          <button
            type="button"
            className={styles.controlBtn}
            onClick={nextTrack}
            aria-label="Next track"
          >
            <SkipForward size={20} className={styles.icon} />
          </button>
        </div>
      </div>
    </div>
  );
};
