import { describe, it, expect } from 'vitest';
import { superviseSearchQuery } from '../src/lib/ai/searchSupervisor';

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
    // Should have corrected query and movie name
    expect(res.correctedQuery.toLowerCase()).toContain('manjummel boys');
    expect(res.movieOrAlbum?.toLowerCase()).toContain('manjummel boys');
    expect(res.primaryArtists.length).toBeGreaterThanOrEqual(1);
  }, 10000);

  it('serves subsequent identical queries instantaneously from cache', async () => {
    const t0 = Date.now();
    const res1 = await superviseSearchQuery('aveshm');
    const t1 = Date.now();

    const t2 = Date.now();
    const res2 = await superviseSearchQuery('aveshm');
    const t3 = Date.now();

    expect(res2.correctedQuery.toLowerCase()).toContain('aavesham');
    // Cached response should be virtually instantaneous (< 10ms)
    expect(t3 - t2).toBeLessThan(15);
  }, 10000);
});
