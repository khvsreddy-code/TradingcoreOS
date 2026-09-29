alter table public.indicator_publications
  add column if not exists indicator_settings jsonb not null default '{}'::jsonb;

comment on column public.indicator_publications.indicator_settings is
  'Renderer-neutral indicator input/style/display settings captured with the public source snapshot.';
