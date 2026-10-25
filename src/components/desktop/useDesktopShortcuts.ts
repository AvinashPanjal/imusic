'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePlayerStore } from '@/store/playerStore';

export interface HudState {
  visible: boolean;
  type: 'volume' | 'mute' | 'shuffle' | 'repeat' | 'like';
  value?: number;
  label: string;
}

export function useDesktopShortcuts(options?: {
  onToggleSearch?: () => void;
  onToggleQueue?: () => void;
  onToggleShortcutsModal?: () => void;
}) {
  const {
    togglePlay,
    nextTrack,
    previousTrack,
    seek,
    currentTime,
    duration,
    volume,
    setVolume,
    toggleMute,
    isMuted,
    toggleShuffle,
    shuffle,
    cycleRepeat,
    repeatMode,
    isFullScreenPlayerOpen,
    openFullScreenPlayer,
    closeFullScreenPlayer,
  } = usePlayerStore();

  const [hud, setHud] = useState<HudState | null>(null);

  const triggerHud = useCallback((hudData: Omit<HudState, 'visible'>) => {
    setHud({ ...hudData, visible: true });
  }, []);

  useEffect(() => {
    if (!hud?.visible) return;
    const timer = setTimeout(() => {
      setHud((prev) => (prev ? { ...prev, visible: false } : null));
    }, 1200);
    return () => clearTimeout(timer);
  }, [hud?.visible, hud?.value, hud?.label]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when user is typing in form inputs, textareas or contenteditables
      const activeEl = document.activeElement;
      const isInput =
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable);

      // Allow Ctrl+K or Cmd+K even if focused
      if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'k' || e.code === 'KeyK')) {
        e.preventDefault();
        options?.onToggleSearch?.();
        return;
      }

      if (isInput) return;

      // Space: Play / Pause
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        togglePlay();
        return;
      }

      // Seek Forward 5s: ArrowRight
      if (e.code === 'ArrowRight' || e.key === 'ArrowRight') {
        e.preventDefault();
        const nextTime = Math.min(duration || 9999, currentTime + 5);
        seek(nextTime);
        return;
      }

      // Seek Backward 5s: ArrowLeft
      if (e.code === 'ArrowLeft' || e.key === 'ArrowLeft') {
        e.preventDefault();
        const prevTime = Math.max(0, currentTime - 5);
        seek(prevTime);
        return;
      }

      // Volume Up (+5%): ArrowUp
      if (e.code === 'ArrowUp' || e.key === 'ArrowUp') {
        e.preventDefault();
        const nextVol = Math.min(1, Math.round((volume + 0.05) * 100) / 100);
        setVolume(nextVol);
        triggerHud({
          type: 'volume',
          value: nextVol,
          label: `Volume ${Math.round(nextVol * 100)}%`,
        });
        return;
      }

      // Volume Down (-5%): ArrowDown
      if (e.code === 'ArrowDown' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextVol = Math.max(0, Math.round((volume - 0.05) * 100) / 100);
        setVolume(nextVol);
        triggerHud({
          type: 'volume',
          value: nextVol,
          label: `Volume ${Math.round(nextVol * 100)}%`,
        });
        return;
      }

      // Mute: KeyM
      if (e.key.toLowerCase() === 'm' || e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
        triggerHud({
          type: 'mute',
          label: isMuted ? 'Unmuted' : 'Muted',
        });
        return;
      }

      // Next Track: Shift + N
      if (e.shiftKey && (e.key.toLowerCase() === 'n' || e.code === 'KeyN')) {
        e.preventDefault();
        nextTrack();
        return;
      }

      // Previous Track: Shift + P
      if (e.shiftKey && (e.key.toLowerCase() === 'p' || e.code === 'KeyP')) {
        e.preventDefault();
        previousTrack();
        return;
      }

      // Shuffle: KeyS (without modifiers)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.toLowerCase() === 's' || e.code === 'KeyS')) {
        e.preventDefault();
        toggleShuffle();
        triggerHud({
          type: 'shuffle',
          label: !shuffle ? 'Shuffle On' : 'Shuffle Off',
        });
        return;
      }

      // Repeat: KeyR (without modifiers)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.toLowerCase() === 'r' || e.code === 'KeyR')) {
        e.preventDefault();
        cycleRepeat();
        const nextRep = repeatMode === 'off' ? 'All' : repeatMode === 'all' ? 'One' : 'Off';
        triggerHud({
          type: 'repeat',
          label: `Repeat ${nextRep}`,
        });
        return;
      }

      // Fullscreen: KeyF (without modifiers)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.toLowerCase() === 'f' || e.code === 'KeyF')) {
        e.preventDefault();
        if (isFullScreenPlayerOpen) closeFullScreenPlayer();
        else openFullScreenPlayer();
        return;
      }

      // Queue Drawer: KeyQ (without modifiers)
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key.toLowerCase() === 'q' || e.code === 'KeyQ')) {
        e.preventDefault();
        options?.onToggleQueue?.();
        return;
      }

      // Quick Search shortcut: /
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '/') {
        e.preventDefault();
        options?.onToggleSearch?.();
        return;
      }

      // Keyboard Help: ?
      if (e.key === '?') {
        e.preventDefault();
        options?.onToggleShortcutsModal?.();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    togglePlay,
    nextTrack,
    previousTrack,
    seek,
    currentTime,
    duration,
    volume,
    setVolume,
    toggleMute,
    isMuted,
    toggleShuffle,
    shuffle,
    cycleRepeat,
    repeatMode,
    isFullScreenPlayerOpen,
    openFullScreenPlayer,
    closeFullScreenPlayer,
    options,
    triggerHud,
  ]);

  return { hud };
}
