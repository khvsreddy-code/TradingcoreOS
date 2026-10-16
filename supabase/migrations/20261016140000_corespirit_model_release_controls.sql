-- Mutable release decisions are deliberately separate from immutable model artifacts.
create table if not exists public.corespirit_model_release_controls (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  model_artifact_id uuid not null references public.corespirit_model_artifacts(id) on delete cascade,
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'candidate'
    check (status in ('candidate','approved','revoked','retired')),
  validation_report jsonb not null default '{}'::jsonb,
  approval_checks jsonb not null default '{}'::jsonb,
  decision_reason text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, artifact_hash)
);
create index if not exists corespirit_release_owner_status_idx
  on public.corespirit_model_release_controls(owner_user_id, status, updated_at desc);
create index if not exists corespirit_release_artifact_idx
  on public.corespirit_model_release_controls(model_artifact_id);

create table if not exists public.corespirit_model_release_events (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  artifact_hash text not null check (artifact_hash ~ '^[a-f0-9]{64}$'),
  previous_status text check (previous_status in ('candidate','approved','revoked','retired')),
  new_status text not null check (new_status in ('candidate','approved','revoked','retired')),
  actor_user_id uuid references auth.users(id) on delete set null,
  reason text not null check (length(trim(reason)) between 8 and 1000),
  approval_checks jsonb not null default '{}'::jsonb,
  validation_report jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists corespirit_release_events_owner_idx
  on public.corespirit_model_release_events(owner_user_id, created_at desc);
create index if not exists corespirit_release_events_hash_idx
  on public.corespirit_model_release_events(owner_user_id, artifact_hash, created_at desc);

alter table public.corespirit_model_release_controls enable row level security;
alter table public.corespirit_model_release_events enable row level security;
revoke all on table public.corespirit_model_release_controls from anon, authenticated;
revoke all on table public.corespirit_model_release_events from anon, authenticated;
grant select, insert, update, delete on table public.corespirit_model_release_controls to service_role;
grant select, insert, update, delete on table public.corespirit_model_release_events to service_role;

-- Existing artifacts begin as candidates. Nothing receives production approval
-- merely because it was trained before the release-control subsystem existed.
insert into public.corespirit_model_release_controls (
  owner_user_id, model_artifact_id, artifact_hash, status, validation_report, approval_checks
)
select
  owner_user_id, id, artifact_hash, 'candidate',
  coalesce(provenance->'validationResults', '{}'::jsonb),
  jsonb_build_object('productionEligible', false, 'reason', 'Explicit owner approval is required')
from public.corespirit_model_artifacts
on conflict (owner_user_id, artifact_hash) do nothing;

create or replace function public.transition_corespirit_model_release(
  p_owner_user_id uuid,
  p_artifact_hash text,
  p_target_status text,
  p_actor_user_id uuid,
  p_reason text,
  p_approval_checks jsonb,
  p_validation_report jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_model public.corespirit_model_artifacts%rowtype;
  v_control public.corespirit_model_release_controls%rowtype;
  v_previous text;
begin
  if p_owner_user_id is null
     or p_actor_user_id is null
     or p_artifact_hash is null or p_artifact_hash !~ '^[a-f0-9]{64}$'
     or p_target_status is null or p_target_status not in ('approved','revoked','retired')
     or nullif(trim(p_reason), '') is null or length(p_reason) > 1000
     or jsonb_typeof(coalesce(p_approval_checks, '{}'::jsonb)) <> 'object'
     or jsonb_typeof(coalesce(p_validation_report, '{}'::jsonb)) <> 'object' then
    raise exception 'valid owner, actor, artifact hash, release status, reason and report objects are required';
  end if;

  select * into v_model
  from public.corespirit_model_artifacts
  where owner_user_id = p_owner_user_id and artifact_hash = p_artifact_hash
  for share;
  if not found then raise exception 'model artifact not found for this owner'; end if;

  insert into public.corespirit_model_release_controls (
    owner_user_id, model_artifact_id, artifact_hash, status, validation_report, approval_checks
  ) values (
    p_owner_user_id, v_model.id, p_artifact_hash, 'candidate',
    coalesce(p_validation_report, '{}'::jsonb),
    jsonb_build_object('productionEligible', false, 'reason', 'Awaiting explicit review')
  ) on conflict (owner_user_id, artifact_hash) do nothing;

  select * into v_control
  from public.corespirit_model_release_controls
  where owner_user_id = p_owner_user_id and artifact_hash = p_artifact_hash
  for update;
  v_previous := v_control.status;

  if p_target_status = 'approved' then
    if v_previous not in ('candidate','revoked') then
      raise exception 'only candidate or revoked artifacts can be approved';
    end if;
    if coalesce(p_approval_checks->>'productionEligible', 'false') <> 'true' then
      raise exception 'model failed the server-side production approval checks';
    end if;
  elsif p_target_status = 'revoked' and v_previous <> 'approved' then
    raise exception 'only an approved model can have its approval revoked';
  elsif p_target_status = 'retired' and v_previous = 'retired' then
    return to_jsonb(v_control);
  end if;

  update public.corespirit_model_release_controls
     set status = p_target_status,
         validation_report = coalesce(p_validation_report, '{}'::jsonb),
         approval_checks = coalesce(p_approval_checks, '{}'::jsonb),
         decision_reason = p_reason,
         approved_by = case when p_target_status = 'approved' then p_actor_user_id else null end,
         approved_at = case when p_target_status = 'approved' then now() else null end,
         updated_at = now()
   where id = v_control.id
   returning * into v_control;

  insert into public.corespirit_model_release_events (
    owner_user_id, artifact_hash, previous_status, new_status, actor_user_id,
    reason, approval_checks, validation_report
  ) values (
    p_owner_user_id, p_artifact_hash, v_previous, p_target_status, p_actor_user_id,
    p_reason, coalesce(p_approval_checks, '{}'::jsonb), coalesce(p_validation_report, '{}'::jsonb)
  );

  return to_jsonb(v_control);
end;
$$;

revoke all on function public.transition_corespirit_model_release(uuid,text,text,uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.transition_corespirit_model_release(uuid,text,text,uuid,text,jsonb,jsonb) to service_role;

-- The release history is append-only; releases are changed through the audited RPC.
create or replace function public.reject_corespirit_release_event_mutation()
returns trigger language plpgsql as $release_trigger$
begin
  if TG_OP = 'DELETE' and pg_trigger_depth() > 1 then return OLD; end if;
  raise exception 'CoreSpirit model release events are immutable';
end;
$release_trigger$;

drop trigger if exists corespirit_model_release_events_immutable on public.corespirit_model_release_events;
create trigger corespirit_model_release_events_immutable
  before update or delete on public.corespirit_model_release_events
  for each row execute function public.reject_corespirit_release_event_mutation();
