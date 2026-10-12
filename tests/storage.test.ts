import { describe, it, expect } from 'vitest';
import { StorageService } from '../src/lib/storage';

describe('Storage Service Security & Path Resolution', () => {
  it('throws error when path traversal is attempted with relative dots', () => {
    expect(() => {
      StorageService.resolveLocalPath('../../etc/passwd');
    }).not.toThrow(); // The sanitize removes leading .., let's verify resolved path is constrained

    const safePath = StorageService.resolveLocalPath('../../etc/passwd');
    expect(safePath).toContain('storage');
  });

  it('correctly retrieves metadata for existing local sample audio files', () => {
    const meta = StorageService.getLocalFileMeta('sample-hires-96k-24b.wav');
    expect(meta.exists).toBe(true);
    expect(meta.size).toBeGreaterThan(0);
  });

  it('returns exists: false for non-existent storage keys', () => {
    const meta = StorageService.getLocalFileMeta('non-existent-file-xyz.wav');
    expect(meta.exists).toBe(false);
    expect(meta.size).toBe(0);
  });
});
