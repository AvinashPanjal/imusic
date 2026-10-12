'use client';

import React, { useState, useRef } from 'react';
import Link from 'next/link';
import { UploadCloud, CheckCircle2, AlertTriangle, Disc, Sparkles, FileAudio, ArrowRight } from 'lucide-react';
import styles from './import.module.css';

interface IngestedResult {
  title: string;
  artist: string;
  album: string;
  coverImage?: string;
  quality: {
    codec: string;
    bitDepth?: number;
    sampleRate?: number;
    bitrate?: number;
    isLossless: boolean;
    isHiRes: boolean;
  };
}

export default function ImportPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [result, setResult] = useState<IngestedResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFile(e.dataTransfer.files[0]);
      setError(null);
      setResult(null);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setUploadProgress(20);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setUploadProgress(50);
      const res = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      setUploadProgress(90);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to import audio file');
      }

      setUploadProgress(100);
      setResult(data.track);
      setSelectedFile(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <span className={styles.subtitle}>Private Audio Pipeline</span>
        <h1 className={styles.title}>Ingest Music Files</h1>
        <p className={styles.description}>
          Upload authorized high-resolution files (FLAC, ALAC, AAC, MP3).
          Source metadata (codec, sample rate, bit depth) will be parsed and verified directly.
        </p>
      </header>

      {/* Upload Drop Zone */}
      <div
        className={`${styles.dropZone} ${selectedFile ? styles.dropZoneSelected : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".flac,.alac,.aac,.m4a,.mp3,.wav,.ogg"
          onChange={handleFileChange}
          style={{ display: 'none' }}
        />

        <div className={styles.dropZoneInner}>
          {selectedFile ? (
            <>
              <FileAudio size={44} className={styles.selectedIcon} />
              <div className={styles.fileName}>{selectedFile.name}</div>
              <div className={styles.fileSize}>
                {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
              </div>
              <span className={styles.changePrompt}>Tap to change selected file</span>
            </>
          ) : (
            <>
              <UploadCloud size={44} className={styles.uploadIcon} />
              <div className={styles.dropPrompt}>
                Tap to choose or drag & drop audio file
              </div>
              <span className={styles.formatNotes}>
                Recommended: 24-bit/96kHz FLAC for Hi-Res Master output
              </span>
            </>
          )}
        </div>
      </div>

      {/* Upload button and progress */}
      {selectedFile && !isUploading && (
        <button
          type="button"
          className={styles.uploadBtn}
          onClick={handleUpload}
        >
          Parse Metadata & Ingest Track
        </button>
      )}

      {isUploading && (
        <div className={styles.progressContainer}>
          <div className={styles.progressBarWrapper}>
            <div
              className={styles.progressBar}
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
          <span className={styles.progressText}>
            Analyzing bit depth and writing storage ({uploadProgress}%)...
          </span>
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className={styles.errorBox}>
          <AlertTriangle size={20} className={styles.errorIcon} />
          <span>{error}</span>
        </div>
      )}

      {/* Ingested Result Card */}
      {result && (
        <div className={styles.resultCard}>
          <div className={styles.resultHeader}>
            <CheckCircle2 size={22} className={styles.successIcon} />
            <h3>Successfully Ingested to Vault</h3>
          </div>

          <div className={styles.metaRow}>
            <div className={styles.metaLabel}>Track Title</div>
            <div className={styles.metaValue}>{result.title}</div>
          </div>
          <div className={styles.metaRow}>
            <div className={styles.metaLabel}>Artist / Album</div>
            <div className={styles.metaValue}>{result.artist} • {result.album}</div>
          </div>

          <div className={styles.specsBox}>
            <div className={styles.specTitleRow}>
              {result.quality.isHiRes ? (
                <span className={styles.badgeHiRes}>
                  <Sparkles size={11} /> 24-Bit Hi-Res Lossless
                </span>
              ) : result.quality.isLossless ? (
                <span className={styles.badgeLossless}>
                  <Disc size={11} /> 16-Bit Lossless
                </span>
              ) : (
                <span className={styles.badgeStandard}>Standard Delivery</span>
              )}
            </div>

            <div className={styles.specGrid}>
              <div className={styles.specCell}>
                <span className={styles.specKey}>Codec</span>
                <span className={styles.specVal}>{result.quality.codec}</span>
              </div>
              <div className={styles.specCell}>
                <span className={styles.specKey}>Bit Depth</span>
                <span className={styles.specVal}>{result.quality.bitDepth ? `${result.quality.bitDepth}-bit` : 'N/A'}</span>
              </div>
              <div className={styles.specCell}>
                <span className={styles.specKey}>Sample Rate</span>
                <span className={styles.specVal}>{result.quality.sampleRate ? `${result.quality.sampleRate / 1000} kHz` : 'N/A'}</span>
              </div>
              <div className={styles.specCell}>
                <span className={styles.specKey}>Bitrate</span>
                <span className={styles.specVal}>{result.quality.bitrate ? `${result.quality.bitrate} kbps` : 'N/A'}</span>
              </div>
            </div>
          </div>

          <Link href="/library" className={styles.viewLibraryLink}>
            <span>View in Library</span>
            <ArrowRight size={16} />
          </Link>
        </div>
      )}

      {/* Legal and Storage Rules */}
      <section className={styles.guidanceSection}>
        <h3>Audio Vault Policy & Principles</h3>
        <ul>
          <li>Only files you legally own or are permitted to possess for personal playback should be ingested.</li>
          <li>No advertisements are injected into uploaded tracks or playback streams.</li>
          <li>Files are stored securely in local private storage or S3 with authenticated byte-range seeking.</li>
        </ul>
      </section>
    </div>
  );
}
