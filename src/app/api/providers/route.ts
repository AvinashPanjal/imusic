import { NextResponse } from 'next/server';
import { ProviderRegistry } from '@/lib/providers/ProviderRegistry';

export async function GET() {
  try {
    const providers = ProviderRegistry.getAll().map((p) => ({
      code: p.code,
      name: p.name,
      description: p.description,
      capabilities: p.capabilities,
      termsNotice: p.getTermsNotice(),
    }));

    return NextResponse.json({ providers });
  } catch (error) {
    console.error('Error fetching providers:', error);
    return NextResponse.json({ error: 'Failed to fetch providers' }, { status: 500 });
  }
}
