'use client';

import React from 'react';
import { Keyboard, X } from 'lucide-react';
import styles from './DesktopShortcutsModal.module.css';

interface DesktopShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DesktopShortcutsModal: React.FC<DesktopShortcutsModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const shortcuts = [
    { label: 'Play / Pause', keys: ['Space'] },
    { label: 'Next Track', keys: ['Shift', 'N'] },
    { label: 'Previous Track', keys: ['Shift', 'P'] },
    { label: 'Seek Forward 5s', keys: ['→'] },
    { label: 'Seek Backward 5s', keys: ['←'] },
    { label: 'Volume Up (+5%)', keys: ['↑'] },
    { label: 'Volume Down (-5%)', keys: ['↓'] },
    { label: 'Toggle Mute', keys: ['M'] },
    { label: 'Toggle Shuffle', keys: ['S'] },
    { label: 'Cycle Repeat Mode', keys: ['R'] },
    { label: 'Toggle Queue Panel', keys: ['Q'] },
    { label: 'Immersive Fullscreen', keys: ['F'] },
    { label: 'Spotlight Quick Search', keys: ['Ctrl / ⌘', 'K'] },
    { label: 'Show / Hide Shortcuts', keys: ['?'] },
  ];

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.titleArea}>
            <Keyboard size={20} className={styles.keyboardIcon} />
            <h3 className={styles.title}>Desktop Keyboard Shortcuts</h3>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close shortcuts modal"
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.grid}>
          {shortcuts.map((sc, i) => (
            <div key={i} className={styles.shortcutItem}>
              <span className={styles.shortcutLabel}>{sc.label}</span>
              <div className={styles.keys}>
                {sc.keys.map((k, idx) => (
                  <kbd key={idx} className={styles.key}>
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <span>Supercharge your music listening with hotkeys</span>
          <span className={styles.escPill}>
            Press <kbd className={styles.key}>Esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
};
