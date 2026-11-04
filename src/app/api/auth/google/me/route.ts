import { NextRequest, NextResponse } from 'next/server';
import { getGoogleSession, getGoogleSessionFromRequest } from '@/lib/auth/googleAuth';

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

    return NextResponse.json(
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
