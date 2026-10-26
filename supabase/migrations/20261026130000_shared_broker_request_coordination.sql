-- Shared, fail-closed broker admission when Redis REST is not installed.
-- gate_key is a server-side hash of budget identity, never a broker token or raw user ID.
create table if not exists public.broker_request_gate_state (
  gate_key text primary key,
  day_key date not null,
  minute_window bigint not null,
  last_admitted_at_ms bigint,
  minute_count integer not null default 0,
  day_count integer not null default 0,
  noninteractive_minute_count integer not null default 0,
  background_minute_count integer not null default 0,
  noninteractive_day_count integer not null default 0,
  background_day_count integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.broker_request_gate_state enable row level security;
revoke all on table public.broker_request_gate_state from public, anon, authenticated;
grant all on table public.broker_request_gate_state to service_role;

create or replace function public.broker_coordination_health()
returns boolean language sql security definer set search_path = ''
as $$ select true; $$;
revoke all on function public.broker_coordination_health() from public, anon, authenticated;
grant execute on function public.broker_coordination_health() to service_role;

create or replace function public.admit_broker_request(
  p_gate_key text, p_min_interval_ms integer, p_max_per_minute integer, p_max_per_day integer, p_priority text
)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_now_ms bigint;
  v_minute_window bigint;
  v_day_key date;
  v_row public.broker_request_gate_state%rowtype;
  v_retry_ms integer;
begin
  if p_gate_key is null or length(p_gate_key) < 1 or length(p_gate_key) > 256 then raise exception 'Invalid broker coordination key'; end if;
  if p_min_interval_ms is null or p_min_interval_ms < 0 or p_max_per_minute is null or p_max_per_minute < 1 or
     (p_max_per_day is not null and p_max_per_day < 1) or p_priority is null or p_priority not in ('interactive','normal','background') then
    raise exception 'Invalid broker request policy';
  end if;
  v_now_ms := (extract(epoch from v_now) * 1000)::bigint;
  v_minute_window := floor(extract(epoch from v_now) / 60)::bigint;
  v_day_key := (v_now at time zone 'Asia/Kolkata')::date;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_gate_key, 0));
  insert into public.broker_request_gate_state (gate_key,day_key,minute_window,last_admitted_at_ms)
  values (p_gate_key,v_day_key,v_minute_window,null) on conflict (gate_key) do nothing;
  select * into v_row from public.broker_request_gate_state where gate_key=p_gate_key for update;

  if v_row.day_key is distinct from v_day_key then
    v_row.day_key:=v_day_key; v_row.day_count:=0; v_row.noninteractive_day_count:=0; v_row.background_day_count:=0;
  end if;
  if v_row.minute_window is distinct from v_minute_window then
    v_row.minute_window:=v_minute_window; v_row.minute_count:=0; v_row.noninteractive_minute_count:=0; v_row.background_minute_count:=0;
  end if;
  update public.broker_request_gate_state set day_key=v_row.day_key,minute_window=v_row.minute_window,day_count=v_row.day_count,
    minute_count=v_row.minute_count,noninteractive_day_count=v_row.noninteractive_day_count,background_day_count=v_row.background_day_count,
    noninteractive_minute_count=v_row.noninteractive_minute_count,background_minute_count=v_row.background_minute_count,updated_at=v_now
    where gate_key=p_gate_key;

  if v_row.last_admitted_at_ms is not null and p_min_interval_ms>0 then
    v_retry_ms:=greatest(0,p_min_interval_ms-(v_now_ms-v_row.last_admitted_at_ms))::integer;
    if v_retry_ms>0 then return pg_catalog.jsonb_build_object('admitted',false,'code','BROKER_RATE_SPACING','retryAfterMs',v_retry_ms); end if;
  end if;
  if p_max_per_day is not null and v_row.day_count>=p_max_per_day then return pg_catalog.jsonb_build_object('admitted',false,'code','BROKER_RATE_BUDGET_EXHAUSTED','retryAfterMs',0); end if;
  if v_row.minute_count>=p_max_per_minute then return pg_catalog.jsonb_build_object('admitted',false,'code','BROKER_RATE_BUDGET_EXHAUSTED','retryAfterMs',0); end if;
  -- noninteractive counters include background requests; background is a stricter subset.
  if p_priority<>'interactive' and v_row.noninteractive_minute_count>=greatest(1,floor(p_max_per_minute*0.7)::integer) then return pg_catalog.jsonb_build_object('admitted',false,'code','BROKER_PRIORITY_BUDGET_EXHAUSTED','retryAfterMs',0); end if;
  if p_priority='background' and v_row.background_minute_count>=greatest(1,floor(p_max_per_minute*0.35)::integer) then return pg_catalog.jsonb_build_object('admitted',false,'code','BROKER_PRIORITY_BUDGET_EXHAUSTED','retryAfterMs',0); end if;
  if p_max_per_day is not null and p_priority<>'interactive' and v_row.noninteractive_day_count>=greatest(1,floor(p_max_per_day*0.7)::integer) then return pg_catalog.jsonb_build_object('admitted',false,'code','BROKER_PRIORITY_BUDGET_EXHAUSTED','retryAfterMs',0); end if;
  if p_max_per_day is not null and p_priority='background' and v_row.background_day_count>=greatest(1,floor(p_max_per_day*0.35)::integer) then return pg_catalog.jsonb_build_object('admitted',false,'code','BROKER_PRIORITY_BUDGET_EXHAUSTED','retryAfterMs',0); end if;

  update public.broker_request_gate_state set day_key=v_day_key,minute_window=v_minute_window,last_admitted_at_ms=v_now_ms,
    minute_count=v_row.minute_count+1,day_count=v_row.day_count+case when p_max_per_day is not null then 1 else 0 end,
    noninteractive_minute_count=v_row.noninteractive_minute_count+case when p_priority<>'interactive' then 1 else 0 end,
    background_minute_count=v_row.background_minute_count+case when p_priority='background' then 1 else 0 end,
    noninteractive_day_count=v_row.noninteractive_day_count+case when p_max_per_day is not null and p_priority<>'interactive' then 1 else 0 end,
    background_day_count=v_row.background_day_count+case when p_max_per_day is not null and p_priority='background' then 1 else 0 end,
    updated_at=v_now where gate_key=p_gate_key;
  return pg_catalog.jsonb_build_object('admitted',true,'code','OK','retryAfterMs',0);
end;
$$;
revoke all on function public.admit_broker_request(text,integer,integer,integer,text) from public, anon, authenticated;
grant execute on function public.admit_broker_request(text,integer,integer,integer,text) to service_role;
