'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ListMusic,
  Palette,
  Keyboard,
  Sparkles,
} from 'lucide-react';
import { usePlayerStore } from '@/store/playerStore';
import { getStoredTheme, applyTheme, ThemeId } from '@/lib/theme';
import styles from './DesktopHeader.module.css';

interface DesktopHeaderProps {
  onOpenSearch: () => void;
  onToggleQueue: () => void;
  onOpenShortcuts: () => void;
  isQueueOpen: boolean;
}

export const DesktopHeader: React.FC<DesktopHeaderProps> = ({
  onOpenSearch,
  onToggleQueue,
  onOpenShortcuts,
  isQueueOpen,
}) => {
  const router = useRouter();
  const { isPlaying, queue, currentTrack } = usePlayerStore();

  const themes: ThemeId[] = ['violet', 'sunset', 'emerald', 'ocean', 'amber'];

  const cycleTheme = () => {
    const current = getStoredTheme();
    const idx = themes.indexOf(current);
    const nextTheme = themes[(idx + 1) % themes.length];
    applyTheme(nextTheme);
  };

  return (
    <header className={styles.header} aria-label="Desktop Command Bar">
      {/* Left: Navigation History */}
      <div className={styles.leftGroup}>
        <button
          type="button"
          className={styles.historyBtn}
          onClick={() => router.back()}
          title="Go Back"
          aria-label="Back"
        >
          <ChevronLeft size={18} />
        </button>
        <button
          type="button"
          className={styles.historyBtn}
          onClick={() => router.forward()}
          title="Go Forward"
          aria-label="Forward"
        >
          <ChevronRight size={18} />
        </button>

        {/* Center Spotlight Search Trigger */}
        <div className={styles.searchPill} onClick={onOpenSearch} role="searchbox" tabIndex={0}>
          <Search size={16} className={styles.searchIcon} />
          <span className={styles.searchPlaceholder}>
            Search tracks, albums, YouTube covers...
          </span>
          <kbd className={styles.kbd}>⌘K</kbd>
        </div>
      </div>

      {/* Right: Audio spec, Theme switch, Queue toggle, Shortcuts */}
      <div className={styles.rightGroup}>
        {/* Equalizer Live Indicator */}
        <div className={styles.eqBadge} title="Hi-Res Lossless Audio Engine Active">
          <div className={styles.eqWave}>
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
          <span>Lossless Bit-Perfect</span>
        </div>

        {/* Theme Cycler */}
        <button
          type="button"
          className={styles.actionBtn}
          onClick={cycleTheme}
          title="Cycle Theme Gradient"
          aria-label="Change Theme"
        >
          <span className={styles.themeColorDot} />
          <span>Theme</span>
        </button>

        {/* Queue Drawer Button */}
        <button
          type="button"
          className={`${styles.actionBtn} ${isQueueOpen ? styles.actionBtnActive : ''}`}
          onClick={onToggleQueue}
          title="Toggle Playback Queue (Q)"
          aria-label="Toggle Queue"
        >
          <ListMusic size={16} />
          <span>Queue</span>
          {queue.length > 0 && <span className={styles.badgeCount}>{queue.length}</span>}
        </button>

        {/* Keyboard Shortcuts Helper */}
        <button
          type="button"
          className={styles.actionBtn}
          onClick={onOpenShortcuts}
          title="Keyboard Shortcuts (?)"
          aria-label="Keyboard Shortcuts"
        >
          <Keyboard size={15} />
        </button>
      </div>
    </header>
  );
};
