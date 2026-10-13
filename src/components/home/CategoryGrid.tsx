'use client';

import React from 'react';
import Image from 'next/image';
import { Sparkles, Film, Music, Radio, Flame, Disc } from 'lucide-react';
import styles from './CategoryGrid.module.css';

export interface CategoryItem {
  id: string;
  title: string;
  nativeTitle: string;
  subtitle: string;
  gradient: string;
  shadowColor: string;
  icon: React.ElementType;
  previewImage: string;
  filterValue: 'all' | 'malayalam' | 'tamil' | 'hindi' | 'global' | 'hires' | 'retro';
}

export const CATEGORIES: CategoryItem[] = [
  {
    id: 'malayalam',
    title: 'Malayalam Cinema',
    nativeTitle: 'മലയാളം',
    subtitle: 'Aavesham, Premalu & Melodies',
    gradient: 'linear-gradient(135deg, #059669 0%, #10b981 55%, #047857 100%)',
    shadowColor: 'rgba(16, 185, 129, 0.45)',
    icon: Film,
    previewImage: 'https://c.saavncdn.com/202/Aavesham-Original-Motion-Picture-Soundtrack-Malayalam-2024-20250910150630-500x500.jpg',
    filterValue: 'malayalam',
  },
  {
    id: 'tamil',
    title: 'Tamil Hits',
    nativeTitle: 'தமிழ்',
    subtitle: 'Leo, Jailer, Vikram & Anirudh',
    gradient: 'linear-gradient(135deg, #7c3aed 0%, #a855f7 55%, #4f46e5 100%)',
    shadowColor: 'rgba(124, 58, 237, 0.45)',
    icon: Flame,
    previewImage: 'https://c.saavncdn.com/187/Jailer-Tamil-2023-20230728081443-500x500.jpg',
    filterValue: 'tamil',
  },
  {
    id: 'hindi',
    title: 'Bollywood & Hindi',
    nativeTitle: 'हिन्दी',
    subtitle: 'ANIMAL, Pritam & Anthems',
    gradient: 'linear-gradient(135deg, #ea580c 0%, #f97316 55%, #e11d48 100%)',
    shadowColor: 'rgba(234, 88, 12, 0.45)',
    icon: Music,
    previewImage: 'https://c.saavncdn.com/092/ANIMAL-Hindi-2023-20260724191152-500x500.jpg',
    filterValue: 'hindi',
  },
  {
    id: 'hires',
    title: 'Hi-Res Lossless Vault',
    nativeTitle: '24-BIT',
    subtitle: 'Studio Masters • 96kHz / 192kHz',
    gradient: 'linear-gradient(135deg, #0284c7 0%, #0ea5e9 55%, #1d4ed8 100%)',
    shadowColor: 'rgba(14, 165, 233, 0.45)',
    icon: Sparkles,
    previewImage: 'https://c.saavncdn.com/934/Manjummel-Boys-Original-Motion-Picture-Soundtrack-Malayalam-2024-20250905071140-500x500.jpg',
    filterValue: 'hires',
  },
  {
    id: 'retro',
    title: 'Classic Soundtracks',
    nativeTitle: '90s GOLD',
    subtitle: 'Indrajaalam, Mohanlal & Classics',
    gradient: 'linear-gradient(135deg, #d97706 0%, #f59e0b 55%, #b45309 100%)',
    shadowColor: 'rgba(245, 158, 11, 0.45)',
    icon: Disc,
    previewImage: 'https://c.saavncdn.com/494/Indrajaalam-Malayalam-2024-20250403152648-500x500.jpg',
    filterValue: 'retro',
  },
  {
    id: 'global',
    title: 'Global Pop & Trending',
    nativeTitle: 'WORLD',
    subtitle: 'The Weeknd & Billboard Top 50',
    gradient: 'linear-gradient(135deg, #db2777 0%, #ec4899 55%, #7c3aed 100%)',
    shadowColor: 'rgba(219, 39, 119, 0.45)',
    icon: Radio,
    previewImage: 'https://c.saavncdn.com/396/The-Highlights-English-2021-20240207045714-500x500.jpg',
    filterValue: 'global',
  },
];

interface CategoryGridProps {
  activeCategory: string;
  onSelectCategory: (val: string) => void;
}

export const CategoryGrid: React.FC<CategoryGridProps> = ({
  activeCategory,
  onSelectCategory,
}) => {
  return (
    <div className={styles.grid}>
      {CATEGORIES.map((cat) => {
        const isActive = activeCategory === cat.filterValue;
        const Icon = cat.icon;

        return (
          <button
            key={cat.id}
            type="button"
            className={`${styles.card} ${isActive ? styles.cardActive : ''}`}
            onClick={() => onSelectCategory(isActive ? 'all' : cat.filterValue)}
            style={{
              background: cat.gradient,
              '--cat-shadow': cat.shadowColor,
            } as React.CSSProperties}
            aria-pressed={isActive}
            aria-label={`Explore ${cat.title}`}
          >
            {/* Ambient card shine */}
            <div className={styles.shine} />

            {/* Left side text info */}
            <div className={styles.content}>
              <div className={styles.badgeRow}>
                <span className={styles.nativeBadge}>{cat.nativeTitle}</span>
                {isActive && <span className={styles.activePill}>SELECTED</span>}
              </div>

              <div className={styles.titleRow}>
                <Icon size={18} className={styles.icon} />
                <h3 className={styles.title}>{cat.title}</h3>
              </div>

              <p className={styles.subtitle}>{cat.subtitle}</p>
            </div>

            {/* Tilted Cover Art Peek in bottom-right corner */}
            <div className={styles.artworkPeek}>
              <Image
                src={cat.previewImage}
                alt={cat.title}
                width={80}
                height={80}
                className={styles.peekImage}
                unoptimized
              />
            </div>
          </button>
        );
      })}
    </div>
  );
};
