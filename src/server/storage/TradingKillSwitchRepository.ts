import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type TradingKillSwitchScope = 'account' | 'strategy';

export interface TradingKillSwitchRecord {
  userId: string;
  brokerId: string;
  scope: TradingKillSwitchScope;
  scopeId: string;
  active: boolean;
  reason: string;
  updatedAt: string;
}

export interface ActiveTradingKillSwitch {
  scope: TradingKillSwitchScope;
  scopeId: string;
  reason: string;
  updatedAt: string;
}

/**
 * Durable server-side kill switches. Call this immediately before every broker
 * order side effect; UI flags are advisory and are never treated as authority.
 * Missing storage is an error, not an implicit "trading enabled" decision.
 */
export class TradingKillSwitchRepository {
  private static readonly supabase: SupabaseClient | null = (() => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  })();

  private static db(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('Durable trading kill-switch storage is unavailable; order submission is blocked.');
    }
    return this.supabase;
  }

  static async activeBlock(input: {
    userId: string;
    brokerId: string;
    strategyId?: string;
  }): Promise<ActiveTradingKillSwitch | null> {
    if (!input.userId.trim()) throw new Error('Authenticated user is required to evaluate trading kill switches.');
    const brokerId = input.brokerId.trim().toLowerCase();
    if (!/^[a-z0-9_-]{1,64}$/.test(brokerId)) throw new Error('Invalid broker scope for trading kill-switch lookup.');

    const { data, error } = await this.db()
      .from('trading_kill_switches')
      .select('scope,scope_id,reason,updated_at')
      .eq('user_id', input.userId)
      .eq('broker_id', brokerId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`Unable to verify trading kill switches: ${error.message}`);

    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const account = rows.find(row => row.scope === 'account' && row.scope_id === 'account');
    const strategy = input.strategyId
      ? rows.find(row => row.scope === 'strategy' && row.scope_id === input.strategyId)
      : undefined;
    const row = account ?? strategy;
    if (!row) return null;
    return {
      scope: row.scope as TradingKillSwitchScope,
      scopeId: String(row.scope_id),
      reason: String(row.reason ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    };
  }

  static async listForAccount(userId: string, brokerId: string): Promise<TradingKillSwitchRecord[]> {
    const { data, error } = await this.db()
      .from('trading_kill_switches')
      .select('user_id,broker_id,scope,scope_id,is_active,reason,updated_at')
      .eq('user_id', userId)
      .eq('broker_id', brokerId.trim().toLowerCase())
      .order('updated_at', { ascending: false })
      .limit(100);
    if (error) throw new Error(`Unable to list trading kill switches: ${error.message}`);
    return (data ?? []).map((value: Record<string, unknown>) => ({
      userId: String(value.user_id),
      brokerId: String(value.broker_id),
      scope: value.scope as TradingKillSwitchScope,
      scopeId: String(value.scope_id),
      active: value.is_active === true,
      reason: String(value.reason ?? ''),
      updatedAt: String(value.updated_at ?? ''),
    }));
  }

  static async set(input: {
    userId: string;
    brokerId: string;
    scope: TradingKillSwitchScope;
    scopeId: string;
    active: boolean;
    reason: string;
  }): Promise<TradingKillSwitchRecord> {
    const brokerId = input.brokerId.trim().toLowerCase();
    const scopeId = input.scope === 'account' ? 'account' : input.scopeId.trim();
    if (!/^[a-z0-9_-]{1,64}$/.test(brokerId)) throw new Error('Invalid broker scope for trading kill switch.');
    if (!input.userId.trim() || !scopeId || scopeId.length > 128) throw new Error('Invalid owner or scope id for trading kill switch.');
    if (input.scope !== 'account' && input.scope !== 'strategy') throw new Error('Invalid trading kill-switch scope.');

    const now = new Date().toISOString();
    const reason = String(input.reason ?? '').trim().slice(0, 500);
    const { data, error } = await this.db()
      .from('trading_kill_switches')
      .upsert({
        user_id: input.userId,
        broker_id: brokerId,
        scope: input.scope,
        scope_id: scopeId,
        is_active: input.active,
        reason,
        updated_by: input.userId,
        updated_at: now,
      }, { onConflict: 'user_id,broker_id,scope,scope_id' })
      .select('user_id,broker_id,scope,scope_id,is_active,reason,updated_at')
      .single();
    if (error || !data) throw new Error(`Unable to persist trading kill switch: ${error?.message || 'missing row'}`);
    return {
      userId: String(data.user_id),
      brokerId: String(data.broker_id),
      scope: data.scope as TradingKillSwitchScope,
      scopeId: String(data.scope_id),
      active: data.is_active === true,
      reason: String(data.reason ?? ''),
      updatedAt: String(data.updated_at ?? ''),
    };
  }
}
