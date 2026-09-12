create table if not exists public.broker_sessions (
  user_id text not null,
  broker_id text not null,
  access_token_encrypted jsonb not null,
  refresh_token_encrypted jsonb,
  expires_at timestamptz not null,
  status text not null check (status in ('Connected', 'Expired', 'Disconnected')),
  connected_at timestamptz not null,
  client_code text,
  updated_at timestamptz not null default now(),
  primary key (user_id, broker_id)
);

alter table public.broker_sessions enable row level security;

drop policy if exists "users can read their broker sessions" on public.broker_sessions;
create policy "users can read their broker sessions"
on public.broker_sessions
for select
using (auth.uid()::text = user_id);

drop policy if exists "users can delete their broker sessions" on public.broker_sessions;
create policy "users can delete their broker sessions"
on public.broker_sessions
for delete
using (auth.uid()::text = user_id);

-- One-time OAuth state records. Only the server service-role client writes these;
-- the table is intentionally not exposed to end users through RLS.
create table if not exists public.oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_id text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.oauth_states enable row level security;

-- No client-facing policies are created. Server-side service-role access is used
-- for issuing and atomically consuming OAuth states.
create index if not exists oauth_states_expiry_idx on public.oauth_states (expires_at);
create index if not exists oauth_states_user_idx on public.oauth_states (user_id, broker_id);

-- Prevent duplicate live order submissions across browser retries/serverless instances.
create table if not exists public.order_idempotency (
  user_id uuid not null references auth.users(id) on delete cascade,
  broker_id text not null,
  idempotency_key text not null,
  request_hash text not null,
  state text not null check (state in ('pending', 'completed', 'failed')),
  response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, broker_id, idempotency_key)
);

alter table public.order_idempotency enable row level security;
create index if not exists order_idempotency_updated_idx on public.order_idempotency (updated_at);
