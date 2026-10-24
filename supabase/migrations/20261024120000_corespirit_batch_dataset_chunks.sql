-- Bounded, immutable, chunk-addressed CoreSpirit research datasets.
-- Interactive row payloads stay capped in the HTTP route. Larger datasets use
-- the upload-session -> immutable manifest -> background-worker lifecycle.
create table if not exists public.corespirit_dataset_batch_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  research_artifact_id uuid not null references public.corespirit_research_artifacts(id) on delete cascade,
  feature_names jsonb not null,
  training_range jsonb not null,
  expected_row_count integer not null check (expected_row_count between 12 and 1000000),
  chunk_size integer not null check (chunk_size between 100 and 1000),
  expected_chunk_count integer not null check (expected_chunk_count between 1 and 10000),
  status text not null default 'uploading' check (status in ('uploading','sealing','sealed','failed')),
  dataset_hash text check (dataset_hash is null or dataset_hash ~ '^[a-f0-9]{64}$'),
  dataset_snapshot_id uuid,
  dataset_manifest jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  sealed_at timestamptz,
  unique (id, owner_user_id)
);

alter table public.corespirit_dataset_snapshots
  drop constraint if exists corespirit_dataset_snapshots_row_count_check;
alter table public.corespirit_dataset_snapshots
  add constraint corespirit_dataset_snapshots_row_count_check check (row_count between 12 and 1000000);

alter table public.corespirit_dataset_snapshots
  add column if not exists storage_mode text not null default 'inline-v1',
  add column if not exists batch_session_id uuid,
  add column if not exists dataset_manifest jsonb;

alter table public.corespirit_dataset_snapshots
  add constraint corespirit_dataset_snapshots_storage_mode_check
  check (storage_mode in ('inline-v1','chunked-v1'));

alter table public.corespirit_dataset_snapshots
  add constraint corespirit_dataset_snapshots_storage_shape_check
  check (
    (storage_mode = 'inline-v1' and batch_session_id is null and dataset_manifest is null
      and jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) = row_count)
    or
    (storage_mode = 'chunked-v1' and batch_session_id is not null and dataset_manifest is not null
      and jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) = 0)
  );

alter table public.corespirit_dataset_snapshots
  add constraint corespirit_dataset_snapshots_batch_session_fk
  foreign key (batch_session_id) references public.corespirit_dataset_batch_sessions(id);

alter table public.corespirit_training_runs
  drop constraint if exists corespirit_training_runs_dataset_row_count_check;
alter table public.corespirit_training_runs
  add constraint corespirit_training_runs_dataset_row_count_check check (dataset_row_count between 12 and 1000000);

create table if not exists public.corespirit_dataset_batch_chunks (
  session_id uuid not null references public.corespirit_dataset_batch_sessions(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  row_count integer not null check (row_count between 1 and 1000),
  first_timestamp bigint not null,
  last_timestamp bigint not null check (last_timestamp >= first_timestamp),
  chunk_hash text not null check (chunk_hash ~ '^[a-f0-9]{64}$'),
  rows jsonb not null check (jsonb_typeof(rows) = 'array' and jsonb_array_length(rows) = row_count),
  created_at timestamptz not null default now(),
  primary key (session_id, chunk_index),
  foreign key (session_id, owner_user_id)
    references public.corespirit_dataset_batch_sessions(id, owner_user_id) on delete cascade
);

create index if not exists corespirit_dataset_batch_chunks_owner_idx
  on public.corespirit_dataset_batch_chunks(owner_user_id, session_id, chunk_index);

alter table public.corespirit_dataset_batch_sessions enable row level security;
alter table public.corespirit_dataset_batch_chunks enable row level security;
revoke all on public.corespirit_dataset_batch_sessions, public.corespirit_dataset_batch_chunks from anon, authenticated;
grant all on public.corespirit_dataset_batch_sessions, public.corespirit_dataset_batch_chunks to service_role;

-- A chunk is append-only. Retries are handled by the application by accepting
-- an existing row only when both its index and content hash are identical.
drop trigger if exists corespirit_dataset_batch_chunks_immutable on public.corespirit_dataset_batch_chunks;
create trigger corespirit_dataset_batch_chunks_immutable
  before update or delete on public.corespirit_dataset_batch_chunks
  for each row execute function public.reject_corespirit_artifact_mutation();

create or replace function public.guard_corespirit_dataset_batch_chunk_insert()
returns trigger language plpgsql as $$
declare
  v_owner uuid;
  v_status text;
begin
  select owner_user_id, status into v_owner, v_status
    from public.corespirit_dataset_batch_sessions where id = NEW.session_id;
  if v_owner is null or v_owner <> NEW.owner_user_id then
    raise exception 'dataset chunk owner does not match upload session';
  end if;
  if v_status <> 'uploading' then
    raise exception 'dataset chunks are accepted only while the upload session is uploading';
  end if;
  return NEW;
end;
$$;

drop trigger if exists corespirit_dataset_batch_chunk_insert_guard on public.corespirit_dataset_batch_chunks;
create trigger corespirit_dataset_batch_chunk_insert_guard
  before insert on public.corespirit_dataset_batch_chunks
  for each row execute function public.guard_corespirit_dataset_batch_chunk_insert();

create index if not exists corespirit_dataset_batch_sessions_owner_created_idx
  on public.corespirit_dataset_batch_sessions(owner_user_id, created_at desc);
