'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { TrackData } from '@/types/music';
import { FEATURED_SOUNDTRACKS, FeaturedSoundtrack } from '@/lib/constants/soundtracks';
import { usePlayerStore } from '@/store/playerStore';
import { extractAmbientColors } from '@/lib/colorExtractor';
import { Play, Sparkles, Disc3, ChevronRight, ChevronLeft, Music2, Radio } from 'lucide-react';
import styles from './HeroSpotlight.module.css';

interface HeroSpotlightProps {
  tracks?: TrackData[];
}

export const HeroSpotlight: React.FC<HeroSpotlightProps> = ({ tracks = [] }) => {
  const [index, setIndex] = useState(0);
  const [glowColor, setGlowColor] = useState('rgba(124, 58, 237, 0.45)');
  const [isStartingPlayback, setIsStartingPlayback] = useState(false);
  const { playTrack, currentTrack, isPlaying } = usePlayerStore();

  const hasDynamicTracks = tracks.length > 0;
  const totalItems = hasDynamicTracks ? Math.min(tracks.length, 6) : FEATURED_SOUNDTRACKS.length;

  // Current item info
  const dynamicTrack = hasDynamicTracks ? tracks[index % totalItems] : null;
  const staticSoundtrack: FeaturedSoundtrack = FEATURED_SOUNDTRACKS[index % FEATURED_SOUNDTRACKS.length] || FEATURED_SOUNDTRACKS[0];

  const title = dynamicTrack ? dynamicTrack.title : staticSoundtrack.title;
  const artistName = dynamicTrack
    ? dynamicTrack.artists?.map((a) => a.name).join(', ')
    : staticSoundtrack.artistName;
  const coverUrl = dynamicTrack
    ? dynamicTrack.album?.coverImage || '/icons/default-artwork.png'
    : staticSoundtrack.coverImage || '/icons/default-artwork.png';
  const releaseYear = dynamicTrack
    ? dynamicTrack.album?.releaseYear || 2026
    : staticSoundtrack.releaseYear || 2026;
  const genre = dynamicTrack ? dynamicTrack.genre || 'Trending Master' : staticSoundtrack.genre || 'Soundtrack';

  const isCurrentPlaying = dynamicTrack ? currentTrack?.id === dynamicTrack.id && isPlaying : false;

  useEffect(() => {
    let active = true;
    extractAmbientColors(coverUrl, title).then((p) => {
      if (active) setGlowColor(p.glow1);
    });
    return () => {
      active = false;
    };
  }, [coverUrl, title]);

  // Auto-advance spotlight every 8 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % totalItems);
    }, 8000);
    return () => clearInterval(timer);
  }, [totalItems]);

  const handleNext = () => {
    setIndex((prev) => (prev + 1) % totalItems);
  };

  const handlePrev = () => {
    setIndex((prev) => (prev - 1 + totalItems) % totalItems);
  };

  const handlePlayHero = async () => {
    if (dynamicTrack) {
      playTrack(dynamicTrack, tracks);
      return;
    }

    // Static fallback
    if (isStartingPlayback) return;
    setIsStartingPlayback(true);
    try {
      const res = await fetch(`/api/albums/${staticSoundtrack.id}`);
      if (res.ok) {
        const data = await res.json();
        const albumTracks = data.album?.tracks || [];
        if (albumTracks.length > 0) {
          playTrack(albumTracks[0], albumTracks);
          setIsStartingPlayback(false);
          return;
        }
      }

      const searchRes = await fetch(`/api/search?q=${encodeURIComponent(staticSoundtrack.title)}`);
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
              SPOTLIGHT
            </span>
            <span className={styles.hiresTag}>
              {genre}
            </span>
          </div>

          <h2 className={styles.title} title={title}>{title}</h2>
          <p className={styles.artist}>
            {artistName || 'Various Artists'}
            {releaseYear ? ` • ${releaseYear}` : ''}
          </p>

          <p className={styles.description}>
            {dynamicTrack
              ? 'Trending release • High-fidelity lossless stereo stream'
              : `Official Soundtrack Album • ${staticSoundtrack.totalTracks || 10} Tracks in 320 KBPS Studio Master`}
          </p>

          <div className={styles.btnRow}>
            <button
              type="button"
              className={styles.playBtn}
              onClick={handlePlayHero}
              disabled={isStartingPlayback}
              aria-label={`Play ${title}`}
            >
              <Play size={18} fill="currentColor" />
              <span>{isStartingPlayback ? 'Loading...' : isCurrentPlaying ? 'Now Playing' : 'Play Track'}</span>
            </button>

            {dynamicTrack?.album?.id ? (
              <Link
                href={`/albums/${dynamicTrack.album.id}`}
                className={styles.exploreBtn}
                aria-label={`View ${title} details`}
              >
                <Disc3 size={18} />
                <span>Explore Album</span>
              </Link>
            ) : (
              <Link
                href={`/albums/${staticSoundtrack.id}`}
                className={styles.exploreBtn}
                aria-label={`View ${title} details`}
              >
                <Disc3 size={18} />
                <span>Explore Album</span>
              </Link>
            )}
          </div>
        </div>

        {/* Right Column: Floating Artwork with 3D drop-glow */}
        <div className={styles.artworkCol}>
          <div className={styles.artworkWrapper}>
            <Image
              src={coverUrl}
              alt={title}
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
          aria-label="Previous featured item"
        >
          <ChevronLeft size={18} />
        </button>

        <div className={styles.dotsRow}>
          {Array.from({ length: totalItems }).map((_, i) => (
            <button
              key={i}
              type="button"
              className={`${styles.dot} ${i === index ? styles.dotActive : ''}`}
              onClick={() => setIndex(i)}
              aria-label={`Jump to item ${i + 1}`}
            />
          ))}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className={styles.navBtn}
          aria-label="Next featured item"
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
};
