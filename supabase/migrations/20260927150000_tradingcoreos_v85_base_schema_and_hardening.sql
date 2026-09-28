-- TradingCoreOS v85 reproducible base schema + operational hardening.
-- All statements are idempotent so this migration can be applied to a project
-- that already contains some of these tables.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text not null default 'Trader',
  avatar text,
  created_at timestamptz not null default now(),
  last_login timestamptz not null default now(),
  role text not null default 'trader',
  plan text not null default 'Starter OS',
  is_onboarded boolean not null default true
);
alter table public.profiles enable row level security;
drop policy if exists "users can read their profile" on public.profiles;
create policy "users can read their profile" on public.profiles for select to authenticated using (auth.uid() = id);
drop policy if exists "users can insert their profile" on public.profiles;
create policy "users can insert their profile" on public.profiles for insert to authenticated with check (auth.uid() = id);
drop policy if exists "users can update their profile" on public.profiles;
create policy "users can update their profile" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
grant select, insert, update on table public.profiles to authenticated;

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_settings enable row level security;
drop policy if exists "users can read their settings" on public.user_settings;
create policy "users can read their settings" on public.user_settings for select to authenticated using (auth.uid() = user_id);
drop policy if exists "users can insert their settings" on public.user_settings;
create policy "users can insert their settings" on public.user_settings for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "users can update their settings" on public.user_settings;
create policy "users can update their settings" on public.user_settings for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on table public.user_settings to authenticated;

create table if not exists public.prediction_models (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  algorithm text not null,
  description text,
  status text not null default 'staging' check (status in ('staging','production','retired','failed')),
  created_at timestamptz not null default now()
);

create table if not exists public.prediction_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  model_id uuid references public.prediction_models(id) on delete set null,
  symbol text not null,
  exchange text not null default 'NSE',
  timeframe text not null,
  bullish_probability numeric,
  neutral_probability numeric,
  bearish_probability numeric,
  confidence numeric,
  predicted_price numeric,
  lower_bound numeric,
  upper_bound numeric,
  market_regime text,
  features jsonb not null default '{}'::jsonb,
  explanation text,
  outcome text not null default 'pending',
  created_at timestamptz not null default now()
);
alter table public.prediction_runs enable row level security;
drop policy if exists prediction_runs_owner_read on public.prediction_runs;
create policy prediction_runs_owner_read on public.prediction_runs for select to authenticated using (auth.uid() = user_id);
drop policy if exists prediction_runs_owner_insert on public.prediction_runs;
create policy prediction_runs_owner_insert on public.prediction_runs for insert to authenticated with check (auth.uid() = user_id);
grant select, insert on table public.prediction_runs to authenticated;

create table if not exists public.automations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  status text not null default 'paused',
  trigger_type text not null default 'conditions',
  conditions jsonb not null default '[]'::jsonb,
  condition_logic text not null default 'ALL',
  actions jsonb not null default '[]'::jsonb,
  cooldown_seconds integer not null default 0,
  max_runs_per_day integer not null default 0,
  allow_order_execution boolean not null default false,
  require_confirmation boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.automations add column if not exists lifecycle_status text not null default 'paused';
alter table public.automations add column if not exists armed_at timestamptz;
alter table public.automations add column if not exists last_transition_at timestamptz;
alter table public.automations drop constraint if exists automations_lifecycle_status_check;
alter table public.automations add constraint automations_lifecycle_status_check check (lifecycle_status in ('draft','validated','tested','paper','armed','live','paused','retired'));
alter table public.automations enable row level security;
drop policy if exists automations_owner_select on public.automations;
create policy automations_owner_select on public.automations for select to authenticated using (auth.uid() = user_id);
drop policy if exists automations_owner_insert on public.automations;
create policy automations_owner_insert on public.automations for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists automations_owner_update on public.automations;
create policy automations_owner_update on public.automations for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists automations_owner_delete on public.automations;
create policy automations_owner_delete on public.automations for delete to authenticated using (auth.uid() = user_id);
grant select, insert, update, delete on table public.automations to authenticated;

create table if not exists public.corespirit_scripts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  source text not null,
  language_version text not null,
  status text not null default 'draft',
  is_published boolean not null default false,
  active_version_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.corespirit_script_versions (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.corespirit_scripts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  version integer not null,
  source text not null,
  compiled_ir jsonb,
  compiler_version text,
  compile_status text not null default 'pending',
  compile_errors jsonb not null default '[]'::jsonb,
  source_hash text,
  artifact_identity text,
  ir_version integer,
  artifact_schema_version integer,
  created_at timestamptz not null default now(),
  unique (script_id, version)
);
alter table public.corespirit_scripts enable row level security;
alter table public.corespirit_script_versions enable row level security;
drop policy if exists corespirit_scripts_owner_all on public.corespirit_scripts;
create policy corespirit_scripts_owner_all on public.corespirit_scripts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists corespirit_versions_owner_all on public.corespirit_script_versions;
create policy corespirit_versions_owner_all on public.corespirit_script_versions for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.corespirit_scripts to authenticated;
grant select, insert on table public.corespirit_script_versions to authenticated;
alter table public.corespirit_scripts drop constraint if exists corespirit_active_version_fk;
alter table public.corespirit_scripts add constraint corespirit_active_version_fk foreign key (active_version_id) references public.corespirit_script_versions(id) on delete set null;

create table if not exists public.corespirit_execution_runs (
  id uuid primary key default gen_random_uuid(),
  script_id uuid not null references public.corespirit_scripts(id) on delete cascade,
  version_id uuid references public.corespirit_script_versions(id) on delete set null,
  deployment_id uuid,
  user_id uuid not null references auth.users(id) on delete cascade,
  execution_type text not null,
  symbol text,
  timeframe text,
  status text not null,
  completed_at timestamptz,
  bars_processed integer not null default 0,
  plots_emitted integer not null default 0,
  signals_emitted integer not null default 0,
  webhook_count integer not null default 0,
  error text,
  metrics jsonb not null default '{}'::jsonb,
  manifest jsonb,
  created_at timestamptz not null default now()
);
alter table public.corespirit_execution_runs enable row level security;
drop policy if exists corespirit_runs_owner_all on public.corespirit_execution_runs;
create policy corespirit_runs_owner_all on public.corespirit_execution_runs for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update on table public.corespirit_execution_runs to authenticated;

-- Broker sessions use UUIDs to match auth.users and the rest of the platform.
create table if not exists public.broker_sessions (
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_id text not null,
  access_token_encrypted jsonb not null,
  refresh_token_encrypted jsonb,
  expires_at timestamptz not null,
  status text not null check (status in ('Connected', 'Expired', 'Disconnected')),
  connected_at timestamptz not null,
  client_code text,
  updated_at timestamptz not null default now(),
  primary key (user_id, broker_id)
);

alter table public.broker_sessions enable row level security;
drop policy if exists broker_sessions_owner_select on public.broker_sessions;
create policy broker_sessions_owner_select on public.broker_sessions for select to authenticated using (auth.uid() = user_id);
drop policy if exists broker_sessions_owner_delete on public.broker_sessions;
create policy broker_sessions_owner_delete on public.broker_sessions for delete to authenticated using (auth.uid() = user_id);
grant select, delete on table public.broker_sessions to authenticated;

create table if not exists public.oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.oauth_states enable row level security;
create index if not exists oauth_states_expiry_idx on public.oauth_states (expires_at);
create index if not exists oauth_states_user_idx on public.oauth_states (user_id, broker_id);

-- Idempotency ledger with explicit recovery state. The UNKNOWN/RECOVERY_REQUIRED
-- states prevent a server crash after broker acceptance from becoming a silent duplicate-order hazard.
create table if not exists public.order_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_id text not null,
  idempotency_key text not null,
  request_hash text not null,
  state text not null default 'pending' check (state in ('pending','completed','failed','unknown','expired','recovery_required')),
  response jsonb,
  broker_order_id text,
  attempts integer not null default 1,
  expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, broker_id, idempotency_key)
);
alter table public.order_idempotency add column if not exists broker_order_id text;
alter table public.order_idempotency add column if not exists attempts integer not null default 1;
alter table public.order_idempotency add column if not exists expires_at timestamptz;
alter table public.order_idempotency add column if not exists last_error text;
alter table public.order_idempotency drop constraint if exists order_idempotency_state_check;
alter table public.order_idempotency add constraint order_idempotency_state_check check (state in ('pending','completed','failed','unknown','expired','recovery_required'));
alter table public.order_idempotency enable row level security;
create index if not exists order_idempotency_updated_idx on public.order_idempotency (updated_at);
create index if not exists order_idempotency_recovery_idx on public.order_idempotency (state, updated_at);

revoke all on table public.order_idempotency from anon, authenticated;

create table if not exists public.execution_audit_log (
  id bigint generated by default as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  workspace_id uuid,
  actor_type text not null check (actor_type in ('user','system','broker','automation')),
  event_type text not null,
  request_id text,
  correlation_id text,
  payload jsonb,
  previous_hash text,
  event_hash text not null,
  created_at timestamptz not null default now()
);
alter table public.execution_audit_log enable row level security;
drop policy if exists audit_owner_read on public.execution_audit_log;
create policy audit_owner_read on public.execution_audit_log for select to authenticated using (auth.uid() = user_id);
grant select on table public.execution_audit_log to authenticated;
create index if not exists execution_audit_user_idx on public.execution_audit_log(user_id, created_at desc);
create index if not exists execution_audit_correlation_idx on public.execution_audit_log(correlation_id, created_at desc);

create table if not exists public.workspace_layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null,
  layout text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, broker)
);

create table if not exists public.workspace_layout_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null,
  name text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, broker, name)
);

alter table public.workspace_layouts enable row level security;
drop policy if exists workspace_layouts_owner_all on public.workspace_layouts;
create policy workspace_layouts_owner_all on public.workspace_layouts for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.workspace_layouts to authenticated;
alter table public.workspace_layout_library enable row level security;
drop policy if exists workspace_layout_library_owner_all on public.workspace_layout_library;
create policy workspace_layout_library_owner_all on public.workspace_layout_library for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
grant select, insert, update, delete on table public.workspace_layout_library to authenticated;

-- Reproducible ML registry / evaluation tables.
create table if not exists public.prediction_model_artifacts (
  id uuid primary key default gen_random_uuid(),
  model_id uuid references public.prediction_models(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  slug text not null,
  algorithm text not null,
  symbol text not null,
  timeframe text not null,
  version text not null,
  status text not null default 'staging' check (status in ('staging','production','retired','failed')),
  artifact_uri text,
  feature_schema jsonb not null default '[]'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  training_rows integer,
  validation_rows integer,
  test_rows integer,
  data_start timestamptz,
  data_end timestamptz,
  dataset_hash text,
  feature_schema_hash text,
  source_code_hash text,
  model_config_hash text,
  artifact_hash text,
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  unique (slug, symbol, timeframe, version)
);
create index if not exists prediction_model_artifacts_lookup on public.prediction_model_artifacts(symbol, timeframe, algorithm, status);
alter table public.prediction_model_artifacts enable row level security;
drop policy if exists prediction_model_artifacts_read on public.prediction_model_artifacts;
create policy prediction_model_artifacts_read on public.prediction_model_artifacts for select to authenticated using (owner_user_id is null or auth.uid() = owner_user_id);

create table if not exists public.prediction_training_runs (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid references public.prediction_model_artifacts(id) on delete set null,
  owner_user_id uuid references auth.users(id) on delete set null,
  algorithm text not null,
  symbol text not null,
  timeframe text not null,
  status text not null check (status in ('queued','running','completed','failed')),
  dataset_uri text,
  dataset_hash text,
  source_code_hash text,
  feature_schema_hash text,
  random_seed bigint,
  config jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  logs text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists prediction_training_runs_lookup on public.prediction_training_runs(symbol, timeframe, created_at desc);
alter table public.prediction_training_runs enable row level security;
drop policy if exists prediction_training_runs_read on public.prediction_training_runs;
create policy prediction_training_runs_read on public.prediction_training_runs for select to authenticated using (owner_user_id is null or auth.uid() = owner_user_id);
drop policy if exists prediction_training_runs_service on public.prediction_training_runs;
create policy prediction_training_runs_service on public.prediction_training_runs for all to service_role using (true) with check (true);

create table if not exists public.prediction_evaluations (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid references public.prediction_model_artifacts(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  symbol text not null,
  timeframe text not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  sample_count integer not null default 0,
  accuracy numeric,
  precision_score numeric,
  recall_score numeric,
  roc_auc numeric,
  log_loss numeric,
  avg_return numeric,
  profit_factor numeric,
  max_drawdown numeric,
  calibration_error numeric,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists prediction_evaluations_lookup on public.prediction_evaluations(symbol, timeframe, period_end desc);
alter table public.prediction_evaluations enable row level security;
drop policy if exists prediction_evaluations_read on public.prediction_evaluations;
create policy prediction_evaluations_read on public.prediction_evaluations for select to authenticated using (owner_user_id is null or auth.uid() = owner_user_id);
drop policy if exists prediction_evaluations_service on public.prediction_evaluations;
create policy prediction_evaluations_service on public.prediction_evaluations for all to service_role using (true) with check (true);

alter table if exists public.prediction_model_artifacts add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.prediction_training_runs add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table if exists public.prediction_evaluations add column if not exists owner_user_id uuid references auth.users(id) on delete set null;

-- Existing model artifact tables get lineage columns rather than a second parallel registry.
alter table if exists public.prediction_model_artifacts add column if not exists dataset_hash text;
alter table if exists public.prediction_model_artifacts add column if not exists feature_schema_hash text;
alter table if exists public.prediction_model_artifacts add column if not exists source_code_hash text;
alter table if exists public.prediction_model_artifacts add column if not exists model_config_hash text;
alter table if exists public.prediction_model_artifacts add column if not exists artifact_hash text;
alter table if exists public.prediction_training_runs add column if not exists source_code_hash text;
alter table if exists public.prediction_training_runs add column if not exists random_seed bigint;
alter table if exists public.prediction_training_runs add column if not exists feature_schema_hash text;

-- Broker-session UUID migration for existing installations where the old column was text.
do $$
declare
  data_type text;
begin
  select c.data_type into data_type
  from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'broker_sessions' and c.column_name = 'user_id';
  if data_type = 'text' then
    alter table public.broker_sessions drop constraint if exists broker_sessions_pkey;
    alter table public.broker_sessions alter column user_id type uuid using user_id::uuid;
    alter table public.broker_sessions add primary key (user_id, broker_id);
    alter table public.broker_sessions drop constraint if exists broker_sessions_user_id_fkey;
    alter table public.broker_sessions add constraint broker_sessions_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade;
  end if;
end $$;

-- Audit records are append-only; all writes must use the atomic append function.
create or replace function public.prevent_execution_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'execution_audit_log is append-only';
end;
$$;

drop trigger if exists execution_audit_log_no_mutation on public.execution_audit_log;
create trigger execution_audit_log_no_mutation
before update or delete on public.execution_audit_log
for each row execute function public.prevent_execution_audit_mutation();

-- Append audit events atomically per user. The advisory transaction lock prevents two
-- concurrent requests from observing the same previous_hash and forking the hash chain.
create or replace function public.append_execution_audit_event(
  p_user_id uuid,
  p_workspace_id uuid,
  p_actor_type text,
  p_event_type text,
  p_request_id text,
  p_correlation_id text,
  p_payload jsonb default null,
  p_created_at timestamptz default now()
)
returns table(id bigint, event_hash text)
language plpgsql
security definer
set search_path = public
as $$
declare
  previous_hash_value text;
  current_hash text;
  lock_key bigint;
begin
  if p_event_type is null or length(trim(p_event_type)) = 0 then
    raise exception 'event_type is required';
  end if;

  lock_key := hashtextextended(coalesce(p_user_id::text, 'system'), 0);
  perform pg_advisory_xact_lock(lock_key);

  select e.event_hash
    into previous_hash_value
  from public.execution_audit_log e
  where e.user_id is not distinct from p_user_id
  order by e.id desc
  limit 1;

  current_hash := encode(
    digest(
      jsonb_build_object(
        'actorType', p_actor_type,
        'eventType', p_event_type,
        'requestId', p_request_id,
        'correlationId', p_correlation_id,
        'payload', p_payload,
        'previousHash', previous_hash_value,
        'createdAt', p_created_at
      )::text,
      'sha256'
    ),
    'hex'
  );

  return query
  insert into public.execution_audit_log (
    user_id, workspace_id, actor_type, event_type, request_id,
    correlation_id, payload, previous_hash, event_hash, created_at
  )
  values (
    p_user_id, p_workspace_id, p_actor_type, p_event_type, p_request_id,
    p_correlation_id, p_payload, previous_hash_value, current_hash, p_created_at
  )
  returning execution_audit_log.id, execution_audit_log.event_hash;
end;
$$;

grant execute on function public.append_execution_audit_event(uuid, uuid, text, text, text, text, jsonb, timestamptz) to service_role;

-- Preserve auth-owned cloud rows on first sign-in.
create or replace function public.handle_new_user_cloud_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, avatar, created_at, last_login, role, plan, is_onboarded)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(coalesce(new.email, 'Trader'), '@', 1), 'Trader'), coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture'), coalesce(new.created_at, now()), now(), coalesce(new.raw_user_meta_data->>'role', 'trader'), coalesce(new.raw_user_meta_data->>'plan', 'Starter OS'), case when lower(coalesce(new.raw_user_meta_data->>'is_onboarded', 'true')) in ('true','1','yes') then true when lower(coalesce(new.raw_user_meta_data->>'is_onboarded', 'true')) in ('false','0','no') then false else true end)
  on conflict (id) do update set email = excluded.email, last_login = now();

  insert into public.user_settings (user_id, settings, updated_at)
  values (new.id, '{}'::jsonb, now())
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_cloud_rows on auth.users;
create trigger on_auth_user_created_cloud_rows
after insert on auth.users
for each row execute function public.handle_new_user_cloud_rows();
