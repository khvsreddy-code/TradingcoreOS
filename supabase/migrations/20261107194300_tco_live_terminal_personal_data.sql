create table if not exists public.terminal_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint terminal_watchlists_user_name_key unique (user_id, name)
);
create unique index if not exists terminal_watchlists_one_default_per_user on public.terminal_watchlists(user_id) where is_default = true;
create index if not exists terminal_watchlists_user_order_idx on public.terminal_watchlists(user_id, sort_order, created_at);

create table if not exists public.terminal_watchlist_items (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.terminal_watchlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  label text not null,
  short_name text,
  exchange text,
  instrument_type text,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint terminal_watchlist_items_unique_symbol unique (watchlist_id, symbol)
);
create index if not exists terminal_watchlist_items_user_order_idx on public.terminal_watchlist_items(user_id, watchlist_id, sort_order);

create table if not exists public.terminal_journal_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  side text not null check (side in ('long','short')),
  quantity numeric(24,8) not null check (quantity > 0),
  entry_price numeric(24,8) not null check (entry_price > 0),
  exit_price numeric(24,8),
  entry_at timestamptz not null,
  exit_at timestamptz,
  gross_pnl numeric(24,8),
  fees numeric(24,8) not null default 0 check (fees >= 0),
  net_pnl numeric(24,8),
  timeframe text,
  setup text,
  strategy_name text,
  tags text[] not null default '{}',
  notes text not null default '',
  source text not null default 'manual' check (source in ('manual','broker','import','strategy')),
  broker_order_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists terminal_journal_trades_user_entry_idx on public.terminal_journal_trades(user_id, entry_at desc);
create index if not exists terminal_journal_trades_user_symbol_idx on public.terminal_journal_trades(user_id, symbol, entry_at desc);

create table if not exists public.terminal_indicator_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  indicator_key text not null,
  title text not null,
  family text not null default 'Other',
  source_type text not null default 'native' check (source_type in ('native','corescript','community')),
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, indicator_key)
);
create index if not exists terminal_indicator_favorites_user_order_idx on public.terminal_indicator_favorites(user_id, sort_order, created_at);

create table if not exists public.terminal_alert_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  label text not null default '',
  condition text not null check (condition in ('above','below','crosses_above','crosses_below')),
  target_price numeric(24,8) not null check (target_price > 0),
  timeframe text,
  status text not null default 'armed' check (status in ('armed','triggered','paused','cancelled')),
  last_triggered_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists terminal_alert_rules_user_status_idx on public.terminal_alert_rules(user_id, status, created_at desc);

create table if not exists public.terminal_quant_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New Quant conversation',
  context jsonb not null default '{}'::jsonb,
  model text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists terminal_quant_conversations_user_updated_idx on public.terminal_quant_conversations(user_id, updated_at desc);

create table if not exists public.terminal_quant_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.terminal_quant_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  model text,
  usage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists terminal_quant_messages_conversation_created_idx on public.terminal_quant_messages(user_id, conversation_id, created_at);

alter table public.terminal_watchlists enable row level security;
alter table public.terminal_watchlist_items enable row level security;
alter table public.terminal_journal_trades enable row level security;
alter table public.terminal_indicator_favorites enable row level security;
alter table public.terminal_alert_rules enable row level security;
alter table public.terminal_quant_conversations enable row level security;
alter table public.terminal_quant_messages enable row level security;

do $$ begin
  create policy "terminal_watchlists_select_own" on public.terminal_watchlists for select to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_watchlists_insert_own" on public.terminal_watchlists for insert to authenticated with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_watchlists_update_own" on public.terminal_watchlists for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_watchlists_delete_own" on public.terminal_watchlists for delete to authenticated using (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "terminal_watchlist_items_select_own" on public.terminal_watchlist_items for select to authenticated
    using (user_id = (select auth.uid()) and exists (select 1 from public.terminal_watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_watchlist_items_insert_own" on public.terminal_watchlist_items for insert to authenticated
    with check (user_id = (select auth.uid()) and exists (select 1 from public.terminal_watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_watchlist_items_update_own" on public.terminal_watchlist_items for update to authenticated
    using (user_id = (select auth.uid()) and exists (select 1 from public.terminal_watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())))
    with check (user_id = (select auth.uid()) and exists (select 1 from public.terminal_watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_watchlist_items_delete_own" on public.terminal_watchlist_items for delete to authenticated
    using (user_id = (select auth.uid()) and exists (select 1 from public.terminal_watchlists w where w.id = watchlist_id and w.user_id = (select auth.uid())));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "terminal_journal_trades_owner_all" on public.terminal_journal_trades for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_indicator_favorites_owner_all" on public.terminal_indicator_favorites for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_alert_rules_owner_all" on public.terminal_alert_rules for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_quant_conversations_owner_all" on public.terminal_quant_conversations for all to authenticated
    using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
exception when duplicate_object then null; end $$;
do $$ begin
  create policy "terminal_quant_messages_owner_all" on public.terminal_quant_messages for all to authenticated
    using (user_id = (select auth.uid())) with check (
      user_id = (select auth.uid()) and exists (
        select 1 from public.terminal_quant_conversations c
        where c.id = conversation_id and c.user_id = (select auth.uid())
      )
    );
exception when duplicate_object then null; end $$;

create or replace function public.terminal_replace_default_watchlist(p_items jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_watchlist_id uuid;
  v_item jsonb;
  v_symbol text;
  v_label text;
  v_short text;
  v_position integer := 0;
begin
  if v_user_id is null then raise exception 'Authentication required'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then raise exception 'Watchlist items must be a JSON array'; end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'A watchlist can contain at most 50 instruments'; end if;

  update public.terminal_watchlists set is_default = false, updated_at = now()
    where user_id = v_user_id and name <> 'Main';
  insert into public.terminal_watchlists(user_id, name, is_default, sort_order)
    values (v_user_id, 'Main', true, 0)
    on conflict (user_id, name) do update set is_default = true, updated_at = now()
    returning id into v_watchlist_id;

  delete from public.terminal_watchlist_items where user_id = v_user_id and watchlist_id = v_watchlist_id;
  for v_item in select value from jsonb_array_elements(p_items) with ordinality as entries(value, position) order by position loop
    v_symbol := upper(trim(coalesce(v_item->>'symbol', '')));
    v_label := left(trim(coalesce(v_item->>'label', v_symbol)), 120);
    v_short := left(trim(coalesce(v_item->>'short', v_item->>'short_name', v_symbol)), 60);
    if v_symbol = '' then continue; end if;
    insert into public.terminal_watchlist_items(watchlist_id,user_id,symbol,label,short_name,exchange,instrument_type,sort_order,metadata)
      values (v_watchlist_id,v_user_id,v_symbol,coalesce(nullif(v_label,''),v_symbol),nullif(v_short,''),
        nullif(trim(coalesce(v_item->>'exchange','')),''),nullif(trim(coalesce(v_item->>'type','')),''),
        v_position,coalesce(v_item->'metadata','{}'::jsonb));
    v_position := v_position + 1;
  end loop;
  return jsonb_build_object('watchlist_id',v_watchlist_id,'items',coalesce((
    select jsonb_agg(jsonb_build_object('symbol',i.symbol,'label',i.label,'short',coalesce(i.short_name,i.symbol),'exchange',i.exchange,'type',i.instrument_type) order by i.sort_order)
    from public.terminal_watchlist_items i where i.user_id=v_user_id and i.watchlist_id=v_watchlist_id
  ),'[]'::jsonb));
end
$$;
revoke all on function public.terminal_replace_default_watchlist(jsonb) from public;
grant execute on function public.terminal_replace_default_watchlist(jsonb) to authenticated;
