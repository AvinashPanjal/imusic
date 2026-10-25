'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlbumSummary } from '@/types/music';
import { Sparkles, Play } from 'lucide-react';
import { extractAmbientColors } from '@/lib/colorExtractor';
import styles from './AlbumCard.module.css';

interface AlbumCardProps {
  album: AlbumSummary;
}

export const AlbumCard: React.FC<AlbumCardProps> = ({ album }) => {
  const [imgSrc, setImgSrc] = React.useState(album.coverImage || '/icons/default-artwork.png');
  const [glowColor, setGlowColor] = React.useState('rgba(124, 58, 237, 0.35)');

  React.useEffect(() => {
    setImgSrc(album.coverImage || '/icons/default-artwork.png');
  }, [album.coverImage]);

  React.useEffect(() => {
    let active = true;
    extractAmbientColors(imgSrc, album.title).then((p) => {
      if (active) setGlowColor(p.glow1);
    });
    return () => {
      active = false;
    };
  }, [imgSrc, album.title]);

  return (
    <Link
      href={`/albums/${album.id}`}
      className={styles.card}
      aria-label={`View album ${album.title}`}
      style={{ '--card-glow': glowColor } as React.CSSProperties}
    >
      <div className={styles.coverWrapper}>
        <Image
          src={imgSrc}
          alt={album.title}
          width={180}
          height={180}
          className={styles.cover}
          unoptimized={imgSrc.startsWith('http')}
          onError={() => setImgSrc('/icons/default-artwork.png')}
        />
        {album.isHiRes && (
          <div className={styles.badgeHiRes} title="Hi-Res Master">
            <Sparkles size={10} /> Hi-Res
          </div>
        )}
        <div className={styles.hoverPlayOverlay} title={`View ${album.title}`}>
          <Play size={18} fill="currentColor" style={{ marginLeft: 2 }} />
        </div>
      </div>

      <div className={styles.info}>
        <span className={styles.title}>{album.title}</span>
        <span className={styles.artist}>
          {album.artistName || 'Album'}
          {album.releaseYear ? ` • ${album.releaseYear}` : ''}
        </span>
      </div>
    </Link>
  );
};
