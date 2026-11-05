import { NextRequest, NextResponse } from 'next/server';
import {
  getGoogleSession,
  getGoogleSessionFromRequest,
  refreshGoogleAccessToken,
  setSessionCookieOnResponse,
} from '@/lib/auth/googleAuth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    let session = getGoogleSessionFromRequest(request);
    if (!session) {
      session = await getGoogleSession(request);
    }

    if (!session || !session.user) {
      return NextResponse.json(
        { connected: false, user: null },
        {
          headers: {
            'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
          },
        }
      );
    }

    let tokenRefreshed = false;
    const isExpired = session.expiresAt && Date.now() > session.expiresAt - 5 * 60 * 1000;
    if (isExpired && session.refreshToken) {
      try {
        const refreshed = await refreshGoogleAccessToken(session.refreshToken);
        if (refreshed.accessToken) {
          session.accessToken = refreshed.accessToken;
          session.expiresAt = Date.now() + refreshed.expiresIn * 1000;
          if (refreshed.refreshToken) session.refreshToken = refreshed.refreshToken;
          tokenRefreshed = true;
        }
      } catch (e) {
        console.warn('Auto-refresh token on /me check failed:', e);
      }
    }

    const response = NextResponse.json(
      {
        connected: true,
        user: session.user,
      },
      {
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );

    if (tokenRefreshed) {
      const isSecure = process.env.NODE_ENV === 'production';
      setSessionCookieOnResponse(response, session, isSecure);
    }

    return response;
  } catch (err: any) {
    return NextResponse.json(
      { connected: false, user: null, error: err?.message },
      {
        status: 500,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        },
      }
    );
  }
}
