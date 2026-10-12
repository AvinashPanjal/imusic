'use client';

import React, { useState, useEffect } from 'react';
import { Search as SearchIcon, X, History, Film, Music2, User, AlertCircle } from 'lucide-react';
import { TrackData, AlbumSummary, ArtistSummary } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { AlbumCard } from '@/components/music/AlbumCard';
import styles from './search.module.css';

const RECENT_SEARCHES_KEY = 'imusic_recent_searches_v1';

export default function SearchPage() {
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
          // Aggregate from all providers
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

          // Save to recent searches
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

  const hasResults =
    results.tracks.length > 0 || results.albums.length > 0 || results.artists.length > 0;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Search</h1>
        <div className={styles.searchBar}>
          <SearchIcon size={20} className={styles.searchIcon} />
          <input
            type="search"
            placeholder="Search movies, songs, artists..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.input}
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
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
        </div>

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
                Movie Soundtracks & Playlists ({results.albums.length})
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

      {/* Recent Searches */}
      {!query && recentSearches.length > 0 && (
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

      {/* Empty State when no results found */}
      {!loading && debouncedQuery && !hasResults && (
        <div className={styles.noResults}>
          <AlertCircle size={40} className={styles.noResultsIcon} />
          <h2>No matching audio found</h2>
          <p>
            No results for &ldquo;{debouncedQuery}&rdquo;. Try searching for movie names like &ldquo;Bethlehem Kudumba Unit&rdquo;, &ldquo;Leo&rdquo;, or &ldquo;Aavesham&rdquo;.
          </p>
        </div>
      )}

      {/* Results View */}
      {!loading && hasResults && (
        <div className={styles.resultsContainer}>
          {/* 1. MOVIE SOUNDTRACKS & PLAYLISTS (FEATURED FIRST) */}
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

          {/* 2. SONGS */}
          {(activeTab === 'all' || activeTab === 'songs') && results.tracks.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitleRow}>
                <Music2 size={20} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>Songs ({results.tracks.length})</h2>
              </div>
              <div className={styles.trackList}>
                {results.tracks.map((track, idx) => (
                  <TrackListItem
                    key={`${track.id}-${idx}`}
                    track={track}
                    index={idx}
                    playlistContext={results.tracks}
                  />
                ))}
              </div>
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
