begin;

create table if not exists public.historical_instrument_mappings (
  instrument_id text primary key,
  fyers_symbol text not null unique,
  tv_symbol text,
  tv_exchange text,
  exchange text not null,
  instrument_type text not null default 'unknown',
  contract_expiry date,
  contract_identity text,
  tv_contract_identity text,
  tv_fut_contract integer,
  timezone text not null default 'Asia/Kolkata',
  session_open time without time zone not null default time '09:15',
  session_close time without time zone not null default time '15:30',
  adjustment_policy text not null default 'none',
  fyers_adjustment_policy text not null default 'none',
  tv_adjustment_policy text not null default 'none',
  calendar_holidays date[] not null default '{}',
  calendar_complete boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint historical_mapping_tv_pair check (
    (tv_symbol is null and tv_exchange is null) or
    (nullif(trim(tv_symbol), '') is not null and nullif(trim(tv_exchange), '') is not null)
  ),
  constraint historical_mapping_fut_contract check (
    tv_fut_contract is null or tv_fut_contract between 1 and 12
  ),
  constraint historical_mapping_calendar_order check (session_close > session_open)
);

create index if not exists historical_instrument_mappings_enabled_exchange_idx
  on public.historical_instrument_mappings (enabled, exchange, instrument_type);

create table if not exists public.historical_dataset_cache (
  instrument_id text not null,
  timeframe text not null,
  bars jsonb not null default '[]'::jsonb,
  bar_count integer not null default 0,
  oldest_timestamp timestamptz,
  newest_timestamp timestamptz,
  revision bigint not null default 1,
  source_policy text not null,
  source_status jsonb not null default '{}'::jsonb,
  degraded boolean not null default false,
  expires_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (instrument_id, timeframe),
  constraint historical_dataset_cache_bars_array check (jsonb_typeof(bars) = 'array'),
  constraint historical_dataset_cache_bar_count_nonnegative check (bar_count >= 0),
  constraint historical_dataset_cache_revision_positive check (revision >= 1),
  constraint historical_dataset_cache_newest_after_oldest check (
    oldest_timestamp is null or newest_timestamp is null or newest_timestamp >= oldest_timestamp
  )
);

create index if not exists historical_dataset_cache_expiry_idx
  on public.historical_dataset_cache (expires_at);
create index if not exists historical_dataset_cache_updated_idx
  on public.historical_dataset_cache (updated_at desc);

create or replace function public.touch_historical_dataset_cache_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  if tg_op = 'INSERT' then
    new.revision = greatest(coalesce(new.revision, 1), 1);
  else
    if new.bars is distinct from old.bars
      or new.source_policy is distinct from old.source_policy then
      new.revision = greatest(coalesce(old.revision, 1), 1) + 1;
    else
      new.revision = greatest(coalesce(old.revision, 1), 1);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists historical_dataset_cache_revision on public.historical_dataset_cache;
create trigger historical_dataset_cache_revision
before insert or update on public.historical_dataset_cache
for each row execute function public.touch_historical_dataset_cache_revision();

alter table public.historical_instrument_mappings enable row level security;
alter table public.historical_dataset_cache enable row level security;

-- Historical mappings and normalized OHLCV are accessed only from the trusted
-- server using its secret/service-role credential. Never expose these tables to
-- the browser's anon or authenticated Supabase clients.
revoke all on table public.historical_instrument_mappings from public, anon, authenticated;
revoke all on table public.historical_dataset_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.historical_instrument_mappings to service_role;
grant select, insert, update, delete on table public.historical_dataset_cache to service_role;
revoke all on function public.touch_historical_dataset_cache_revision() from public, anon, authenticated;

commit;
