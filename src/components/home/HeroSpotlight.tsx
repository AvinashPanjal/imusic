'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { FEATURED_SOUNDTRACKS, FeaturedSoundtrack } from '@/lib/constants/soundtracks';
import { usePlayerStore } from '@/store/playerStore';
import { extractAmbientColors } from '@/lib/colorExtractor';
import { Play, Sparkles, Disc3, ChevronRight, ChevronLeft, Music2 } from 'lucide-react';
import styles from './HeroSpotlight.module.css';

export const HeroSpotlight: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [glowColor, setGlowColor] = useState('rgba(124, 58, 237, 0.45)');
  const [isStartingPlayback, setIsStartingPlayback] = useState(false);
  const { playTrack, queue } = usePlayerStore();

  const current: FeaturedSoundtrack = FEATURED_SOUNDTRACKS[index] || FEATURED_SOUNDTRACKS[0];
  const coverUrl = current.coverImage || '/icons/default-artwork.png';

  useEffect(() => {
    let active = true;
    extractAmbientColors(coverUrl, current.title).then((p) => {
      if (active) setGlowColor(p.glow1);
    });
    return () => {
      active = false;
    };
  }, [coverUrl, current.title]);

  const handleNext = () => {
    setIndex((prev) => (prev + 1) % FEATURED_SOUNDTRACKS.length);
  };

  const handlePrev = () => {
    setIndex((prev) => (prev - 1 + FEATURED_SOUNDTRACKS.length) % FEATURED_SOUNDTRACKS.length);
  };

  const handlePlaySoundtrack = async () => {
    if (isStartingPlayback) return;
    setIsStartingPlayback(true);
    try {
      const res = await fetch(`/api/albums/${current.id}`);
      if (res.ok) {
        const data = await res.json();
        const albumTracks = data.album?.tracks || [];
        if (albumTracks.length > 0) {
          playTrack(albumTracks[0], albumTracks);
          setIsStartingPlayback(false);
          return;
        }
      }

      // Fallback: search by album title
      const searchRes = await fetch(`/api/search?q=${encodeURIComponent(current.title)}`);
      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const results = searchData.results || [];
        const indianVault = results.find((r: any) => r.providerCode === 'indian_music_vault');
        if (indianVault && indianVault.tracks && indianVault.tracks.length > 0) {
          playTrack(indianVault.tracks[0], indianVault.tracks);
        }
      }
    } catch (err) {
      console.warn('Could not launch soundtrack play:', err);
    } finally {
      setIsStartingPlayback(false);
    }
  };

  return (
    <div
      className={styles.banner}
      style={{ '--spotlight-glow': glowColor } as React.CSSProperties}
    >
      {/* Background Aurora Radial Mesh */}
      <div className={styles.auroraMesh} />
      <div
        className={styles.auroraArtworkBackdrop}
        style={{ backgroundImage: `url(${coverUrl})` }}
      />

      <div className={styles.content}>
        {/* Left Column: Metadata & Actions */}
        <div className={styles.metaCol}>
          <div className={styles.tagRow}>
            <span className={styles.spotlightTag}>
              <Sparkles size={12} className={styles.sparkleIcon} />
              TODAY&apos;S SPOTLIGHT
            </span>
            <span className={styles.hiresTag}>
              {current.genre || 'Soundtrack'}
            </span>
          </div>

          <h2 className={styles.title}>{current.title}</h2>
          <p className={styles.artist}>
            {current.artistName || 'Various Artists'}
            {current.releaseYear ? ` • ${current.releaseYear}` : ''}
          </p>

          <p className={styles.description}>
            Official Soundtrack Album • {current.totalTracks || 10} Tracks in 320 KBPS Studio Master
          </p>

          <div className={styles.btnRow}>
            <button
              type="button"
              className={styles.playBtn}
              onClick={handlePlaySoundtrack}
              disabled={isStartingPlayback}
              aria-label={`Play ${current.title} soundtrack`}
            >
              <Play size={18} fill="currentColor" />
              <span>{isStartingPlayback ? 'Loading...' : 'Play Soundtrack'}</span>
            </button>

            <Link
              href={`/albums/${current.id}`}
              className={styles.exploreBtn}
              aria-label={`View ${current.title} details`}
            >
              <Disc3 size={18} />
              <span>Explore Album</span>
            </Link>
          </div>
        </div>

        {/* Right Column: Floating Artwork with 3D drop-glow */}
        <div className={styles.artworkCol}>
          <div className={styles.artworkWrapper}>
            <Image
              src={coverUrl}
              alt={current.title}
              width={260}
              height={260}
              priority
              className={styles.artwork}
              unoptimized={coverUrl.startsWith('http')}
            />
            <div className={styles.discPeek}>
              <Music2 size={24} className={styles.discIcon} />
            </div>
          </div>
        </div>
      </div>

      {/* Slide Navigation Controls */}
      <div className={styles.navRow}>
        <button
          type="button"
          onClick={handlePrev}
          className={styles.navBtn}
          aria-label="Previous featured soundtrack"
        >
          <ChevronLeft size={18} />
        </button>

        <div className={styles.dotsRow}>
          {FEATURED_SOUNDTRACKS.slice(0, 6).map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Jump to ${item.title}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className={styles.navBtn}
          aria-label="Next featured soundtrack"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};
