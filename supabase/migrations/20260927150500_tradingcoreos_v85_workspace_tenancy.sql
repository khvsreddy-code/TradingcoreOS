-- v85 tenancy foundation. Existing user-scoped records remain compatible;
-- workspace_id is optional until a user explicitly adopts a workspace.
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, slug)
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','admin','editor','trader','viewer','auditor')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create or replace function public.is_workspace_member(target_workspace_id uuid, target_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = target_workspace_id and wm.user_id = target_user_id
  );
$$;

alter function public.is_workspace_member(uuid, uuid) owner to postgres;
revoke all on function public.is_workspace_member(uuid, uuid) from public;
grant execute on function public.is_workspace_member(uuid, uuid) to authenticated;

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;

drop policy if exists workspaces_member_read on public.workspaces;
create policy workspaces_member_read on public.workspaces for select to authenticated using (
  auth.uid() = owner_user_id
  or public.is_workspace_member(id, auth.uid())
);
drop policy if exists workspaces_owner_write on public.workspaces;
create policy workspaces_owner_write on public.workspaces for all to authenticated using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);
drop policy if exists workspace_members_member_read on public.workspace_members;
create policy workspace_members_member_read on public.workspace_members for select to authenticated using (
  auth.uid() = user_id
  or exists (select 1 from public.workspaces w where w.id = workspace_members.workspace_id and w.owner_user_id = auth.uid())
);
drop policy if exists workspace_members_owner_write on public.workspace_members;
create policy workspace_members_owner_write on public.workspace_members for all to authenticated using (
  exists (select 1 from public.workspaces w where w.id = workspace_members.workspace_id and w.owner_user_id = auth.uid())
) with check (
  exists (select 1 from public.workspaces w where w.id = workspace_members.workspace_id and w.owner_user_id = auth.uid())
);

grant select, insert, update, delete on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;

alter table public.automations add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.corespirit_scripts add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.corespirit_execution_runs add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.prediction_model_artifacts add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.prediction_training_runs add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
alter table public.prediction_evaluations add column if not exists workspace_id uuid references public.workspaces(id) on delete set null;
