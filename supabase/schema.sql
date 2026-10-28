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

-- ============ EXTENSIONS (additive, backward compatible, no seed rows) ============
-- New tables mirror projects ownership: a user can only touch rows of projects
-- they own. Admins do NOT get broader access through RLS here; admin-wide reads
-- go through the dedicated server route /api/admin/projects, which uses
-- SUPABASE_SECRET_KEY server-side only (see lib/server.ts). That route, not RLS,
-- is the admin path — RLS stays restrictive by design.

create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  domain text not null,
  name text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  url text not null,
  score integer not null,
  checks jsonb not null default '[]'::jsonb,
  response_time_ms integer,
  page_size_bytes integer,
  pagespeed jsonb,
  scanned_at timestamptz not null default now()
);

create table if not exists public.backlinks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_url text not null,
  target_url text,
  anchor_text text,
  rel text,
  status text not null default 'active',
  created_at timestamptz not null default now()
);

create table if not exists public.ai_prompts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  prompt text not null,
  brand_mentioned boolean,
  result_json jsonb,
  checked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.gbp_grid_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword text not null,
  centre_lat numeric,
  centre_lng numeric,
  centre_name text,
  grid_json jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ranking_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  keyword_id uuid references public.keywords(id) on delete set null,
  keyword text not null,
  kind text not null check (kind in ('serp', 'gbp')),
  rank integer,
  source text not null default 'dataforseo',
  checked_at timestamptz not null default now()
);

alter table public.competitors enable row level security;
alter table public.audit_scans enable row level security;
alter table public.backlinks enable row level security;
alter table public.ai_prompts enable row level security;
alter table public.gbp_grid_snapshots enable row level security;
alter table public.ranking_snapshots enable row level security;

create policy "own project competitors" on public.competitors for all using (
  exists (select 1 from public.projects p where p.id = competitors.project_id and p.owner_id = auth.uid()));
create policy "own project audits" on public.audit_scans for all using (
  exists (select 1 from public.projects p where p.id = audit_scans.project_id and p.owner_id = auth.uid()));
create policy "own project backlinks" on public.backlinks for all using (
  exists (select 1 from public.projects p where p.id = backlinks.project_id and p.owner_id = auth.uid()));
create policy "own project ai prompts" on public.ai_prompts for all using (
  exists (select 1 from public.projects p where p.id = ai_prompts.project_id and p.owner_id = auth.uid()));
create policy "own project gbp grids" on public.gbp_grid_snapshots for all using (
  exists (select 1 from public.projects p where p.id = gbp_grid_snapshots.project_id and p.owner_id = auth.uid()));
create policy "own project ranking snapshots" on public.ranking_snapshots for all using (
  exists (select 1 from public.projects p where p.id = ranking_snapshots.project_id and p.owner_id = auth.uid()));

-- ADMIN NOTE: do NOT widen these policies to admins. Admin-wide listing is done
-- server-side only via /api/admin/projects and /api/admin/users, which verify the
-- caller against the two admin emails in lib/access.ts and use the service key.
-- The service key must never be exposed to the browser or committed to the repo.
