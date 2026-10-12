'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Search, Library } from 'lucide-react';
import styles from './BottomNavigation.module.css';

export const BottomNavigation: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    { label: 'Home', href: '/', icon: Home, exact: true },
    { label: 'Search', href: '/search', icon: Search, exact: false },
    { label: 'Library', href: '/library', icon: Library, exact: false },
  ];

  return (
    <nav className={styles.bottomNav} aria-label="Main Navigation">
      <div className={styles.navContainer}>
        {navItems.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname.startsWith(item.href);
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              aria-current={isActive ? 'page' : undefined}
            >
              <div className={styles.iconContainer}>
                <Icon size={22} className={styles.icon} />
              </div>
              <span className={styles.navLabel}>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
