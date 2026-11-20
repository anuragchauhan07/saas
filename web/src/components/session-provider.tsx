'use client';

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getCookie, setCookie } from '@/lib/api';

export type Role = 'owner' | 'admin' | 'member';
export interface Membership {
  role: Role;
  organizations: { id: string; name: string };
}
export interface Me {
  profile: { id: string; email: string; name: string | null };
  memberships: Membership[];
}

interface SessionCtx {
  me: Me;
  org: { id: string; name: string };
  role: Role;
  switchOrg: (id: string) => void;
}

const Ctx = createContext<SessionCtx | null>(null);

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [active, setActive] = useState<Membership | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<Me>('/auth/me')
      .then((data) => {
        if (cancelled) return;
        const saved = getCookie('org_id');
        const found =
          data.memberships.find((m) => m.organizations.id === saved) ??
          data.memberships[0] ??
          null;
        if (found) setCookie('org_id', found.organizations.id);
        setMe(data);
        setActive(found);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load session');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<SessionCtx | null>(() => {
    if (!me || !active) return null;
    return {
      me,
      org: active.organizations,
      role: active.role,
      switchOrg: (id: string) => {
        setCookie('org_id', id);
        window.location.reload();
      },
    };
  }, [me, active]);

  if (error) return <div className="p-8 text-red-600">{error}</div>;
  if (!value) return <div className="p-8 text-zinc-500">Loading…</div>;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}