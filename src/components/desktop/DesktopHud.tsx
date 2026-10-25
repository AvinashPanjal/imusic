'use client';

import React from 'react';
import { Volume2, VolumeX, Shuffle, Repeat, Heart } from 'lucide-react';
import { HudState } from './useDesktopShortcuts';
import styles from './DesktopHud.module.css';

interface DesktopHudProps {
  hud: HudState | null;
}

export const DesktopHud: React.FC<DesktopHudProps> = ({ hud }) => {
  if (!hud || !hud.visible) return null;

  return (
    <div className={styles.hud} role="status" aria-live="polite">
      {hud.type === 'volume' && (
        <>
          <Volume2 size={16} className={styles.icon} />
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${Math.round((hud.value ?? 0) * 100)}%` }}
            />
          </div>
          <span className={styles.text}>{Math.round((hud.value ?? 0) * 100)}%</span>
        </>
      )}

      {hud.type === 'mute' && (
        <>
          <VolumeX size={16} className={styles.icon} />
          <span>{hud.label}</span>
        </>
      )}

      {hud.type === 'shuffle' && (
        <>
          <Shuffle size={16} className={styles.icon} />
          <span>{hud.label}</span>
        </>
      )}

      {hud.type === 'repeat' && (
        <>
          <Repeat size={16} className={styles.icon} />
          <span>{hud.label}</span>
        </>
      )}

      {hud.type === 'like' && (
        <>
          <Heart size={16} className={styles.icon} fill="currentColor" />
          <span>{hud.label}</span>
        </>
      )}
    </div>
  );
};
