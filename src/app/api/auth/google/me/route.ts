import { NextResponse } from 'next/server';
import { getGoogleSession } from '@/lib/auth/googleAuth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const session = await getGoogleSession();
    if (!session || !session.user) {
      return NextResponse.json({ connected: false, user: null });
    }

    return NextResponse.json({
      connected: true,
      user: session.user,
    });
  } catch (err: any) {
    return NextResponse.json({ connected: false, user: null, error: err?.message }, { status: 500 });
  }
}
