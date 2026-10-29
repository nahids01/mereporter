-- 0011: persist keyword attributes + wizard project attributes (Nightwatch clone).
-- Run in Supabase SQL editor for the mereporter project. Additive only, no seed rows.
alter table public.keywords add column if not exists country text;
alter table public.keywords add column if not exists language text;
alter table public.keywords add column if not exists search_engine text;
alter table public.keywords add column if not exists device text;
alter table public.keywords add column if not exists tags text[];
alter table public.keywords add column if not exists translation text;
alter table public.keywords add column if not exists ranking_url text;
alter table public.keywords add column if not exists search_volume numeric;
alter table public.projects add column if not exists country text;
alter table public.projects add column if not exists language text;
alter table public.projects add column if not exists url_group text;
alter table public.projects add column if not exists is_local_business boolean not null default false;
alter table public.projects add column if not exists business_name text;
