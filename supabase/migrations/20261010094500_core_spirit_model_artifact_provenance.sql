-- CoreSpirit model artifact provenance and immutable version lifecycle.
-- Model bytes live in private object storage/model hosts; this schema stores checksums,
-- complete training lineage, owner-scoped aliases, and audit-friendly run state.
create extension if not exists pgcrypto;

create table if not exists public.core_spirit_model_artifacts (
  artifact_hash text primary key check (artifact_hash ~ '^[a-f0-9]{64}$'),
  owner_user_id uuid not null,
  model_name text not null check (length(trim(model_name)) > 0),
  model_version text not null check (length(trim(model_version)) > 0),
  artifact_uri text not null check (length(trim(artifact_uri)) > 0),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  research_artifact_hash text not null check (research_artifact_hash ~ '^[a-f0-9]{64}$'),
  compiler_version text not null,
  ir_version integer not null check (ir_version > 0),
  feature_graph_hash text not null check (feature_graph_hash ~ '^[a-f0-9]{64}$'),
  dataset_id text not null,
  dataset_version text not null,
  training_from timestamptz not null,
  training_to timestamptz not null,
  training_parameters jsonb not null default '{}'::jsonb,
  random_seed text not null,
  model_implementation text not null check (model_implementation in ('python','cpp','rust','wasm','onnx','remote')),
  backend text not null check (backend in ('cpu','gpu','wasm','onnx-runtime','native-rpc','remote')),
  dependency_versions jsonb not null default '{}'::jsonb,
  provenance jsonb not null,
  metrics jsonb not null default '{}'::jsonb,
  input_names jsonb not null default '[]'::jsonb,
  output_names jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  check (training_from <= training_to),
  unique (owner_user_id, model_name, model_version)
);
create index if not exists core_spirit_model_artifacts_owner_created
  on public.core_spirit_model_artifacts(owner_user_id, created_at desc);
create index if not exists core_spirit_model_artifacts_source_hash
  on public.core_spirit_model_artifacts(source_hash);

create table if not exists public.core_spirit_model_aliases (
  owner_user_id uuid not null,
  alias_name text not null check (length(trim(alias_name)) > 0),
  artifact_hash text not null references public.core_spirit_model_artifacts(artifact_hash) on delete restrict,
  input_names jsonb not null default '[]'::jsonb,
  output_names jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_user_id, alias_name)
);
create index if not exists core_spirit_model_aliases_artifact_hash
  on public.core_spirit_model_aliases(artifact_hash);

create table if not exists public.core_spirit_model_training_runs (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  model_name text not null,
  alias_name text not null,
  research_artifact_hash text not null check (research_artifact_hash ~ '^[a-f0-9]{64}$'),
  source_hash text check (source_hash is null or source_hash ~ '^[a-f0-9]{64}$'),
  feature_graph_hash text check (feature_graph_hash is null or feature_graph_hash ~ '^[a-f0-9]{64}$'),
  dataset_id text not null,
  dataset_version text,
  dataset_uri text,
  dataset_hash text check (dataset_hash is null or dataset_hash ~ '^[a-f0-9]{64}$'),
  requested_from timestamptz not null,
  requested_to timestamptz not null,
  training_parameters jsonb not null default '{}'::jsonb,
  random_seed text not null,
  model_implementation text not null check (model_implementation in ('python','cpp','rust','wasm','onnx','remote')),
  backend text not null check (backend in ('cpu','gpu','wasm','onnx-runtime','native-rpc','remote')),
  status text not null check (status in ('queued','running','completed','failed')),
  artifact_hash text references public.core_spirit_model_artifacts(artifact_hash) on delete restrict,
  metrics jsonb not null default '{}'::jsonb,
  failure_summary text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  check (requested_from <= requested_to)
);
create index if not exists core_spirit_training_runs_owner_created
  on public.core_spirit_model_training_runs(owner_user_id, created_at desc);
create index if not exists core_spirit_training_runs_status_created
  on public.core_spirit_model_training_runs(status, created_at);

-- The hash and provenance row are immutable, even for privileged clients. Re-training
-- creates a new artifact hash/version; mutable aliases select a pinned hash explicitly.
create or replace function public.core_spirit_reject_model_artifact_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'CoreSpirit model artifacts are immutable; create a new artifact version';
end;
$$;
drop trigger if exists core_spirit_model_artifacts_immutable on public.core_spirit_model_artifacts;
create trigger core_spirit_model_artifacts_immutable
before update or delete on public.core_spirit_model_artifacts
for each row execute function public.core_spirit_reject_model_artifact_mutation();

alter table public.core_spirit_model_artifacts enable row level security;
alter table public.core_spirit_model_aliases enable row level security;
alter table public.core_spirit_model_training_runs enable row level security;

drop policy if exists core_spirit_model_artifacts_owner_read on public.core_spirit_model_artifacts;
create policy core_spirit_model_artifacts_owner_read
  on public.core_spirit_model_artifacts for select to authenticated
  using ((select auth.uid()) = owner_user_id);
drop policy if exists core_spirit_model_artifacts_service_all on public.core_spirit_model_artifacts;
create policy core_spirit_model_artifacts_service_all
  on public.core_spirit_model_artifacts for all to service_role
  using (true) with check (true);

drop policy if exists core_spirit_model_aliases_owner_read on public.core_spirit_model_aliases;
create policy core_spirit_model_aliases_owner_read
  on public.core_spirit_model_aliases for select to authenticated
  using ((select auth.uid()) = owner_user_id);
drop policy if exists core_spirit_model_aliases_service_all on public.core_spirit_model_aliases;
create policy core_spirit_model_aliases_service_all
  on public.core_spirit_model_aliases for all to service_role
  using (true) with check (true);

drop policy if exists core_spirit_training_runs_owner_read on public.core_spirit_model_training_runs;
create policy core_spirit_training_runs_owner_read
  on public.core_spirit_model_training_runs for select to authenticated
  using ((select auth.uid()) = owner_user_id);
drop policy if exists core_spirit_training_runs_service_all on public.core_spirit_model_training_runs;
create policy core_spirit_training_runs_service_all
  on public.core_spirit_model_training_runs for all to service_role
  using (true) with check (true);

revoke all on public.core_spirit_model_artifacts from anon, authenticated;
revoke all on public.core_spirit_model_aliases from anon, authenticated;
revoke all on public.core_spirit_model_training_runs from anon, authenticated;
grant select on public.core_spirit_model_artifacts to authenticated;
grant select on public.core_spirit_model_aliases to authenticated;
grant select on public.core_spirit_model_training_runs to authenticated;
grant all on public.core_spirit_model_artifacts to service_role;
grant all on public.core_spirit_model_aliases to service_role;
grant all on public.core_spirit_model_training_runs to service_role;
