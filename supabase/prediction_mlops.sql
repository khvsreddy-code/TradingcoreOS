-- TradingCoreOS production ML registry / evaluation layer.
-- Keeps model lifecycle separate from individual user prediction runs.

create table if not exists public.prediction_model_artifacts (
  id uuid primary key default gen_random_uuid(),
  model_id uuid references public.prediction_models(id) on delete set null,
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
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  unique (slug, symbol, timeframe, version)
);

create index if not exists prediction_model_artifacts_lookup
  on public.prediction_model_artifacts(symbol, timeframe, algorithm, status);

create table if not exists public.prediction_training_runs (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid references public.prediction_model_artifacts(id) on delete set null,
  algorithm text not null,
  symbol text not null,
  timeframe text not null,
  status text not null check (status in ('queued','running','completed','failed')),
  dataset_uri text,
  dataset_hash text,
  config jsonb not null default '{}'::jsonb,
  metrics jsonb not null default '{}'::jsonb,
  logs text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists prediction_training_runs_lookup
  on public.prediction_training_runs(symbol, timeframe, created_at desc);

create table if not exists public.prediction_evaluations (
  id uuid primary key default gen_random_uuid(),
  artifact_id uuid references public.prediction_model_artifacts(id) on delete cascade,
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

create index if not exists prediction_evaluations_lookup
  on public.prediction_evaluations(symbol, timeframe, period_end desc);

alter table public.prediction_model_artifacts enable row level security;
alter table public.prediction_training_runs enable row level security;
alter table public.prediction_evaluations enable row level security;

-- Model metadata is safe for authenticated users to read. Writes stay service-role only.
drop policy if exists prediction_model_artifacts_read on public.prediction_model_artifacts;
create policy prediction_model_artifacts_read on public.prediction_model_artifacts
  for select to authenticated using (true);

drop policy if exists prediction_training_runs_service on public.prediction_training_runs;
create policy prediction_training_runs_service on public.prediction_training_runs
  for all to service_role using (true) with check (true);

drop policy if exists prediction_evaluations_read on public.prediction_evaluations;
create policy prediction_evaluations_read on public.prediction_evaluations
  for select to authenticated using (true);

drop policy if exists prediction_evaluations_service on public.prediction_evaluations;
create policy prediction_evaluations_service on public.prediction_evaluations
  for all to service_role using (true) with check (true);
