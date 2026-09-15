-- Per-user named TradingCoreOS workspace layouts, separate from the active workspace.
create table if not exists public.workspace_layout_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  broker text not null,
  name text not null,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  unique (user_id, broker, name)
);
alter table public.workspace_layout_library enable row level security;
drop policy if exists "users can read their named workspace layouts" on public.workspace_layout_library;
create policy "users can read their named workspace layouts" on public.workspace_layout_library for select using (auth.uid() = user_id);
drop policy if exists "users can insert their named workspace layouts" on public.workspace_layout_library;
create policy "users can insert their named workspace layouts" on public.workspace_layout_library for insert with check (auth.uid() = user_id);
drop policy if exists "users can update their named workspace layouts" on public.workspace_layout_library;
create policy "users can update their named workspace layouts" on public.workspace_layout_library for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "users can delete their named workspace layouts" on public.workspace_layout_library;
create policy "users can delete their named workspace layouts" on public.workspace_layout_library for delete using (auth.uid() = user_id);
