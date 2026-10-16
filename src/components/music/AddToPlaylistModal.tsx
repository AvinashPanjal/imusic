'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { TrackData, PlaylistData } from '@/types/music';
import { LocalLibrary } from '@/lib/storage/localLibrary';
import { X, Plus, Check, ListMusic } from 'lucide-react';
import styles from './AddToPlaylistModal.module.css';

interface AddToPlaylistModalProps {
  track: TrackData | null;
  isOpen: boolean;
  onClose: () => void;
  onAdded?: (playlistTitle: string) => void;
}

export const AddToPlaylistModal: React.FC<AddToPlaylistModalProps> = ({
  track,
  isOpen,
  onClose,
  onAdded,
}) => {
  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [addedPlaylists, setAddedPlaylists] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const list = LocalLibrary.getPlaylists();
      setPlaylists(list);

      // Check which playlists already have this track
      if (track) {
        const addedMap: Record<string, boolean> = {};
        for (const pl of list) {
          const has = pl.tracks?.some((t: any) => (t.track ? t.track.id === track.id : t.id === track.id));
          if (has) addedMap[pl.id] = true;
        }
        setAddedPlaylists(addedMap);
      }
    }
  }, [isOpen, track]);

  if (!isOpen || !track) return null;

  const artworkUrl = track.album?.coverImage || '/icons/default-artwork.png';
  const artistNames = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  const handleAddToPlaylist = (playlist: PlaylistData) => {
    LocalLibrary.addTrackToPlaylist(playlist.id, track);
    setAddedPlaylists((prev) => ({ ...prev, [playlist.id]: true }));

    // Send to backend if available
    fetch(`/api/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trackId: track.id }),
    }).catch(() => {});

    setNotice(`Added to "${playlist.title}"!`);
    onAdded?.(playlist.title);

    setTimeout(() => {
      setNotice(null);
      onClose();
    }, 1200);
  };

  const handleCreateAndAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsCreating(true);
    const title = newTitle.trim();
    const newPl: PlaylistData = {
      id: `pl_local_${Date.now()}`,
      title,
      description: 'Created by you',
      isPublic: false,
      userId: 'local_user',
      createdAt: new Date().toISOString(),
      trackCount: 1,
      tracks: [{ position: 0, track }],
      coverImage: track.album?.coverImage || undefined,
    };

    LocalLibrary.savePlaylist(newPl);
    setPlaylists((prev) => [newPl, ...prev]);
    setAddedPlaylists((prev) => ({ ...prev, [newPl.id]: true }));

    // Fire API sync
    fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => {});

    setNotice(`Created "${title}" and added song!`);
    setNewTitle('');
    setIsCreating(false);
    onAdded?.(title);

    setTimeout(() => {
      setNotice(null);
      onClose();
    }, 1200);
  };

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Add to Playlist</h3>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {/* Selected Track Preview */}
        <div className={styles.trackPreview}>
          <Image
            src={artworkUrl}
            alt={track.title}
            width={40}
            height={40}
            className={styles.trackThumb}
            unoptimized={artworkUrl.startsWith('http')}
          />
          <div className={styles.trackMeta}>
            <span className={styles.trackTitle}>{track.title}</span>
            <span className={styles.trackArtist}>{artistNames}</span>
          </div>
        </div>

        {notice && <div className={styles.toastNotice}>{notice}</div>}

        {/* Create New Playlist Inline */}
        <form onSubmit={handleCreateAndAdd} className={styles.createNewRow}>
          <input
            type="text"
            className={styles.createInput}
            placeholder="New playlist name..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
          />
          <button
            type="submit"
            className={styles.createBtn}
            disabled={!newTitle.trim() || isCreating}
          >
            <Plus size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Create &amp; Add
          </button>
        </form>

        {/* Playlists List */}
        <div className={styles.playlistList}>
          {playlists.length === 0 ? (
            <div className={styles.emptyPlaylists}>
              No playlists found. Create one above to get started!
            </div>
          ) : (
            playlists.map((pl) => {
              const isAdded = addedPlaylists[pl.id];
              return (
                <div
                  key={pl.id}
                  className={styles.playlistItem}
                  onClick={() => handleAddToPlaylist(pl)}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.playlistItemMeta}>
                    <ListMusic size={18} className={styles.playlistIcon} />
                    <span className={styles.playlistName}>{pl.title}</span>
                    <span className={styles.playlistCount}>
                      ({pl.trackCount ?? pl.tracks?.length ?? 0} songs)
                    </span>
                  </div>
                  {isAdded ? (
                    <span className={styles.addedBadge}>
                      <Check size={14} /> Added
                    </span>
                  ) : (
                    <Plus size={16} color="var(--text-tertiary)" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
