'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Image from 'next/image';
import { usePlayerStore } from '@/store/playerStore';
import { parseLrc } from '@/lib/lyrics';
import { X, Play, Trash2, Music2, Mic2, Disc3, Sparkles } from 'lucide-react';
import styles from './DesktopQueueDrawer.module.css';

interface DesktopQueueDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DesktopQueueDrawer: React.FC<DesktopQueueDrawerProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<'queue' | 'now-playing' | 'lyrics'>('queue');
  const {
    currentTrack,
    queue,
    queueIndex,
    currentTime,
    playTrack,
    removeFromQueue,
    clearQueue,
    seek,
  } = usePlayerStore();

  const activeLyricRef = useRef<HTMLDivElement | null>(null);

  // Parse lyrics
  const parsedLyrics = useMemo(() => {
    if (!currentTrack?.lyricsSynced) return [];
    return parseLrc(currentTrack.lyricsSynced);
  }, [currentTrack?.lyricsSynced]);

  const activeLyricIdx = useMemo(() => {
    if (parsedLyrics.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < parsedLyrics.length; i++) {
      if (currentTime >= parsedLyrics[i].time) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [parsedLyrics, currentTime]);

  useEffect(() => {
    if (activeTab === 'lyrics' && activeLyricRef.current) {
      activeLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeLyricIdx, activeTab]);

  const artworkUrl = currentTrack?.album?.coverImage || '/icons/default-artwork.png';
  const artistNames = currentTrack?.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  return (
    <aside
      className={`${styles.drawer} ${isOpen ? styles.drawerOpen : ''}`}
      aria-label="Desktop Queue & Lyrics Drawer"
    >
      <div className={styles.header}>
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'queue' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('queue')}
          >
            Queue ({queue.length})
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'now-playing' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('now-playing')}
          >
            Track Info
          </button>
          <button
            type="button"
            className={`${styles.tabBtn} ${activeTab === 'lyrics' ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab('lyrics')}
          >
            Lyrics
          </button>
        </div>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onClose}
          aria-label="Close drawer"
        >
          <X size={16} />
        </button>
      </div>

      <div className={styles.content}>
        {/* TAB 1: Queue */}
        {activeTab === 'queue' && (
          <>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>Up Next in Queue</span>
              {queue.length > 0 && (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={clearQueue}
                >
                  Clear All
                </button>
              )}
            </div>

            {queue.length === 0 ? (
              <div className={styles.emptyState}>
                <Music2 size={36} />
                <span>Your queue is empty</span>
              </div>
            ) : (
              <div className={styles.queueList}>
                {queue.map((track, i) => {
                  const isCurrent = currentTrack?.id === track.id || i === queueIndex;
                  const trackArt = track.album?.coverImage || '/icons/default-artwork.png';
                  const artists = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

                  return (
                    <div
                      key={`${track.id}-${i}`}
                      className={`${styles.trackRow} ${isCurrent ? styles.trackRowCurrent : ''}`}
                      onClick={() => playTrack(track, queue, i)}
                    >
                      <Image
                        src={trackArt}
                        alt={track.title}
                        width={38}
                        height={38}
                        className={styles.trackArtwork}
                        unoptimized={trackArt.startsWith('http')}
                      />
                      <div className={styles.trackMeta}>
                        <span
                          className={`${styles.trackTitle} ${
                            isCurrent ? styles.trackTitleCurrent : ''
                          }`}
                        >
                          {track.title}
                        </span>
                        <span className={styles.trackArtist}>{artists}</span>
                      </div>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(i);
                        }}
                        aria-label="Remove from queue"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* TAB 2: Now Playing & Audio Specs */}
        {activeTab === 'now-playing' && (
          <div className={styles.nowPlayingCard}>
            <div className={styles.bigArtworkWrapper}>
              <Image
                src={artworkUrl}
                alt={currentTrack?.title || 'Now Playing'}
                width={240}
                height={240}
                className={styles.bigArtwork}
                unoptimized={artworkUrl.startsWith('http')}
              />
            </div>
            <div>
              <h4 className={styles.bigTitle}>{currentTrack?.title || 'No Track Selected'}</h4>
              <p className={styles.bigArtist}>{artistNames}</p>
            </div>

            {currentTrack && (
              <div className={styles.specGrid}>
                <div className={styles.specCard}>
                  <span className={styles.specKey}>Audio Engine</span>
                  <span className={styles.specVal}>Bit-Perfect Native</span>
                </div>
                <div className={styles.specCard}>
                  <span className={styles.specKey}>Format</span>
                  <span className={styles.specVal}>
                    {currentTrack.assets?.[0]?.format?.toUpperCase() || 'AAC / MP4'}
                  </span>
                </div>
                <div className={styles.specCard}>
                  <span className={styles.specKey}>Bitrate</span>
                  <span className={styles.specVal}>
                    {currentTrack.assets?.[0]?.bitrate ? `${currentTrack.assets[0].bitrate} kbps` : 'High Definition'}
                  </span>
                </div>
                <div className={styles.specCard}>
                  <span className={styles.specKey}>Quality Profile</span>
                  <span className={styles.specVal} style={{ color: 'var(--badge-hires-text)' }}>
                    {currentTrack.assets?.[0]?.isHiRes ? 'Hi-Res Master' : 'Lossless Audio'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Lyrics */}
        {activeTab === 'lyrics' && (
          <div className={styles.lyricsArea}>
            {parsedLyrics.length > 0 ? (
              parsedLyrics.map((lyric, idx) => {
                const isActive = idx === activeLyricIdx;
                return (
                  <div
                    key={idx}
                    ref={isActive ? activeLyricRef : null}
                    className={`${styles.lyricLine} ${isActive ? styles.lyricLineActive : ''}`}
                    onClick={() => seek(lyric.time)}
                  >
                    {lyric.text}
                  </div>
                );
              })
            ) : currentTrack?.lyricsPlain ? (
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8, color: 'var(--text-secondary)' }}>
                {currentTrack.lyricsPlain}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <Mic2 size={36} />
                <span>No synchronized lyrics available for this track</span>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
