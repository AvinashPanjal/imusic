'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  ListMusic,
  Palette,
  Keyboard,
  Sparkles,
  Sun,
  Moon,
} from 'lucide-react';
import { usePlayerStore } from '@/store/playerStore';
import {
  getStoredTheme,
  applyTheme,
  getStoredColorMode,
  toggleColorMode,
  ThemeId,
  ColorMode,
} from '@/lib/theme';
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
  const { isPlaying, queue } = usePlayerStore();
  const [colorMode, setColorMode] = useState<ColorMode>('dark');

  const themes: ThemeId[] = ['violet', 'sunset', 'emerald', 'ocean', 'amber'];

  useEffect(() => {
    setColorMode(getStoredColorMode());
    const handleModeChange = (e: any) => {
      if (e.detail?.mode) setColorMode(e.detail.mode);
    };
    window.addEventListener('imusic:color_mode_changed', handleModeChange);
    return () => window.removeEventListener('imusic:color_mode_changed', handleModeChange);
  }, []);

  const cycleTheme = () => {
    const current = getStoredTheme();
    const idx = themes.indexOf(current);
    const nextTheme = themes[(idx + 1) % themes.length];
    applyTheme(nextTheme);
  };

  const handleToggleMode = () => {
    const next = toggleColorMode();
    setColorMode(next);
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
            Search tracks, albums, artists...
          </span>
          <kbd className={styles.kbd}>⌘K</kbd>
        </div>
      </div>

      {/* Right: Audio spec, Light/Dark mode, Theme switch, Queue toggle, Shortcuts */}
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

        {/* Light / Dark Mode Toggle */}
        <button
          type="button"
          className={styles.actionBtn}
          onClick={handleToggleMode}
          title={colorMode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label="Toggle Color Scheme"
        >
          {colorMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          <span>{colorMode === 'dark' ? 'Light' : 'Dark'}</span>
        </button>

        {/* Theme Cycler */}
        <button
          type="button"
          className={styles.actionBtn}
          onClick={cycleTheme}
          title="Cycle Accent Gradient"
          aria-label="Change Accent Theme"
        >
          <span className={styles.themeColorDot} />
          <span>Accent</span>
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
