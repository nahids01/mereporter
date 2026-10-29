-- 0010: Site Crawler settings + per-page crawl columns (additive, no seed rows).
-- Run in the Supabase SQL editor AFTER 0008/0009.
-- project_settings holds, per project, the Settings > General extras
-- (country, language, group, Google Place, carousel title, position
-- tracking) and the Site Crawler settings. The GA / Search Console
-- property picks themselves live on projects.gsc_site_url /
-- projects.ga4_property_id (see 0008), so every existing fetch route
-- keeps working unchanged. RLS is enabled with NO browser policies on
-- purpose: only service-role server routes read/write this table, the
-- same pattern as integration_tokens in 0008.
-- audit_scans gains per-page crawl columns. The crawl route also works
-- without them (it falls back to encoding the page detail in checks),
-- so an un-migrated database degrades instead of breaking.

create table if not exists public.project_settings (
  project_id uuid primary key references public.projects(id) on delete cascade,
  general jsonb not null default '{}'::jsonb,
  crawler jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.project_settings enable row level security;
-- Deliberately no policies: service-role server routes bypass RLS; the
-- browser (anon/authenticated) can read nothing from this table directly.

alter table public.audit_scans add column if not exists page_status text;
alter table public.audit_scans add column if not exists indexable boolean;
alter table public.audit_scans add column if not exists description text;
alter table public.audit_scans add column if not exists h1_text text;
alter table public.audit_scans add column if not exists depth integer;
alter table public.audit_scans add column if not exists issues jsonb not null default '[]'::jsonb;
