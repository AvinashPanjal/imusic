'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Library, Settings, UploadCloud, Radio, Sparkles } from 'lucide-react';
import styles from './DesktopSidebar.module.css';

export const DesktopSidebar: React.FC = () => {
  const pathname = usePathname();

  const links = [
    { label: 'Home', href: '/', icon: Home, exact: true },
    { label: 'Search', href: '/search', icon: Search, exact: false },
    { label: 'Your Library', href: '/library', icon: Library, exact: false },
    { label: 'Import Music', href: '/import', icon: UploadCloud, exact: false },
    { label: 'Settings', href: '/settings', icon: Settings, exact: false },
  ];

  return (
    <aside className={styles.sidebar} aria-label="Desktop Navigation">
      <div className={styles.brand}>
        <div className={styles.logoIcon}>
          <Radio size={20} />
        </div>
        <div className={styles.brandText}>
          <span className={styles.brandName}>iMusic</span>
          <span className={styles.brandBadge}>
            <Sparkles size={10} /> Hi-Res Lossless
          </span>
        </div>
      </div>

      <nav className={styles.navMenu}>
        {links.map((link) => {
          const isActive = link.exact
            ? pathname === link.href
            : pathname.startsWith(link.href);
          const Icon = link.icon;

          return (
            <Link
              key={link.href}
              href={link.href}
              className={`${styles.navLink} ${isActive ? styles.navLinkActive : ''}`}
            >
              <Icon size={18} className={styles.linkIcon} />
              <span>{link.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.footerNote}>
        <p className={styles.footerDevice}>Targeted for iPhone PWA</p>
        <p className={styles.footerNotice}>Ad-free personal audio streaming</p>
      </div>
    </aside>
  );
};
