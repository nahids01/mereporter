-- 0008: live GSC/GA4/Bing connection tokens (additive, no seed rows, no key values).
-- Run this in the Supabase SQL editor for the "mereporter" project AFTER schema.sql.
-- Tokens are read/written ONLY by server routes with the service-role client
-- (see lib/server.ts). RLS is enabled with NO browser policies on purpose:
-- an authenticated browser session must never be able to read a token row,
-- and status endpoints return booleans + site/property + expiry only.

create table if not exists public.integration_tokens (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  provider text not null check (provider in ('gsc', 'ga4')),
  site_url text,
  property_id text,
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, provider)
);

alter table public.integration_tokens enable row level security;
-- Deliberately no policies: service-role server routes bypass RLS; the
-- browser (anon/authenticated) can read nothing from this table.

alter table public.projects add column if not exists gsc_site_url text;
alter table public.projects add column if not exists ga4_property_id text;
alter table public.projects add column if not exists bing_site_url text;
