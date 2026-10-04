-- Public CoreSpirit scripts support both indicator and strategy publications.
alter table public.indicator_publications
  add column if not exists script_kind text not null default 'indicator';

update public.indicator_publications
set script_kind = 'indicator'
where script_kind is null or script_kind = '';

alter table public.indicator_publications
  drop constraint if exists indicator_publications_script_kind_check;

alter table public.indicator_publications
  add constraint indicator_publications_script_kind_check
  check (script_kind in ('indicator', 'strategy'));

create index if not exists idx_indicator_publications_public_kind_published
  on public.indicator_publications (script_kind, published_at desc)
  where status = 'published' and visibility = 'public';
