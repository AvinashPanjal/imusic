'use client';

import React, { useState } from 'react';
import { TrackData } from '@/types/music';
import { Info, Sparkles, Disc, X } from 'lucide-react';
import styles from './AudioQualityBadge.module.css';

interface AudioQualityBadgeProps {
  track: TrackData | null;
  interactive?: boolean;
}

export const AudioQualityBadge: React.FC<AudioQualityBadgeProps> = ({ track, interactive = true }) => {
  const [showModal, setShowModal] = useState(false);

  if (!track) return null;

  const asset = track.assets?.[0];
  const isHiRes = asset?.isHiRes || (asset?.bitDepth && asset.bitDepth >= 24) || (asset?.sampleRate && asset.sampleRate > 48000);
  const isLossless = asset?.isLossless || asset?.codec === 'FLAC' || asset?.codec === 'ALAC';
  const codec = asset?.codec || 'AAC';
  const bitDepth = asset?.bitDepth || (isHiRes ? 24 : isLossless ? 16 : null);
  const sampleRate = asset?.sampleRate ? `${asset.sampleRate / 1000} kHz` : isHiRes ? '96 kHz' : isLossless ? '44.1 kHz' : null;
  const bitrate = asset?.bitrate ? `${asset.bitrate} kbps` : isLossless ? '1411 kbps' : '256 kbps';

  let label = 'AAC 256 kbps';
  let badgeClass = styles.badgeStandard;

  if (isHiRes) {
    label = `Hi-Res Lossless • ${bitDepth}b/${sampleRate}`;
    badgeClass = styles.badgeHiRes;
  } else if (isLossless) {
    label = `Lossless • ${bitDepth}b/${sampleRate}`;
    badgeClass = styles.badgeLossless;
  }

  const handleBadgeClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (interactive) {
      setShowModal(true);
    }
  };

  return (
    <>
      <button
        type="button"
        className={`${styles.badge} ${badgeClass}`}
        onClick={handleBadgeClick}
        title="Tap for audio quality specifications"
        aria-label={`Audio quality: ${label}`}
      >
        {isHiRes ? <Sparkles size={11} className={styles.icon} /> : <Disc size={11} className={styles.icon} />}
        <span>{label}</span>
      </button>

      {showModal && (
        <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleRow}>
                <span className={`${styles.badge} ${badgeClass}`}>{label}</span>
                <h3 className={styles.modalTitle}>Audio Quality Details</h3>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                onClick={() => setShowModal(false)}
                aria-label="Close audio details"
              >
                <X size={20} />
              </button>
            </div>

            <div className={styles.specGrid}>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Codec</span>
                <span className={styles.specValue}>{codec}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Bit Depth</span>
                <span className={styles.specValue}>{bitDepth ? `${bitDepth}-bit` : '16-bit float'}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Sample Rate</span>
                <span className={styles.specValue}>{sampleRate || '44.1 kHz'}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Bitrate</span>
                <span className={styles.specValue}>{bitrate}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Encoding</span>
                <span className={styles.specValue}>{isLossless ? 'Direct Lossless PCM' : 'Perceptual AAC'}</span>
              </div>
              <div className={styles.specItem}>
                <span className={styles.specLabel}>Delivery</span>
                <span className={styles.specValue}>HTTP 206 Byte-Range</span>
              </div>
            </div>

            <div className={styles.disclaimerBox}>
              <Info size={16} className={styles.infoIcon} />
              <div>
                <strong>iPhone & Hardware Notice:</strong>
                <p>
                  iOS Safari streams full bit-depth files natively. Bluetooth devices (including AirPods)
                  are limited to 24-bit/48kHz or AAC compressed transmission. For authentic 96kHz or 192kHz
                  Hi-Res output, connect a compatible external Lightning or USB-C DAC with wired headphones.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
