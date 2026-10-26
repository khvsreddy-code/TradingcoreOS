-- Add a separately-keyed, narrow RPC surface for shared broker quota coordination.
-- This lets the server use a coordination-only Supabase project without reusing its
-- application service-role key or exposing the service-role-only admission function.

create table if not exists public.broker_coordination_credentials (
  name text primary key check (name = 'broker_gate'),
  secret_sha256 text not null check (secret_sha256 ~ '^[a-f0-9]{64}$'),
  updated_at timestamptz not null default now()
);
alter table public.broker_coordination_credentials enable row level security;
revoke all on table public.broker_coordination_credentials from public, anon, authenticated;
grant all on table public.broker_coordination_credentials to service_role;

create or replace function public.broker_coordination_health_secure(p_shared_secret text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected text;
  v_actual text;
begin
  if p_shared_secret is null
     or pg_catalog.char_length(p_shared_secret) < 32
     or pg_catalog.char_length(p_shared_secret) > 256 then
    return false;
  end if;
  select secret_sha256 into v_expected
  from public.broker_coordination_credentials
  where name = 'broker_gate';
  if v_expected is null then return false; end if;
  v_actual := pg_catalog.encode(
    pg_catalog.sha256(pg_catalog.convert_to(p_shared_secret, 'UTF8')),
    'hex'
  );
  return v_actual = v_expected;
end;
$$;
revoke all on function public.broker_coordination_health_secure(text) from public;
grant execute on function public.broker_coordination_health_secure(text) to anon, authenticated;

create or replace function public.admit_broker_request_secure(
  p_gate_key text,
  p_min_interval_ms integer,
  p_max_per_minute integer,
  p_max_per_day integer,
  p_priority text,
  p_shared_secret text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.broker_coordination_health_secure(p_shared_secret) then
    raise exception using errcode = '28000', message = 'Broker coordination credential rejected';
  end if;
  return public.admit_broker_request(
    p_gate_key,
    p_min_interval_ms,
    p_max_per_minute,
    p_max_per_day,
    p_priority
  );
end;
$$;
revoke all on function public.admit_broker_request_secure(text,integer,integer,integer,text,text) from public;
grant execute on function public.admit_broker_request_secure(text,integer,integer,integer,text,text) to anon, authenticated;
