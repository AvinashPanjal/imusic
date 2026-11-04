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
import { usePlayerStore } from '@/store/playerStore';
import { fetchYouTubeTrackInfo } from '@/lib/youtubeTrack';
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
  Upload,
  FileText,
  Play,
  Search,
  X,
  Check,
  Youtube,
  RefreshCw,
  LogOut,
  Shuffle,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import styles from './library.module.css';

type LibraryTab = 'playlists' | 'favorites' | 'downloaded' | 'tracks' | 'albums' | 'youtube';
type SortField = 'date' | 'title' | 'artist';

export default function LibraryPage() {
  const router = useRouter();
  const { playTrack } = usePlayerStore();
  const [activeTab, setActiveTab] = useState<LibraryTab>('playlists');
  const [sortField, setSortField] = useState<SortField>('date');

  // Google / YouTube Liked Songs state
  const [googleUser, setGoogleUser] = useState<{ id: string; name: string; email: string; picture: string } | null>(null);
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [ytLikedTracks, setYtLikedTracks] = useState<TrackData[]>([]);
  const [ytLikedSearch, setYtLikedSearch] = useState('');
  const [isLoadingYt, setIsLoadingYt] = useState(false);
  const [ytSyncNotice, setYtSyncNotice] = useState<string | null>(null);
  const [ytAuthError, setYtAuthError] = useState<string | null>(null);
  const [ytFilter, setYtFilter] = useState<'music' | 'all'>('music');
  const [ytTotalLoaded, setYtTotalLoaded] = useState<number>(0);

  const [playlists, setPlaylists] = useState<PlaylistData[]>([]);
  const [favorites, setFavorites] = useState<TrackData[]>([]);
  const [allTracks, setAllTracks] = useState<TrackData[]>([]);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [downloadedTracks, setDownloadedTracks] = useState<TrackData[]>([]);
  const [storageEstimate, setStorageEstimate] = useState<{ usedMB: number; quotaMB: number }>({ usedMB: 0, quotaMB: 0 });

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistTitle, setNewPlaylistTitle] = useState('');
  const [playlistToDelete, setPlaylistToDelete] = useState<{ id: string; title: string } | null>(null);

  // Quick YouTube Paste State for Favorites
  const [ytInputUrl, setYtInputUrl] = useState('');
  const [isResolvingYt, setIsResolvingYt] = useState(false);
  const [ytNotice, setYtNotice] = useState<string | null>(null);

  // Import Playlist Modal State
  const [showImportModal, setShowImportModal] = useState(false);
  const [importMode, setImportMode] = useState<'url' | 'raw' | 'file'>('url');
  const [importUrl, setImportUrl] = useState('');
  const [importCustomTitle, setImportCustomTitle] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatusText, setImportStatusText] = useState('');
  const [importResult, setImportResult] = useState<{
    success: boolean;
    playlist?: any;
    totalRequested?: number;
    importedCount?: number;
    matchedCount?: number;
    isEmbedLimited?: boolean;
    error?: string;
  } | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (text) {
        setImportUrl(text);
        if (!importCustomTitle) {
          setImportCustomTitle(file.name.replace(/\.[^/.]+$/, ''));
        }
      }
    };
    reader.readAsText(file);
  };

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
    fetchGoogleAuthStatus();

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab');
      if (tab === 'youtube') {
        setActiveTab('youtube');
      } else if (tab === 'favorites') {
        setActiveTab('favorites');
      }

      const err = params.get('error');
      if (err) {
        setYtAuthError(decodeURIComponent(err));
      }

      if (params.get('connected') === 'true') {
        window.history.replaceState({}, '', '/library?tab=youtube');
        fetchGoogleAuthStatus();
      }
    }
  }, []);

  const fetchGoogleAuthStatus = async () => {
    try {
      const res = await fetch('/api/auth/google/me', {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        const connected = Boolean(data.connected);
        setIsGoogleConnected(connected);
        setGoogleUser(data.user || null);
        if (connected) {
          fetchYtLikedTracks();
        }
      }
    } catch (err) {
      console.warn('Error checking Google auth:', err);
    }
  };

  const fetchYtLikedTracks = async (filterParam?: 'music' | 'all') => {
    const targetFilter = filterParam || ytFilter;
    setIsLoadingYt(true);
    setYtSyncNotice(
      targetFilter === 'music'
        ? 'Filtering and matching your YouTube music with studio lossless...'
        : 'Fetching all liked YouTube videos...'
    );
    try {
      const res = await fetch(`/api/youtube/liked?filter=${targetFilter}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        setYtLikedTracks(data.tracks || []);
        if (typeof data.totalLoaded === 'number') {
          setYtTotalLoaded(data.totalLoaded);
        }
        setYtSyncNotice(null);
      } else {
        const errData = await res.json();
        setYtSyncNotice(errData.error || 'Failed to load liked songs.');
      }
    } catch {
      setYtSyncNotice('Error connecting to YouTube API.');
    } finally {
      setIsLoadingYt(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    if (!confirm('Are you sure you want to disconnect your Google account?')) return;
    try {
      await fetch('/api/auth/google/logout', { method: 'POST' });
      setIsGoogleConnected(false);
      setGoogleUser(null);
      setYtLikedTracks([]);
    } catch {}
  };

  const handlePlayAllYt = () => {
    if (ytLikedTracks.length === 0) return;
    playTrack(ytLikedTracks[0], ytLikedTracks);
  };

  const handleShuffleYt = () => {
    if (ytLikedTracks.length === 0) return;
    const shuffled = [...ytLikedTracks].sort(() => Math.random() - 0.5);
    playTrack(shuffled[0], shuffled);
  };

  const handleImportYtToPlaylist = () => {
    if (ytLikedTracks.length === 0) return;
    const localPl: PlaylistData = {
      id: `pl_yt_liked_${Date.now()}`,
      title: 'YouTube Liked Songs',
      description: `Imported from YouTube (${ytLikedTracks.length} tracks)`,
      isPublic: false,
      userId: 'local_user',
      createdAt: new Date().toISOString(),
      trackCount: ytLikedTracks.length,
      tracks: ytLikedTracks.map((track, i) => ({ position: i + 1, track })),
    };
    LocalLibrary.savePlaylist(localPl);
    setPlaylists((prev) => [localPl, ...prev.filter((p) => p.id !== localPl.id)]);
    router.push(`/playlists/${localPl.id}`);
  };

  const filteredYtTracks = ytLikedTracks.filter((t) => {
    if (!ytLikedSearch.trim()) return true;
    const q = ytLikedSearch.toLowerCase();
    return (
      t.title.toLowerCase().includes(q) ||
      t.artists?.some((a) => a.name.toLowerCase().includes(q))
    );
  });

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

    // Immediately open the newly created playlist
    router.push(`/playlists/${localPl.id}`);
  };

  const handleRemoveFavorite = (track: TrackData) => {
    LocalLibrary.removeFavorite(track.id);
    setFavorites((prev) => prev.filter((t) => t.id !== track.id));
    fetch(`/api/library/favorites/${track.id}`, { method: 'DELETE' }).catch(() => {});
    setYtNotice(`Removed "${track.title}" from Favorites`);
    setTimeout(() => setYtNotice(null), 2500);
  };

  const handleYtPlayNow = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!ytInputUrl.trim() || isResolvingYt) return;

    setIsResolvingYt(true);
    try {
      const track = await fetchYouTubeTrackInfo(ytInputUrl.trim());
      if (!track) {
        setYtNotice('Could not extract YouTube video. Please check the URL.');
        setTimeout(() => setYtNotice(null), 3500);
        return;
      }

      playTrack(track, [track], 0);
      setYtNotice(`Playing "${track.title}"!`);
      setTimeout(() => setYtNotice(null), 3000);
    } catch (err) {
      console.warn('Error playing YouTube track:', err);
      setYtNotice('Failed to play YouTube track.');
      setTimeout(() => setYtNotice(null), 3000);
    } finally {
      setIsResolvingYt(false);
    }
  };

  const handleYtAddFavorite = async () => {
    if (!ytInputUrl.trim() || isResolvingYt) return;

    setIsResolvingYt(true);
    try {
      const track = await fetchYouTubeTrackInfo(ytInputUrl.trim());
      if (!track) {
        setYtNotice('Could not extract YouTube video. Please check the URL.');
        setTimeout(() => setYtNotice(null), 3500);
        return;
      }

      LocalLibrary.addFavorite(track);
      setFavorites((prev) => [track, ...prev.filter((t) => t.id !== track.id)]);
      fetch('/api/library/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trackId: track.id }),
      }).catch(() => {});

      setYtNotice(`Added "${track.title}" to Favorites!`);
      setYtInputUrl('');
      setTimeout(() => setYtNotice(null), 3500);
    } catch (err) {
      console.warn('Error favoriting YouTube track:', err);
      setYtNotice('Failed to add track to favorites.');
      setTimeout(() => setYtNotice(null), 3000);
    } finally {
      setIsResolvingYt(false);
    }
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

      let data: any = null;
      const text = await res.text();
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(
          res.status === 504
            ? 'Import timed out on server. Please try again with fewer tracks.'
            : `Server returned error (${res.status}): ${text.slice(0, 100)}`
        );
      }

      if (res.ok && data?.success && data.playlist) {
        LocalLibrary.savePlaylist(data.playlist);
        setPlaylists((prev) => [data.playlist, ...prev.filter((p) => p.id !== data.playlist.id)]);
        setImportResult(data);
        setImportUrl('');
        setImportCustomTitle('');
      } else {
        setImportResult({
          success: false,
          error: data?.error || 'Failed to import playlist. Please check file/links and try again.',
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

  const handleDeletePlaylist = (e: React.MouseEvent, playlistId: string, playlistTitle: string) => {
    e.preventDefault();
    e.stopPropagation();
    setPlaylistToDelete({ id: playlistId, title: playlistTitle });
  };

  const confirmDeletePlaylist = () => {
    if (!playlistToDelete) return;
    const { id } = playlistToDelete;
    LocalLibrary.deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    fetch(`/api/playlists/${id}`, {
      method: 'DELETE',
    }).catch(() => {});
    setPlaylistToDelete(null);
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
          className={`${styles.tabBtn} ${activeTab === 'youtube' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('youtube')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          <Youtube size={15} color="#ef4444" />
          <span>YouTube Liked {isGoogleConnected && ytLikedTracks.length > 0 ? `(${ytLikedTracks.length})` : ''}</span>
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
          {/* Quick YouTube Stream & Favorite Box */}
          <div className={styles.ytQuickSection}>
            <div className={styles.ytQuickHeader}>
              <div className={styles.ytHeaderTitle}>
                <Sparkles size={16} className={styles.sparkleIcon} />
                <span>Quick YouTube Stream &amp; Favorites</span>
              </div>
              <span className={styles.ytHeaderSubtitle}>
                Paste any YouTube video, song, or short link to play audio directly or save to your Favorites.
              </span>
            </div>

            <form onSubmit={handleYtPlayNow} className={styles.ytInputRow}>
              <div className={styles.ytInputWrapper}>
                <Search size={16} className={styles.ytInputIcon} />
                <input
                  type="text"
                  placeholder="Paste YouTube link (e.g. https://youtu.be/... or https://youtube.com/watch?v=...)"
                  value={ytInputUrl}
                  onChange={(e) => setYtInputUrl(e.target.value)}
                  className={styles.ytInput}
                />
                {ytInputUrl && (
                  <button
                    type="button"
                    className={styles.ytClearBtn}
                    onClick={() => setYtInputUrl('')}
                    title="Clear"
                    aria-label="Clear input"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className={styles.ytBtnGroup}>
                <button
                  type="button"
                  className={styles.ytPlayBtn}
                  disabled={!ytInputUrl.trim() || isResolvingYt}
                  onClick={handleYtPlayNow}
                >
                  <Play size={15} fill="currentColor" /> Play Now
                </button>

                <button
                  type="button"
                  className={styles.ytFavBtn}
                  disabled={!ytInputUrl.trim() || isResolvingYt}
                  onClick={handleYtAddFavorite}
                >
                  <Heart size={15} fill="currentColor" /> + Favorite
                </button>
              </div>
            </form>

            {isResolvingYt && (
              <div className={styles.ytStatusNotice}>
                <div className={styles.spinnerSm} /> Loading YouTube audio track...
              </div>
            )}

            {ytNotice && (
              <div className={styles.ytSuccessNotice}>
                <Check size={16} /> {ytNotice}
              </div>
            )}
          </div>

          {favorites.length === 0 ? (
            <div className={styles.emptyView}>
              <Heart size={44} className={styles.emptyIcon} />
              <h3>No Favorites Yet</h3>
              <p>Paste a YouTube link above or tap the heart icon while playing any song.</p>
            </div>
          ) : (
            <div className={styles.trackList}>
              {sortTracks(favorites).map((track, idx) => (
                <TrackListItem
                  key={track.id}
                  track={track}
                  index={idx}
                  playlistContext={favorites}
                  onRemove={handleRemoveFavorite}
                  removeLabel="Remove from Favorites"
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

      {/* Tab: YouTube Liked Songs */}
      {activeTab === 'youtube' && (
        <div className={styles.tabContent}>
          {ytAuthError && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '12px 18px',
                borderRadius: 12,
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                fontSize: 13,
                fontWeight: 500,
                maxWidth: 680,
                margin: '0 auto 16px',
              }}
            >
              <AlertCircle size={18} style={{ flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <strong>Sign-In Alert:</strong> {ytAuthError}
              </div>
              <button
                type="button"
                onClick={() => setYtAuthError(null)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#ef4444',
                  cursor: 'pointer',
                  padding: 4,
                }}
              >
                <X size={15} />
              </button>
            </div>
          )}

          {!isGoogleConnected ? (
            <div className={styles.ytConnectHero}>
              <div className={styles.ytBadgeIcon}>
                <Youtube size={36} />
              </div>
              <h2 className={styles.ytHeroTitle}>Sync Your YouTube Liked Songs</h2>
              <p className={styles.ytHeroDesc}>
                Connect your Google account to automatically import, shuffle, and stream all your liked songs from YouTube and YouTube Music in high-fidelity audio.
              </p>
              <a href="/api/auth/google" className={styles.googleLoginBtn}>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Sign in with Google</span>
              </a>
              <span className={styles.privacyNote}>
                <ShieldCheck size={14} /> Read-only access • Your account credentials are never stored or shared.
              </span>
            </div>
          ) : (
            <div>
              {/* Connected User Header Banner */}
              <div className={styles.ytUserCard}>
                <div className={styles.ytUserLeft}>
                  {googleUser?.picture ? (
                    <img
                      src={googleUser.picture}
                      alt={googleUser.name || 'User'}
                      className={styles.ytUserAvatar}
                    />
                  ) : (
                    <div className={styles.ytUserAvatarFallback}>
                      {googleUser?.name?.[0]?.toUpperCase() || 'G'}
                    </div>
                  )}
                  <div className={styles.ytUserDetails}>
                    <div className={styles.ytUserName}>
                      {googleUser?.name || 'Google User'}
                      <span className={styles.ytUserBadge}>
                        <Youtube size={12} /> YouTube Synced
                      </span>
                    </div>
                    <span className={styles.ytUserEmail}>{googleUser?.email}</span>
                  </div>
                </div>

                <div className={styles.ytUserActions}>
                  <button
                    type="button"
                    className={styles.ytSyncBtn}
                    onClick={() => fetchYtLikedTracks()}
                    disabled={isLoadingYt}
                  >
                    <RefreshCw size={14} className={isLoadingYt ? styles.spinnerSm : ''} />
                    <span>{isLoadingYt ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.ytDisconnectBtn}
                    onClick={handleDisconnectGoogle}
                    title="Disconnect Google Account"
                  >
                    <LogOut size={13} />
                    <span>Disconnect</span>
                  </button>
                </div>
              </div>

              {/* Filter Switch & Studio Lossless Engine Notice */}
              <div className={styles.ytFilterRow}>
                <button
                  type="button"
                  className={`${styles.ytFilterPill} ${ytFilter === 'music' ? styles.ytFilterPillActive : ''}`}
                  onClick={() => {
                    setYtFilter('music');
                    fetchYtLikedTracks('music');
                  }}
                >
                  <Music size={13} />
                  <span>Music Tracks Only</span>
                </button>
                <button
                  type="button"
                  className={`${styles.ytFilterPill} ${ytFilter === 'all' ? styles.ytFilterPillActive : ''}`}
                  onClick={() => {
                    setYtFilter('all');
                    fetchYtLikedTracks('all');
                  }}
                >
                  <Youtube size={13} />
                  <span>All Liked Videos {ytTotalLoaded > 0 ? `(${ytTotalLoaded})` : ''}</span>
                </button>

                <div
                  className={styles.ytLosslessBadge}
                  title="Matches songs with Studio CD Quality 320 KBPS audio streams for seamless mobile & desktop playback"
                >
                  <Sparkles size={12} />
                  <span>Studio Lossless Active</span>
                </div>
              </div>

              {/* Controls bar */}
              <div className={styles.ytControlBar}>
                <div className={styles.ytControlsLeft}>
                  <button
                    type="button"
                    className={styles.ytPlayAllBtn}
                    onClick={handlePlayAllYt}
                    disabled={filteredYtTracks.length === 0}
                  >
                    <Play size={16} fill="currentColor" />
                    <span>Play All ({filteredYtTracks.length})</span>
                  </button>

                  <button
                    type="button"
                    className={styles.ytShuffleBtn}
                    onClick={handleShuffleYt}
                    disabled={filteredYtTracks.length === 0}
                  >
                    <Shuffle size={15} />
                    <span>Shuffle</span>
                  </button>

                  <button
                    type="button"
                    className={styles.ytImportBtn}
                    onClick={handleImportYtToPlaylist}
                    disabled={filteredYtTracks.length === 0}
                    title="Save all liked songs as a permanent iMusic playlist"
                  >
                    <FolderPlus size={15} />
                    <span>Save to Playlist</span>
                  </button>
                </div>

                <div className={styles.ytSearchWrapper}>
                  <Search size={15} className={styles.ytSearchIcon} />
                  <input
                    type="text"
                    className={styles.ytSearchInput}
                    placeholder="Search liked songs..."
                    value={ytLikedSearch}
                    onChange={(e) => setYtLikedSearch(e.target.value)}
                  />
                </div>
              </div>

              {/* Status Notice if syncing */}
              {ytSyncNotice && (
                <div style={{ padding: '8px 12px', fontSize: 13, color: 'var(--text-secondary)' }}>
                  {ytSyncNotice}
                </div>
              )}

              {/* Tracks List */}
              {filteredYtTracks.length === 0 ? (
                <div className={styles.emptyView}>
                  <Youtube size={44} className={styles.emptyIcon} style={{ color: '#ef4444' }} />
                  <h3>{isLoadingYt ? 'Loading YouTube Liked Songs...' : 'No Liked Songs Found'}</h3>
                  <p>
                    {isLoadingYt
                      ? 'Contacting YouTube Data API to fetch your music...'
                      : 'Like some music videos or songs on YouTube, then click "Sync Now".'}
                  </p>
                </div>
              ) : (
                <div className={styles.trackList}>
                  {filteredYtTracks.map((track, idx) => (
                    <TrackListItem
                      key={track.id}
                      track={track}
                      index={idx}
                      playlistContext={filteredYtTracks}
                    />
                  ))}
                </div>
              )}
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

      {/* Delete Playlist Confirmation Modal */}
      {playlistToDelete && (
        <div className={styles.modalOverlay} onClick={() => setPlaylistToDelete(null)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3>Delete Playlist</h3>
            <p className={styles.modalDescription}>
              Are you sure you want to delete &ldquo;{playlistToDelete.title}&rdquo;? This cannot be undone.
            </p>
            <div className={styles.modalBtnRow}>
              <button
                type="button"
                className={styles.cancelBtn}
                onClick={() => setPlaylistToDelete(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.submitBtn}
                style={{ backgroundColor: '#ef4444' }}
                onClick={confirmDeletePlaylist}
              >
                Delete
              </button>
            </div>
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
                Import songs from Spotify or paste track titles. Every song matches with 100% full-length playable audio. 100% Free.
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
                      {importResult.matchedCount} of {importResult.importedCount} songs matched with 100% full playable audio (zero preview snippets).
                    </p>
                    {importResult.isEmbedLimited && (
                      <div className={styles.infoBanner}>
                        ℹ️ <strong>100 Tracks Imported (Spotify&rsquo;s Public Limit)</strong>: Spotify&rsquo;s servers strictly cap public playlist preview links at 100 songs.
                        <br /><br />
                        <strong>To import all 200–500+ songs in 10 seconds:</strong>
                        <div style={{ marginTop: '6px' }}>
                          1. In <strong>Spotify Desktop / Web</strong>: Open playlist &rarr; Click any song &rarr; Press <code>Ctrl+A</code> (or <code>Cmd+A</code>) &rarr; Press <code>Ctrl+C</code>.
                        </div>
                        <div style={{ marginTop: '4px' }}>
                          2. Switch to <strong>&ldquo;Paste Songs / Links&rdquo;</strong> tab above, paste the copied links, and click Import!
                        </div>
                      </div>
                    )}
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

            <div className={styles.importModeTabs}>
              <button
                type="button"
                className={`${styles.importModeTab} ${importMode === 'url' ? styles.importModeTabActive : ''}`}
                onClick={() => setImportMode('url')}
                disabled={isImporting}
              >
                Playlist Link
              </button>
              <button
                type="button"
                className={`${styles.importModeTab} ${importMode === 'raw' ? styles.importModeTabActive : ''}`}
                onClick={() => setImportMode('raw')}
                disabled={isImporting}
              >
                Paste Songs / Links
              </button>
              <button
                type="button"
                className={`${styles.importModeTab} ${importMode === 'file' ? styles.importModeTabActive : ''}`}
                onClick={() => {
                  setImportMode('file');
                  fileInputRef.current?.click();
                }}
                disabled={isImporting}
              >
                Upload File (.csv)
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              accept=".csv,.txt"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />

            <form onSubmit={handleImportPlaylist} className={styles.modalForm}>
              {importMode === 'url' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Spotify, YouTube, or JioSaavn Playlist Link</label>
                  <input
                    type="text"
                    placeholder="https://open.spotify.com/playlist/... or YouTube playlist"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    disabled={isImporting}
                    required
                    className={styles.modalInput}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    💡 Note: Direct Spotify links are capped at 100 tracks by Spotify. For 100+ songs, switch to &ldquo;Paste Songs / Links&rdquo;!
                  </span>
                </div>
              )}

              {importMode === 'raw' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Paste Spotify Track Links or Song Titles (Up to 500 Songs)</label>
                  <textarea
                    placeholder="Paste Spotify track links (Ctrl+A & Ctrl+C from Spotify Desktop):&#10;https://open.spotify.com/track/...&#10;https://open.spotify.com/track/...&#10;&#10;OR paste song titles:&#10;Rasathi Unnai - P. Jayachandran&#10;Pehle Bhi Main - Vishal Mishra"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    disabled={isImporting}
                    required
                    rows={6}
                    className={styles.modalTextarea}
                  />
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                    🔥 Quick tip: In Spotify Desktop / Web, open your playlist &rarr; Press <code>Ctrl+A</code> &rarr; <code>Ctrl+C</code> &rarr; paste here!
                  </span>
                </div>
              )}

              {importMode === 'file' && (
                <div className={styles.fieldGroup}>
                  <label className={styles.fieldLabel}>Upload Playlist Export File (.csv or .txt)</label>
                  <div
                    className={styles.fileDropZone}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={24} style={{ color: 'var(--accent-hover)' }} />
                    <div className={styles.fileDropZoneText}>
                      {uploadedFileName ? `Selected: ${uploadedFileName}` : 'Click to select CSV or TXT file'}
                    </div>
                    <div className={styles.fileDropZoneSub}>
                      {importUrl ? `${importUrl.split('\n').filter(Boolean).length} tracks ready to import` : 'Supports Exportify, TuneMyMusic, Soundiiz, or text lists'}
                    </div>
                  </div>
                </div>
              )}

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
                  <span>{importStatusText || 'Importing songs & matching full audio streams...'}</span>
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
