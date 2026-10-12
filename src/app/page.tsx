'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { TrackData, AlbumSummary, PlaylistData } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { AlbumCard } from '@/components/music/AlbumCard';
import { Sparkles, UploadCloud, Library, Play, Compass, Disc, Radio, ExternalLink } from 'lucide-react';
import styles from './page.module.css';

export default function HomePage() {
  const [greeting, setGreeting] = useState('Welcome');
  const [recentTracks, setRecentTracks] = useState<TrackData[]>([]);
  const [hiResTracks, setHiResTracks] = useState<TrackData[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [openTracks, setOpenTracks] = useState<TrackData[]>([]);
  const [onlineTrending, setOnlineTrending] = useState<TrackData[]>([]);
  const [indianTracks, setIndianTracks] = useState<TrackData[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<'all' | 'tamil' | 'malayalam' | 'hindi'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Dynamic greeting based on time of day
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    // Fetch initial data
    const loadHomeData = async () => {
      try {
        const [tracksRes, albumsRes, playlistsRes, searchRes] = await Promise.all([
          fetch('/api/tracks?limit=20'),
          fetch('/api/albums'),
          fetch('/api/playlists'),
          fetch('/api/search?q='),
        ]);

        if (tracksRes.ok) {
          const data = await tracksRes.json();
          const all: TrackData[] = data.tracks || [];
          setRecentTracks(all.slice(0, 6));
          setHiResTracks(all.filter((t) => t.assets?.some((a) => a.isHiRes)));
        }

        if (albumsRes.ok) {
          const data = await albumsRes.json();
          setAlbums(data.albums || []);
        }

        if (playlistsRes.ok) {
          const data = await playlistsRes.json();
          setPlaylists(data.playlists || []);
        }

        if (searchRes.ok) {
          const data = await searchRes.json();
          // Extract Indian mainstream music
          const indianProvider = data.results?.find((r: any) => r.providerCode === 'indian_music_vault');
          if (indianProvider) {
            setIndianTracks(indianProvider.tracks || []);
          }

          // Extract open-licensed and online trending catalogue items
          const openProvider = data.results?.find((r: any) => r.providerCode === 'open_licensed');
          if (openProvider) {
            setOpenTracks(openProvider.tracks || []);
          }

          const onlineProvider = data.results?.find((r: any) => r.providerCode === 'audius_online');
          if (onlineProvider) {
            setOnlineTrending(onlineProvider.tracks || []);
          }
        }
      } catch (err) {
        console.error('Failed to load home catalogue:', err);
      } finally {
        setLoading(false);
      }
    };

    loadHomeData();
  }, []);

  const hasAnyContent =
    recentTracks.length > 0 ||
    openTracks.length > 0 ||
    onlineTrending.length > 0 ||
    indianTracks.length > 0;

  const filteredIndianTracks = indianTracks.filter((t) => {
    if (selectedLanguage === 'all') return true;
    const g = (t.genre || '').toLowerCase();
    return g.includes(selectedLanguage);
  });

  return (
    <div className={styles.container}>
      {/* Top Header */}
      <header className={styles.header}>
        <div>
          <span className={styles.subGreeting}>iPhone Hi-Res PWA</span>
          <h1 className={styles.greeting}>{greeting}</h1>
        </div>
        <div className={styles.headerActions}>
          <Link href="/import" className={styles.iconBtn} title="Import Music Files" aria-label="Import Music Files">
            <UploadCloud size={20} />
          </Link>
        </div>
      </header>

      {/* Hi-Res Lossless Audio Banner */}
      <section className={styles.audiophileBanner}>
        <div className={styles.bannerGlow} />
        <div className={styles.bannerContent}>
          <div className={styles.bannerBadge}>
            <Sparkles size={12} />
            <span>Audiophile Grade</span>
          </div>
          <h2 className={styles.bannerTitle}>Ad-Free Stream Engine</h2>
          <p className={styles.bannerText}>
            Stream direct 320kbps Tamil, Malayalam, Hindi, and Global tracks without ads. Full Lock Screen controls on iPhone.
          </p>
        </div>
      </section>

      {/* Mainstream Indian Hits Section (Tamil, Malayalam, Hindi) */}
      {indianTracks.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <div className={styles.badgeRow}>
                <h2 className={styles.sectionTitle}>Latest Indian Hits</h2>
                <span className={styles.sectionBadge}>320 KBPS AAC</span>
              </div>
              <span className={styles.sectionSubtitle}>
                Top trending Tamil, Malayalam & Bollywood releases
              </span>
            </div>
          </div>

          {/* Language filter pills */}
          <div className={styles.horizontalScroll}>
            <button
              type="button"
              className={`${styles.filterPill} ${selectedLanguage === 'all' ? styles.filterPillActive : ''}`}
              onClick={() => setSelectedLanguage('all')}
            >
              All Languages
            </button>
            <button
              type="button"
              className={`${styles.filterPill} ${selectedLanguage === 'tamil' ? styles.filterPillActive : ''}`}
              onClick={() => setSelectedLanguage('tamil')}
            >
              Tamil (தமிழ்)
            </button>
            <button
              type="button"
              className={`${styles.filterPill} ${selectedLanguage === 'malayalam' ? styles.filterPillActive : ''}`}
              onClick={() => setSelectedLanguage('malayalam')}
            >
              Malayalam (മലയാളം)
            </button>
            <button
              type="button"
              className={`${styles.filterPill} ${selectedLanguage === 'hindi' ? styles.filterPillActive : ''}`}
              onClick={() => setSelectedLanguage('hindi')}
            >
              Hindi (हिन्दी)
            </button>
          </div>

          <div className={styles.trackList}>
            {(filteredIndianTracks.length > 0 ? filteredIndianTracks : indianTracks)
              .slice(0, 10)
              .map((track, idx) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  index={idx}
                  playlistContext={filteredIndianTracks.length > 0 ? filteredIndianTracks : indianTracks}
                />
              ))}
          </div>
        </section>
      )}

      {/* Empty State if completely blank */}
      {!loading && !hasAnyContent && (
        <div className={styles.emptyState}>
          <Disc size={48} className={styles.emptyIcon} />
          <h2>Your Audio Vault is Empty</h2>
          <p>Import your own lossless FLAC files or stream authorized open-licensed tracks.</p>
          <div className={styles.emptyActions}>
            <Link href="/import" className={styles.primaryBtn}>
              <UploadCloud size={18} /> Ingest FLAC / Audio Files
            </Link>
          </div>
        </div>
      )}

      {/* Quick Playlists Bar */}
      {playlists.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your Playlists</h2>
          <div className={styles.horizontalScroll}>
            {playlists.map((pl) => (
              <Link key={pl.id} href={`/playlists/${pl.id}`} className={styles.playlistPill}>
                <div className={styles.playlistPillArt}>
                  <Library size={16} />
                </div>
                <span className={styles.playlistPillTitle}>{pl.title}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recently Added Hi-Res Tracks */}
      {hiResTracks.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div className={styles.badgeRow}>
              <h2 className={styles.sectionTitle}>Hi-Res Lossless Vault</h2>
              <span className={styles.sectionBadge}>24-BIT / 96kHz</span>
            </div>
          </div>
          <div className={styles.trackList}>
            {hiResTracks.slice(0, 4).map((track, idx) => (
              <TrackListItem
                key={track.id}
                track={track}
                index={idx}
                playlistContext={hiResTracks}
              />
            ))}
          </div>
        </section>
      )}

      {/* Recently Played / Library Tracks */}
      {recentTracks.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <h2 className={styles.sectionTitle}>Recently Added to Library</h2>
            <Link href="/library" className={styles.seeAll}>See All</Link>
          </div>
          <div className={styles.trackList}>
            {recentTracks.map((track, idx) => (
              <TrackListItem
                key={track.id}
                track={track}
                index={idx}
                playlistContext={recentTracks}
              />
            ))}
          </div>
        </section>
      )}

      {/* Albums Grid */}
      {albums.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Featured Albums</h2>
          <div className={styles.horizontalScroll}>
            {albums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}

      {/* Open-Licensed CC Audio Section */}
      {openTracks.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <h2 className={styles.sectionTitle}>Open-Licensed Master Recordings</h2>
              <span className={styles.sectionSubtitle}>Authorized Creative Commons lossless streams</span>
            </div>
          </div>
          <div className={styles.trackList}>
            {openTracks.map((track, idx) => (
              <TrackListItem
                key={track.id}
                track={track}
                index={idx}
                playlistContext={openTracks}
              />
            ))}
          </div>
        </section>
      )}

      {/* Live Online Free Music Section */}
      {onlineTrending.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <div className={styles.badgeRow}>
                <h2 className={styles.sectionTitle}>Online Free Music Vault</h2>
                <span className={styles.sectionBadge}>1M+ AD-FREE TRACKS</span>
              </div>
              <span className={styles.sectionSubtitle}>
                Instant in-app streaming with zero advertisements or accounts
              </span>
            </div>
          </div>
          <div className={styles.trackList}>
            {onlineTrending.slice(0, 8).map((track, idx) => (
              <TrackListItem
                key={track.id}
                track={track}
                index={idx}
                playlistContext={onlineTrending}
              />
            ))}
          </div>
        </section>
      )}

      {/* Commercial Metadata Handoff Info */}
      <section className={styles.handoffSection}>
        <div className={styles.handoffHeader}>
          <Radio size={18} className={styles.handoffIcon} />
          <h3>Looking for Mainstream Catalogues?</h3>
        </div>
        <p>
          Copyright-protected commercial streaming services require proprietary apps and subscriptions.
          Search in the Search tab to inspect metadata and initiate official handoffs to Apple Music or Spotify without ads or pirated streams.
        </p>
      </section>
    </div>
  );
}
