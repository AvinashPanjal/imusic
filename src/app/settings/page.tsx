'use client';

import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Wifi,
  Radio,
  HardDrive,
  Smartphone,
  Sparkles,
  Info,
  Check,
  Trash2,
  Share,
  PlusSquare,
  Palette,
} from 'lucide-react';
import { OfflineDownloadManager } from '@/lib/offline/downloadManager';
import { THEMES, getStoredTheme, applyTheme, type ThemeId } from '@/lib/theme';
import styles from './settings.module.css';

export default function SettingsPage() {
  const [currentTheme, setCurrentTheme] = useState<ThemeId>('violet');
  const [streamingQuality, setStreamingQuality] = useState('auto');
  const [wifiQuality, setWifiQuality] = useState('hires');
  const [cellularQuality, setCellularQuality] = useState('high');
  const [downloadQuality, setDownloadQuality] = useState('lossless');
  const [storageUsage, setStorageUsage] = useState({ usedMB: 0, quotaMB: 0 });
  const [savedNotice, setSavedNotice] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  useEffect(() => {
    setCurrentTheme(getStoredTheme());
  }, []);

  useEffect(() => {
    // Load settings from backend
    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.settings) {
            setStreamingQuality(data.settings.streamingQuality || 'auto');
            setWifiQuality(data.settings.wifiStreamingQuality || 'hires');
            setCellularQuality(data.settings.cellularStreamingQuality || 'high');
            setDownloadQuality(data.settings.downloadQuality || 'lossless');
          }
        }
        const est = await OfflineDownloadManager.getStorageEstimate();
        setStorageUsage({
          usedMB: Math.round(est.usedBytes / (1024 * 1024)),
          quotaMB: Math.round(est.quotaBytes / (1024 * 1024)),
        });
      } catch (err) {
        console.error('Settings load error:', err);
      }
    };

    fetchSettings();
  }, []);

  const handleSaveSettings = async (updates: Partial<{
    streamingQuality: string;
    wifiStreamingQuality: string;
    cellularStreamingQuality: string;
    downloadQuality: string;
  }>) => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        setSavedNotice(true);
        setTimeout(() => setSavedNotice(false), 2000);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const handleClearOffline = async () => {
    try {
      const tracks = await OfflineDownloadManager.getAllDownloadedTracks();
      for (const t of tracks) {
        await OfflineDownloadManager.deleteDownloadedTrack(t.id);
      }
      const est = await OfflineDownloadManager.getStorageEstimate();
      setStorageUsage({
        usedMB: Math.round(est.usedBytes / (1024 * 1024)),
        quotaMB: Math.round(est.quotaBytes / (1024 * 1024)),
      });
      setShowClearConfirm(false);
      setSavedNotice(true);
      setTimeout(() => setSavedNotice(false), 2000);
    } catch (err) {
      console.error('Clear offline storage error:', err);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <span className={styles.subtitle}>Preferences & System</span>
        <h1 className={styles.title}>Settings</h1>
      </header>

      {savedNotice && (
        <div className={styles.toast}>
          <Check size={16} /> Preferences updated
        </div>
      )}

      {/* App Appearance & Accent Theme */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Palette size={18} className={styles.sectionIcon} />
          <h2>App Appearance & Accent Themes</h2>
        </div>

        <div className={styles.themeGrid}>
          {THEMES.map((theme) => {
            const isActive = currentTheme === theme.id;
            return (
              <button
                key={theme.id}
                type="button"
                className={`${styles.themeCard} ${isActive ? styles.themeCardActive : ''}`}
                onClick={() => {
                  setCurrentTheme(theme.id);
                  applyTheme(theme.id);
                  setSavedNotice(true);
                  setTimeout(() => setSavedNotice(false), 2000);
                }}
              >
                <div
                  className={styles.themeSwatch}
                  style={{ background: theme.gradient }}
                >
                  {isActive && <Check size={18} className={styles.themeCheck} />}
                </div>
                <div className={styles.themeInfo}>
                  <span className={styles.themeName}>{theme.name}</span>
                  <span className={styles.themeTagline}>{theme.tagline}</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Audio Quality Preferences */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Sliders size={18} className={styles.sectionIcon} />
          <h2>Audio Streaming Quality</h2>
        </div>

        <div className={styles.card}>
          <div className={styles.settingRow}>
            <div className={styles.settingText}>
              <span className={styles.settingLabel}>Global Quality Preset</span>
              <span className={styles.settingDesc}>
                Selects best audio asset when multiple resolutions exist
              </span>
            </div>
            <select
              value={streamingQuality}
              onChange={(e) => {
                setStreamingQuality(e.target.value);
                handleSaveSettings({ streamingQuality: e.target.value });
              }}
              className={styles.select}
            >
              <option value="auto">Automatic (Adaptive)</option>
              <option value="hires">Hi-Res Lossless (Up to 24-bit/96kHz)</option>
              <option value="lossless">Lossless (16-bit/44.1kHz)</option>
              <option value="high">High (AAC 256/320kbps)</option>
              <option value="standard">Standard (AAC 160kbps)</option>
            </select>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingText}>
              <span className={styles.settingLabel}>Wi-Fi Streaming</span>
              <span className={styles.settingDesc}>Max quality when on Wi-Fi</span>
            </div>
            <select
              value={wifiQuality}
              onChange={(e) => {
                setWifiQuality(e.target.value);
                handleSaveSettings({ wifiStreamingQuality: e.target.value });
              }}
              className={styles.select}
            >
              <option value="hires">Hi-Res Lossless (24-bit)</option>
              <option value="lossless">Lossless (16-bit)</option>
              <option value="high">High (AAC)</option>
            </select>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingText}>
              <span className={styles.settingLabel}>Cellular Streaming</span>
              <span className={styles.settingDesc}>Save mobile data allowance</span>
            </div>
            <select
              value={cellularQuality}
              onChange={(e) => {
                setCellularQuality(e.target.value);
                handleSaveSettings({ cellularStreamingQuality: e.target.value });
              }}
              className={styles.select}
            >
              <option value="high">High (AAC 256kbps)</option>
              <option value="lossless">Lossless</option>
              <option value="hires">Hi-Res Lossless</option>
            </select>
          </div>
        </div>
      </section>

      {/* Offline Storage */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <HardDrive size={18} className={styles.sectionIcon} />
          <h2>Offline Storage & Cache</h2>
        </div>

        <div className={styles.card}>
          <div className={styles.storageBarInfo}>
            <span>Offline Cached: {storageUsage.usedMB} MB</span>
            <span>Allocated Quota: {Math.round(storageUsage.quotaMB / 1024)} GB</span>
          </div>

          {showClearConfirm ? (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', marginTop: '6px' }}>
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Are you sure you want to delete all offline tracks?</span>
              <button
                type="button"
                className={styles.dangerBtn}
                style={{ background: '#ef4444', color: '#fff' }}
                onClick={handleClearOffline}
              >
                Yes, Clear All
              </button>
              <button
                type="button"
                className={styles.select}
                onClick={() => setShowClearConfirm(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.dangerBtn}
              onClick={() => setShowClearConfirm(true)}
            >
              <Trash2 size={16} /> Clear Offline Downloaded Tracks
            </button>
          )}
        </div>
      </section>

      {/* iPhone PWA Installation Guide */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Smartphone size={18} className={styles.sectionIcon} />
          <h2>iPhone Installation Guide (Add to Home Screen)</h2>
        </div>

        <div className={styles.card}>
          <ol className={styles.stepList}>
            <li>
              <strong>1. Open in Safari:</strong> Launch iOS Safari and visit this web application over HTTPS.
            </li>
            <li>
              <strong>2. Tap Share:</strong> Tap the Share button (<Share size={14} className={styles.inlineIcon} />) at the bottom toolbar of Safari.
            </li>
            <li>
              <strong>3. Add to Home Screen:</strong> Scroll down and select <em>&ldquo;Add to Home Screen&rdquo;</em> (<PlusSquare size={14} className={styles.inlineIcon} />).
            </li>
            <li>
              <strong>4. Launch Standalone:</strong> Open the newly created <strong>AVMusic</strong> app icon from your Home Screen. It will run in standalone fullscreen mode without the Safari URL bar.
            </li>
          </ol>
        </div>
      </section>

      {/* Technical Audio Output & Dynamic Island Documentation */}
      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <Info size={18} className={styles.sectionIcon} />
          <h2>Hardware Specifications & iOS Capabilities</h2>
        </div>

        <div className={styles.card}>
          <div className={styles.docItem}>
            <Sparkles size={16} className={styles.docIcon} />
            <div>
              <strong>Hi-Res Audio Output Notice:</strong>
              <p>
                iOS Safari decodes 24-bit/96kHz and 24-bit/192kHz FLAC natively. However, Bluetooth headphones (including AirPods Max and AirPods Pro) transmit via AAC or max 24-bit/48kHz. For true bit-perfect 96kHz+ playback, connect a Lightning or USB-C DAC with wired audiophile headphones.
              </p>
            </div>
          </div>

          <div className={styles.docItem}>
            <Radio size={16} className={styles.docIcon} />
            <div>
              <strong>Dynamic Island & Lock Screen:</strong>
              <p>
                When media plays, iOS displays the standard system Now Playing controls in the Dynamic Island, Control Center, and Lock Screen via the Web Media Session API. Web PWAs cannot launch custom native Live Activities without a native Swift app wrapper.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
