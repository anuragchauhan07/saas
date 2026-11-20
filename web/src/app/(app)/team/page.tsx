'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, setCookie } from '@/lib/api';
import { useSession } from '@/components/session-provider';

interface Profile {
  id: string;
  email: string;
  name: string | null;
}
interface Member {
  role: 'owner' | 'admin' | 'member';
  created_at: string;
  profiles: Profile | Profile[] | null;
}

const field = 'rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm';

export default function TeamPage() {
  const { me, org, role } = useSession();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member' | 'admin'>('member');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [newOrg, setNewOrg] = useState('');

  const canManage = role === 'owner' || role === 'admin';

  const load = useCallback(async () => {
    try {
      setMembers(await api<Member[]>('/orgs/current/members'));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const profileOf = (m: Member): Profile | null =>
    Array.isArray(m.profiles) ? (m.profiles[0] ?? null) : m.profiles;

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInviteLink(null);
    try {
      const res = await api<{ inviteLink: string }>('/orgs/current/invites', {
        method: 'POST',
        json: { email, role: inviteRole },
      });
      setInviteLink(res.inviteLink);
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create invite');
    }
  }

  async function remove(userId: string) {
    if (!confirm('Remove this member?')) return;
    setError(null);
    try {
      await api(`/orgs/current/members/${userId}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove member');
    }
  }

  async function createOrg(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const created = await api<{ id: string }>('/orgs', { method: 'POST', json: { name: newOrg } });
      setCookie('org_id', created.id);
      window.location.href = '/documents';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create workspace');
    }
  }

  function canRemove(m: Member) {
    const p = profileOf(m);
    if (!canManage || !p || p.id === me.profile.id) return false;
    if (m.role === 'owner') return false;
    if (m.role === 'admin' && role !== 'owner') return false;
    return true;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Team</h1>
        <p className="text-sm text-zinc-500">Members of {org.name}</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white">
        {loading ? (
          <p className="p-4 text-zinc-500">Loading…</p>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {members.map((m, i) => {
              const p = profileOf(m);
              return (
                <li key={p?.id ?? i} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p?.name || p?.email}</p>
                    <p className="truncate text-xs text-zinc-500">{p?.email}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs capitalize">{m.role}</span>
                    {canRemove(m) && p && (
                      <button onClick={() => remove(p.id)} className="text-sm text-zinc-400 hover:text-red-600">
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Invite someone</h2>
        {canManage ? (
          <>
            <form onSubmit={invite} className="flex flex-wrap gap-2">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@example.com"
                className={`${field} min-w-60 flex-1`}
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as 'member' | 'admin')}
                className={field}
              >
                <option value="member">Member</option>
                {role === 'owner' && <option value="admin">Admin</option>}
              </select>
              <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">
                Create invite link
              </button>
            </form>
            {inviteLink && (
              <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md bg-zinc-50 p-3 text-sm">
                <code className="break-all">{inviteLink}</code>
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(inviteLink);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs"
                >
                  {copied ? 'Copied' : 'Copy'}
                </button>
                <p className="w-full text-xs text-zinc-500">
                  Send this link to the invitee. It only works for the email you entered and expires in 7 days.
                </p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">Only owners and admins can invite people.</p>
        )}
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 font-medium">Create another workspace</h2>
        <form onSubmit={createOrg} className="flex gap-2">
          <input
            required
            maxLength={80}
            value={newOrg}
            onChange={(e) => setNewOrg(e.target.value)}
            placeholder="Workspace name"
            className={`${field} flex-1`}
          />
          <button className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white">Create</button>
        </form>
      </section>
    </div>
  );
}