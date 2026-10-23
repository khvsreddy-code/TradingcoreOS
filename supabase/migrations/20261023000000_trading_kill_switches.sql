-- Durable execution kill switches. Only trusted server-side service-role code may read/write this table.
create table if not exists public.trading_kill_switches (
  scope_type text not null check (scope_type in ('global', 'account', 'strategy')),
  scope_id text not null,
  enabled boolean not null default false,
  reason text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (scope_type, scope_id),
  check (length(scope_id) between 1 and 256)
);

alter table public.trading_kill_switches enable row level security;
revoke all on public.trading_kill_switches from anon, authenticated;
grant select, insert, update, delete on public.trading_kill_switches to service_role;

comment on table public.trading_kill_switches is
  'Server-side execution guard. A matching enabled global, account, or strategy row blocks new order submissions.';
