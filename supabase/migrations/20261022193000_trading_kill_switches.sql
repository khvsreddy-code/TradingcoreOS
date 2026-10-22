-- Durable account/strategy order-submission circuit breakers.
-- Only the trusted server role may read or mutate kill switches. Browser state
-- is never authoritative for live order admission.
create table if not exists public.trading_kill_switches (
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_id text not null,
  scope text not null check (scope in ('account','strategy')),
  scope_id text not null,
  is_active boolean not null default false,
  reason text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, broker_id, scope, scope_id),
  constraint trading_kill_switch_scope_id_check
    check ((scope = 'account' and scope_id = 'account') or (scope = 'strategy' and length(scope_id) between 1 and 128))
);

create index if not exists trading_kill_switches_active_lookup
  on public.trading_kill_switches (user_id, broker_id, scope, scope_id)
  where is_active = true;

alter table public.trading_kill_switches enable row level security;
revoke all on table public.trading_kill_switches from public, anon, authenticated;
grant select, insert, update, delete on table public.trading_kill_switches to service_role;
