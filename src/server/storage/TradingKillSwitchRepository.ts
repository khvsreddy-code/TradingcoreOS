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

    const db = this.db();
    // Query the exact account key first, then (when present) the exact strategy
    // key. Do not use a capped list here: more than 100 active strategy switches
    // must never hide an account-wide stop from the execution boundary.
    const account = await db.from('trading_kill_switches')
      .select('scope,scope_id,reason,updated_at')
      .eq('user_id', input.userId)
      .eq('broker_id', brokerId)
      .eq('scope', 'account')
      .eq('scope_id', 'account')
      .eq('is_active', true)
      .maybeSingle();
    if (account.error) throw new Error(`Unable to verify account trading kill switch: ${account.error.message}`);
    if (account.data) {
      return {
        scope: 'account',
        scopeId: 'account',
        reason: String(account.data.reason ?? ''),
        updatedAt: String(account.data.updated_at ?? ''),
      };
    }

    if (!input.strategyId) return null;
    const strategy = await db.from('trading_kill_switches')
      .select('scope,scope_id,reason,updated_at')
      .eq('user_id', input.userId)
      .eq('broker_id', brokerId)
      .eq('scope', 'strategy')
      .eq('scope_id', input.strategyId)
      .eq('is_active', true)
      .maybeSingle();
    if (strategy.error) throw new Error(`Unable to verify strategy trading kill switch: ${strategy.error.message}`);
    if (!strategy.data) return null;
    return {
      scope: 'strategy',
      scopeId: String(strategy.data.scope_id),
      reason: String(strategy.data.reason ?? ''),
      updatedAt: String(strategy.data.updated_at ?? ''),
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
    requestId?: string | null;
  }): Promise<TradingKillSwitchRecord> {
    const brokerId = input.brokerId.trim().toLowerCase();
    const scopeId = input.scope === 'account' ? 'account' : input.scopeId.trim();
    if (!/^[a-z0-9_-]{1,64}$/.test(brokerId)) throw new Error('Invalid broker scope for trading kill switch.');
    if (!input.userId.trim() || !scopeId || scopeId.length > 128) throw new Error('Invalid owner or scope id for trading kill switch.');
    if (input.scope !== 'account' && input.scope !== 'strategy') throw new Error('Invalid trading kill-switch scope.');

    const reason = String(input.reason ?? '').trim().slice(0, 500);
    const { data, error } = await this.db().rpc('set_trading_kill_switch', {
      p_user_id: input.userId,
      p_broker_id: brokerId,
      p_scope: input.scope,
      p_scope_id: scopeId,
      p_active: input.active,
      p_reason: reason,
      p_request_id: input.requestId || null,
    });
    const row = Array.isArray(data) ? data[0] as Record<string, unknown> | undefined : data as Record<string, unknown> | null;
    if (error || !row) throw new Error(`Unable to atomically persist and audit trading kill switch: ${error?.message || 'missing row'}`);
    return {
      userId: String(row.user_id),
      brokerId: String(row.broker_id),
      scope: row.scope as TradingKillSwitchScope,
      scopeId: String(row.scope_id),
      active: row.is_active === true,
      reason: String(row.reason ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    };
  }
}
