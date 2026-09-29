create table if not exists public.indicator_publications (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.corespirit_scripts(id) on delete cascade,
  version_id uuid not null references public.corespirit_script_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null unique,
  title text not null,
  description text not null default '',
  category text not null default 'Custom',
  tags text[] not null default '{}'::text[],
  cover_image_path text,
  cover_image_url text,
  author_name text not null default 'Trader',
  author_avatar_url text,
  source_snapshot text not null,
  language_version text not null default '1',
  source_hash text,
  license text not null default 'MIT',
  open_source boolean not null default true,
  visibility text not null default 'public' check (visibility in ('public','unlisted')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  views_count bigint not null default 0,
  installs_count bigint not null default 0,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (script_id)
);

create index if not exists indicator_publications_public_idx
  on public.indicator_publications (status, visibility, published_at desc);
create index if not exists indicator_publications_category_idx
  on public.indicator_publications (category, published_at desc);

alter table public.indicator_publications enable row level security;

drop policy if exists indicator_publications_owner_all on public.indicator_publications;
drop policy if exists indicator_publications_public_read on public.indicator_publications;

create policy indicator_publications_select on public.indicator_publications
for select to anon, authenticated
using ((status = 'published' and visibility = 'public') or (select auth.uid()) = user_id);

create policy indicator_publications_insert_own on public.indicator_publications
for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy indicator_publications_update_own on public.indicator_publications
for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy indicator_publications_delete_own on public.indicator_publications
for delete to authenticated
using ((select auth.uid()) = user_id);

grant select on table public.indicator_publications to anon, authenticated;
grant insert, update, delete on table public.indicator_publications to authenticated;

create index if not exists indicator_publications_user_idx
  on public.indicator_publications (user_id, updated_at desc);
create index if not exists indicator_publications_version_idx
  on public.indicator_publications (version_id);

insert into storage.buckets (id, name, public)
values ('indicator-covers', 'indicator-covers', true)
on conflict (id) do update set public = true;

drop policy if exists indicator_covers_public_read on storage.objects;
create policy indicator_covers_public_read on storage.objects
for select to anon, authenticated
using (bucket_id = 'indicator-covers');

drop policy if exists indicator_covers_owner_insert on storage.objects;
create policy indicator_covers_owner_insert on storage.objects
for insert to authenticated
with check (bucket_id = 'indicator-covers' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists indicator_covers_owner_update on storage.objects;
create policy indicator_covers_owner_update on storage.objects
for update to authenticated
using ((select auth.uid())::text = owner_id)
with check (bucket_id = 'indicator-covers' and (select auth.uid())::text = owner_id);

drop policy if exists indicator_covers_owner_delete on storage.objects;
create policy indicator_covers_owner_delete on storage.objects
for delete to authenticated
using ((select auth.uid())::text = owner_id);

comment on table public.indicator_publications is
  'Public user-authored CoreSpirit indicator snapshots for TradingCore Explore; source is intentionally visible when published.';
