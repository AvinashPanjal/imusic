'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PlaylistData, TrackData } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { usePlayerStore } from '@/store/playerStore';
import { Play, Shuffle, ChevronLeft, Library, Trash2 } from 'lucide-react';
import styles from './playlistDetail.module.css';

export default function PlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [loading, setLoading] = useState(true);

  const { playTrack, toggleShuffle } = usePlayerStore();

  const loadPlaylist = async () => {
    try {
      const res = await fetch(`/api/playlists/${id}`);
      if (res.ok) {
        const data = await res.json();
        setPlaylist(data.playlist);
        const extractedTracks = data.playlist.tracks?.map((pt: any) => pt.track) || [];
        setTracks(extractedTracks);
      }
    } catch (err) {
      console.error('Error loading playlist:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) loadPlaylist();
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

  const handleDeletePlaylist = async () => {
    if (!confirm('Are you sure you want to delete this playlist?')) return;
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: 'DELETE' });
      if (res.ok) {
        router.push('/library');
      }
    } catch (err) {
      console.error('Failed to delete playlist:', err);
    }
  };

  if (loading) {
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.spinner} />
      </div>
    );
  }

  if (!playlist) {
    return (
      <div className={styles.notFound}>
        <h2>Playlist not found</h2>
        <button type="button" onClick={() => router.push('/library')} className={styles.backBtn}>
          Back to Library
        </button>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Back button */}
      <nav className={styles.navBar}>
        <button type="button" className={styles.iconNavBtn} onClick={() => router.back()} aria-label="Go back">
          <ChevronLeft size={24} />
        </button>
        <button
          type="button"
          className={styles.deleteBtn}
          onClick={handleDeletePlaylist}
          aria-label="Delete playlist"
        >
          <Trash2 size={18} />
        </button>
      </nav>

      {/* Hero Header */}
      <header className={styles.hero}>
        <div className={styles.artCollage}>
          <Library size={48} className={styles.collageIcon} />
        </div>
        <div className={styles.heroMeta}>
          <span className={styles.tag}>PLAYLIST</span>
          <h1 className={styles.playlistTitle}>{playlist.title}</h1>
          {playlist.description && (
            <p className={styles.description}>{playlist.description}</p>
          )}
          <span className={styles.stats}>
            {tracks.length} {tracks.length === 1 ? 'track' : 'tracks'}
          </span>
        </div>
      </header>

      {/* Action Buttons */}
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

      {/* Tracks List */}
      <section className={styles.trackSection}>
        {tracks.length === 0 ? (
          <div className={styles.emptyTracks}>
            <p>No tracks in this playlist yet.</p>
            <p className={styles.hint}>Browse your library or search for songs to add them.</p>
          </div>
        ) : (
          <div className={styles.trackList}>
            {tracks.map((track, idx) => (
              <TrackListItem
                key={`${track.id}-${idx}`}
                track={track}
                index={idx}
                playlistContext={tracks}
                showArtwork={true}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
