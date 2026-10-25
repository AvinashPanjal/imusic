'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Search, X, Play, Music, Sparkles } from 'lucide-react';
import { TrackData } from '@/types/music';
import { usePlayerStore } from '@/store/playerStore';
import styles from './DesktopSpotlightSearch.module.css';

interface DesktopSpotlightSearchProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DesktopSpotlightSearch: React.FC<DesktopSpotlightSearchProps> = ({ isOpen, onClose }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackData[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const playTrack = usePlayerStore((s) => s.playTrack);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setSelectedIndex(0);
    } else {
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query.trim())}`);
        if (res.ok) {
          const data = await res.json();
          const list: TrackData[] = [];
          if (Array.isArray(data.results)) {
            for (const prov of data.results) {
              if (Array.isArray(prov.tracks)) {
                list.push(...prov.tracks);
              }
            }
          }
          setResults(list.slice(0, 10));
          setSelectedIndex(0);
        }
      } catch (err) {
        console.warn('Spotlight search error', err);
      } finally {
        setLoading(false);
      }
    }, 280);

    return () => clearTimeout(timer);
  }, [query]);

  // Keyboard navigation within modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % results.length);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + results.length) % results.length);
      }
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (results.length > 0 && results[selectedIndex]) {
        playTrack(results[selectedIndex], results, selectedIndex);
        onClose();
      }
      return;
    }
  };

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div
        className={styles.modal}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className={styles.searchBarRow}>
          <Search size={20} className={styles.searchIcon} />
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            placeholder="Search songs, artists, albums, or YouTube covers..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => {
                setQuery('');
                setResults([]);
                inputRef.current?.focus();
              }}
              aria-label="Clear query"
            >
              <X size={16} />
            </button>
          )}
          <span className={styles.escPill}>Esc</span>
        </div>

        <div className={styles.resultsArea}>
          {loading && (
            <div className={styles.emptyState}>
              <div className={styles.loadingSpinner} />
              <span>Searching music catalogue & YouTube...</span>
            </div>
          )}

          {!loading && results.length > 0 && (
            results.map((track, i) => {
              const art = track.album?.coverImage || '/icons/default-artwork.png';
              const artistNames = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';
              const isSelected = i === selectedIndex;

              return (
                <div
                  key={track.id || i}
                  className={`${styles.trackRow} ${isSelected ? styles.trackRowSelected : ''}`}
                  onClick={() => {
                    playTrack(track, results, i);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(i)}
                >
                  <Image
                    src={art}
                    alt={track.title}
                    width={40}
                    height={40}
                    className={styles.artwork}
                    unoptimized={art.startsWith('http')}
                  />
                  <div className={styles.meta}>
                    <span className={styles.title}>{track.title}</span>
                    <span className={styles.artist}>{artistNames}</span>
                  </div>
                  <Play size={18} className={styles.playAction} />
                </div>
              );
            })
          )}

          {!loading && query.trim() && results.length === 0 && (
            <div className={styles.emptyState}>
              <Music size={28} />
              <span>No direct tracks found for &ldquo;{query}&rdquo;</span>
            </div>
          )}

          {!loading && !query.trim() && (
            <div className={styles.emptyState}>
              <Sparkles size={24} style={{ color: 'var(--accent-hover)' }} />
              <span>Type anything to instantly find and play music</span>
            </div>
          )}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerHints}>
            <span className={styles.hintItem}>
              <kbd className={styles.kbd}>↑</kbd> <kbd className={styles.kbd}>↓</kbd> Navigate
            </span>
            <span className={styles.hintItem}>
              <kbd className={styles.kbd}>↵</kbd> Play
            </span>
          </div>
          <span>Direct Hi-Res Audio Streaming</span>
        </div>
      </div>
    </div>
  );
};
