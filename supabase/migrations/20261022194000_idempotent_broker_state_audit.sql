-- Idempotent, hash-chained audit recording for durable broker order-state events.
-- This lets a retried WebSocket/reconciliation event fill a missing audit write
-- without duplicating the entry in the immutable per-user hash chain.
create table if not exists public.execution_audit_event_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  event_key text not null,
  audit_id bigint not null references public.execution_audit_log(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (user_id, event_key)
);

alter table public.execution_audit_event_keys enable row level security;
revoke all on table public.execution_audit_event_keys from public, anon, authenticated;
grant select, insert, update, delete on table public.execution_audit_event_keys to service_role;

create or replace function public.append_execution_audit_event_once(
  p_user_id uuid,
  p_event_key text,
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
set search_path = public, pg_temp
as $$
declare
  existing_id bigint;
  existing_hash text;
  appended_id bigint;
  appended_hash text;
begin
  if p_user_id is null or nullif(trim(p_event_key), '') is null or length(p_event_key) > 200 then
    raise exception 'user and a bounded audit event key are required';
  end if;

  -- Serialize event-key check, hash-chain append and key registration per user.
  -- The inner append function takes the same transaction advisory lock as well.
  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select k.audit_id, a.event_hash
    into existing_id, existing_hash
    from public.execution_audit_event_keys k
    join public.execution_audit_log a on a.id = k.audit_id
    where k.user_id = p_user_id and k.event_key = p_event_key;
  if found then
    return query select existing_id, existing_hash;
    return;
  end if;

  select a.id, a.event_hash
    into appended_id, appended_hash
    from public.append_execution_audit_event(
      p_user_id,
      p_workspace_id,
      p_actor_type,
      p_event_type,
      p_request_id,
      p_correlation_id,
      p_payload,
      p_created_at
    ) a;

  insert into public.execution_audit_event_keys(user_id, event_key, audit_id)
  values (p_user_id, p_event_key, appended_id);

  return query select appended_id, appended_hash;
end;
$$;

revoke all on function public.append_execution_audit_event_once(uuid, text, uuid, text, text, text, text, jsonb, timestamptz)
  from public, anon, authenticated;
grant execute on function public.append_execution_audit_event_once(uuid, text, uuid, text, text, text, text, jsonb, timestamptz)
  to service_role;
