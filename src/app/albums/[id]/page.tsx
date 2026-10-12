'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { TrackData } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { usePlayerStore } from '@/store/playerStore';
import { Play, Shuffle, ChevronLeft, Sparkles, Disc } from 'lucide-react';
import styles from './albumDetail.module.css';

export default function AlbumDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [album, setAlbum] = useState<any>(null);
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [loading, setLoading] = useState(true);

  const { playTrack, toggleShuffle } = usePlayerStore();

  useEffect(() => {
    if (!id) return;
    const loadAlbum = async () => {
      try {
        const res = await fetch(`/api/albums/${id}`);
        if (res.ok) {
          const data = await res.json();
          setAlbum(data.album);
          setTracks(data.album.tracks || []);
        }
      } catch (err) {
        console.error('Failed to load album:', err);
      } finally {
        setLoading(false);
      }
    };
    loadAlbum();
  }, [id]);

  const handlePlayAll = () => {
    if (tracks.length > 0) {
      playTrack(tracks[0], tracks, 0);
    }
  };

  const handleShufflePlay = () => {
    if (tracks.length > 0) {
      toggleShuffle();
      const randomIndex = Math.floor(Math.random() * tracks.length);
      playTrack(tracks[randomIndex], tracks, randomIndex);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (!album) {
    return (
      <div className={styles.notFound}>
        <h2>Album not found</h2>
        <button type="button" onClick={() => router.push('/library')} className={styles.backBtn}>
          Back
        </button>
      </div>
    );
  }

  const artworkUrl = album.coverImage || '/icons/default-artwork.png';

  return (
    <div className={styles.container}>
      <nav className={styles.navBar}>
        <button type="button" className={styles.iconNavBtn} onClick={() => router.back()} aria-label="Go back">
          <ChevronLeft size={24} />
        </button>
      </nav>

      {/* Album Header */}
      <header className={styles.hero}>
        <div className={styles.coverWrapper}>
          <Image
            src={artworkUrl}
            alt={album.title}
            width={240}
            height={240}
            priority
            className={styles.cover}
            unoptimized={artworkUrl.startsWith('http')}
          />
        </div>

        <div className={styles.meta}>
          <div className={styles.badgeRow}>
            {album.isHiRes ? (
              <span className={styles.badgeHiRes}>
                <Sparkles size={11} /> 24-Bit Hi-Res Lossless
              </span>
            ) : album.isLossless ? (
              <span className={styles.badgeLossless}>
                <Disc size={11} /> Lossless
              </span>
            ) : null}
          </div>

          <h1 className={styles.title}>{album.title}</h1>
          <p className={styles.artist}>{album.artist?.name || 'Various Artists'}</p>
          <div className={styles.subtext}>
            {album.releaseYear ? `${album.releaseYear} • ` : ''}
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
            {album.recordLabel ? ` • ${album.recordLabel}` : ''}
          </div>
        </div>
      </header>

      {/* Action Controls */}
      {tracks.length > 0 && (
        <div className={styles.actionsRow}>
          <button type="button" className={styles.playAllBtn} onClick={handlePlayAll}>
            <Play size={20} fill="currentColor" /> Play
          </button>
          <button type="button" className={styles.shuffleBtn} onClick={handleShufflePlay}>
            <Shuffle size={18} /> Shuffle
          </button>
        </div>
      )}

      {/* Track Listing */}
      <section className={styles.trackSection}>
        <div className={styles.trackList}>
          {tracks.map((track, idx) => (
            <TrackListItem
              key={track.id}
              track={track}
              index={typeof track.trackNumber === 'number' ? track.trackNumber - 1 : idx}
              playlistContext={tracks}
              showArtwork={false}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
