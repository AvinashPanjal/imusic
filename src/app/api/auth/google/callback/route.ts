import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  setGoogleSession,
} from '@/lib/auth/googleAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const origin =
    process.env.NEXT_PUBLIC_APP_URL ||
    (request.headers.get('x-forwarded-proto')
      ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
      : request.nextUrl.origin);

  if (error) {
    console.error('Google OAuth error from query:', error);
    return NextResponse.redirect(`${origin}/library?tab=youtube&error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/library?tab=youtube&error=no_code`);
  }

  try {
    // 1. Exchange authorization code for access & refresh tokens
    const { accessToken, refreshToken, expiresIn } = await exchangeGoogleCode(code, origin);

    // 2. Fetch authenticated user's profile
    const userInfo = await fetchGoogleUserInfo(accessToken);

    // 3. Save session into secure HTTP-only cookie
    await setGoogleSession({
      user: userInfo,
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
    });

    // 4. Redirect user back to YouTube Liked Songs library
    return NextResponse.redirect(`${origin}/library?tab=youtube&connected=true`);
  } catch (err: any) {
    console.error('Error handling Google OAuth callback:', err);
    return NextResponse.redirect(
      `${origin}/library?tab=youtube&error=${encodeURIComponent(err?.message || 'Authentication failed')}`
    );
  }
}
