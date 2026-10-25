'use client';

import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { extractAmbientColors } from '@/lib/colorExtractor';
import styles from './DesktopAuroraEngine.module.css';

export const DesktopAuroraEngine: React.FC = () => {
  const currentTrack = usePlayerStore((s) => s.currentTrack);
  const [glow1, setGlow1] = useState('rgba(124, 58, 237, 0.25)');
  const [glow2, setGlow2] = useState('rgba(244, 63, 94, 0.18)');

  useEffect(() => {
    if (!currentTrack) return;
    let active = true;
    const artUrl = currentTrack.album?.coverImage || '/icons/default-artwork.png';
    const seed = `${currentTrack.title} ${currentTrack.artists?.[0]?.name || ''}`;

    extractAmbientColors(artUrl, seed).then((palette) => {
      if (active) {
        setGlow1(palette.glow1);
        setGlow2(palette.glow2);
      }
    });

    return () => {
      active = false;
    };
  }, [currentTrack?.id, currentTrack?.album?.coverImage, currentTrack?.title]);

  return (
    <div
      className={styles.auroraContainer}
      aria-hidden="true"
      style={
        {
          '--aurora-glow-1': glow1,
          '--aurora-glow-2': glow2,
        } as React.CSSProperties
      }
    >
      <div className={styles.auroraOrb1} />
      <div className={styles.auroraOrb2} />
      <div className={styles.auroraOrb3} />
      <div className={styles.subtleGridPattern} />
    </div>
  );
};
