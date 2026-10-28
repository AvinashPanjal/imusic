'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { TrackData } from '@/types/music';
import { usePlayerStore } from '@/store/playerStore';
import { extractAmbientColors } from '@/lib/colorExtractor';
import { LocalLibrary } from '@/lib/storage/localLibrary';
import { Play, Pause, Heart } from 'lucide-react';
import styles from './TrackCard.module.css';

interface TrackCardProps {
  track: TrackData;
  playlistContext?: TrackData[];
  showLanguageBadge?: boolean;
}

export const TrackCard: React.FC<TrackCardProps> = ({
  track,
  playlistContext,
  showLanguageBadge = true,
}) => {
  const { currentTrack, isPlaying, playTrack, togglePlay } = usePlayerStore();
  const [imgSrc, setImgSrc] = useState(track.album?.coverImage || '/icons/default-artwork.png');
  const [glowColor, setGlowColor] = useState('rgba(124, 58, 237, 0.35)');
  const [isFav, setIsFav] = useState(false);

  const isCurrent = currentTrack?.id === track.id;
  const isThisPlaying = isCurrent && isPlaying;

  useEffect(() => {
    setImgSrc(track.album?.coverImage || '/icons/default-artwork.png');
  }, [track.album?.coverImage]);

  useEffect(() => {
    let active = true;
    extractAmbientColors(imgSrc, track.title).then((p) => {
      if (active) setGlowColor(p.glow1);
    });
    return () => {
      active = false;
    };
  }, [imgSrc, track.title]);

  useEffect(() => {
    setIsFav(Boolean(track.isFavorite || LocalLibrary.isFavorite(track.id)));
  }, [track.id, track.isFavorite]);

  const handleCardClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      playTrack(track, playlistContext || [track]);
    }
  };

  const handleFavClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const nextFav = LocalLibrary.toggleFavorite(track);
    setIsFav(nextFav);
  };

  // Determine language badge
  const genreStr = (track.genre || '').toLowerCase();
  let langLabel = '';
  let badgeClass = styles.badgeDefault;

  if (genreStr.includes('malayalam')) {
    langLabel = 'MALAYALAM';
    badgeClass = styles.badgeMalayalam;
  } else if (genreStr.includes('tamil')) {
    langLabel = 'TAMIL';
    badgeClass = styles.badgeTamil;
  } else if (genreStr.includes('hindi')) {
    langLabel = 'HINDI';
    badgeClass = styles.badgeHindi;
  } else if (track.assets?.some((a) => a.isHiRes)) {
    langLabel = 'HI-RES';
    badgeClass = styles.badgeDefault;
  } else if (track.assets?.some((a) => a.isLossless)) {
    langLabel = 'LOSSLESS';
    badgeClass = styles.badgeDefault;
  }

  const artistName = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  return (
    <div
      className={`${styles.card} ${isThisPlaying ? styles.cardPlaying : ''}`}
      onClick={handleCardClick}
      style={{ '--card-glow': glowColor } as React.CSSProperties}
      title={`Play ${track.title} by ${artistName}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      <div className={styles.artWrapper}>
        <Image
          src={imgSrc}
          alt={track.title}
          width={188}
          height={188}
          className={styles.artwork}
          unoptimized={imgSrc.startsWith('http')}
          onError={() => setImgSrc('/icons/default-artwork.png')}
        />

        {showLanguageBadge && langLabel && (
          <div className={`${styles.badgePill} ${badgeClass}`}>
            {langLabel}
          </div>
        )}

        {/* Hover / Active Play Button Overlay */}
        <div className={styles.playOverlay}>
          <div className={styles.playBtnCircle}>
            {isThisPlaying ? (
              <div className={styles.equalizerWave}>
                <span className={styles.eqBar} />
                <span className={styles.eqBar} />
                <span className={styles.eqBar} />
                <span className={styles.eqBar} />
              </div>
            ) : isCurrent ? (
              <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />
            ) : (
              <Play size={20} fill="currentColor" style={{ marginLeft: 2 }} />
            )}
          </div>
        </div>
      </div>

      <div className={styles.info}>
        <div className={styles.titleRow}>
          <span className={styles.title} title={track.title}>
            {track.title}
          </span>
          <button
            type="button"
            className={`${styles.favIconBtn} ${isFav ? styles.favActive : ''}`}
            onClick={handleFavClick}
            aria-label={isFav ? 'Remove from favorites' : 'Add to favorites'}
            title={isFav ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Heart size={14} fill={isFav ? '#f43f5e' : 'none'} />
          </button>
        </div>

        <span className={styles.artist} title={artistName}>
          {artistName}
        </span>

        <div className={styles.subMetaRow}>
          <span className={styles.bitrateTag}>320 KBPS</span>
          <span>{track.album?.releaseYear || 2026}</span>
        </div>
      </div>
    </div>
  );
};
