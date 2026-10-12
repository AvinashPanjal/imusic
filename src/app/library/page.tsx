'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { TrackData, PlaylistData, AlbumSummary } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { AlbumCard } from '@/components/music/AlbumCard';
import { OfflineDownloadManager } from '@/lib/offline/downloadManager';
import {
  Library as LibraryIcon,
  Heart,
  DownloadCloud,
  Plus,
  UploadCloud,
  ArrowUpDown,
  Music,
  Disc,
  FolderPlus,
  HardDrive,
} from 'lucide-react';
import styles from './library.module.css';

type LibraryTab = 'playlists' | 'favorites' | 'downloaded' | 'tracks' | 'albums';
type SortField = 'date' | 'title' | 'artist';

export default function LibraryPage() {
  const [activeTab, setActiveTab] = useState<LibraryTab>('playlists');
  const [sortField, setSortField] = useState<SortField>('date');

  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [favorites, setFavorites] = useState<TrackData[]>([]);
  const [allTracks, setAllTracks] = useState<TrackData[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [downloadedTracks, setDownloadedTracks] = useState<TrackData[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<{ usedMB: number; quotaMB: number }>({ usedMB: 0, quotaMB: 0 });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [loading, setLoading] = useState(true);

  // Load Library Data
  const loadLibrary = async () => {
    try {
      const [favRes, playRes, tracksRes, albumsRes] = await Promise.all([
        fetch('/api/library/favorites'),
        fetch('/api/playlists'),
        fetch('/api/tracks'),
        fetch('/api/albums'),
      ]);

      if (favRes.ok) {
        const d = await favRes.json();
        setFavorites(d.favorites || []);
      }
      if (playRes.ok) {
        const d = await playRes.json();
        setPlaylists(d.playlists || []);
      }
      if (tracksRes.ok) {
        const d = await tracksRes.json();
        setAllTracks(d.tracks || []);
      }
      if (albumsRes.ok) {
        const d = await albumsRes.json();
        setAlbums(d.albums || []);
      }

      // Check offline downloads
      const offline = await OfflineDownloadManager.getAllDownloadedTracks();
      setDownloadedTracks(offline);

      // Check storage estimate
      const est = await OfflineDownloadManager.getStorageEstimate();
      setStorageEstimate({
        usedMB: Math.round(est.usedBytes / (1024 * 1024)),
        quotaMB: Math.round(est.quotaBytes / (1024 * 1024)),
      });
    } catch (err) {
      console.error('Failed to load library:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  const handleCreatePlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlaylistTitle.trim()) return;

    try {
      const res = await fetch('/api/playlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newPlaylistTitle.trim() }),
      });
      if (res.ok) {
        setNewPlaylistTitle('');
        setShowCreateModal(false);
        loadLibrary();
      }
    } catch (err) {
      console.error('Create playlist error:', err);
    }
  };

  // Sort helper
  const sortTracks = (list: TrackData[]) => {
    return [...list].sort((a, b) => {
      if (sortField === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sortField === 'artist') {
        const nameA = a.artists?.[0]?.name || '';
        const nameB = b.artists?.[0]?.name || '';
        return nameA.localeCompare(nameB);
      }
      return 0; // Default date / natural
    });
  };

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <span className={styles.subtitle}>Personal Collection</span>
          <h1 className={styles.title}>Your Library</h1>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setShowCreateModal(true)}
            title="Create Playlist"
            aria-label="Create Playlist"
          >
            <FolderPlus size={20} />
          </button>
          <Link
            href="/import"
            className={styles.actionBtn}
            title="Ingest Audio Files"
            aria-label="Ingest Audio Files"
          >
            <UploadCloud size={20} />
          </Link>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className={styles.tabsScroller}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'playlists' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('playlists')}
        >
          Playlists ({playlists.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'favorites' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('favorites')}
        >
          Favorites ({favorites.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'downloaded' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('downloaded')}
        >
          Offline ({downloadedTracks.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'tracks' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('tracks')}
        >
          All Songs ({allTracks.length})
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'albums' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('albums')}
        >
          Albums ({albums.length})
        </button>
      </div>

      {/* Sort row (when viewing tracks) */}
      {(activeTab === 'tracks' || activeTab === 'favorites' || activeTab === 'downloaded') && (
        <div className={styles.sortRow}>
          <div className={styles.sortLabel}>
            <ArrowUpDown size={14} />
            <span>Sort by</span>
          </div>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className={styles.sortSelect}
            aria-label="Sort tracks"
          >
            <option value="date">Recently Added</option>
            <option value="title">Title (A-Z)</option>
            <option value="artist">Artist (A-Z)</option>
          </select>
        </div>
      )}

      {/* Tab: Playlists */}
      {activeTab === 'playlists' && (
        <div className={styles.tabContent}>
          {playlists.length === 0 ? (
            <div className={styles.emptyView}>
              <FolderPlus size={44} className={styles.emptyIcon} />
              <h3>No Playlists Yet</h3>
              <p>Create custom playlists to organize your lossless favorites.</p>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => setShowCreateModal(true)}
              >
                <Plus size={16} /> New Playlist
              </button>
            </div>
          ) : (
            <div className={styles.playlistsList}>
              {playlists.map((pl) => (
                <Link key={pl.id} href={`/playlists/${pl.id}`} className={styles.playlistRow}>
                  <div className={styles.playlistArt}>
                    <LibraryIcon size={22} />
                  </div>
                  <div className={styles.playlistMeta}>
                    <span className={styles.playlistTitle}>{pl.title}</span>
                    <span className={styles.playlistSubtitle}>
                      {pl.trackCount} {pl.trackCount === 1 ? 'song' : 'songs'}
                      {pl.description ? ` • ${pl.description}` : ''}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Favorites */}
      {activeTab === 'favorites' && (
        <div className={styles.tabContent}>
          {favorites.length === 0 ? (
            <div className={styles.emptyView}>
              <Heart size={44} className={styles.emptyIcon} />
              <h3>No Favorites Yet</h3>
              <p>Tap the heart icon in the Now Playing screen to bookmark tracks.</p>
            </div>
          ) : (
            <div className={styles.trackList}>
              {sortTracks(favorites).map((track, idx) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  index={idx}
                  playlistContext={favorites}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Offline / Downloaded */}
      {activeTab === 'downloaded' && (
        <div className={styles.tabContent}>
          <div className={styles.storageStatus}>
            <div className={styles.storageHeader}>
              <HardDrive size={16} />
              <span>Offline Device Storage</span>
            </div>
            <div className={styles.storageStats}>
              <span>{storageEstimate.usedMB} MB cached in IndexedDB</span>
              {storageEstimate.quotaMB > 0 && (
                <span>Quota: {Math.round(storageEstimate.quotaMB / 1024)} GB</span>
              )}
            </div>
            <p className={styles.storageNotice}>
              iOS Safari may reclaim browser storage if device memory is low. Eligible tracks can be downloaded for offline listening without streaming.
            </p>
          </div>

          {downloadedTracks.length === 0 ? (
            <div className={styles.emptyView}>
              <DownloadCloud size={44} className={styles.emptyIcon} />
              <h3>No Offline Tracks</h3>
              <p>Tap &ldquo;Save Offline&rdquo; on any eligible track to cache it for playback without internet.</p>
            </div>
          ) : (
            <div className={styles.trackList}>
              {sortTracks(downloadedTracks).map((track, idx) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  index={idx}
                  playlistContext={downloadedTracks}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: All Songs */}
      {activeTab === 'tracks' && (
        <div className={styles.tabContent}>
          {allTracks.length === 0 ? (
            <div className={styles.emptyView}>
              <Music size={44} className={styles.emptyIcon} />
              <h3>No Audio Tracks Ingested</h3>
              <p>Upload your own FLAC or audio files through the import interface.</p>
              <Link href="/import" className={styles.primaryBtn}>
                <UploadCloud size={16} /> Ingest Files
              </Link>
            </div>
          ) : (
            <div className={styles.trackList}>
              {sortTracks(allTracks).map((track, idx) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  index={idx}
                  playlistContext={allTracks}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tab: Albums */}
      {activeTab === 'albums' && (
        <div className={styles.tabContent}>
          {albums.length === 0 ? (
            <div className={styles.emptyView}>
              <Disc size={44} className={styles.emptyIcon} />
              <h3>No Albums Found</h3>
              <p>Ingest audio albums with ID3/FLAC tags to organize your catalogue.</p>
            </div>
          ) : (
            <div className={styles.albumsGrid}>
              {albums.map((al) => (
                <AlbumCard key={al.id} album={al} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div className={styles.modalOverlay} onClick={() => setShowCreateModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Create Playlist</h3>
            <form onSubmit={handleCreatePlaylist} className={styles.modalForm}>
              <input
                type="text"
                placeholder="Playlist name"
                value={newPlaylistTitle}
                onChange={(e) => setNewPlaylistTitle(e.target.value)}
                autoFocus
                required
                className={styles.modalInput}
              />
              <div className={styles.modalBtnRow}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className={styles.submitBtn}>
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
