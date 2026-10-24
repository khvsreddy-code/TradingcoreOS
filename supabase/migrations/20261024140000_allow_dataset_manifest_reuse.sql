-- Identical immutable manifests are content-addressed and may be reused by a later upload session.
-- A snapshot points to the first sealed chunk session with that same content hash; additional
-- sessions may safely reference that snapshot because the canonical manifest/chunk hashes match.
drop index if exists public.corespirit_dataset_batch_session_snapshot_unique;
