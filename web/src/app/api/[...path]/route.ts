import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { API_URL, clearSession, refreshSession, setSession } from '@/lib/server-session';
import type { Session } from '@/lib/server-session';

async function handler(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const route = path.join('/');
  const target = `${API_URL}/${route}${req.nextUrl.search}`;
  const jar = await cookies();
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  const body = hasBody ? await req.text() : undefined;

  try {
    // Login / signup: store tokens in httpOnly cookies, never return them
    if (route === 'auth/login' || route === 'auth/signup') {
      const upstream = await fetch(target, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        cache: 'no-store',
      });
      const data = await upstream.json().catch(() => ({ message: 'Unexpected response' }));
      if (!upstream.ok) return NextResponse.json(data, { status: upstream.status });
      setSession(jar, data as Session);
      jar.delete('org_id');
      return NextResponse.json({ user: (data as Session).user });
    }

    if (route === 'auth/logout') {
      clearSession(jar);
      return NextResponse.json({ ok: true });
    }

    // Everything else needs a valid access token (refresh it if expired)
    let access = jar.get('access_token')?.value;
    if (!access) {
      const refresh = jar.get('refresh_token')?.value;
      const session = refresh ? await refreshSession(refresh) : null;
      if (!session) {
        clearSession(jar);
        return NextResponse.json({ message: 'Not authenticated' }, { status: 401 });
      }
      setSession(jar, session);
      access = session.accessToken;
    }

    const headers = new Headers({ Authorization: `Bearer ${access}` });
    const contentType = req.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);
    const orgId = jar.get('org_id')?.value;
    if (orgId) headers.set('x-org-id', orgId);

    const upstream = await fetch(target, {
      method: req.method,
      headers,
      body,
      cache: 'no-store',
    });

    // Pass the body through as a stream (needed for the chat SSE later)
    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'application/json',
        'cache-control': 'no-cache, no-transform',
      },
    });
  } catch {
    return NextResponse.json({ message: 'API is unreachable' }, { status: 502 });
  }
}

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE };