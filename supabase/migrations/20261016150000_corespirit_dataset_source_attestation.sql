-- Dataset integrity and source trust are distinct. A content hash proves immutability,
-- not that caller-supplied market data was truly available at the decision time.
alter table public.corespirit_dataset_snapshots
  add column if not exists source_provenance text not null default 'user_supplied',
  add column if not exists source_verified boolean not null default false,
  add column if not exists source_attestation_hash text,
  add column if not exists source_attestation jsonb not null default '{}'::jsonb;

alter table public.corespirit_dataset_snapshots
  drop constraint if exists corespirit_dataset_source_provenance_check,
  drop constraint if exists corespirit_dataset_source_attestation_hash_check,
  drop constraint if exists corespirit_dataset_source_verified_check;

alter table public.corespirit_dataset_snapshots
  add constraint corespirit_dataset_source_provenance_check
    check (source_provenance in ('user_supplied','broker_history','trusted_feature_pipeline')),
  add constraint corespirit_dataset_source_attestation_hash_check
    check (source_attestation_hash is null or source_attestation_hash ~ '^[a-f0-9]{64}$'),
  add constraint corespirit_dataset_source_verified_check
    check (
      (source_verified = false and source_attestation_hash is null)
      or
      (source_verified = true and source_provenance <> 'user_supplied' and source_attestation_hash is not null)
    );

-- Existing snapshots and client-submitted rows remain explicitly unverified.
update public.corespirit_dataset_snapshots
   set source_provenance = 'user_supplied',
       source_verified = false,
       source_attestation_hash = null,
       source_attestation = jsonb_build_object(
         'kind', 'legacy-or-client-submitted-feature-rows',
         'verified', false,
         'note', 'Dataset hash is not source attestation'
       )
 where source_verified is distinct from false
    or source_provenance is distinct from 'user_supplied'
    or source_attestation_hash is not null
    or source_attestation = '{}'::jsonb;

create index if not exists corespirit_dataset_source_verification_idx
  on public.corespirit_dataset_snapshots(owner_user_id, source_verified, created_at desc);

comment on column public.corespirit_dataset_snapshots.source_provenance is
  'Claimed source class; client submissions remain user_supplied and are not production-verifiable.';
comment on column public.corespirit_dataset_snapshots.source_verified is
  'True only for server-verified provider or trusted feature-pipeline data with a verifiable attestation hash.';
comment on column public.corespirit_dataset_snapshots.source_attestation_hash is
  'SHA-256 of the server-created source attestation; not interchangeable with dataset_hash.';
