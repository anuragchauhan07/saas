create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text,
  created_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on public.memberships (user_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  title text not null,
  storage_path text not null,
  mime_type text,
  status text not null default 'queued'
    check (status in ('queued', 'processing', 'done', 'failed')),
  summary text,
  error text,
  created_at timestamptz not null default now()
);
create index on public.documents (org_id, created_at desc);

create table public.chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding extensions.vector(768)
);
create index on public.chunks (org_id);
create index on public.chunks using hnsw (embedding extensions.vector_cosine_ops);

create table public.subscriptions (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  plan text not null default 'free' check (plan in ('free', 'pro')),
  status text not null default 'active',
  stripe_customer_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

create table public.usage_logs (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in ('document', 'query', 'embedding')),
  tokens int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.usage_logs (org_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.documents enable row level security;
alter table public.chunks enable row level security;
alter table public.subscriptions enable row level security;
alter table public.usage_logs enable row level security;