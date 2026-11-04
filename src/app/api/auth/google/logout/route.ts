import { NextResponse } from 'next/server';
import { clearSessionCookieOnResponse, clearGoogleSession } from '@/lib/auth/googleAuth';

export const dynamic = 'force-dynamic';

export async function POST() {
  await clearGoogleSession();
  const response = NextResponse.json({ success: true });
  clearSessionCookieOnResponse(response);
  return response;
}

export async function GET() {
  await clearGoogleSession();
  const response = NextResponse.json({ success: true });
  clearSessionCookieOnResponse(response);
  return response;
}
