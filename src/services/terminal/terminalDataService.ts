import { getSupabaseClient } from '../auth/supabaseClient';

export type TerminalWatchlistItem = {
  symbol: string;
  label: string;
  short: string;
  exchange?: string | null;
  type?: string | null;
};

export type TerminalWatchlistRecord = {
  id: string;
  name: string;
  is_default: boolean;
  sort_order: number;
};

export type TerminalJournalTrade = {
  id: string;
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  entry_price: number;
  exit_price: number | null;
  entry_at: string;
  exit_at: string | null;
  gross_pnl: number | null;
  fees: number;
  net_pnl: number | null;
  timeframe: string | null;
  setup: string | null;
  strategy_name: string | null;
  tags: string[];
  notes: string;
  source: string;
  metadata?: Record<string, unknown>;
  created_at: string;
};

export type TerminalJournalTradeInput = Omit<TerminalJournalTrade, 'id' | 'created_at'> & {
  id?: string;
  created_at?: string;
};

export type TerminalAlertRuleInput = {
  symbol: string;
  label?: string;
  condition: 'above' | 'below' | 'crosses_above' | 'crosses_below';
  target_price: number;
  timeframe?: string;
  status?: 'armed' | 'triggered' | 'paused' | 'cancelled';
  metadata?: Record<string, unknown>;
};

async function authenticatedUserId(): Promise<string | null> {
  try {
    const { data, error } = await getSupabaseClient().auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

function throwOnError(error: { message?: string } | null, operation: string): void {
  if (error) throw new Error(operation + ': ' + (error.message || 'Supabase request failed.'));
}

/** Loads the signed-in user's Main watchlist. Returns null when signed out or not created. */
export async function loadDefaultTerminalWatchlist(): Promise<TerminalWatchlistItem[] | null> {
  const userId = await authenticatedUserId();
  if (!userId) return null;
  const supabase = getSupabaseClient();
  const listResult = await supabase
    .from('terminal_watchlists')
    .select('id')
    .eq('user_id', userId)
    .eq('is_default', true)
    .limit(1)
    .maybeSingle();
  throwOnError(listResult.error, 'Load watchlist');
  if (!listResult.data?.id) return null;

  const itemsResult = await supabase
    .from('terminal_watchlist_items')
    .select('symbol,label,short_name,exchange,instrument_type')
    .eq('user_id', userId)
    .eq('watchlist_id', listResult.data.id)
    .order('sort_order', { ascending: true });
  throwOnError(itemsResult.error, 'Load watchlist items');
  return (itemsResult.data || []).map((row: Record<string, unknown>) => ({
    symbol: String(row.symbol || ''),
    label: String(row.label || row.symbol || ''),
    short: String(row.short_name || row.symbol || ''),
    exchange: row.exchange == null ? null : String(row.exchange),
    type: row.instrument_type == null ? null : String(row.instrument_type),
  })).filter((item: TerminalWatchlistItem) => item.symbol);
}

/** Replaces the Main list atomically through an authenticated, RLS-respecting RPC. */
export async function saveDefaultTerminalWatchlist(items: readonly TerminalWatchlistItem[]): Promise<boolean> {
  const userId = await authenticatedUserId();
  if (!userId) return false;
  const payload = items.slice(0, 50).map((item) => ({
    symbol: String(item.symbol || '').trim().toUpperCase(),
    label: String(item.label || item.symbol || '').trim().slice(0, 120),
    short: String(item.short || item.symbol || '').trim().slice(0, 60),
    exchange: item.exchange ?? null,
    type: item.type ?? null,
  })).filter((item) => item.symbol);
  const { error } = await getSupabaseClient().rpc('terminal_replace_default_watchlist', { p_items: payload });
  if (error) throw new Error('Save watchlist: ' + error.message);
  return true;
}

/** Lists the signed-in user's watchlists. No symbols or broker data are fetched here. */
export async function listTerminalWatchlists(): Promise<TerminalWatchlistRecord[]> {
  const userId = await authenticatedUserId();
  if (!userId) return [];
  const { data, error } = await getSupabaseClient()
    .from('terminal_watchlists')
    .select('id,name,is_default,sort_order')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  throwOnError(error, 'Load watchlists');
  return (data || []).map((row: Record<string, unknown>) => ({
    id: String(row.id),
    name: String(row.name || 'Watchlist'),
    is_default: Boolean(row.is_default),
    sort_order: Number(row.sort_order || 0),
  }));
}

/** Creates Main only when an authenticated user has no default list yet. */
export async function ensureDefaultTerminalWatchlist(): Promise<TerminalWatchlistRecord | null> {
  const userId = await authenticatedUserId();
  if (!userId) return null;
  const existing = await listTerminalWatchlists();
  const currentDefault = existing.find(item => item.is_default);
  if (currentDefault) return currentDefault;
  const { data, error } = await getSupabaseClient()
    .from('terminal_watchlists')
    .insert({ user_id: userId, name: 'Main', is_default: true, sort_order: 0 })
    .select('id,name,is_default,sort_order')
    .single();
  if (error) {
    // A second tab may have created Main after the initial read. Re-read before surfacing.
    const refreshed = await listTerminalWatchlists();
    const racedDefault = refreshed.find(item => item.is_default);
    if (racedDefault) return racedDefault;
    throw new Error('Create default watchlist: ' + error.message);
  }
  return {
    id: String(data.id),
    name: String(data.name),
    is_default: Boolean(data.is_default),
    sort_order: Number(data.sort_order || 0),
  };
}

export async function createTerminalWatchlist(name: string): Promise<TerminalWatchlistRecord> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to create watchlists.');
  const normalizedName = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!normalizedName || normalizedName.toLowerCase() === 'main') {
    throw new Error('Choose a name other than Main.');
  }
  const current = await listTerminalWatchlists();
  if (current.length >= 20) throw new Error('You can create up to 20 watchlists.');
  const { data, error } = await getSupabaseClient()
    .from('terminal_watchlists')
    .insert({ user_id: userId, name: normalizedName, is_default: false, sort_order: current.length })
    .select('id,name,is_default,sort_order')
    .single();
  throwOnError(error, 'Create watchlist');
  return { id: String(data.id), name: String(data.name), is_default: Boolean(data.is_default), sort_order: Number(data.sort_order || 0) };
}

export async function renameTerminalWatchlist(id: string, name: string): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to rename watchlists.');
  const normalizedName = name.trim().replace(/\s+/g, ' ').slice(0, 40);
  if (!normalizedName || normalizedName.toLowerCase() === 'main') throw new Error('Choose a different watchlist name.');
  const { data: target, error: readError } = await getSupabaseClient()
    .from('terminal_watchlists')
    .select('id,is_default')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  throwOnError(readError, 'Check watchlist');
  if (!target) throw new Error('Watchlist not found.');
  if (target.is_default) throw new Error('The Main watchlist cannot be renamed.');
  const { error } = await getSupabaseClient().from('terminal_watchlists')
    .update({ name: normalizedName, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId);
  throwOnError(error, 'Rename watchlist');
}

export async function deleteTerminalWatchlist(id: string): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to delete watchlists.');
  const { data: target, error: readError } = await getSupabaseClient()
    .from('terminal_watchlists')
    .select('id,is_default')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  throwOnError(readError, 'Check watchlist');
  if (!target) return;
  if (target.is_default) throw new Error('The Main watchlist cannot be deleted.');
  const supabase = getSupabaseClient();
  const { error: itemsError } = await supabase.from('terminal_watchlist_items')
    .delete().eq('watchlist_id', id).eq('user_id', userId);
  throwOnError(itemsError, 'Delete watchlist items');
  const { error } = await supabase.from('terminal_watchlists').delete().eq('id', id).eq('user_id', userId);
  throwOnError(error, 'Delete watchlist');
}

export async function loadTerminalWatchlistItems(watchlistId: string): Promise<TerminalWatchlistItem[]> {
  const userId = await authenticatedUserId();
  if (!userId) return [];
  const { data, error } = await getSupabaseClient()
    .from('terminal_watchlist_items')
    .select('symbol,label,short_name,exchange,instrument_type')
    .eq('user_id', userId)
    .eq('watchlist_id', watchlistId)
    .order('sort_order', { ascending: true });
  throwOnError(error, 'Load watchlist items');
  return (data || []).map((row: Record<string, unknown>) => ({
    symbol: String(row.symbol || ''),
    label: String(row.label || row.symbol || ''),
    short: String(row.short_name || row.symbol || ''),
    exchange: row.exchange == null ? null : String(row.exchange),
    type: row.instrument_type == null ? null : String(row.instrument_type),
  })).filter((item: TerminalWatchlistItem) => item.symbol);
}

/** Item-level writes are independently protected by the existing watchlist RLS policies. */
export async function upsertTerminalWatchlistItem(watchlistId: string, item: TerminalWatchlistItem, sortOrder: number): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to sync watchlist items.');
  const symbol = String(item.symbol || '').trim().toUpperCase();
  if (!symbol) throw new Error('A watchlist symbol is required.');
  const { error } = await getSupabaseClient().from('terminal_watchlist_items').upsert({
    user_id: userId,
    watchlist_id: watchlistId,
    symbol,
    label: String(item.label || symbol).slice(0, 120),
    short_name: String(item.short || symbol).slice(0, 60),
    exchange: item.exchange || null,
    instrument_type: item.type || null,
    sort_order: Math.max(0, Math.floor(sortOrder)),
    metadata: {},
  }, { onConflict: 'watchlist_id,symbol' });
  throwOnError(error, 'Save watchlist item');
}

export async function deleteTerminalWatchlistItem(watchlistId: string, symbol: string): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to sync watchlist items.');
  const { error } = await getSupabaseClient().from('terminal_watchlist_items')
    .delete()
    .eq('user_id', userId)
    .eq('watchlist_id', watchlistId)
    .eq('symbol', symbol.toUpperCase());
  throwOnError(error, 'Remove watchlist item');
}

export async function getTerminalIndicatorFavoriteKeys(): Promise<string[]> {
  const userId = await authenticatedUserId();
  if (!userId) return [];
  const { data, error } = await getSupabaseClient()
    .from('terminal_indicator_favorites')
    .select('indicator_key')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });
  throwOnError(error, 'Load indicator favorites');
  return (data || []).map((row: Record<string, unknown>) => String(row.indicator_key || '')).filter(Boolean);
}

export async function setTerminalIndicatorFavorite(input: {
  key: string;
  title: string;
  family: string;
  sourceType?: 'native' | 'corescript' | 'community';
}, favorite: boolean): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to sync indicator favorites.');
  const supabase = getSupabaseClient();
  if (favorite) {
    const { error } = await supabase.from('terminal_indicator_favorites').upsert({
      user_id: userId,
      indicator_key: input.key,
      title: input.title.slice(0, 140),
      family: input.family.slice(0, 80),
      source_type: input.sourceType || 'native',
    }, { onConflict: 'user_id,indicator_key' });
    throwOnError(error, 'Save indicator favorite');
    return;
  }
  const { error } = await supabase.from('terminal_indicator_favorites')
    .delete().eq('user_id', userId).eq('indicator_key', input.key);
  throwOnError(error, 'Remove indicator favorite');
}

export async function listTerminalJournalTrades(limit = 100): Promise<TerminalJournalTrade[]> {
  const userId = await authenticatedUserId();
  if (!userId) return [];
  const boundedLimit = Math.max(1, Math.min(250, Math.floor(limit)));
  const { data, error } = await getSupabaseClient()
    .from('terminal_journal_trades')
    .select('id,symbol,side,quantity,entry_price,exit_price,entry_at,exit_at,gross_pnl,fees,net_pnl,timeframe,setup,strategy_name,tags,notes,source,metadata,created_at')
    .eq('user_id', userId)
    .order('entry_at', { ascending: false })
    .limit(boundedLimit);
  throwOnError(error, 'Load journal trades');
  return (data || []) as unknown as TerminalJournalTrade[];
}

export async function saveTerminalJournalTrade(input: TerminalJournalTradeInput): Promise<TerminalJournalTrade> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to save journal trades.');
  const payload = {
    ...(input.id ? { id: input.id } : {}),
    user_id: userId,
    symbol: input.symbol.trim().toUpperCase(),
    side: input.side,
    quantity: input.quantity,
    entry_price: input.entry_price,
    exit_price: input.exit_price,
    entry_at: input.entry_at,
    exit_at: input.exit_at,
    gross_pnl: input.gross_pnl,
    fees: input.fees,
    net_pnl: input.net_pnl,
    timeframe: input.timeframe,
    setup: input.setup,
    strategy_name: input.strategy_name,
    tags: input.tags || [],
    notes: input.notes || '',
    source: input.source || 'manual',
    metadata: input.metadata || {},
  };
  const { data, error } = await getSupabaseClient()
    .from('terminal_journal_trades')
    .upsert(payload)
    .select('id,symbol,side,quantity,entry_price,exit_price,entry_at,exit_at,gross_pnl,fees,net_pnl,timeframe,setup,strategy_name,tags,notes,source,metadata,created_at')
    .single();
  throwOnError(error, 'Save journal trade');
  return data as unknown as TerminalJournalTrade;
}

export async function deleteTerminalJournalTrade(id: string): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to delete journal trades.');
  const { error } = await getSupabaseClient().from('terminal_journal_trades')
    .delete().eq('user_id', userId).eq('id', id);
  throwOnError(error, 'Delete journal trade');
}

export type TerminalAlertRuleRecord = Omit<TerminalAlertRuleInput, 'status'> & {
  id: string;
  status: 'armed' | 'triggered' | 'paused' | 'cancelled';
  last_triggered_at: string | null;
  created_at: string;
};

export async function listTerminalAlertRules(): Promise<TerminalAlertRuleRecord[]> {
  const userId = await authenticatedUserId();
  if (!userId) return [];
  const { data, error } = await getSupabaseClient()
    .from('terminal_alert_rules')
    .select('id,symbol,label,condition,target_price,timeframe,status,metadata,last_triggered_at,created_at')
    .eq('user_id', userId)
    .neq('status', 'cancelled')
    .order('created_at', { ascending: false });
  throwOnError(error, 'Load alert rules');
  return (data || []) as unknown as TerminalAlertRuleRecord[];
}

/**
 * Claims a live alert exactly once across tabs/devices. The armed-status filter
 * is the compare-and-set guard; RLS still scopes the mutation to auth.uid().
 */
export async function claimTerminalAlertRuleTrigger(
  rule: TerminalAlertRuleRecord,
  trigger: { price: number; source: 'fyers' | 'upstox'; firedAt: string; marketTimestamp?: number | null },
): Promise<boolean> {
  const userId = await authenticatedUserId();
  if (!userId) return false;
  const firedAt = new Date(trigger.firedAt);
  const price = Number(trigger.price);
  if (!Number.isFinite(firedAt.getTime()) || !Number.isFinite(price) || price <= 0) return false;

  const { data, error } = await getSupabaseClient()
    .from('terminal_alert_rules')
    .update({
      status: 'triggered',
      last_triggered_at: firedAt.toISOString(),
      updated_at: firedAt.toISOString(),
      metadata: {
        ...(rule.metadata || {}),
        trigger: {
          condition: rule.condition,
          targetPrice: Number(rule.target_price),
          observedPrice: price,
          source: trigger.source,
          firedAt: firedAt.toISOString(),
          marketTimestamp: Number.isFinite(Number(trigger.marketTimestamp)) ? Number(trigger.marketTimestamp) : null,
        },
      },
    })
    .eq('id', rule.id)
    .eq('user_id', userId)
    .eq('status', 'armed')
    .select('id')
    .maybeSingle();
  throwOnError(error, 'Claim price alert trigger');
  return Boolean(data?.id);
}

export async function saveTerminalAlertRule(input: TerminalAlertRuleInput): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to save alert rules.');
  const { error } = await getSupabaseClient().from('terminal_alert_rules').insert({
    user_id: userId,
    symbol: input.symbol.trim().toUpperCase(),
    label: input.label || input.symbol,
    condition: input.condition,
    target_price: input.target_price,
    timeframe: input.timeframe || null,
    status: input.status || 'armed',
    metadata: input.metadata || {},
  });
  throwOnError(error, 'Save alert rule');
}

export async function createTerminalQuantConversation(title: string, context: Record<string, unknown>): Promise<string | null> {
  const userId = await authenticatedUserId();
  if (!userId) return null;
  const { data, error } = await getSupabaseClient().from('terminal_quant_conversations')
    .insert({ user_id: userId, title: title.slice(0, 120), context })
    .select('id')
    .single();
  throwOnError(error, 'Create Quant conversation');
  return data?.id ? String(data.id) : null;
}

export async function appendTerminalQuantMessage(input: {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  model?: string;
}): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) return;
  const content = input.content.slice(0, 8_000);
  if (!content) return;
  const { error } = await getSupabaseClient().from('terminal_quant_messages').insert({
    user_id: userId,
    conversation_id: input.conversationId,
    role: input.role,
    content,
    model: input.model || null,
  });
  throwOnError(error, 'Save Quant conversation message');
}


export async function deleteTerminalAlertRule(id: string): Promise<void> {
  const userId = await authenticatedUserId();
  if (!userId) throw new Error('Sign in to remove alert rules.');
  const { error } = await getSupabaseClient().from('terminal_alert_rules')
    .delete().eq('user_id', userId).eq('id', id);
  throwOnError(error, 'Delete alert rule');
}
