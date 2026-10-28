-- 0009: DataForSEO usage log + keyword dedupe (additive, no seed rows, no key values).
-- Run in the Supabase SQL editor AFTER 0008. The usage table records ONLY
-- counts (project, kind, keyword, searches used, date) — never credentials,
-- never API responses. It is what the admin Setup page shows, so the owner
-- can see exactly what the only paid API (DataForSEO) is costing.

create table if not exists public.dataforseo_usage (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('serp', 'gbp')),
  keyword text not null,
  searches integer not null default 1 check (searches >= 0),
  created_at timestamptz not null default now()
);

alter table public.dataforseo_usage enable row level security;
-- Deliberately no browser policies: only the service-role server routes
-- write this table, and only the admin-only /api/admin/usage route reads it.

-- Dedupe stored keywords (same project + kind + keyword, keep earliest),
-- then enforce it, so auto-fetch and manual fetch can never pay twice for
-- the same keyword in the same kind. SERP and GBP are separate kinds, so
-- the same text in both is intentional and is NOT deduped away.
delete from public.keywords a using public.keywords b
where a.project_id = b.project_id and a.kind = b.kind and a.keyword = b.keyword
  and a.created_at > b.created_at;
create unique index if not exists keywords_project_kind_keyword_unique
  on public.keywords (project_id, kind, keyword);
