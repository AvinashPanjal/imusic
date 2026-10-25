'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { AudioEngine } from '@/components/player/AudioEngine';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { FullScreenPlayer } from '@/components/player/FullScreenPlayer';
import { BottomNavigation } from '@/components/navigation/BottomNavigation';
import { DesktopSidebar } from '@/components/navigation/DesktopSidebar';
import { DesktopHeader } from '@/components/desktop/DesktopHeader';
import { DesktopPlayerDock } from '@/components/desktop/DesktopPlayerDock';
import { DesktopQueueDrawer } from '@/components/desktop/DesktopQueueDrawer';
import { DesktopAuroraEngine } from '@/components/desktop/DesktopAuroraEngine';
import { DesktopSpotlightSearch } from '@/components/desktop/DesktopSpotlightSearch';
import { DesktopShortcutsModal } from '@/components/desktop/DesktopShortcutsModal';
import { DesktopHud } from '@/components/desktop/DesktopHud';
import { useDesktopShortcuts } from '@/components/desktop/useDesktopShortcuts';
import { getStoredTheme, applyTheme } from '@/lib/theme';
import styles from './AppShell.module.css';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hydrate = usePlayerStore((s) => s.hydrate);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  const toggleQueue = useCallback(() => {
    setIsQueueOpen((prev) => !prev);
  }, []);

  const openSearch = useCallback(() => {
    setIsSearchOpen(true);
  }, []);

  const closeSearch = useCallback(() => {
    setIsSearchOpen(false);
  }, []);

  const toggleShortcuts = useCallback(() => {
    setIsShortcutsOpen((prev) => !prev);
  }, []);

  // Desktop Global Shortcuts & On-screen HUD
  const { hud } = useDesktopShortcuts({
    onToggleSearch: () => setIsSearchOpen((prev) => !prev),
    onToggleQueue: toggleQueue,
    onToggleShortcutsModal: toggleShortcuts,
  });

  useEffect(() => {
    hydrate();
    applyTheme(getStoredTheme());
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch(() => {});
      });
    }
  }, [hydrate]);

  return (
    <div className={styles.shell}>
      {/* Background Aurora Lighting Engine (Desktop only) */}
      <DesktopAuroraEngine />

      {/* Persistent Audio Engine */}
      <AudioEngine />

      {/* Desktop Sidebar (Desktop only) */}
      <DesktopSidebar
        onOpenShortcuts={toggleShortcuts}
        onOpenSearch={openSearch}
      />

      {/* Main page content area */}
      <main className={styles.mainContent}>
        {/* Floating Desktop Command Header (Desktop only) */}
        <DesktopHeader
          onOpenSearch={openSearch}
          onToggleQueue={toggleQueue}
          onOpenShortcuts={toggleShortcuts}
          isQueueOpen={isQueueOpen}
        />

        <div className={styles.pageInner}>
          {children}
        </div>
      </main>

      {/* Mobile Mini Player (< 1024px only) */}
      <MiniPlayer />

      {/* Desktop Master Studio Player Dock (>= 1024px only) */}
      <DesktopPlayerDock
        onToggleQueue={toggleQueue}
        isQueueOpen={isQueueOpen}
      />

      {/* Desktop Queue & Lyrics Slide-out Panel (Desktop only) */}
      <DesktopQueueDrawer
        isOpen={isQueueOpen}
        onClose={() => setIsQueueOpen(false)}
      />

      {/* Desktop Spotlight Quick Search Modal */}
      <DesktopSpotlightSearch
        isOpen={isSearchOpen}
        onClose={closeSearch}
      />

      {/* Desktop Keyboard Shortcuts Cheat Sheet Modal */}
      <DesktopShortcutsModal
        isOpen={isShortcutsOpen}
        onClose={() => setIsShortcutsOpen(false)}
      />

      {/* Desktop On-Screen Volume/Mute HUD Toast */}
      <DesktopHud hud={hud} />

      {/* Full-screen player modal */}
      <FullScreenPlayer />

      {/* Bottom Navigation for Mobile Phone only (< 1024px) */}
      <BottomNavigation />
    </div>
  );
};
