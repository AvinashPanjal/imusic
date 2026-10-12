'use client';

import React, { useEffect } from 'react';
import { usePlayerStore } from '@/store/playerStore';
import { AudioEngine } from '@/components/player/AudioEngine';
import { MiniPlayer } from '@/components/player/MiniPlayer';
import { FullScreenPlayer } from '@/components/player/FullScreenPlayer';
import { BottomNavigation } from '@/components/navigation/BottomNavigation';
import { DesktopSidebar } from '@/components/navigation/DesktopSidebar';
import styles from './AppShell.module.css';

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const hydrate = usePlayerStore((s) => s.hydrate);

  useEffect(() => {
    hydrate();
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.update().catch(() => {});
      });
    }
  }, [hydrate]);
  return (
    <div className={styles.shell}>
      {/* Persistent Audio Engine */}
      <AudioEngine />

      {/* Desktop sidebar */}
      <DesktopSidebar />

      {/* Main page content area */}
      <main className={styles.mainContent}>
        <div className={styles.pageInner}>
          {children}
        </div>
      </main>

      {/* Mini Player */}
      <MiniPlayer />

      {/* Full-screen player modal */}
      <FullScreenPlayer />

      {/* Bottom Navigation for iPhone */}
      <BottomNavigation />
    </div>
  );
};
