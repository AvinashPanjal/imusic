'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search as SearchIcon, X, History, Film, Music2, User, Play, AlertCircle, Sparkles } from 'lucide-react';
import { TrackData, AlbumSummary, ArtistSummary } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { AlbumCard } from '@/components/music/AlbumCard';
import { usePlayerStore } from '@/store/playerStore';
import { normalizeSearchText, cleanQuery } from '@/lib/providers/IndianMusicProvider';
import styles from './search.module.css';

const RECENT_SEARCHES_KEY = 'imusic_recent_searches_v1';

const POPULAR_SOUNDTRACKS: AlbumSummary[] = [
  {
    id: 'saavn-album-79759837',
    title: 'Bethlehem Kudumba Unit',
    artistName: 'Vishnu Vijay',
    coverImage: 'https://c.saavncdn.com/569/Bethlehem-Kudumba-Unit-Malayalam-2026-20260901164324-500x500.jpg',
    releaseYear: 2026,
    genre: 'Malayalam / Soundtrack',
    isLossless: true,
  },
  {
    id: 'saavn-album-55472703',
    title: 'Indrajaalam',
    artistName: 'S. P. Venkatesh, Mohanlal',
    coverImage: 'https://c.saavncdn.com/494/Indrajaalam-Malayalam-2024-20250403152648-500x500.jpg',
    releaseYear: 1990,
    genre: 'Malayalam / Classic Soundtrack',
    isLossless: true,
  },
  {
    id: 'saavn-album-49113982',
    title: 'Leo',
    artistName: 'Anirudh Ravichander',
    coverImage: 'https://c.saavncdn.com/415/Leo-Original-Motion-Picture-Soundtrack-English-2023-20231019170311-500x500.jpg',
    releaseYear: 2023,
    genre: 'Tamil / Soundtrack',
    isLossless: true,
  },
  {
    id: 'saavn-album-52210422',
    title: 'Aavesham',
    artistName: 'Sushin Shyam',
    coverImage: 'https://c.saavncdn.com/202/Aavesham-Original-Motion-Picture-Soundtrack-Malayalam-2024-20240411130634-500x500.jpg',
    releaseYear: 2024,
    genre: 'Malayalam / Soundtrack',
    isLossless: true,
  },
  {
    id: 'saavn-album-47094777',
    title: 'Jailer',
    artistName: 'Anirudh Ravichander',
    coverImage: 'https://c.saavncdn.com/777/Jailer-Tamil-2023-20230728183015-500x500.jpg',
    releaseYear: 2023,
    genre: 'Tamil / Soundtrack',
    isLossless: true,
  },
  {
    id: 'saavn-album-51419924',
    title: 'Manjummel Boys',
    artistName: 'Sushin Shyam',
    coverImage: 'https://c.saavncdn.com/924/Manjummel-Boys-Original-Motion-Picture-Soundtrack-Malayalam-2024-20240222041203-500x500.jpg',
    releaseYear: 2024,
    genre: 'Malayalam / Soundtrack',
    isLossless: true,
  },
  {
    id: 'saavn-album-49986024',
    title: 'ANIMAL',
    artistName: 'Pritam',
    coverImage: 'https://c.saavncdn.com/024/ANIMAL-Hindi-2023-20231124191427-500x500.jpg',
    releaseYear: 2023,
    genre: 'Hindi / Soundtrack',
    isLossless: true,
  },
  {
    id: 'saavn-album-35003732',
    title: 'Vikram',
    artistName: 'Anirudh Ravichander',
    coverImage: 'https://c.saavncdn.com/732/Vikram-Tamil-2022-20220515182605-500x500.jpg',
    releaseYear: 2022,
    genre: 'Tamil / Soundtrack',
    isLossless: true,
  },
  {
    id: 'saavn-album-25118096',
    title: 'The Highlights',
    artistName: 'The Weeknd',
    coverImage: 'https://c.saavncdn.com/396/The-Highlights-English-2021-20240207045714-500x500.jpg',
    releaseYear: 2021,
    genre: 'Global / Pop',
    isLossless: true,
  },
];

export default function SearchPage() {
  const router = useRouter();
  const { playTrack } = usePlayerStore();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'songs' | 'artists'>('all');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    tracks: TrackData[];
    albums: AlbumSummary[];
    artists: ArtistSummary[];
  }>({ tracks: [], albums: [], artists: [] });

  // Load recent searches from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(RECENT_SEARCHES_KEY);
      if (saved) {
        setRecentSearches(JSON.parse(saved));
      }
    } catch {
      // Ignore
    }
  }, []);

  // Debounce input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Execute search across providers
  useEffect(() => {
    if (!debouncedQuery) {
      setResults({ tracks: [], albums: [], artists: [] });
      setLoading(false);
      return;
    }

    setLoading(true);

    const performSearch = async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
        if (res.ok) {
          const data = await res.json();
          const aggregatedTracks: TrackData[] = [];
          const aggregatedAlbums: AlbumSummary[] = [];
          const aggregatedArtists: ArtistSummary[] = [];

          if (data.results && Array.isArray(data.results)) {
            for (const providerResult of data.results) {
              if (providerResult.tracks) aggregatedTracks.push(...providerResult.tracks);
              if (providerResult.albums) aggregatedAlbums.push(...providerResult.albums);
              if (providerResult.artists) aggregatedArtists.push(...providerResult.artists);
            }
          }

          // Deduplicate albums by ID
          const seenAlbumIds = new Set<string>();
          const uniqueAlbums = aggregatedAlbums.filter((a) => {
            if (seenAlbumIds.has(a.id)) return false;
            seenAlbumIds.add(a.id);
            return true;
          });

          // Deduplicate tracks by ID
          const seenTrackIds = new Set<string>();
          const uniqueTracks = aggregatedTracks.filter((t) => {
            if (seenTrackIds.has(t.id)) return false;
            seenTrackIds.add(t.id);
            return true;
          });

          setResults({
            tracks: uniqueTracks,
            albums: uniqueAlbums,
            artists: aggregatedArtists,
          });

          saveRecentSearch(debouncedQuery);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery]);

  const saveRecentSearch = (term: string) => {
    if (!term || term.length < 2) return;
    try {
      const updated = [term, ...recentSearches.filter((s) => s.toLowerCase() !== term.toLowerCase())].slice(0, 8);
      setRecentSearches(updated);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
  };

  const handleClearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem(RECENT_SEARCHES_KEY);
  };

  const clearInput = () => {
    setQuery('');
    setDebouncedQuery('');
    setResults({ tracks: [], albums: [], artists: [] });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(query.trim());
  };

  // Top Result determination (Spotify style with phonetic normalization & cleanQuery)
  const topAlbum = results.albums.length > 0 ? results.albums[0] : null;
  const topTrack = results.tracks.length > 0 ? results.tracks[0] : null;

  const normQuery = normalizeSearchText(debouncedQuery);
  const cleanNormQ = normalizeSearchText(cleanQuery(debouncedQuery));
  const normAlbumTitle = topAlbum ? normalizeSearchText(topAlbum.title) : '';
  const normTrackTitle = topTrack ? normalizeSearchText(topTrack.title) : '';

  const isTrackExact = Boolean(
    normTrackTitle &&
      (normTrackTitle === normQuery ||
        (cleanNormQ && normTrackTitle === cleanNormQ) ||
        normTrackTitle.startsWith(normQuery) ||
        (cleanNormQ && normTrackTitle.startsWith(cleanNormQ)))
  );

  const isAlbumExact = Boolean(
    normAlbumTitle &&
      (normAlbumTitle === normQuery ||
        (cleanNormQ && normAlbumTitle === cleanNormQ) ||
        normAlbumTitle.startsWith(normQuery) ||
        (cleanNormQ && normAlbumTitle.startsWith(cleanNormQ)))
  );

  // Check if query explicitly asks for a soundtrack, album, or movie
  const queryLower = debouncedQuery.toLowerCase();
  const isExplicitAlbumSearch = /\b(soundtrack|album|movie|film|playlist|ost)\b/.test(queryLower);

  // If there is an exact or strong track match, Song ALWAYS wins Top Result (just like Spotify!)
  const isTopMatchAlbum = Boolean(
    topAlbum &&
      (isExplicitAlbumSearch ||
        (!isTrackExact &&
          (isAlbumExact ||
            normAlbumTitle.includes(normQuery) ||
            normQuery.includes(normAlbumTitle) ||
            topAlbum.title.toLowerCase().includes(queryLower) ||
            queryLower.includes(topAlbum.title.toLowerCase()))))
  );

  const handlePlayTopResult = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isTopMatchAlbum && topAlbum) {
      try {
        const res = await fetch(`/api/albums/${topAlbum.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.album?.tracks?.length > 0) {
            // Find track in album that matches the search query
            const matchingTrackIdx = data.album.tracks.findIndex((t: TrackData) => {
              const tNorm = normalizeSearchText(t.title);
              return (
                tNorm === normQuery ||
                (cleanNormQ && tNorm === cleanNormQ) ||
                tNorm.includes(normQuery) ||
                normQuery.includes(tNorm)
              );
            });
            const playIdx = matchingTrackIdx >= 0 ? matchingTrackIdx : 0;
            playTrack(data.album.tracks[playIdx], data.album.tracks, playIdx);
            return;
          }
        }
      } catch {}
      router.push(`/albums/${topAlbum.id}`);
    } else if (topTrack) {
      playTrack(topTrack, results.tracks, 0);
    }
  };

  const hasResults =
    results.tracks.length > 0 || results.albums.length > 0 || results.artists.length > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Search</h1>
        <form onSubmit={handleFormSubmit} className={styles.searchBar}>
          <SearchIcon size={20} className={styles.searchIcon} />
          <input
            type="search"
            placeholder="Search movie soundtracks, songs, artists..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.input}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            enterKeyHint="search"
            aria-label="Search catalogue"
          />
          {query && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={clearInput}
              aria-label="Clear search input"
            >
              <X size={18} />
            </button>
          )}
        </form>

        {/* Category Tabs for Fast Filter */}
        {hasResults && (
          <div className={styles.filterRow}>
            <button
              type="button"
              className={`${styles.filterPill} ${activeTab === 'all' ? styles.filterPillActive : ''}`}
              onClick={() => setActiveTab('all')}
            >
              All Results
            </button>
            {results.albums.length > 0 && (
              <button
                type="button"
                className={`${styles.filterPill} ${activeTab === 'movies' ? styles.filterPillActive : ''}`}
                onClick={() => setActiveTab('movies')}
              >
                Movie Soundtracks ({results.albums.length})
              </button>
            )}
            {results.tracks.length > 0 && (
              <button
                type="button"
                className={`${styles.filterPill} ${activeTab === 'songs' ? styles.filterPillActive : ''}`}
                onClick={() => setActiveTab('songs')}
              >
                Songs ({results.tracks.length})
              </button>
            )}
            {results.artists.length > 0 && (
              <button
                type="button"
                className={`${styles.filterPill} ${activeTab === 'artists' ? styles.filterPillActive : ''}`}
                onClick={() => setActiveTab('artists')}
              >
                Artists ({results.artists.length})
              </button>
            )}
          </div>
        )}
      </header>

      {/* Loading state */}
      {loading && (
        <div className={styles.loadingState}>
          <div className={styles.spinner} />
          <span>Searching 50M+ tracks and movie soundtracks...</span>
        </div>
      )}

      {/* Browse Trending Soundtracks When Input is Empty */}
      {!query && (
        <div className={styles.resultsContainer}>
          {recentSearches.length > 0 && (
            <section className={styles.recentSection}>
              <div className={styles.recentHeader}>
                <div className={styles.recentTitleRow}>
                  <History size={16} />
                  <h2>Recent Searches</h2>
                </div>
                <button
                  type="button"
                  className={styles.clearRecentBtn}
                  onClick={handleClearRecent}
                >
                  Clear
                </button>
              </div>
              <div className={styles.pillsList}>
                {recentSearches.map((term) => (
                  <button
                    key={term}
                    type="button"
                    className={styles.searchPill}
                    onClick={() => setQuery(term)}
                  >
                    {term}
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className={styles.section}>
            <div className={styles.sectionTitleRow}>
              <Film size={20} className={styles.sectionIcon} />
              <h2 className={styles.sectionTitle}>Popular Movie Soundtracks</h2>
            </div>
            <div className={styles.albumsGrid}>
              {POPULAR_SOUNDTRACKS.map((album) => (
                <AlbumCard key={album.id} album={album} />
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Empty State when no results found */}
      {!loading && debouncedQuery && !hasResults && (
        <div className={styles.noResults}>
          <AlertCircle size={40} className={styles.noResultsIcon} />
          <h2>No matching audio found</h2>
          <p>
            No results for &ldquo;{debouncedQuery}&rdquo;. Try searching for &ldquo;Bethlehem Kudumba Unit&rdquo;, &ldquo;Leo&rdquo;, or &ldquo;Aavesham&rdquo;.
          </p>
        </div>
      )}

      {/* Results View */}
      {!loading && hasResults && (
        <div className={styles.resultsContainer}>
          {/* SPOTIFY-STYLE TOP RESULT CARD */}
          {activeTab === 'all' && (isTopMatchAlbum ? topAlbum : topTrack) && (
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Top Result</h2>
              <div
                className={styles.topResultCard}
                onClick={() => {
                  if (isTopMatchAlbum && topAlbum) {
                    router.push(`/albums/${topAlbum.id}`);
                  } else if (topTrack) {
                    playTrack(topTrack, results.tracks, 0);
                  }
                }}
              >
                <div className={styles.topResultMain}>
                  <Image
                    src={
                      (isTopMatchAlbum ? topAlbum?.coverImage : topTrack?.album?.coverImage) ||
                      '/icons/default-artwork.png'
                    }
                    alt={(isTopMatchAlbum ? topAlbum?.title : topTrack?.title) || 'Result'}
                    width={76}
                    height={76}
                    className={styles.topResultArt}
                    unoptimized
                  />
                  <div className={styles.topResultMeta}>
                    <span className={styles.topResultBadge}>
                      {isTopMatchAlbum ? 'Movie Soundtrack / Playlist' : 'Song'}
                    </span>
                    <h3 className={styles.topResultTitle}>
                      {isTopMatchAlbum ? topAlbum?.title : topTrack?.title}
                    </h3>
                    <p className={styles.topResultSubtitle}>
                      {isTopMatchAlbum
                        ? `${topAlbum?.artistName || 'Soundtrack'} • ${topAlbum?.releaseYear || 2026}`
                        : `${topTrack?.artists?.map((a) => a.name).join(', ')} • ${topTrack?.album?.title || 'Single'}`}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  className={styles.topResultPlayBtn}
                  onClick={handlePlayTopResult}
                  aria-label="Play Top Result"
                >
                  <Play size={22} fill="currentColor" style={{ marginLeft: 2 }} />
                </button>
              </div>
            </section>
          )}

          {/* 1. SONGS (DIRECTLY UNDER TOP RESULT FOR INSTANT PLAYBACK) */}
          {(activeTab === 'all' || activeTab === 'songs') && results.tracks.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitleRow}>
                <Music2 size={20} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>
                  {activeTab === 'all' ? 'Songs' : `Songs (${results.tracks.length})`}
                </h2>
              </div>
              <div className={styles.trackList}>
                {(activeTab === 'all' ? results.tracks.slice(0, 5) : results.tracks).map((track, idx) => (
                  <TrackListItem
                    key={`${track.id}-${idx}`}
                    track={track}
                    index={idx}
                    playlistContext={results.tracks}
                  />
                ))}
              </div>
              {activeTab === 'all' && results.tracks.length > 5 && (
                <button
                  type="button"
                  className={styles.seeAllBtn}
                  onClick={() => setActiveTab('songs')}
                >
                  See all {results.tracks.length} songs →
                </button>
              )}
            </section>
          )}

          {/* 2. MOVIE SOUNDTRACKS & PLAYLISTS */}
          {(activeTab === 'all' || activeTab === 'movies') && results.albums.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitleRow}>
                <Film size={20} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>
                  Movie Soundtracks & Playlists ({results.albums.length})
                </h2>
              </div>

              {activeTab === 'all' ? (
                <div className={styles.albumsGrid}>
                  {results.albums.map((album) => (
                    <AlbumCard key={album.id} album={album} />
                  ))}
                </div>
              ) : (
                <div className={styles.albumsFullGrid}>
                  {results.albums.map((album) => (
                    <AlbumCard key={album.id} album={album} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* 3. ARTISTS */}
          {(activeTab === 'all' || activeTab === 'artists') && results.artists.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitleRow}>
                <User size={20} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>Artists ({results.artists.length})</h2>
              </div>
              <div className={styles.artistsGrid}>
                {results.artists.map((artist) => (
                  <div key={artist.id} className={styles.artistPill}>
                    <div className={styles.artistAvatar}>
                      {artist.name.charAt(0)}
                    </div>
                    <span className={styles.artistName}>{artist.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
