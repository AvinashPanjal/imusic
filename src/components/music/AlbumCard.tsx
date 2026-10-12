'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlbumSummary } from '@/types/music';
import { Sparkles, Disc } from 'lucide-react';
import styles from './AlbumCard.module.css';

interface AlbumCardProps {
  album: AlbumSummary;
}

export const AlbumCard: React.FC<AlbumCardProps> = ({ album }) => {
  const artworkUrl = album.coverImage || '/icons/default-artwork.png';

  return (
    <Link href={`/albums/${album.id}`} className={styles.card} aria-label={`View album ${album.title}`}>
      <div className={styles.coverWrapper}>
        <Image
          src={artworkUrl}
          alt={album.title}
          width={180}
          height={180}
          className={styles.cover}
          unoptimized={artworkUrl.startsWith('http')}
        />
        {album.isHiRes && (
          <div className={styles.badgeHiRes} title="Hi-Res Master">
            <Sparkles size={10} /> Hi-Res
          </div>
        )}
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
