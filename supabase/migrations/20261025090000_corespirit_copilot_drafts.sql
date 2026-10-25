create table if not exists public.corespirit_copilot_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  artifact_kind text not null check (artifact_kind in ('corespirit-copilot-draft','corespirit-copilot-report')),
  schema_version integer not null default 1 check (schema_version > 0),
  version integer not null default 1 check (version > 0),
  mode text not null,
  model_version text not null,
  compiler_version text not null,
  runtime_version text not null,
  source_hash text not null check (source_hash ~ '^[a-f0-9]{64}$'),
  base_source_hash text not null check (base_source_hash ~ '^[a-f0-9]{64}$'),
  prompt_hash text not null check (prompt_hash ~ '^[a-f0-9]{64}$'),
  diagnostics_hash text not null check (diagnostics_hash ~ '^[a-f0-9]{64}$'),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, artifact_hash)
);

create index if not exists corespirit_copilot_drafts_user_created_idx
  on public.corespirit_copilot_drafts (user_id, created_at desc);

create index if not exists corespirit_copilot_drafts_user_mode_idx
  on public.corespirit_copilot_drafts (user_id, mode, created_at desc);

alter table public.corespirit_copilot_drafts enable row level security;

revoke all on public.corespirit_copilot_drafts from anon, authenticated;
grant all on public.corespirit_copilot_drafts to service_role;
