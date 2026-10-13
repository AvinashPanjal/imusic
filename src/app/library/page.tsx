'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { TrackData, PlaylistData, AlbumSummary } from '@/types/music';
import { TrackListItem } from '@/components/music/TrackListItem';
import { AlbumCard } from '@/components/music/AlbumCard';
import { OfflineDownloadManager } from '@/lib/offline/downloadManager';
import { LocalLibrary } from '@/lib/storage/localLibrary';
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
  Link2,
  Trash2,
  Loader2,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import styles from './library.module.css';

type LibraryTab = 'playlists' | 'favorites' | 'downloaded' | 'tracks' | 'albums';
type SortField = 'date' | 'title' | 'artist';

export default function LibraryPage() {
  const router = useRouter();
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

  // Import Playlist Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importCustomTitle, setImportCustomTitle] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importStatusText, setImportStatusText] = useState('');
  const [importResult, setImportResult] = useState<{
    success: boolean;
    playlist?: any;
    totalRequested?: number;
    importedCount?: number;
    matchedCount?: number;
    error?: string;
  } | null>(null);

  const [loading, setLoading] = useState(true);

  // Load Library Data
  const loadLibrary = async () => {
    try {
      // 1. Read local storage immediately
      const localPlaylists = LocalLibrary.getPlaylists();
      const localFavorites = LocalLibrary.getFavorites();

      let serverFavs: TrackData[] = [];
      let serverPls: PlaylistData[] = [];

      try {
        const [favRes, playRes, tracksRes, albumsRes] = await Promise.all([
          fetch('/api/library/favorites').catch(() => null),
          fetch('/api/playlists').catch(() => null),
          fetch('/api/tracks').catch(() => null),
          fetch('/api/albums').catch(() => null),
        ]);

        if (favRes && favRes.ok) {
          const d = await favRes.json();
          serverFavs = d.favorites || [];
        }
        if (playRes && playRes.ok) {
          const d = await playRes.json();
          serverPls = d.playlists || [];
        }
        if (tracksRes && tracksRes.ok) {
          const d = await tracksRes.json();
          setAllTracks(d.tracks || []);
        }
        if (albumsRes && albumsRes.ok) {
          const d = await albumsRes.json();
          setAlbums(d.albums || []);
        }
      } catch (netErr) {
        console.warn('Network issue fetching library from server:', netErr);
      }

      // Merge playlists: local first, then server
      const combinedPls = [...localPlaylists];
      for (const sp of serverPls) {
        if (!combinedPls.some((p) => p.id === sp.id)) {
          combinedPls.push(sp);
        }
      }
      setPlaylists(combinedPls);

      // Merge favorites: local first, then server
      const combinedFavs = [...localFavorites];
      for (const sf of serverFavs) {
        if (!combinedFavs.some((f) => f.id === sf.id)) {
          combinedFavs.push(sf);
        }
      }
      setFavorites(combinedFavs);

      // Check offline downloads
      const offline = await OfflineDownloadManager.getAllDownloadedTracks().catch(() => []);
      setDownloadedTracks(offline);

      // Check storage estimate
      const est = await OfflineDownloadManager.getStorageEstimate().catch(() => ({ usedBytes: 0, quotaBytes: 0 }));
      setStorageEstimate({
        usedMB: Math.round(est.usedBytes / (1024 * 1024)),
        quotaMB: Math.round(est.quotaBytes / (1024 * 1024)),
      });
    } catch (err) {
      console.warn('Failed to load library:', err);
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

    const title = newPlaylistTitle.trim();
    const localPl: PlaylistData = {
      id: `pl_local_${Date.now()}`,
      title,
      description: 'Created by you',
      isPublic: false,
      userId: 'local_user',
      createdAt: new Date().toISOString(),
      trackCount: 0,
      tracks: [],
    };

    LocalLibrary.savePlaylist(localPl);
    setPlaylists((prev) => [localPl, ...prev.filter((p) => p.id !== localPl.id)]);
    setNewPlaylistTitle('');
    setShowCreateModal(false);

    fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }).catch(() => {});
  };

  const handleImportPlaylist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importUrl.trim() || isImporting) return;

    setIsImporting(true);
    setImportStatusText('Fetching Spotify tracks & matching 320 KBPS audio streams...');
    setImportResult(null);

    try {
      const res = await fetch('/api/playlists/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: importUrl.trim(),
          customTitle: importCustomTitle.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (res.ok && data.success && data.playlist) {
        LocalLibrary.savePlaylist(data.playlist);
        setPlaylists((prev) => [data.playlist, ...prev.filter((p) => p.id !== data.playlist.id)]);
        setImportResult(data);
        setImportUrl('');
        setImportCustomTitle('');
      } else {
        setImportResult({
          success: false,
          error: data.error || 'Failed to import playlist. Please check link and ensure it is public.',
        });
      }
    } catch (err: any) {
      setImportResult({
        success: false,
        error: err.message || 'Network error while importing playlist.',
      });
    } finally {
      setIsImporting(false);
      setImportStatusText('');
    }
  };

  const handleDeletePlaylist = async (e: React.MouseEvent, playlistId: string, playlistTitle: string) => {
    e.preventDefault();
    e.stopPropagation();

    if (!confirm(`Are you sure you want to delete "${playlistTitle}"?`)) return;

    LocalLibrary.deletePlaylist(playlistId);
    setPlaylists((prev) => prev.filter((p) => p.id !== playlistId));

    fetch(`/api/playlists/${playlistId}`, {
      method: 'DELETE',
    }).catch(() => {});
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
            onClick={() => {
              setImportResult(null);
              setShowImportModal(true);
            }}
            title="Import Playlist from Spotify"
            aria-label="Import Playlist from Spotify"
          >
            <Link2 size={20} />
          </button>
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
              <p>Create custom playlists or import your favorite playlists from Spotify.</p>
              <div className={styles.emptyBtnRow}>
                <button
                  type="button"
                  className={styles.primaryBtn}
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus size={16} /> New Playlist
                </button>
                <button
                  type="button"
                  className={styles.secondaryBtn}
                  onClick={() => {
                    setImportResult(null);
                    setShowImportModal(true);
                  }}
                >
                  <Link2 size={16} /> Import from Spotify
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.playlistsList}>
              {playlists.map((pl) => (
                <div key={pl.id} className={styles.playlistRowWrapper}>
                  <Link href={`/playlists/${pl.id}`} className={styles.playlistRow}>
                    <div className={styles.playlistArt}>
                      {pl.coverImage ? (
                        <Image
                          src={pl.coverImage}
                          alt={pl.title}
                          width={44}
                          height={44}
                          className={styles.playlistCoverImg}
                          unoptimized={pl.coverImage.startsWith('http')}
                        />
                      ) : (
                        <LibraryIcon size={22} />
                      )}
                    </div>
                    <div className={styles.playlistMeta}>
                      <span className={styles.playlistTitle}>{pl.title}</span>
                      <span className={styles.playlistSubtitle}>
                        {(pl.trackCount ?? pl.tracks?.length ?? 0)} {(pl.trackCount === 1 || pl.tracks?.length === 1) ? 'song' : 'songs'}
                        {pl.description ? ` • ${pl.description}` : ''}
                      </span>
                    </div>
                  </Link>
                  <button
                    type="button"
                    className={styles.deletePlaylistBtn}
                    onClick={(e) => handleDeletePlaylist(e, pl.id, pl.title)}
                    title={`Delete playlist "${pl.title}"`}
                    aria-label={`Delete playlist "${pl.title}"`}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
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

      {/* Import Playlist Modal */}
      {showImportModal && (
        <div className={styles.modalOverlay} onClick={() => !isImporting && setShowImportModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalBadgeRow}>
                <Sparkles size={16} className={styles.sparkleIcon} />
                <h3>Import Playlist (Spotify, YouTube & Web)</h3>
              </div>
              <p className={styles.modalDescription}>
                Paste any Spotify playlist, JioSaavn link, or song titles to import with instant audio playback. 100% Free.
              </p>
            </div>

            {importResult && (
              <div
                className={`${styles.importResultCard} ${
                  importResult.success ? styles.importResultSuccess : styles.importResultError
                }`}
              >
                {importResult.success ? (
                  <>
                    <div className={styles.resultTitleRow}>
                      <CheckCircle2 size={18} className={styles.successIcon} />
                      <strong>Imported &ldquo;{importResult.playlist?.title}&rdquo;!</strong>
                    </div>
                    <p className={styles.resultDetails}>
                      {importResult.matchedCount} of {importResult.importedCount} songs matched with full playable audio streams.
                    </p>
                    <button
                      type="button"
                      className={styles.viewPlaylistBtn}
                      onClick={() => {
                        setShowImportModal(false);
                        router.push(`/playlists/${importResult.playlist?.id}`);
                      }}
                    >
                      Open Playlist Now &rarr;
                    </button>
                  </>
                ) : (
                  <p className={styles.errorDetails}>{importResult.error}</p>
                )}
              </div>
            )}

            <form onSubmit={handleImportPlaylist} className={styles.modalForm}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Spotify Link, YouTube Link, or Song List</label>
                <input
                  type="text"
                  placeholder="https://open.spotify.com/playlist/... or song titles"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  disabled={isImporting}
                  required
                  className={styles.modalInput}
                />
              </div>

              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>Custom Title (Optional)</label>
                <input
                  type="text"
                  placeholder="Leave empty to use original title"
                  value={importCustomTitle}
                  onChange={(e) => setImportCustomTitle(e.target.value)}
                  disabled={isImporting}
                  className={styles.modalInput}
                />
              </div>

              {isImporting && (
                <div className={styles.importingStatus}>
                  <Loader2 size={18} className={styles.spinner} />
                  <span>{importStatusText || 'Importing songs & matching 320 KBPS streams...'}</span>
                </div>
              )}

              <div className={styles.modalBtnRow}>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={() => setShowImportModal(false)}
                  disabled={isImporting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={styles.submitBtn}
                  disabled={isImporting || !importUrl.trim()}
                >
                  {isImporting ? 'Importing...' : 'Import Playlist'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
