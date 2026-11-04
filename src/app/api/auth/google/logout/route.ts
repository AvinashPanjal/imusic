import { NextResponse } from 'next/server';
import { clearGoogleSession } from '@/lib/auth/googleAuth';

export const dynamic = 'force-dynamic';

export async function POST() {
  await clearGoogleSession();
  return NextResponse.json({ success: true });
}

export async function GET() {
  await clearGoogleSession();
  return NextResponse.json({ success: true });
}
