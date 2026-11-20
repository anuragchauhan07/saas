'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, getCookie } from '@/lib/api';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api(`/auth/${mode}`, {
        method: 'POST',
        json:
          mode === 'signup'
            ? { email, password, name: name || undefined }
            : { email, password },
      });
      const pending = getCookie('pending_invite');
      router.push(pending ? `/invite/${pending}` : '/documents');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  const input = 'w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm';

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold">{mode === 'login' ? 'Log in to DocMind' : 'Create your account'}</h1>

        {mode === 'signup' && (
          <input className={input} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        )}
        <input className={input} type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <input className={input} type="password" placeholder="Password (min 8 characters)" required minLength={mode === 'signup' ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} />

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button disabled={loading} className="w-full rounded-md bg-zinc-900 py-2 text-sm font-medium text-white disabled:opacity-60">
          {loading ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>

        <p className="text-center text-sm text-zinc-500">
          {mode === 'login' ? (
            <>No account? <Link href="/signup" className="text-zinc-900 underline">Sign up</Link></>
          ) : (
            <>Have an account? <Link href="/login" className="text-zinc-900 underline">Log in</Link></>
          )}
        </p>
      </form>
    </div>
  );
}