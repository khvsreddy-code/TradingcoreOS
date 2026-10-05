create table if not exists public.background_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  progress integer not null default 0 check (progress between 0 and 100),
  queue_message_id text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists background_jobs_user_created_idx
  on public.background_jobs (user_id, created_at desc);

create index if not exists background_jobs_status_created_idx
  on public.background_jobs (status, created_at asc);

alter table public.background_jobs enable row level security;

revoke all on public.background_jobs from anon, authenticated;
grant all on public.background_jobs to service_role;
