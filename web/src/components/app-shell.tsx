'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useSession } from './session-provider';

// Chat and Team links get added in the next step
const NAV = [
  { href: '/documents', label: 'Documents' },
  { href: '/chat', label: 'Chat' },
  { href: '/team', label: 'Team' },
];
export function AppShell({ children }: { children: React.ReactNode }) {
  const { me, org, role, switchOrg } = useSession();
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await api('/auth/logout', { method: 'POST' });
    router.push('/login');
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-semibold">DocMind</span>

          <nav className="flex gap-4 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={
                  pathname.startsWith(n.href)
                    ? 'font-medium text-zinc-900'
                    : 'text-zinc-500 hover:text-zinc-900'
                }
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 text-sm">
            <select
              value={org.id}
              onChange={(e) => switchOrg(e.target.value)}
              className="rounded-md border border-zinc-300 bg-white px-2 py-1"
            >
              {me.memberships.map((m) => (
                <option key={m.organizations.id} value={m.organizations.id}>
                  {m.organizations.name}
                </option>
              ))}
            </select>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs capitalize">{role}</span>
            <span className="hidden text-zinc-500 sm:inline">{me.profile.email}</span>
            <button onClick={logout} className="text-zinc-500 hover:text-zinc-900">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}