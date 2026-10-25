'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Search,
  Library,
  Settings,
  UploadCloud,
  Radio,
  Sparkles,
  Heart,
  Compass,
  Cpu,
  Keyboard,
} from 'lucide-react';
import { usePlayerStore } from '@/store/playerStore';
import styles from './DesktopSidebar.module.css';

interface DesktopSidebarProps {
  onOpenShortcuts?: () => void;
  onOpenSearch?: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({
  onOpenShortcuts,
  onOpenSearch,
}) => {
  const pathname = usePathname();
  const { currentTrack, isPlaying } = usePlayerStore();

  const mainLinks = [
    { label: 'Home', href: '/', icon: Home, exact: true },
    { label: 'Search', href: '/search', icon: Search, exact: false, kbd: '⌘K' },
    { label: 'Explore', href: '/search?tab=trending', icon: Compass, exact: false },
  ];

  const collectionLinks = [
    { label: 'Your Library', href: '/library', icon: Library, exact: false },
    { label: 'Liked Songs', href: '/library?tab=favorites', icon: Heart, exact: false, isHeart: true },
    { label: 'Import Music', href: '/import', icon: UploadCloud, exact: false, badge: 'Spotify' },
  ];

  const currentBitrate =
    currentTrack?.assets?.[0]?.bitrate ? `${currentTrack.assets[0].bitrate} kbps` : 'Lossless Direct';

  return (
    <aside className={styles.sidebar} aria-label="Desktop Navigation">
      {/* Brand & Studio Logo */}
      <Link href="/" className={styles.brand}>
        <div className={styles.logoIcon}>
          <Radio size={22} />
        </div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>AVMusic</span>
          <span className={styles.brandBadge}>
            <Sparkles size={11} /> Studio Lossless
          </span>
        </div>
      </Link>

      <div className={styles.scrollArea}>
        {/* Section 1: Discover */}
        <div className={styles.sectionGroup}>
          <span className={styles.sectionHeader}>Discover</span>
          {mainLinks.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
                onClick={link.kbd ? (e) => {
                  if (onOpenSearch) {
                    e.preventDefault();
                    onOpenSearch();
                  }
                } : undefined}
              >
                <div className={styles.navLinkLeft}>
                  <Icon size={19} className={styles.linkIcon} />
                  <span>{link.label}</span>
                </div>
                {link.kbd && <kbd className={styles.kbd}>{link.kbd}</kbd>}
              </Link>
            );
          })}
        </div>

        {/* Section 2: Collection */}
        <div className={styles.sectionGroup}>
          <span className={styles.sectionHeader}>Collection</span>
          {collectionLinks.map((link) => {
            const isActive = pathname.startsWith(link.href.split('?')[0]);
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
              >
                <div className={styles.navLinkLeft}>
                  {link.isHeart ? (
                    <div className={styles.heartIconBox}>
                      <Heart size={13} fill="currentColor" />
                    </div>
                  ) : (
                    <Icon size={19} className={styles.linkIcon} />
                  )}
                  <span>{link.label}</span>
                </div>
                {link.badge && (
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: 'var(--accent-hover)',
                      background: 'var(--accent-subtle)',
                      padding: '2px 6px',
                      borderRadius: 'var(--radius-full)',
                    }}
                  >
                    {link.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>

        {/* Section 3: Audio Engine Live Widget */}
        <div className={styles.engineWidget}>
          <div className={styles.engineRow}>
            <span className={styles.engineTitle}>
              <Cpu size={12} /> Audio Engine
            </span>
            <span className={styles.engineDot} />
          </div>
          <div className={styles.engineRow}>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Status</span>
            <span className={styles.engineBitrate}>
              {isPlaying ? currentBitrate : 'Bit-Perfect Idle'}
            </span>
          </div>
          <p className={styles.engineDesc}>
            Direct 307 CDN pipeline with bit-perfect hardware playback.
          </p>
        </div>

        {/* Section 4: Hotkeys Helper */}
        {onOpenShortcuts && (
          <button
            type="button"
            className={styles.shortcutsPill}
            onClick={onOpenShortcuts}
            title="View keyboard hotkeys"
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Keyboard size={15} />
              <span>Keyboard Hotkeys</span>
            </div>
            <kbd className={styles.kbd}>?</kbd>
          </button>
        )}

        {/* Section 5: Settings Link */}
        <div className={styles.sectionGroup} style={{ marginTop: 'auto' }}>
          <Link
            href="/settings"
            className={`${styles.navLink} ${pathname === '/settings' ? styles.navLinkActive : ''}`}
          >
            <div className={styles.navLinkLeft}>
              <Settings size={18} className={styles.linkIcon} />
              <span>Settings</span>
            </div>
          </Link>
        </div>
      </div>
    </aside>
  );
};
