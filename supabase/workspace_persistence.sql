-- TradingCoreOS per-user workspace persistence.
create table if not exists public.workspace_layouts (
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null,
  layout text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, broker)
);
alter table public.workspace_layouts enable row level security;
drop policy if exists "users can read their workspace layouts" on public.workspace_layouts;
create policy "users can read their workspace layouts" on public.workspace_layouts for select using (auth.uid() = user_id);
drop policy if exists "users can insert their workspace layouts" on public.workspace_layouts;
create policy "users can insert their workspace layouts" on public.workspace_layouts for insert with check (auth.uid() = user_id);
drop policy if exists "users can update their workspace layouts" on public.workspace_layouts;
create policy "users can update their workspace layouts" on public.workspace_layouts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
