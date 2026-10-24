-- Enforce immutable dataset declarations and one-way state transitions independently
-- of application code. Chunks and snapshots remain content-addressed after sealing.
alter table public.corespirit_dataset_batch_sessions
  add constraint corespirit_dataset_batch_sessions_snapshot_fk
  foreign key (dataset_snapshot_id) references public.corespirit_dataset_snapshots(id);

create unique index if not exists corespirit_dataset_batch_session_snapshot_unique
  on public.corespirit_dataset_batch_sessions(dataset_snapshot_id)
  where dataset_snapshot_id is not null;

create or replace function public.guard_corespirit_dataset_batch_session_update()
returns trigger language plpgsql as $$
begin
  if NEW.id is distinct from OLD.id
    or NEW.owner_user_id is distinct from OLD.owner_user_id
    or NEW.research_artifact_id is distinct from OLD.research_artifact_id
    or NEW.feature_names is distinct from OLD.feature_names
    or NEW.training_range is distinct from OLD.training_range
    or NEW.expected_row_count is distinct from OLD.expected_row_count
    or NEW.chunk_size is distinct from OLD.chunk_size
    or NEW.expected_chunk_count is distinct from OLD.expected_chunk_count
    or NEW.created_at is distinct from OLD.created_at then
    raise exception 'dataset batch declaration is immutable';
  end if;

  if OLD.status in ('sealed', 'failed') then
    raise exception 'sealed or failed dataset batch sessions are terminal';
  end if;

  if OLD.status = 'uploading' and NEW.status not in ('uploading', 'sealing', 'failed') then
    raise exception 'invalid dataset batch transition from uploading';
  end if;
  if OLD.status = 'sealing' and NEW.status not in ('sealing', 'sealed', 'failed') then
    raise exception 'invalid dataset batch transition from sealing';
  end if;

  if NEW.status in ('uploading', 'sealing') and
    (NEW.dataset_hash is not null or NEW.dataset_snapshot_id is not null
      or NEW.dataset_manifest is not null or NEW.sealed_at is not null) then
    raise exception 'unsealed dataset batch cannot carry a final manifest';
  end if;

  if NEW.status = 'sealed' and
    (NEW.dataset_hash is null
      or NEW.dataset_hash !~ '^[a-f0-9]{64}$'
      or NEW.dataset_snapshot_id is null
      or NEW.dataset_manifest is null
      or jsonb_typeof(NEW.dataset_manifest) is distinct from 'object'
      or NEW.dataset_manifest->>'datasetVersion' is distinct from NEW.dataset_hash
      or NEW.dataset_manifest->>'researchArtifactId' is distinct from NEW.research_artifact_id::text
      or NEW.dataset_manifest->>'rowCount' is distinct from NEW.expected_row_count::text
      or NEW.dataset_manifest->>'chunkCount' is distinct from NEW.expected_chunk_count::text
      or NEW.sealed_at is null) then
    raise exception 'sealed dataset batch requires a complete, identity-matched manifest';
  end if;

  NEW.updated_at := coalesce(NEW.updated_at, now());
  return NEW;
end;
$$;

drop trigger if exists corespirit_dataset_batch_session_update_guard on public.corespirit_dataset_batch_sessions;
create trigger corespirit_dataset_batch_session_update_guard
  before update on public.corespirit_dataset_batch_sessions
  for each row execute function public.guard_corespirit_dataset_batch_session_update();
