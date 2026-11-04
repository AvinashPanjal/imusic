import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthUrl, getRequestOrigin, STATE_COOKIE_NAME } from '@/lib/auth/googleAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const origin = getRequestOrigin(request);
    const { url, state } = getGoogleOAuthUrl(origin);

    const isSecure = origin.startsWith('https:');
    const response = NextResponse.redirect(url);
    // Store state in a cookie for 10 minutes to protect against CSRF
    response.cookies.set(STATE_COOKIE_NAME, state, {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60,
    });

    return response;
  } catch (error: any) {
    console.error('Google OAuth initialization error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to initialize Google login' }, { status: 500 });
  }
}
