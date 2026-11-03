import { describe, it, expect } from 'vitest';
import { superviseSearchQuery } from '../src/lib/ai/searchSupervisor';
import fs from 'fs';
import path from 'path';

if (!process.env.GEMINI_API_KEY) {
  try {
    const envContent = fs.readFileSync(path.resolve(__dirname, '../.env'), 'utf-8');
    const match = envContent.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)/);
    if (match) {
      process.env.GEMINI_API_KEY = match[1];
    }
  } catch {}
}

describe('AI Search Supervisor', () => {
  it('returns empty analysis for empty or whitespace query', async () => {
    const res = await superviseSearchQuery('   ');
    expect(res.originalQuery).toBe('');
    expect(res.isAiEnhanced).toBe(false);
  });

  it('supervises misspelled Indian movie query accurately', async () => {
    const res = await superviseSearchQuery('manjumel boys songs');
    expect(res.originalQuery).toBe('manjumel boys songs');
    expect(res.isAiEnhanced).toBe(true);
    // Should have corrected query, intent movie, and movie name
    expect(res.correctedQuery.toLowerCase()).toContain('manjummel boys');
    expect(res.movieOrAlbum?.toLowerCase()).toContain('manjummel boys');
    expect(res.intent).toBe('movie');
    expect(res.primaryArtists.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('supervises specific song search query as song intent', async () => {
    const res = await superviseSearchQuery('illuminati song');
    expect(res.isAiEnhanced).toBe(true);
    expect(res.intent).toBe('song');
    expect(res.songName?.toLowerCase()).toContain('illuminati');
  }, 30000);

  it('strictly prevents false positive matches on unrelated words (e.g. balan the boy)', async () => {
    const res = await superviseSearchQuery('balan the boy');
    expect(res.songName).not.toBe('Pehle Bhi Main');
    expect(res.movieOrAlbum).not.toBe('ANIMAL');
    expect(res.correctedQuery.toLowerCase()).toContain('balan');
  }, 30000);

  it('serves subsequent identical queries instantaneously from cache', async () => {
    const t0 = Date.now();
    const res1 = await superviseSearchQuery('aveshm');
    const t1 = Date.now();

    const t2 = Date.now();
    const res2 = await superviseSearchQuery('aveshm');
    const t3 = Date.now();

    expect(res2.correctedQuery.toLowerCase()).toContain('aavesham');
    // Cached response should be virtually instantaneous (< 15ms)
    expect(t3 - t2).toBeLessThan(20);
  }, 30000);
});
