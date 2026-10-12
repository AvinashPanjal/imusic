import { describe, it, expect } from 'vitest';
import { parseLrc, formatTime } from '../src/lib/lyrics';

describe('Lyrics Parser and Time Formatter', () => {
  it('correctly parses LRC synchronized lines into chronological time-stamped array', () => {
    const sampleLrc = `
      [00:04.50] First line of lyrics
      [00:12.80] Second line follows
      [01:05.10] Chorus section begins
    `;

    const parsed = parseLrc(sampleLrc);

    expect(parsed).toHaveLength(3);
    expect(parsed[0].time).toBeCloseTo(4.5, 1);
    expect(parsed[0].text).toBe('First line of lyrics');

    expect(parsed[1].time).toBeCloseTo(12.8, 1);
    expect(parsed[1].text).toBe('Second line follows');

    expect(parsed[2].time).toBeCloseTo(65.1, 1);
    expect(parsed[2].text).toBe('Chorus section begins');
  });

  it('handles empty or malformed strings gracefully without throwing', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc(null as any)).toEqual([]);
    expect(parseLrc('Just plain text without timestamps')).toEqual([]);
  });

  it('formats seconds into accurate MM:SS display format', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(65)).toBe('1:05');
    expect(formatTime(215)).toBe('3:35');
    expect(formatTime(-5)).toBe('0:00');
    expect(formatTime(NaN)).toBe('0:00');
  });
});
