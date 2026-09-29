-- TradingCoreOS production ML registry / lineage / evaluation layer.
create extension if not exists pgcrypto;

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
drop policy if exists prediction_model_artifacts_service on public.prediction_model_artifacts;
create policy prediction_model_artifacts_service on public.prediction_model_artifacts for all to service_role using (true) with check (true);

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

-- Lifecycle fields for automation deployments.
alter table if exists public.automations add column if not exists lifecycle_status text not null default 'paused';
alter table if exists public.automations add column if not exists armed_at timestamptz;
alter table if exists public.automations add column if not exists last_transition_at timestamptz;
alter table if exists public.automations drop constraint if exists automations_lifecycle_status_check;
alter table if exists public.automations add constraint automations_lifecycle_status_check check (lifecycle_status in ('draft','validated','tested','paper','armed','live','paused','retired'));
