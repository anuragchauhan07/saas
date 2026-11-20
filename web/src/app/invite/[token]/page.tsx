'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api, deleteCookie, setCookie } from '@/lib/api';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const [error, setError] = useState<string | null>(null);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    // If the visitor isn't logged in, api() sends them to /login;
    // this cookie brings them back here afterwards.
    setCookie('pending_invite', token, 1);

    api<{ orgId: string }>('/invites/accept', { method: 'POST', json: { token } })
      .then((res) => {
        deleteCookie('pending_invite');
        setCookie('org_id', res.orgId);
        window.location.href = '/documents';
      })
      .catch((err) => {
        if (err?.status === 401) return; // redirecting to login
        deleteCookie('pending_invite');
        setError(err instanceof Error ? err.message : 'Could not accept invitation');
      });
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-sm">
        {error ? (
          <>
            <h1 className="mb-2 text-lg font-semibold">Invitation problem</h1>
            <p className="mb-4 text-sm text-red-600">{error}</p>
            <Link href="/documents" className="text-sm underline">
              Go to my workspace
            </Link>
          </>
        ) : (
          <p className="text-zinc-500">Joining workspace…</p>
        )}
      </div>
    </div>
  );
}