begin;

alter table public.historical_instrument_mappings
  add column if not exists special_sessions jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'historical_mapping_special_sessions_array'
      and conrelid = 'public.historical_instrument_mappings'::regclass
  ) then
    alter table public.historical_instrument_mappings
      add constraint historical_mapping_special_sessions_array
      check (jsonb_typeof(special_sessions) = 'array');
  end if;
end;
$$;

commit;
