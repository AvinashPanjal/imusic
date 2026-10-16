'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PlaylistData, TrackData } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { usePlayerStore } from '@/store/playerStore';
import { LocalLibrary } from '@/lib/storage/localLibrary';
import { fetchYouTubeTrackInfo } from '@/lib/youtubeTrack';
import { Play, Shuffle, ChevronLeft, Library, Trash2, Plus, Search, X, Check } from 'lucide-react';
import styles from './playlistDetail.module.css';

export default function PlaylistDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [playlist, setPlaylist] = useState<PlaylistData | null>(null);
  const [tracks, setTracks] = useState<TrackData[]>([]);
  const [loading, setLoading] = useState(true);

  // Quick YouTube add state
  const [ytUrl, setYtUrl] = useState('');
  const [isAddingYt, setIsAddingYt] = useState(false);
  const [addNotice, setAddNotice] = useState<string | null>(null);

  const { playTrack, toggleShuffle } = usePlayerStore();

  const loadPlaylist = async () => {
    // 1. Read from local library first
    const local = LocalLibrary.getPlaylistById(id);
    if (local) {
      setPlaylist(local);
      const extractedTracks = local.tracks?.map((pt: any) => pt.track || pt) || [];
      setTracks(extractedTracks);
      setLoading(false);
    }

    try {
      const res = await fetch(`/api/playlists/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (data.playlist) {
          setPlaylist(data.playlist);
          const extractedTracks = data.playlist.tracks?.map((pt: any) => pt.track || pt) || [];
          setTracks(extractedTracks);
        }
      }
    } catch (err) {
      console.warn('Error loading playlist from server:', err);
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

  const handleRemoveTrack = (track: TrackData) => {
    LocalLibrary.removeTrackFromPlaylist(id, track.id);
    setTracks((prev) => prev.filter((t) => t.id !== track.id));
    setPlaylist((prev) => (prev ? { ...prev, trackCount: Math.max(0, (prev.trackCount || 1) - 1) } : prev));
    fetch(`/api/playlists/${id}/tracks/${track.id}`, { method: 'DELETE' }).catch(() => {});
    setAddNotice(`Removed "${track.title}" from playlist`);
    setTimeout(() => setAddNotice(null), 2500);
  };

  const handleAddYtTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ytUrl.trim() || isAddingYt) return;

    setIsAddingYt(true);
    try {
      const track = await fetchYouTubeTrackInfo(ytUrl.trim());
      if (!track) {
        setAddNotice('Could not extract YouTube video. Check URL.');
        setTimeout(() => setAddNotice(null), 3000);
        return;
      }

      LocalLibrary.addTrackToPlaylist(id, track);
      setTracks((prev) => [...prev.filter((t) => t.id !== track.id), track]);
      setPlaylist((prev) => (prev ? {
        ...prev,
        trackCount: (prev.trackCount || tracks.length) + 1,
        coverImage: prev.coverImage || track.album?.coverImage,
      } : prev));

      fetch(`/api/playlists/${id}/tracks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: track.id }),
      }).catch(() => {});

      setAddNotice(`Added "${track.title}" to playlist!`);
      setYtUrl('');
      setTimeout(() => setAddNotice(null), 3000);
    } catch (err) {
      console.warn('Error adding YouTube track to playlist:', err);
      setAddNotice('Failed to add track.');
      setTimeout(() => setAddNotice(null), 3000);
    } finally {
      setIsAddingYt(false);
    }
  };

  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const handleDeletePlaylist = () => {
    setShowDeleteModal(true);
  };

  const confirmDeletePlaylist = async () => {
    LocalLibrary.deletePlaylist(id);
    fetch(`/api/playlists/${id}`, { method: 'DELETE' }).catch(() => {});
    setShowDeleteModal(false);
    router.push('/library');
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

      {/* Quick Add Song via YouTube */}
      <div className={styles.quickAddSection}>
        <form onSubmit={handleAddYtTrack} className={styles.quickAddForm}>
          <div className={styles.quickAddInputWrapper}>
            <Search size={15} className={styles.quickAddIcon} />
            <input
              type="text"
              placeholder="Paste YouTube link to add track to this playlist..."
              value={ytUrl}
              onChange={(e) => setYtUrl(e.target.value)}
              className={styles.quickAddInput}
            />
            {ytUrl && (
              <button
                type="button"
                className={styles.quickAddClearBtn}
                onClick={() => setYtUrl('')}
                title="Clear"
              >
                <X size={14} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className={styles.quickAddBtn}
            disabled={!ytUrl.trim() || isAddingYt}
          >
            <Plus size={16} /> {isAddingYt ? 'Adding...' : 'Add Track'}
          </button>
        </form>
        {addNotice && (
          <div className={styles.addNotice}>
            <Check size={14} /> {addNotice}
          </div>
        )}
      </div>

      {/* Tracks List */}
      <section className={styles.trackSection}>
        {tracks.length === 0 ? (
          <div className={styles.emptyTracks}>
            <p>No tracks in this playlist yet.</p>
            <p className={styles.hint}>Paste a YouTube link above or click &ldquo;Add to Playlist&rdquo; on any track in your library.</p>
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
                onRemove={handleRemoveTrack}
                removeLabel="Remove from Playlist"
              />
            ))}
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className={styles.modalOverlay} onClick={() => setShowDeleteModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Delete Playlist</h3>
            <p className={styles.modalDescription}>
              Are you sure you want to delete this playlist? This action cannot be undone.
            </p>
            <div className={styles.modalBtnRow}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setShowDeleteModal(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.deleteConfirmBtn}
                onClick={confirmDeletePlaylist}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
