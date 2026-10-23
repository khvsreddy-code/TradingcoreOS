import { createClient } from '@supabase/supabase-js';

export type TradingKillSwitchScope = 'global' | 'account' | 'strategy';

export class TradingKillSwitchRepository {
  private static readonly supabase = TradingKillSwitchRepository.createClient();

  private static createClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  /**
   * Execution-boundary kill switch. Missing storage is a hard failure rather
   * than silently treating an unavailable control plane as "enabled".
   */
  static async assertOrderSubmissionAllowed(userId: string, strategyId?: string): Promise<void> {
    const globalEnv = String(process.env.TRADINGCORE_ORDER_KILL_SWITCH ?? '').trim().toLowerCase();
    if (['1', 'true', 'yes', 'enabled', 'on'].includes(globalEnv)) {
      throw new Error('TradingCore global order kill switch is active; new orders are blocked.');
    }
    if (!this.supabase) throw new Error('Trading kill-switch storage is not configured; order submission is blocked.');

    const scopes: Array<{ scope: TradingKillSwitchScope; id: string }> = [
      { scope: 'global', id: '*' },
      { scope: 'account', id: userId },
    ];
    if (strategyId) scopes.push({ scope: 'strategy', id: strategyId });

    for (const item of scopes) {
      const { data, error } = await this.supabase
        .from('trading_kill_switches')
        .select('scope_type, scope_id, reason')
        .eq('scope_type', item.scope)
        .eq('scope_id', item.id)
        .eq('enabled', true)
        .limit(1);
      if (error) {
        throw new Error('Trading kill-switch state could not be verified; order submission is blocked.');
      }
      if (data?.length) {
        const reason = typeof data[0].reason === 'string' && data[0].reason.trim()
          ? data[0].reason.trim()
          : 'An administrator has blocked new order submissions.';
        throw new Error(`Trading ${item.scope} kill switch is active: ${reason}`);
      }
    }
  }
}
