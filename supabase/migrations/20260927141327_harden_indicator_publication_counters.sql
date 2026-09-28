create table if not exists public.indicator_publication_events (
  id uuid primary key default gen_random_uuid(),
  publication_id uuid not null references public.indicator_publications(id) on delete cascade,
  event_type text not null check (event_type in ('view','install')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists indicator_publication_events_publication_idx
  on public.indicator_publication_events (publication_id, event_type, created_at desc);
create index if not exists indicator_publication_events_actor_idx
  on public.indicator_publication_events (actor_id, created_at desc);

alter table public.indicator_publication_events enable row level security;

drop policy if exists indicator_publication_events_insert_public on public.indicator_publication_events;
create policy indicator_publication_events_insert_public
  on public.indicator_publication_events
  for insert to anon, authenticated
  with check (exists (
    select 1 from public.indicator_publications p
    where p.id = publication_id and p.status = 'published' and p.visibility = 'public'
  ));

grant insert on table public.indicator_publication_events to anon, authenticated;

create or replace function public.handle_indicator_publication_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type = 'view' then
    update public.indicator_publications
       set views_count = views_count + 1, updated_at = now()
     where id = new.publication_id and status = 'published' and visibility = 'public';
  elsif new.event_type = 'install' then
    update public.indicator_publications
       set installs_count = installs_count + 1, updated_at = now()
     where id = new.publication_id and status = 'published' and visibility = 'public';
  end if;
  return new;
end;
$$;

drop trigger if exists indicator_publication_event_counter on public.indicator_publication_events;
create trigger indicator_publication_event_counter
after insert on public.indicator_publication_events
for each row execute function public.handle_indicator_publication_event();

revoke all on function public.handle_indicator_publication_event() from public;
