import { cookies } from 'next/headers';

type Jar = Awaited<ReturnType<typeof cookies>>;

export const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const secure = process.env.NODE_ENV === 'production';

export interface Session {
  accessToken: string;
  refreshToken: string;
  expiresAt?: number;
  user: { id: string; email?: string };
}

export function setSession(jar: Jar, s: Session) {
  const now = Math.floor(Date.now() / 1000);
  const accessAge = Math.max((s.expiresAt ?? now + 3600) - now - 30, 60);
  const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
  jar.set('access_token', s.accessToken, { ...base, maxAge: accessAge });
  jar.set('refresh_token', s.refreshToken, { ...base, maxAge: 60 * 60 * 24 * 30 });
}

export function clearSession(jar: Jar) {
  jar.delete('access_token');
  jar.delete('refresh_token');
  jar.delete('org_id');
}

export async function refreshSession(refreshToken: string): Promise<Session | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
    cache: 'no-store',
  });
  if (!res.ok) return null;
  return (await res.json()) as Session;
}