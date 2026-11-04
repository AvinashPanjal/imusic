import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  getRequestOrigin,
  setSessionCookieOnResponse,
  GoogleUserSession,
  STATE_COOKIE_NAME,
} from '@/lib/auth/googleAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  const origin = getRequestOrigin(request);
  const isSecure = origin.startsWith('https:');

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

    const session: GoogleUserSession = {
      user: userInfo,
      accessToken,
      refreshToken,
      expiresAt: Date.now() + expiresIn * 1000,
    };

    // 3. Create redirect response and attach session cookie directly on the response
    const response = NextResponse.redirect(`${origin}/library?tab=youtube&connected=true`);
    setSessionCookieOnResponse(response, session, isSecure);

    // Clear state cookie
    response.cookies.delete(STATE_COOKIE_NAME);

    return response;
  } catch (err: any) {
    console.error('Error handling Google OAuth callback:', err);
    return NextResponse.redirect(
      `${origin}/library?tab=youtube&error=${encodeURIComponent(err?.message || 'Authentication failed')}`
    );
  }
}
