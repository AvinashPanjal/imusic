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
  const [imgSrc, setImgSrc] = React.useState(album.coverImage || '/icons/default-artwork.png');

  React.useEffect(() => {
    setImgSrc(album.coverImage || '/icons/default-artwork.png');
  }, [album.coverImage]);

  return (
    <Link href={`/albums/${album.id}`} className={styles.card} aria-label={`View album ${album.title}`}>
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
