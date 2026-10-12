import { NextRequest, NextResponse } from 'next/server';
import { ProviderRegistry } from '@/lib/providers/ProviderRegistry';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q') || '';

    const results = await ProviderRegistry.searchAll(query);

    return NextResponse.json({
      query,
      results,
    });
  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
