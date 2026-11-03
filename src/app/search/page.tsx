'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Search as SearchIcon, X, History, Film, Music2, User, Play, AlertCircle, Sparkles, Shuffle, Disc } from 'lucide-react';
import { TrackData, AlbumSummary, ArtistSummary } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { AlbumCard } from '@/components/music/AlbumCard';
import { usePlayerStore } from '@/store/playerStore';
import { normalizeSearchText, cleanQuery } from '@/lib/providers/IndianMusicProvider';
import { FEATURED_SOUNDTRACKS, fuzzyMatch, cleanSongTitle } from '@/lib/constants/soundtracks';
import styles from './search.module.css';

const RECENT_SEARCHES_KEY = 'imusic_recent_searches_v1';
const POPULAR_SOUNDTRACKS: AlbumSummary[] = FEATURED_SOUNDTRACKS;

function stripLeadingArticles(str: string): string {
  if (!str) return '';
  return str.toLowerCase().replace(/^(the|a|an)\s+/i, '').trim();
}

interface AISearchData {
  originalQuery: string;
  correctedQuery: string;
  intent: 'movie' | 'song' | 'artist' | 'genre' | 'general';
  movieOrAlbum: string | null;
  songName: string | null;
  primaryArtists: string[];
  language: string | null;
  searchVariants?: string[];
  isAiEnhanced: boolean;
}

function computeRelevanceScore(
  title: string,
  artistName: string | undefined,
  query: string,
  isSaavn: boolean,
  albumTitle?: string,
  ai?: AISearchData | null
): number {
  if (!title || !query) return 0;
  const rawClean = cleanSongTitle(title);
  const qClean = query.toLowerCase().trim();
  const qTokens = qClean.split(/\s+/).filter((w) => w.length > 2);

  const titleNoArticle = stripLeadingArticles(title);
  const cleanNoArticle = stripLeadingArticles(rawClean);
  const qNoArticle = stripLeadingArticles(query);

  const normTitle = normalizeSearchText(titleNoArticle);
  const normClean = normalizeSearchText(cleanNoArticle);
  const normQ = normalizeSearchText(qNoArticle);
  const cleanNormQ = normalizeSearchText(cleanQuery(qNoArticle));

  const baseTitle = cleanNoArticle.split('-')[0].trim();
  const normBase = normalizeSearchText(baseTitle);

  let score = 0;

  // AI-guided ranking bonuses
  if (ai?.isAiEnhanced) {
    if (ai.movieOrAlbum && albumTitle) {
      const normAiMovie = normalizeSearchText(stripLeadingArticles(ai.movieOrAlbum));
      const normAlb = normalizeSearchText(albumTitle);
      if (normAlb === normAiMovie || normAlb.startsWith(normAiMovie)) {
        score += 1800;
      } else if (normAlb.includes(normAiMovie) || fuzzyMatch(albumTitle, ai.movieOrAlbum)) {
        score += 1000;
      }
    }

    if (ai.songName) {
      const normAiSong = normalizeSearchText(stripLeadingArticles(ai.songName));
      if (normClean === normAiSong || normBase === normAiSong) {
        score += 2200;
      } else if (normClean.startsWith(normAiSong)) {
        score += 1400;
      } else if (normClean.includes(normAiSong) || fuzzyMatch(rawClean, ai.songName)) {
        score += 800;
      }
    }

    if (ai.correctedQuery) {
      const normAiQ = normalizeSearchText(stripLeadingArticles(ai.correctedQuery));
      if (normClean === normAiQ || normBase === normAiQ) {
        score += 1200;
      } else if (normClean.startsWith(normAiQ)) {
        score += 600;
      } else if (normClean.includes(normAiQ)) {
        score += 350;
      }
    }

    if (ai.primaryArtists && ai.primaryArtists.length > 0 && artistName) {
      const normArtist = normalizeSearchText(artistName);
      if (ai.primaryArtists.some((pa) => normArtist.includes(normalizeSearchText(pa)))) {
        score += 200;
      }
    }
  }

  // 1. Exact clean match or base title match without leading articles
  if (
    normClean === normQ ||
    normBase === normQ ||
    (cleanNormQ && (normClean === cleanNormQ || normBase === cleanNormQ)) ||
    normTitle === normQ
  ) {
    score += 1000;
  }
  // 2. Starts with query without leading articles
  else if (
    normClean.startsWith(normQ) ||
    normBase.startsWith(normQ) ||
    (cleanNormQ && (normClean.startsWith(cleanNormQ) || normBase.startsWith(cleanNormQ))) ||
    normTitle.startsWith(normQ)
  ) {
    score += 500;
  }
  // 3. Contains all query tokens
  else if (qTokens.length > 0 && qTokens.every((t) => title.toLowerCase().includes(t))) {
    score += 300;
  }
  // 4. Fuzzy match
  else if (fuzzyMatch(rawClean, query) || fuzzyMatch(title, query)) {
    score += 150;
  }

  // Boost official Indian studio tracks (lossless 320kbps AAC, plays in background)
  if (isSaavn) {
    score += 50;
  }

  // Penalize instrumentals / karaoke / covers unless the user explicitly searched for them
  if (!qClean.includes('instrumental') && title.toLowerCase().includes('instrumental')) {
    score -= 250;
  }
  if (!qClean.includes('karaoke') && title.toLowerCase().includes('karaoke')) {
    score -= 250;
  }
  if (!qClean.includes('cover') && title.toLowerCase().includes('cover')) {
    score -= 100;
  }

  return score;
}

export default function SearchPage() {
  const router = useRouter();
  const { playTrack, toggleShuffle } = usePlayerStore();

  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'movies' | 'songs' | 'artists'>('all');
  const [loading, setLoading] = useState(false);
  const [aiInfo, setAiInfo] = useState<AISearchData | null>(null);
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
      setAiInfo(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    const performSearch = async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);
        if (res.ok) {
          const data = await res.json();
          const ai: AISearchData | null = data.ai || null;
          setAiInfo(ai);

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

          // Deduplicate tracks by ID and sort by query relevance
          const seenTrackIds = new Set<string>();
          let uniqueTracks = aggregatedTracks.filter((t) => {
            if (seenTrackIds.has(t.id)) return false;
            seenTrackIds.add(t.id);
            return true;
          });

          // Intelligent relevance sorting to guarantee exact matches are #1
          if (debouncedQuery) {
            uniqueTracks.sort((a, b) => {
              const isSaavnA = a.id.startsWith('saavn');
              const isSaavnB = b.id.startsWith('saavn');
              const scoreA = computeRelevanceScore(a.title, a.artists?.[0]?.name, debouncedQuery, isSaavnA, a.album?.title, ai);
              const scoreB = computeRelevanceScore(b.title, b.artists?.[0]?.name, debouncedQuery, isSaavnB, b.album?.title, ai);
              if (scoreA !== scoreB) {
                return scoreB - scoreA;
              }
              return (b.playCount || 0) - (a.playCount || 0);
            });

            uniqueAlbums.sort((a, b) => {
              const isSaavnA = a.id.startsWith('saavn');
              const isSaavnB = b.id.startsWith('saavn');
              const scoreA = computeRelevanceScore(a.title, a.artistName, debouncedQuery, isSaavnA, a.title, ai);
              const scoreB = computeRelevanceScore(b.title, b.artistName, debouncedQuery, isSaavnB, b.title, ai);
              if (scoreA !== scoreB) {
                return scoreB - scoreA;
              }
              return 0;
            });
          }

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
    setAiInfo(null);
    setResults({ tracks: [], albums: [], artists: [] });
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setDebouncedQuery(query.trim());
  };

  // Top Result determination (Spotify style with phonetic normalization & cleanQuery)
  const topAlbum = results.albums.length > 0 ? results.albums[0] : null;
  const topTrack = results.tracks.length > 0 ? results.tracks[0] : null;

  // Tracks belonging to the top movie soundtrack
  const movieTracks = React.useMemo(() => {
    if (!topAlbum) return [];
    if (topAlbum.tracks && topAlbum.tracks.length > 0) {
      return topAlbum.tracks;
    }
    const normTopAlbum = normalizeSearchText(topAlbum.title);
    const matched = results.tracks.filter((t) => {
      if (t.album?.id && topAlbum.id && t.album.id === topAlbum.id) return true;
      if (t.album?.title) {
        const normAlb = normalizeSearchText(t.album.title);
        if (normAlb === normTopAlbum || normAlb.includes(normTopAlbum) || normTopAlbum.includes(normAlb)) {
          return true;
        }
        if (fuzzyMatch(t.album.title, topAlbum.title)) return true;
      }
      return false;
    });
    return matched.length > 0 ? matched : results.tracks.slice(0, 8);
  }, [topAlbum, results.tracks]);

  const movieTrackIds = React.useMemo(() => new Set(movieTracks.map((t) => t.id)), [movieTracks]);
  const otherTracks = React.useMemo(
    () => results.tracks.filter((t) => !movieTrackIds.has(t.id)),
    [results.tracks, movieTrackIds]
  );
  const otherAlbums = React.useMemo(
    () => results.albums.filter((a) => a.id !== topAlbum?.id),
    [results.albums, topAlbum]
  );

  const trackScore = topTrack
    ? computeRelevanceScore(topTrack.title, topTrack.artists?.[0]?.name, debouncedQuery, topTrack.id.startsWith('saavn'), topTrack.album?.title, aiInfo)
    : 0;
  const isTrackExact = trackScore >= 500;

  const albumScore = topAlbum
    ? computeRelevanceScore(topAlbum.title, topAlbum.artistName, debouncedQuery, topAlbum.id.startsWith('saavn'), topAlbum.title, aiInfo)
    : 0;
  const isAlbumExact = albumScore >= 500;

  // Check if query explicitly asks for a soundtrack, album, or movie
  const queryLower = debouncedQuery.toLowerCase();
  const isExplicitAlbumSearch = /\b(soundtrack|album|movie|film|playlist|ost|padam|pattu)\b/.test(queryLower);

  // AI-guided determination: Is user searching for a movie soundtrack or a specific song?
  const isMovieSearch = Boolean(
    topAlbum && (
      aiInfo?.intent === 'movie' ||
      (aiInfo?.movieOrAlbum && !aiInfo?.songName) ||
      (isExplicitAlbumSearch && !isTrackExact) ||
      (albumScore > trackScore && !isTrackExact)
    )
  );

  const handlePlayMoviePlaylist = async (startIndex = 0) => {
    if (movieTracks.length > 0) {
      playTrack(movieTracks[startIndex], movieTracks, startIndex);
      return;
    }
    if (topAlbum) {
      try {
        const res = await fetch(`/api/albums/${topAlbum.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.album?.tracks?.length > 0) {
            playTrack(data.album.tracks[startIndex], data.album.tracks, startIndex);
            return;
          }
        }
      } catch {}
      router.push(`/albums/${topAlbum.id}`);
    }
  };

  const handleShuffleMoviePlaylist = async () => {
    let list = movieTracks;
    if (list.length === 0 && topAlbum) {
      try {
        const res = await fetch(`/api/albums/${topAlbum.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.album?.tracks?.length > 0) {
            list = data.album.tracks;
          }
        }
      } catch {}
    }
    if (list.length > 0) {
      toggleShuffle();
      const randIdx = Math.floor(Math.random() * list.length);
      playTrack(list[randIdx], list, randIdx);
    }
  };

  const handlePlayTopResult = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMovieSearch && topAlbum) {
      handlePlayMoviePlaylist(0);
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

        {/* AI Supervision Intelligence Pill */}
        {aiInfo && aiInfo.isAiEnhanced && (
          <div className={styles.aiSupervisionBanner}>
            <Sparkles size={16} className={styles.aiSparkleIcon} />
            <div className={styles.aiSupervisionText}>
              <span>
                AI Supervised:{' '}
                <strong className={styles.aiHighlight}>{aiInfo.correctedQuery}</strong>
              </span>
              {aiInfo.movieOrAlbum && (
                <span className={styles.aiSubText}>
                  Soundtrack: <strong>{aiInfo.movieOrAlbum}</strong>
                </span>
              )}
              {aiInfo.language && (
                <span className={styles.aiLanguageBadge}>{aiInfo.language}</span>
              )}
            </div>
          </div>
        )}

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
          {/* ========================================================= */}
          {/* SCENARIO 1: MOVIE SEARCH -> MOVIE PLAYLIST HERO ON TOP    */}
          {/* ========================================================= */}
          {activeTab === 'all' && isMovieSearch && topAlbum && (
            <>
              <section className={styles.moviePlaylistSection}>
                <div className={styles.moviePlaylistHeader}>
                  <div className={styles.moviePlaylistHeaderLeft}>
                    <Film size={20} className={styles.sectionIcon} />
                    <h2 className={styles.sectionTitle}>Movie Soundtrack Playlist</h2>
                  </div>
                  {aiInfo?.isAiEnhanced && (
                    <span className={styles.aiBadgeInline}>
                      <Sparkles size={12} />
                      AI Detected Movie
                    </span>
                  )}
                </div>

                <div className={styles.moviePlaylistCard}>
                  <div className={styles.moviePlaylistCoverWrap}>
                    <Image
                      src={topAlbum.coverImage || '/icons/default-artwork.png'}
                      alt={topAlbum.title}
                      width={140}
                      height={140}
                      className={styles.moviePlaylistCover}
                      unoptimized
                    />
                  </div>

                  <div className={styles.moviePlaylistInfo}>
                    <div className={styles.movieBadgeRow}>
                      <span className={styles.movieBadge}>Official Movie Playlist</span>
                      {aiInfo?.language && (
                        <span className={styles.movieLangBadge}>{aiInfo.language}</span>
                      )}
                    </div>

                    <h3 className={styles.moviePlaylistTitle}>{topAlbum.title}</h3>
                    <p className={styles.moviePlaylistArtist}>
                      {topAlbum.artistName || 'Soundtrack'} • {topAlbum.releaseYear || 2024}
                    </p>
                    <p className={styles.moviePlaylistStats}>
                      {movieTracks.length > 0 ? `${movieTracks.length} Soundtrack Tracks` : 'Full Soundtrack Album'} • 320kbps Studio Lossless
                    </p>

                    <div className={styles.moviePlaylistActions}>
                      <button
                        type="button"
                        className={styles.moviePlayAllBtn}
                        onClick={() => handlePlayMoviePlaylist(0)}
                      >
                        <Play size={18} fill="currentColor" />
                        <span>Play Playlist</span>
                      </button>
                      <button
                        type="button"
                        className={styles.movieShuffleBtn}
                        onClick={handleShuffleMoviePlaylist}
                      >
                        <Shuffle size={16} />
                        <span>Shuffle</span>
                      </button>
                      <button
                        type="button"
                        className={styles.movieViewBtn}
                        onClick={() => router.push(`/albums/${topAlbum.id}`)}
                      >
                        <Disc size={15} />
                        <span>Album Details</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* The movie's complete tracklist right inside the movie playlist view */}
                {movieTracks.length > 0 && (
                  <div className={styles.movieTracksContainer}>
                    <div className={styles.movieTracksHeader}>
                      <Music2 size={16} />
                      <span>Soundtrack Tracks ({movieTracks.length})</span>
                    </div>
                    <div className={styles.trackList}>
                      {movieTracks.map((track, idx) => (
                        <TrackListItem
                          key={`${track.id}-${idx}`}
                          track={track}
                          index={idx}
                          playlistContext={movieTracks}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              {/* Other Related Soundtracks */}
              {otherAlbums.length > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionTitleRow}>
                    <Film size={20} className={styles.sectionIcon} />
                    <h2 className={styles.sectionTitle}>More Soundtracks & Albums ({otherAlbums.length})</h2>
                  </div>
                  <div className={styles.albumsGrid}>
                    {otherAlbums.map((album) => (
                      <AlbumCard key={album.id} album={album} />
                    ))}
                  </div>
                </section>
              )}

              {/* Other Related Tracks */}
              {otherTracks.length > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionTitleRow}>
                    <Music2 size={20} className={styles.sectionIcon} />
                    <h2 className={styles.sectionTitle}>Other Related Tracks ({otherTracks.length})</h2>
                  </div>
                  <div className={styles.trackList}>
                    {otherTracks.slice(0, 6).map((track, idx) => (
                      <TrackListItem
                        key={`${track.id}-${idx}`}
                        track={track}
                        index={idx}
                        playlistContext={otherTracks}
                      />
                    ))}
                  </div>
                  {otherTracks.length > 6 && (
                    <button
                      type="button"
                      className={styles.seeAllBtn}
                      onClick={() => setActiveTab('songs')}
                    >
                      See all {otherTracks.length} tracks →
                    </button>
                  )}
                </section>
              )}
            </>
          )}

          {/* ========================================================= */}
          {/* SCENARIO 2: NOT A MOVIE SEARCH (SONG SEARCH OR GENERAL)   */}
          {/* ========================================================= */}
          {activeTab === 'all' && !isMovieSearch && (
            <>
              {/* SPOTIFY-STYLE TOP RESULT CARD FOR SONG */}
              {topTrack && (
                <section className={styles.section}>
                  <h2 className={styles.sectionTitle}>Top Result</h2>
                  <div
                    className={styles.topResultCard}
                    onClick={() => playTrack(topTrack, results.tracks, 0)}
                  >
                    <div className={styles.topResultMain}>
                      <Image
                        src={topTrack.album?.coverImage || '/icons/default-artwork.png'}
                        alt={topTrack.title}
                        width={76}
                        height={76}
                        className={styles.topResultArt}
                        unoptimized
                      />
                      <div className={styles.topResultMeta}>
                        <span className={styles.topResultBadge}>
                          Song • Studio Lossless
                        </span>
                        <h3 className={styles.topResultTitle}>{topTrack.title}</h3>
                        <p className={styles.topResultSubtitle}>
                          {topTrack.artists?.map((a) => a.name).join(', ')} • {topTrack.album?.title || 'Single'}
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

              {/* 1. SONGS LIST */}
              {results.tracks.length > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionTitleRow}>
                    <Music2 size={20} className={styles.sectionIcon} />
                    <h2 className={styles.sectionTitle}>Songs ({results.tracks.length})</h2>
                  </div>
                  <div className={styles.trackList}>
                    {results.tracks.slice(0, 6).map((track, idx) => (
                      <TrackListItem
                        key={`${track.id}-${idx}`}
                        track={track}
                        index={idx}
                        playlistContext={results.tracks}
                      />
                    ))}
                  </div>
                  {results.tracks.length > 6 && (
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
              {results.albums.length > 0 && (
                <section className={styles.section}>
                  <div className={styles.sectionTitleRow}>
                    <Film size={20} className={styles.sectionIcon} />
                    <h2 className={styles.sectionTitle}>
                      Movie Soundtracks & Playlists ({results.albums.length})
                    </h2>
                  </div>
                  <div className={styles.albumsGrid}>
                    {results.albums.map((album) => (
                      <AlbumCard key={album.id} album={album} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* ========================================================= */}
          {/* EXPLICIT TAB VIEWS: SONGS / MOVIES                        */}
          {/* ========================================================= */}
          {activeTab === 'songs' && results.tracks.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitleRow}>
                <Music2 size={20} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>All Songs ({results.tracks.length})</h2>
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

          {activeTab === 'movies' && results.albums.length > 0 && (
            <section className={styles.section}>
              <div className={styles.sectionTitleRow}>
                <Film size={20} className={styles.sectionIcon} />
                <h2 className={styles.sectionTitle}>
                  All Movie Soundtracks & Playlists ({results.albums.length})
                </h2>
              </div>
              <div className={styles.albumsFullGrid}>
                {results.albums.map((album) => (
                  <AlbumCard key={album.id} album={album} />
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
