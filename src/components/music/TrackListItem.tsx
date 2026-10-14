'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import { TrackData } from '@/types/music';
import { usePlayerStore } from '@/store/playerStore';
import { Play, Pause, MoreVertical, Plus, Heart, Download, Check, Sparkles } from 'lucide-react';
import { formatTime } from '@/lib/lyrics';
import { OfflineDownloadManager } from '@/lib/offline/downloadManager';
import styles from './TrackListItem.module.css';

interface TrackListItemProps {
  track: TrackData;
  index?: number;
  playlistContext?: TrackData[];
  showArtwork?: boolean;
}

export const TrackListItem: React.FC<TrackListItemProps> = ({
  track,
  index,
  playlistContext,
  showArtwork = true,
}) => {
  const { currentTrack, isPlaying, playTrack, togglePlay, addToQueue, playNext } = usePlayerStore();
  const [showMenu, setShowMenu] = useState(false);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const isCurrent = currentTrack?.id === track.id;
  const artworkUrl = track.album?.coverImage || '/icons/default-artwork.png';
  const artistNames = track.artists?.map((a) => a.name).join(', ') || 'Unknown Artist';

  const asset = track.assets?.[0];
  const isHiRes = asset?.isHiRes;
  const isLossless = asset?.isLossless || asset?.codec === 'FLAC';

  const handleRowClick = () => {
    if (isCurrent) {
      togglePlay();
    } else {
      const queueToUse = playlistContext || [track];
      const targetIndex = playlistContext ? playlistContext.findIndex((t) => t.id === track.id) : 0;
      playTrack(track, queueToUse, targetIndex);
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu(false);
    if (isDownloaded || isDownloading) return;

    setIsDownloading(true);
    try {
      await OfflineDownloadManager.downloadTrack(track);
      setIsDownloaded(true);
    } catch (err) {
      alert((err as Error).message || 'Failed to download track');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      className={`${styles.row} ${isCurrent ? styles.rowActive : ''}`}
      onClick={handleRowClick}
      role="button"
      tabIndex={0}
      aria-label={`Play ${track.title} by ${artistNames}`}
    >
      {/* Index or Artwork */}
      {showArtwork ? (
        <div className={styles.artworkWrapper}>
          <Image
            src={artworkUrl}
            alt={track.title}
            width={44}
            height={44}
            className={styles.artwork}
            unoptimized={artworkUrl.startsWith('http')}
          />
          {isCurrent && (
            <div className={styles.playingIndicator}>
              {isPlaying ? <Pause size={14} /> : <Play size={14} />}
            </div>
          )}
        </div>
      ) : (
        <div className={styles.indexCol}>
          {isCurrent ? (
            isPlaying ? <Pause size={16} className={styles.accentIcon} /> : <Play size={16} className={styles.accentIcon} />
          ) : (
            <span className={styles.indexText}>{index !== undefined ? index + 1 : '•'}</span>
          )}
        </div>
      )}

      {/* Track Meta */}
      <div className={styles.meta}>
        <div className={styles.titleRow}>
          <span className={`${styles.title} ${isCurrent ? styles.titleActive : ''}`}>
            {track.title}
          </span>
          {isHiRes ? (
            <span className={styles.badgeHiRes} title="24-bit Hi-Res Lossless">
              <Sparkles size={9} /> Hi-Res
            </span>
          ) : isLossless ? (
            <span className={styles.badgeLossless} title="Lossless Audio">
              Lossless
            </span>
          ) : null}
        </div>
        <div className={styles.artistRow}>
          <span className={styles.artist}>{artistNames}</span>
          {track.album?.title && (
            <span className={styles.albumTitle}> • {track.album.title}</span>
          )}
        </div>
      </div>

      {/* Duration and Menu Button */}
      <div className={styles.rightActions} onClick={(e) => e.stopPropagation()}>
        <span className={styles.duration}>{formatTime(track.duration)}</span>
        <div className={styles.menuAnchor}>
          <button
            type="button"
            className={styles.moreBtn}
            onClick={() => setShowMenu(!showMenu)}
            aria-label="Track options"
          >
            <MoreVertical size={18} />
          </button>

          {showMenu && (
            <div className={styles.menuPopover}>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  playNext(track);
                  setShowMenu(false);
                }}
              >
                <Plus size={16} /> Play Next
              </button>
              <button
                type="button"
                className={styles.menuItem}
                onClick={() => {
                  addToQueue(track);
                  setShowMenu(false);
                }}
              >
                <Plus size={16} /> Add to Queue
              </button>
              {track.providerCode !== 'commercial_handoff' && (
                <button
                  type="button"
                  className={styles.menuItem}
                  onClick={handleDownload}
                  disabled={isDownloading || isDownloaded}
                >
                  {isDownloaded ? (
                    <><Check size={16} /> Saved Offline</>
                  ) : isDownloading ? (
                    'Downloading...'
                  ) : (
                    <><Download size={16} /> Save Offline</>
                  )}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
