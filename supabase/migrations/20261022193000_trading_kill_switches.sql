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


-- Update the switch and append its audit record in the same transaction. A
-- failed immutable audit append rolls back the state change (particularly an
-- operator disable action) instead of returning an ambiguous result.
create or replace function public.set_trading_kill_switch(
  p_user_id uuid,
  p_broker_id text,
  p_scope text,
  p_scope_id text,
  p_active boolean,
  p_reason text,
  p_request_id text default null
)
returns table (
  user_id uuid,
  broker_id text,
  scope text,
  scope_id text,
  is_active boolean,
  reason text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_broker text;
  v_scope text;
  v_scope_id text;
  v_reason text;
  v_now timestamptz := now();
  v_row public.trading_kill_switches%rowtype;
begin
  v_broker := lower(trim(coalesce(p_broker_id, '')));
  v_scope := lower(trim(coalesce(p_scope, '')));
  v_scope_id := case when v_scope = 'account' then 'account' else trim(coalesce(p_scope_id, '')) end;
  v_reason := left(trim(coalesce(p_reason, '')), 500);

  if p_user_id is null or v_broker !~ '^[a-z0-9_-]{1,64}$' then
    raise exception 'valid owner and broker are required';
  end if;
  if v_scope not in ('account','strategy') then
    raise exception 'unsupported trading kill-switch scope';
  end if;
  if (v_scope = 'account' and v_scope_id <> 'account')
     or (v_scope = 'strategy' and (length(v_scope_id) < 1 or length(v_scope_id) > 128)) then
    raise exception 'invalid trading kill-switch scope id';
  end if;
  if p_active is null then raise exception 'active flag is required'; end if;

  insert into public.trading_kill_switches (
    user_id, broker_id, scope, scope_id, is_active, reason, updated_by, created_at, updated_at
  ) values (
    p_user_id, v_broker, v_scope, v_scope_id, p_active, v_reason, p_user_id, v_now, v_now
  )
  on conflict (user_id, broker_id, scope, scope_id) do update set
    is_active = excluded.is_active,
    reason = excluded.reason,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at
  returning * into v_row;

  perform public.append_execution_audit_event(
    p_user_id,
    null,
    'user',
    case when p_active then 'trading.kill_switch.enabled' else 'trading.kill_switch.disabled' end,
    p_request_id,
    'kill-switch:' || v_broker || ':' || v_scope || ':' || v_scope_id,
    jsonb_build_object(
      'brokerId', v_broker, 'scope', v_scope, 'scopeId', v_scope_id,
      'active', p_active, 'reason', v_reason, 'updatedAt', v_now
    ),
    v_now
  );

  return query select v_row.user_id, v_row.broker_id, v_row.scope, v_row.scope_id,
    v_row.is_active, v_row.reason, v_row.updated_at;
end;
$$;

revoke all on function public.set_trading_kill_switch(uuid, text, text, text, boolean, text, text)
  from public, anon, authenticated;
grant execute on function public.set_trading_kill_switch(uuid, text, text, text, boolean, text, text)
  to service_role;
