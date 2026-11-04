import { NextRequest, NextResponse } from 'next/server';
import { getGoogleOAuthUrl } from '@/lib/auth/googleAuth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const origin =
      process.env.NEXT_PUBLIC_APP_URL ||
      request.headers.get('x-forwarded-proto')
        ? `${request.headers.get('x-forwarded-proto')}://${request.headers.get('host')}`
        : request.nextUrl.origin;

    const { url, state } = getGoogleOAuthUrl(origin);

    const response = NextResponse.redirect(url);
    // Store state in a cookie for 10 minutes to protect against CSRF
    response.cookies.set('imusic_google_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
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
