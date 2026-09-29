-- CoreSpirit / Automation lifecycle control plane.
-- Apply after the base automations table exists.

alter table if exists public.automations
  add column if not exists lifecycle_state text not null default 'CREATED';

alter table if exists public.automations
  add column if not exists lifecycle_version integer not null default 1;

alter table if exists public.automations
  add column if not exists lifecycle_transition_at timestamptz;

alter table if exists public.automations
  add column if not exists lifecycle_transition_actor text;

alter table if exists public.automations
  add column if not exists lifecycle_transition_reason text;

alter table if exists public.automations
  drop constraint if exists automations_lifecycle_state_check;

alter table if exists public.automations
  add constraint automations_lifecycle_state_check
  check (lifecycle_state in ('CREATED','VALIDATED','PAPER','ARMED','LIVE','PAUSED','STOPPED'));

create index if not exists automations_lifecycle_state_idx
  on public.automations(lifecycle_state);
