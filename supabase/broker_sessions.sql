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
