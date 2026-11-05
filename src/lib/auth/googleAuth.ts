import crypto from 'crypto';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export interface GoogleUserSession {
  user: {
    id: string;
    email: string;
    name: string;
    picture: string;
  };
  accessToken: string;
  refreshToken?: string;
  expiresAt: number; // Unix timestamp in ms
}

export const COOKIE_NAME = 'imusic_google_session';
export const STATE_COOKIE_NAME = 'imusic_google_oauth_state';

function getSecretKey(): Buffer {
  const secret = process.env.AUTH_SECRET || 'imusic-default-super-secure-key-32b!';
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Determine the exact origin URL for the incoming request
 */
export function getRequestOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  const host = request.headers.get('host');
  if (host) {
    const proto = request.url.startsWith('https') ? 'https' : 'http';
    return `${proto}://${host}`;
  }
  return request.nextUrl.origin;
}

/**
 * Encrypt session data into a safe string
 */
export function encryptSession(session: GoogleUserSession): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', getSecretKey(), iv);
  const json = JSON.stringify(session);
  const encrypted = Buffer.concat([cipher.update(json, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypt session string back to GoogleUserSession
 */
export function decryptSession(cookieValue: string): GoogleUserSession | null {
  try {
    const [ivHex, tagHex, encryptedHex] = cookieValue.split(':');
    if (!ivHex || !tagHex || !encryptedHex) return null;

    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    const decipher = crypto.createDecipheriv('aes-256-gcm', getSecretKey(), iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    return null;
  }
}

/**
 * Read session directly from NextRequest cookies
 */
export function getGoogleSessionFromRequest(request: NextRequest): GoogleUserSession | null {
  const sessionCookie = request.cookies.get(COOKIE_NAME);
  if (!sessionCookie?.value) return null;
  return decryptSession(sessionCookie.value);
}

/**
 * Get current Google session from cookies (with auto-refresh if expired)
 */
export async function getGoogleSession(req?: NextRequest): Promise<GoogleUserSession | null> {
  let sessionValue: string | undefined;

  if (req) {
    sessionValue = req.cookies.get(COOKIE_NAME)?.value;
  }

  if (!sessionValue) {
    try {
      const cookieStore = cookies();
      sessionValue = cookieStore.get(COOKIE_NAME)?.value;
    } catch {
      // In certain server contexts cookies() may throw
    }
  }

  if (!sessionValue) return null;

  const session = decryptSession(sessionValue);
  if (!session) return null;

  // If token is about to expire within 5 minutes and we have a refreshToken, refresh it
  if (session.expiresAt && Date.now() > session.expiresAt - 5 * 60 * 1000 && session.refreshToken) {
    try {
      const refreshed = await refreshGoogleAccessToken(session.refreshToken);
      if (refreshed.accessToken) {
        session.accessToken = refreshed.accessToken;
        session.expiresAt = Date.now() + refreshed.expiresIn * 1000;
        if (refreshed.refreshToken) session.refreshToken = refreshed.refreshToken;
        await setGoogleSession(session);
      }
    } catch (e) {
      console.warn('Failed to refresh Google token:', e);
    }
  }

  return session;
}

/**
 * Set session cookie directly on a NextResponse (e.g. on redirect response)
 */
export function setSessionCookieOnResponse(
  response: NextResponse,
  session: GoogleUserSession,
  isSecure: boolean
): void {
  const encrypted = encryptSession(session);
  response.cookies.set(COOKIE_NAME, encrypted, {
    httpOnly: true,
    secure: isSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });
}

/**
 * Clear session cookie directly on a NextResponse
 */
export function clearSessionCookieOnResponse(response: NextResponse): void {
  response.cookies.delete(COOKIE_NAME);
}

/**
 * Save Google session into secure HTTP-only cookie using cookies()
 */
export async function setGoogleSession(session: GoogleUserSession): Promise<void> {
  const encrypted = encryptSession(session);
  try {
    const cookieStore = cookies();
    cookieStore.set(COOKIE_NAME, encrypted, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });
  } catch {}
}

/**
 * Clear Google session cookie
 */
export async function clearGoogleSession(): Promise<void> {
  try {
    const cookieStore = cookies();
    cookieStore.delete(COOKIE_NAME);
  } catch {}
}

function getGoogleCredentials() {
  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim().replace(/^["']+|["']+$/g, '');
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim().replace(/^["']+|["']+$/g, '');
  return { clientId, clientSecret };
}

/**
 * Generate Google OAuth 2.0 authorization URL
 */
export function getGoogleOAuthUrl(origin: string): { url: string; state: string } {
  const { clientId } = getGoogleCredentials();
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = crypto.randomBytes(24).toString('hex');

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/youtube.readonly',
    ].join(' '),
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    state,
  };
}

/**
 * Exchange OAuth authorization code for tokens
 */
export async function exchangeGoogleCode(
  code: string,
  origin: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const { clientId, clientSecret } = getGoogleCredentials();
  const redirectUri = `${origin}/api/auth/google/callback`;

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token exchange failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Refresh an expired access token using the stored refresh token
 */
export async function refreshGoogleAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; refreshToken?: string; expiresIn: number }> {
  const { clientId, clientSecret } = getGoogleCredentials();

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${errText}`);
  }

  const data = await res.json();
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: data.expires_in || 3600,
  };
}

/**
 * Fetch user info (email, name, picture) using access token
 */
export async function fetchGoogleUserInfo(accessToken: string): Promise<{
  id: string;
  email: string;
  name: string;
  picture: string;
}> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch Google user profile: ${res.status}`);
  }

  const data = await res.json();
  return {
    id: data.id,
    email: data.email || '',
    name: data.name || data.email?.split('@')[0] || 'Google User',
    picture: data.picture || '',
  };
}
