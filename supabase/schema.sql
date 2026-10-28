-- MeReporter schema. Run this in the Supabase SQL editor for the
-- "mereporter" project (West Europe / London, eu-west-2) BEFORE first use.
-- No seed data is inserted: a fresh install is intentionally empty.
-- No key values belong in this file.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null default 'user' check (role in ('admin', 'user')),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  website_url text not null,
  location text,
  created_at timestamptz not null default now()
);

create table if not exists public.keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('serp', 'gbp')),
  keyword text not null,
  rank integer,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.metric_imports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source text not null check (source in ('gsc', 'ga4', 'bing', 'csv')),
  metric text not null,
  value numeric,
  imported_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  month text not null,
  report_json jsonb not null,
  status text not null default 'draft' check (status in ('draft', 'sent', 'failed')),
  created_at timestamptz not null default now(),
  unique (project_id, month)
);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.keywords enable row level security;
alter table public.metric_imports enable row level security;
alter table public.reports enable row level security;

-- Users read only their own profile; admins are enforced in app code too.
create policy "own profile" on public.profiles for select using (auth.uid() = id);
create policy "own projects" on public.projects for all using (auth.uid() = owner_id);
create policy "own project keywords" on public.keywords for all using (
  exists (select 1 from public.projects p where p.id = keywords.project_id and p.owner_id = auth.uid())
);
create policy "own project metrics" on public.metric_imports for all using (
  exists (select 1 from public.projects p where p.id = metric_imports.project_id and p.owner_id = auth.uid())
);
create policy "own project reports" on public.reports for all using (
  exists (select 1 from public.projects p where p.id = reports.project_id and p.owner_id = auth.uid())
);

-- NOTE: Admins (the two initial admin emails) must be granted broader access
-- via a service-role route or a dedicated admin policy after the first admin
-- signs up. Do NOT disable RLS. Do NOT add demo/seed rows.
