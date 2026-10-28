'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { TrackData, AlbumSummary, PlaylistData } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { TrackCard } from '@/components/music/TrackCard';
import { AlbumCard } from '@/components/music/AlbumCard';
import { HeroSpotlight } from '@/components/home/HeroSpotlight';
import { CategoryGrid } from '@/components/home/CategoryGrid';
import { LocalLibrary } from '@/lib/storage/localLibrary';
import { usePlayerStore } from '@/store/playerStore';
import {
  Sparkles,
  UploadCloud,
  Library,
  Disc,
  Film,
  Settings,
  Compass,
  Flame,
  History,
  Play,
  LayoutGrid,
  List,
  Music2,
  Headphones,
} from 'lucide-react';
import styles from './page.module.css';

type LanguageFilter = 'all' | 'malayalam' | 'tamil' | 'hindi';

export default function HomePage() {
  const [greeting, setGreeting] = useState('Good music');
  const [recentlyPlayed, setRecentlyPlayed] = useState<TrackData[]>([]);
  const [spotlightTracks, setSpotlightTracks] = useState<TrackData[]>([]);
  const [trendingAll, setTrendingAll] = useState<TrackData[]>([]);
  const [malayalamTrending, setMalayalamTrending] = useState<TrackData[]>([]);
  const [tamilTrending, setTamilTrending] = useState<TrackData[]>([]);
  const [hindiTrending, setHindiTrending] = useState<TrackData[]>([]);
  const [newAlbums, setNewAlbums] = useState<AlbumSummary[]>([]);
  const [hiResTracks, setHiResTracks] = useState<TrackData[]>([]);
  const [localAlbums, setLocalAlbums] = useState<AlbumSummary[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageFilter>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [loading, setLoading] = useState(true);

  const { playTrack } = usePlayerStore();

  // Load recently played tracks from LocalLibrary
  const refreshRecentlyPlayed = useCallback(() => {
    const list = LocalLibrary.getRecentlyPlayed();
    setRecentlyPlayed(list);
  }, []);

  useEffect(() => {
    // Dynamic greeting based on time of day
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning');
    else if (hour < 18) setGreeting('Good afternoon');
    else setGreeting('Good evening');

    // Initial load of recently played
    refreshRecentlyPlayed();

    // Listen to live updates whenever a song is played
    const handleRecentUpdate = () => {
      refreshRecentlyPlayed();
    };
    window.addEventListener('imusic:recently_played_updated', handleRecentUpdate);

    // Fetch dynamic live trending feed & local library data
    const loadHomeData = async () => {
      try {
        const [trendingRes, tracksRes, albumsRes, playlistsRes] = await Promise.all([
          fetch('/api/trending').catch(() => null),
          fetch('/api/tracks?limit=20').catch(() => null),
          fetch('/api/albums').catch(() => null),
          fetch('/api/playlists').catch(() => null),
        ]);

        if (trendingRes && trendingRes.ok) {
          const trendingData = await trendingRes.json();
          if (trendingData.spotlight) setSpotlightTracks(trendingData.spotlight);
          if (trendingData.trendingAll) setTrendingAll(trendingData.trendingAll);
          if (trendingData.malayalam) setMalayalamTrending(trendingData.malayalam);
          if (trendingData.tamil) setTamilTrending(trendingData.tamil);
          if (trendingData.hindi) setHindiTrending(trendingData.hindi);
          if (trendingData.newAlbums) setNewAlbums(trendingData.newAlbums);
        }

        if (tracksRes && tracksRes.ok) {
          const data = await tracksRes.json();
          const all: TrackData[] = data.tracks || [];
          setHiResTracks(all.filter((t) => t.assets?.some((a) => a.isHiRes)));
        }

        if (albumsRes && albumsRes.ok) {
          const data = await albumsRes.json();
          setLocalAlbums(data.albums || []);
        }

        if (playlistsRes && playlistsRes.ok) {
          const data = await playlistsRes.json();
          setPlaylists(data.playlists || []);
        }
      } catch (err) {
        console.error('Failed to load home catalogue:', err);
      } finally {
        setLoading(false);
      }
    };

    loadHomeData();

    return () => {
      window.removeEventListener('imusic:recently_played_updated', handleRecentUpdate);
    };
  }, [refreshRecentlyPlayed]);

  // Determine which trending tracks to display based on selected language
  const activeTrendingTracks = useMemo(() => {
    switch (selectedLanguage) {
      case 'malayalam':
        return malayalamTrending.length > 0 ? malayalamTrending : trendingAll;
      case 'tamil':
        return tamilTrending.length > 0 ? tamilTrending : trendingAll;
      case 'hindi':
        return hindiTrending.length > 0 ? hindiTrending : trendingAll;
      case 'all':
      default:
        return trendingAll;
    }
  }, [selectedLanguage, malayalamTrending, tamilTrending, hindiTrending, trendingAll]);

  // Combine new albums with local albums
  const displayedAlbums = useMemo(() => {
    const existingIds = new Set(newAlbums.map((a) => a.id));
    const extra = localAlbums.filter((a) => !existingIds.has(a.id));
    return [...newAlbums, ...extra];
  }, [newAlbums, localAlbums]);

  const handlePlayRecentlyPlayedAll = () => {
    if (recentlyPlayed.length > 0) {
      playTrack(recentlyPlayed[0], recentlyPlayed);
    }
  };

  const handlePlayTrendingAll = () => {
    if (activeTrendingTracks.length > 0) {
      playTrack(activeTrendingTracks[0], activeTrendingTracks);
    }
  };

  const hasAnyContent =
    recentlyPlayed.length > 0 ||
    activeTrendingTracks.length > 0 ||
    displayedAlbums.length > 0 ||
    hiResTracks.length > 0;

  return (
    <div className={styles.container}>
      {/* Top Ambient Glow */}
      <div className={styles.ambientTopGlow} />

      {/* Top Header */}
      <header className={styles.header}>
        <div className={styles.greetingBlock}>
          <div className={styles.subGreetingRow}>
            <span className={styles.subGreetingBadge}>AVMusic Hi-Res Studio</span>
            <div className={styles.liveIndicator}>
              <span className={styles.liveDot} />
              <span>LIVE CHARTS 2026</span>
            </div>
          </div>
          <h1 className={styles.greeting}>{greeting}</h1>
        </div>

        <div className={styles.headerActions}>
          <Link
            href="/settings"
            className={styles.iconBtn}
            title="Theme & Audio Settings"
            aria-label="Settings"
          >
            <Settings size={20} />
          </Link>
          <Link
            href="/import"
            className={styles.iconBtn}
            title="Import Music Files"
            aria-label="Import Music Files"
          >
            <UploadCloud size={20} />
          </Link>
        </div>
      </header>

      {/* Top Dynamic Spotlight Aurora Hero (Auto-rotating 2026 Trending Hits) */}
      <HeroSpotlight tracks={spotlightTracks} />

      {/* =========================================================================
          RECENTLY PLAYED SONGS (CARDS)
          ========================================================================= */}
      {recentlyPlayed.length > 0 ? (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <div className={styles.badgeRow}>
                <div className={`${styles.sectionIconWrapper} ${styles.iconCyan}`}>
                  <History size={16} />
                </div>
                <h2 className={styles.sectionTitle}>Recently Played</h2>
                <span className={`${styles.sectionBadge} ${styles.sectionBadgeRecent}`}>
                  {recentlyPlayed.length} TRACKS
                </span>
              </div>
              <span className={styles.sectionSubtitle}>
                Jump right back into your recent listening session
              </span>
            </div>

            <button
              type="button"
              className={styles.sectionActionBtn}
              onClick={handlePlayRecentlyPlayedAll}
              title="Play all recently played tracks"
            >
              <Play size={13} fill="currentColor" />
              <span>Play All</span>
            </button>
          </div>

          <div className={styles.horizontalScroll}>
            {recentlyPlayed.map((track) => (
              <TrackCard
                key={`recent-${track.id}`}
                track={track}
                playlistContext={recentlyPlayed}
              />
            ))}
          </div>
        </section>
      ) : trendingAll.length > 0 ? (
        /* If no history yet, display Quick Picks for you */
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <div className={styles.badgeRow}>
                <div className={`${styles.sectionIconWrapper} ${styles.iconCyan}`}>
                  <Headphones size={16} />
                </div>
                <h2 className={styles.sectionTitle}>Quick Picks For You</h2>
                <span className={`${styles.sectionBadge} ${styles.sectionBadgeRecent}`}>
                  RECOMMENDED
                </span>
              </div>
              <span className={styles.sectionSubtitle}>
                Hand-picked hot singles to kickstart your queue
              </span>
            </div>
          </div>

          <div className={styles.horizontalScroll}>
            {trendingAll.slice(0, 10).map((track) => (
              <TrackCard
                key={`quickpick-${track.id}`}
                track={track}
                playlistContext={trendingAll}
              />
            ))}
          </div>
        </section>
      ) : null}

      {/* =========================================================================
          NEW RELEASES & SOUNDTRACK ALBUMS (2026)
          ========================================================================= */}
      {displayedAlbums.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <div className={styles.badgeRow}>
                <div className={`${styles.sectionIconWrapper} ${styles.iconViolet}`}>
                  <Film size={16} />
                </div>
                <h2 className={styles.sectionTitle}>New Releases &amp; Soundtracks</h2>
                <span className={`${styles.sectionBadge} ${styles.sectionBadgeHires}`}>
                  2026 OFFICIAL
                </span>
              </div>
              <span className={styles.sectionSubtitle}>
                Latest movie albums &amp; master singles in Malayalam, Tamil &amp; Hindi
              </span>
            </div>
          </div>

          <div className={styles.horizontalScroll}>
            {displayedAlbums.map((album) => (
              <AlbumCard key={album.id} album={album} />
            ))}
          </div>
        </section>
      )}

      {/* =========================================================================
          TRENDING RELEASES (MALAYALAM, TAMIL, HINDI PRIORITIZED)
          ========================================================================= */}
      {activeTrendingTracks.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div>
              <div className={styles.badgeRow}>
                <div className={`${styles.sectionIconWrapper} ${styles.iconAmber}`}>
                  <Flame size={16} />
                </div>
                <h2 className={styles.sectionTitle}>Trending Releases</h2>
                <span className={`${styles.sectionBadge} ${styles.sectionBadgeTrending}`}>
                  320 KBPS MASTER
                </span>
              </div>
              <span className={styles.sectionSubtitle}>
                Real-time chart toppers • Malayalam, Tamil &amp; Hindi prioritized
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className={styles.viewSwitcher}>
                <button
                  type="button"
                  className={`${styles.viewSwitchBtn} ${viewMode === 'cards' ? styles.viewSwitchBtnActive : ''}`}
                  onClick={() => setViewMode('cards')}
                  title="Card View"
                  aria-label="Card View"
                >
                  <LayoutGrid size={15} />
                </button>
                <button
                  type="button"
                  className={`${styles.viewSwitchBtn} ${viewMode === 'list' ? styles.viewSwitchBtnActive : ''}`}
                  onClick={() => setViewMode('list')}
                  title="List View"
                  aria-label="List View"
                >
                  <List size={15} />
                </button>
              </div>

              <button
                type="button"
                className={styles.sectionActionBtn}
                onClick={handlePlayTrendingAll}
                title="Play all trending songs"
              >
                <Play size={13} fill="currentColor" />
                <span>Play All</span>
              </button>
            </div>
          </div>

          {/* Language filter pills with distinct vivid neon colors */}
          <div className={styles.filterPillsRow}>
            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedLanguage === 'all' ? styles.filterPillAllActive : ''
              }`}
              onClick={() => setSelectedLanguage('all')}
            >
              <Flame size={14} />
              <span>All Trending</span>
            </button>

            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedLanguage === 'malayalam' ? styles.filterPillMalayalamActive : ''
              }`}
              onClick={() => setSelectedLanguage('malayalam')}
            >
              <span style={{ fontSize: 13 }}>🟢</span>
              <span>Malayalam (മലയാളം)</span>
            </button>

            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedLanguage === 'tamil' ? styles.filterPillTamilActive : ''
              }`}
              onClick={() => setSelectedLanguage('tamil')}
            >
              <span style={{ fontSize: 13 }}>🟡</span>
              <span>Tamil (தமிழ்)</span>
            </button>

            <button
              type="button"
              className={`${styles.filterPill} ${
                selectedLanguage === 'hindi' ? styles.filterPillHindiActive : ''
              }`}
              onClick={() => setSelectedLanguage('hindi')}
            >
              <span style={{ fontSize: 13 }}>🔴</span>
              <span>Hindi (हिन्दी)</span>
            </button>
          </div>

          {/* Cards View vs List View */}
          {viewMode === 'cards' ? (
            <div className={styles.horizontalScroll}>
              {activeTrendingTracks.slice(0, 16).map((track) => (
                <TrackCard
                  key={track.id}
                  track={track}
                  playlistContext={activeTrendingTracks}
                />
              ))}
            </div>
          ) : (
            <div className={styles.trackList}>
              {activeTrendingTracks.slice(0, 14).map((track, idx) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  index={idx}
                  playlistContext={activeTrendingTracks}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* =========================================================================
          EXPLORE SOUNDSCAPES & GENRES GRID
          ========================================================================= */}
      <section className={styles.section}>
        <div className={styles.sectionHeaderRow}>
          <div>
            <div className={styles.badgeRow}>
              <div className={`${styles.sectionIconWrapper} ${styles.iconEmerald}`}>
                <Compass size={16} />
              </div>
              <h2 className={styles.sectionTitle}>Explore Soundscapes</h2>
            </div>
            <span className={styles.sectionSubtitle}>
              Curated charts across cinema, retro gold &amp; studio lossless masters
            </span>
          </div>
        </div>
        <CategoryGrid
          activeCategory={selectedLanguage}
          onSelectCategory={(val) => {
            if (val === 'hires') {
              const el = document.getElementById('hires-vault');
              if (el) el.scrollIntoView({ behavior: 'smooth' });
            } else if (val === 'retro') {
              setSelectedLanguage('malayalam');
            } else if (val === 'malayalam' || val === 'tamil' || val === 'hindi' || val === 'all') {
              setSelectedLanguage(val);
            }
          }}
        />
      </section>

      {/* Quick Playlists Bar */}
      {playlists.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionHeaderRow}>
            <div className={styles.badgeRow}>
              <div className={`${styles.sectionIconWrapper} ${styles.iconViolet}`}>
                <Library size={16} />
              </div>
              <h2 className={styles.sectionTitle}>Your Playlists</h2>
            </div>
          </div>
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

      {/* Recently Added Hi-Res Tracks (if any) */}
      {hiResTracks.length > 0 && (
        <section className={styles.section} id="hires-vault">
          <div className={styles.sectionHeaderRow}>
            <div className={styles.badgeRow}>
              <div className={`${styles.sectionIconWrapper} ${styles.iconAmber}`}>
                <Sparkles size={16} />
              </div>
              <h2 className={styles.sectionTitle}>Hi-Res Lossless Vault</h2>
              <span className={`${styles.sectionBadge} ${styles.sectionBadgeHires}`}>
                24-BIT / 96kHz
              </span>
            </div>
          </div>
          <div className={styles.trackList}>
            {hiResTracks.slice(0, 6).map((track, idx) => (
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

      {/* Empty State if completely blank and done loading */}
      {!loading && !hasAnyContent && (
        <div className={styles.emptyState}>
          <Disc size={48} className={styles.emptyIcon} />
          <h2>Your Audio Vault is Empty</h2>
          <p>Import your own lossless FLAC files or stream authorized online tracks.</p>
          <div style={{ marginTop: 8 }}>
            <Link href="/import" className={styles.primaryBtn}>
              <UploadCloud size={18} /> Ingest FLAC / Audio Files
            </Link>
          </div>
        </div>
      )}

      {/* SEO & Discoverability Footer for Crawlers & Users */}
      <footer className={styles.seoFooter}>
        <h2 className={styles.seoFooterTitle}>AVMusic — Lossless &amp; Hi-Res Music Streaming</h2>
        <p className={styles.seoFooterDesc}>
          AVMusic is an ad-free Progressive Web App designed for audiophile bit-perfect sound. Stream your favorite songs in 320 kbps &amp; FLAC, import playlists directly from Spotify or YouTube, and enjoy seamless background playback with lockscreen controls on iPhone, Android, and Desktop.
        </p>
        <nav className={styles.seoFooterLinks} aria-label="Explore AVMusic">
          <Link href="/search" className={styles.seoFooterLink}>Search Music</Link>
          <Link href="/library" className={styles.seoFooterLink}>Your Library &amp; Playlists</Link>
          <Link href="/import" className={styles.seoFooterLink}>Import Spotify &amp; Audio</Link>
          <Link href="/settings" className={styles.seoFooterLink}>Audio &amp; Equalizer Settings</Link>
        </nav>
      </footer>
    </div>
  );
}
