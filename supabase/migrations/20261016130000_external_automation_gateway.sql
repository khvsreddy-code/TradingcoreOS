-- External AI/workflow integrations with scoped credentials, a durable signal feed,
-- and an atomic idempotency/daily-cap claim for every requested order.
-- Apply after the base workspace schema and FYERS order-state reconciliation migration.

alter table public.automations
  add column if not exists lifecycle_state text not null default 'CREATED';
alter table public.automations
  add column if not exists lifecycle_version integer not null default 1;
alter table public.automations
  add column if not exists lifecycle_transition_at timestamptz;
alter table public.automations
  add column if not exists lifecycle_transition_actor text;
alter table public.automations
  add column if not exists lifecycle_transition_reason text;

create table if not exists public.automation_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  broker_id text not null check (broker_id in ('fyers')),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_prefix text not null,
  scopes text[] not null default array['market:read','signals:read','orders:request']::text[],
  allowed_symbols text[] not null check (cardinality(allowed_symbols) between 1 and 100),
  max_order_quantity integer not null check (max_order_quantity between 1 and 1000),
  max_order_notional numeric(18,2) not null check (max_order_notional > 0 and max_order_notional <= 100000000),
  max_position_notional numeric(18,2) not null check (max_position_notional > 0 and max_position_notional <= 500000000),
  max_account_exposure_notional numeric(18,2) not null check (max_account_exposure_notional > 0 and max_account_exposure_notional <= 500000000),
  max_daily_orders integer not null check (max_daily_orders between 1 and 1000),
  margin_buffer_percent numeric(5,2) not null default 15 check (margin_buffer_percent between 0 and 50),
  allow_live_orders boolean not null default false,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_integrations_expiry_check check (expires_at > created_at)
);
create index if not exists automation_integrations_owner_idx
  on public.automation_integrations (user_id, created_at desc);
create index if not exists automation_integrations_automation_idx
  on public.automation_integrations (automation_id, revoked_at, expires_at);

create table if not exists public.automation_signal_events (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.automation_integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 200),
  event_type text not null,
  symbol text not null,
  timeframe text not null default '',
  source_id text not null default '',
  run_id text not null default '',
  mode text not null,
  bar_index integer not null default -1,
  signal_timestamp timestamptz not null,
  payload jsonb not null,
  payload_hash text not null check (payload_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (integration_id, event_id)
);
create index if not exists automation_signal_events_feed_idx
  on public.automation_signal_events (integration_id, created_at asc);
create index if not exists automation_signal_events_symbol_idx
  on public.automation_signal_events (automation_id, symbol, signal_timestamp desc);

create table if not exists public.automation_order_requests (
  id uuid primary key default gen_random_uuid(),
  integration_id uuid not null references public.automation_integrations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  automation_id uuid not null references public.automations(id) on delete cascade,
  external_request_id text not null check (length(external_request_id) between 8 and 128),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'PROCESSING' check (state in (
    'PROCESSING','PAPER','INTENT','SUBMITTED','ACKNOWLEDGED','OPEN','PARTIAL',
    'FILLED','CANCEL_PENDING','CANCELLED','REJECTED','EXPIRED','UNKNOWN','RECOVERY_REQUIRED'
  )),
  payload jsonb not null,
  response jsonb,
  client_order_id text,
  broker_order_id text,
  signal_id text,
  estimated_notional numeric(18,2),
  risk_checks jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (integration_id, external_request_id)
);
create index if not exists automation_order_requests_owner_idx
  on public.automation_order_requests (user_id, created_at desc);
create index if not exists automation_order_requests_daily_cap_idx
  on public.automation_order_requests (integration_id, created_at desc, state);
create index if not exists automation_order_requests_broker_order_idx
  on public.automation_order_requests (user_id, broker_order_id)
  where broker_order_id is not null;

alter table public.automation_integrations enable row level security;
alter table public.automation_signal_events enable row level security;
alter table public.automation_order_requests enable row level security;
revoke all on table public.automation_integrations from anon, authenticated;
revoke all on table public.automation_signal_events from anon, authenticated;
revoke all on table public.automation_order_requests from anon, authenticated;
grant select, insert, update, delete on table public.automation_integrations to service_role;
grant select, insert, update, delete on table public.automation_signal_events to service_role;
grant select, insert, update, delete on table public.automation_order_requests to service_role;

-- The integration row lock serializes claims for a single credential. It is the
-- durable idempotency authority and also makes daily-cap accounting race-safe.
create or replace function public.claim_automation_order_request(
  p_integration_id uuid,
  p_external_request_id text,
  p_request_hash text,
  p_payload jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_integration public.automation_integrations%rowtype;
  v_existing public.automation_order_requests%rowtype;
  v_created public.automation_order_requests%rowtype;
  v_live_count integer;
  v_utc_day_start timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
begin
  if p_integration_id is null
     or nullif(trim(p_external_request_id), '') is null
     or length(p_external_request_id) < 8 or length(p_external_request_id) > 128
     or p_request_hash is null or p_request_hash !~ '^[a-f0-9]{64}$'
     or p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'valid integration, idempotency key, hash, and JSON object are required';
  end if;

  select * into v_integration
  from public.automation_integrations
  where id = p_integration_id
  for update;
  if not found or v_integration.revoked_at is not null or v_integration.expires_at <= now() then
    raise exception 'automation integration is not active';
  end if;

  select * into v_existing
  from public.automation_order_requests
  where integration_id = p_integration_id and external_request_id = p_external_request_id;
  if found then
    if v_existing.request_hash <> p_request_hash then
      return jsonb_build_object('claimed', false, 'conflict', 'request_mismatch', 'record', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('claimed', false, 'record', to_jsonb(v_existing));
  end if;

  select count(*)::integer into v_live_count
  from public.automation_order_requests
  where integration_id = p_integration_id
    and created_at >= v_utc_day_start
    and payload->>'mode' = 'LIVE';
  if v_live_count >= v_integration.max_daily_orders then
    return jsonb_build_object('claimed', false, 'conflict', 'daily_limit');
  end if;

  insert into public.automation_order_requests (
    integration_id, user_id, automation_id, external_request_id, request_hash,
    state, payload, signal_id
  ) values (
    v_integration.id, v_integration.user_id, v_integration.automation_id,
    p_external_request_id, p_request_hash, 'PROCESSING', p_payload,
    nullif(p_payload->>'signalId', '')
  )
  returning * into v_created;
  return jsonb_build_object('claimed', true, 'record', to_jsonb(v_created));
end;
$$;

revoke all on function public.claim_automation_order_request(uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.claim_automation_order_request(uuid, text, text, jsonb) to service_role;
