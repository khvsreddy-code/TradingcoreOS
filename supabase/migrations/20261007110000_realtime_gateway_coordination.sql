create table if not exists public.realtime_gateway_owners (
  user_id text primary key,
  owner_value text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists realtime_gateway_owners_expiry_idx
  on public.realtime_gateway_owners (expires_at);

create table if not exists public.realtime_gateway_subscriptions (
  subscription_key text primary key,
  user_id text not null,
  instance_id text not null,
  connection_id text not null,
  kind text not null check (kind in ('market','orders','both')),
  symbols jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index if not exists realtime_gateway_subscriptions_user_idx
  on public.realtime_gateway_subscriptions (user_id, expires_at);

alter table public.realtime_gateway_owners enable row level security;
alter table public.realtime_gateway_subscriptions enable row level security;

create or replace function public.claim_realtime_gateway_owner(
  p_user_id text,
  p_owner_value text,
  p_ttl_ms integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed boolean;
begin
  insert into public.realtime_gateway_owners(user_id, owner_value, expires_at, updated_at)
  values (p_user_id, p_owner_value, now() + make_interval(secs => greatest(1, p_ttl_ms) / 1000.0), now())
  on conflict (user_id) do update
    set owner_value = excluded.owner_value,
        expires_at = excluded.expires_at,
        updated_at = now()
    where public.realtime_gateway_owners.expires_at <= now()
  returning true into claimed;

  return coalesce(claimed, false);
end;
$$;

create or replace function public.renew_realtime_gateway_owner(
  p_user_id text,
  p_owner_value text,
  p_ttl_ms integer
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.realtime_gateway_owners
     set expires_at = now() + make_interval(secs => greatest(1, p_ttl_ms) / 1000.0),
         updated_at = now()
   where user_id = p_user_id
     and owner_value = p_owner_value
     and expires_at > now();
  return found;
end;
$$;

create or replace function public.release_realtime_gateway_owner(
  p_user_id text,
  p_owner_value text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.realtime_gateway_owners
   where user_id = p_user_id
     and owner_value = p_owner_value;
  return found;
end;
$$;

grant execute on function public.claim_realtime_gateway_owner(text, text, integer) to service_role;
grant execute on function public.renew_realtime_gateway_owner(text, text, integer) to service_role;
grant execute on function public.release_realtime_gateway_owner(text, text) to service_role;