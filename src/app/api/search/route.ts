import { NextRequest, NextResponse } from 'next/server';
import { ProviderRegistry } from '@/lib/providers/ProviderRegistry';
import { superviseSearchQuery } from '@/lib/ai/searchSupervisor';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    if (!query.trim()) {
      return NextResponse.json({
        query: '',
        ai: null,
        results: [],
      });
    }

    // AI Search Supervision: detects typos, canonical movie soundtrack/song intent, and primary artists
    const aiAnalysis = await superviseSearchQuery(query);

    // Run federated search across all catalogue providers with AI context
    const results = await ProviderRegistry.searchAll(query, { aiAnalysis });

    return NextResponse.json({
      query,
      ai: {
        originalQuery: aiAnalysis.originalQuery,
        correctedQuery: aiAnalysis.correctedQuery,
        intent: aiAnalysis.intent,
        movieOrAlbum: aiAnalysis.movieOrAlbum,
        songName: aiAnalysis.songName,
        primaryArtists: aiAnalysis.primaryArtists,
        language: aiAnalysis.language,
        searchVariants: aiAnalysis.searchVariants,
        isAiEnhanced: aiAnalysis.isAiEnhanced,
      },
      results,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
