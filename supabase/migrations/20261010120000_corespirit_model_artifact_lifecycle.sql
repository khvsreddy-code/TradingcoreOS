-- CoreSpirit research and model artifact lifecycle.
-- Artifacts are immutable; mutable execution state lives in training_runs/background_jobs.
create extension if not exists pgcrypto;

create table if not exists public.corespirit_research_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  compiler_version text not null,
  ir_version text not null,
  feature_graph_hash text not null check (feature_graph_hash ~ '^[a-f0-9]{64}$'),
  artifact jsonb not null,
  created_at timestamptz not null default now(),
  unique (owner_user_id, name, source_hash, feature_graph_hash)
);
create index if not exists corespirit_research_owner_created_idx
  on public.corespirit_research_artifacts(owner_user_id, created_at desc);

create table if not exists public.corespirit_model_artifacts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  research_artifact_id uuid not null references public.corespirit_research_artifacts(id) on delete restrict,
  name text not null check (length(trim(name)) between 1 and 120),
  artifact_hash text not null unique check (artifact_hash ~ '^[a-f0-9]{64}$'),
  provenance jsonb not null,
  artifact jsonb not null,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (owner_user_id, name)
);
create index if not exists corespirit_model_owner_created_idx
  on public.corespirit_model_artifacts(owner_user_id, created_at desc);
create index if not exists corespirit_model_owner_hash_idx
  on public.corespirit_model_artifacts(owner_user_id, artifact_hash);

create table if not exists public.corespirit_training_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  research_artifact_id uuid not null references public.corespirit_research_artifacts(id) on delete restrict,
  model_artifact_id uuid references public.corespirit_model_artifacts(id) on delete set null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  dataset_version text not null check (dataset_version ~ '^[a-f0-9]{64}$'),
  dataset_row_count integer not null check (dataset_row_count between 1 and 1024),
  feature_names jsonb not null,
  training_range jsonb not null,
  training_parameters jsonb not null default '{}'::jsonb,
  random_seed bigint not null check (random_seed >= 0),
  progress integer not null default 0 check (progress between 0 and 100),
  error text,
  metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists corespirit_training_owner_created_idx
  on public.corespirit_training_runs(owner_user_id, created_at desc);
create index if not exists corespirit_training_status_created_idx
  on public.corespirit_training_runs(status, created_at asc);

alter table public.corespirit_research_artifacts enable row level security;
alter table public.corespirit_model_artifacts enable row level security;
alter table public.corespirit_training_runs enable row level security;

drop policy if exists corespirit_research_owner_read on public.corespirit_research_artifacts;
create policy corespirit_research_owner_read on public.corespirit_research_artifacts
  for select to authenticated using (auth.uid() = owner_user_id);
drop policy if exists corespirit_models_owner_read on public.corespirit_model_artifacts;
create policy corespirit_models_owner_read on public.corespirit_model_artifacts
  for select to authenticated using (auth.uid() = owner_user_id);
drop policy if exists corespirit_training_owner_read on public.corespirit_training_runs;
create policy corespirit_training_owner_read on public.corespirit_training_runs
  for select to authenticated using (auth.uid() = owner_user_id);

revoke all on public.corespirit_research_artifacts, public.corespirit_model_artifacts, public.corespirit_training_runs from anon, authenticated;
grant select on public.corespirit_research_artifacts, public.corespirit_model_artifacts, public.corespirit_training_runs to authenticated;
grant all on public.corespirit_research_artifacts, public.corespirit_model_artifacts, public.corespirit_training_runs to service_role;

create or replace function public.reject_corespirit_artifact_mutation()
returns trigger language plpgsql as $$
begin
  -- Permit account-deletion cascades while rejecting direct artifact mutation.
  if TG_OP = 'DELETE' and pg_trigger_depth() > 1 then return OLD; end if;
  raise exception 'CoreSpirit artifacts are immutable; publish a new versioned artifact instead';
end;
$$;

drop trigger if exists corespirit_research_artifacts_immutable on public.corespirit_research_artifacts;
create trigger corespirit_research_artifacts_immutable
  before update or delete on public.corespirit_research_artifacts
  for each row execute function public.reject_corespirit_artifact_mutation();

drop trigger if exists corespirit_model_artifacts_immutable on public.corespirit_model_artifacts;
create trigger corespirit_model_artifacts_immutable
  before update or delete on public.corespirit_model_artifacts
  for each row execute function public.reject_corespirit_artifact_mutation();
