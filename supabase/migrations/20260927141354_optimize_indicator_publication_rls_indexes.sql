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

create index if not exists indicator_publications_user_idx
  on public.indicator_publications (user_id, updated_at desc);
create index if not exists indicator_publications_version_idx
  on public.indicator_publications (version_id);

create index if not exists indicator_publication_events_actor_idx
  on public.indicator_publication_events (actor_id, created_at desc);
