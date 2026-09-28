import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

interface OAuthStateRow {
  state_hash: string;
  user_id: string;
  broker_id: string;
  expires_at: string;
  consumed_at: string | null;
}

/** One-time OAuth state storage. Supabase is authoritative in production. */
export class OAuthStateRepository {
  private static supabase = OAuthStateRepository.createClient();
  private static memory = new Map<string, OAuthStateRow>();

  private static createClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    return url && key
      ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
      : null;
  }

  private static hash(state: string): string {
    return crypto.createHash('sha256').update(state).digest('hex');
  }

  private static allowMemoryFallback(): boolean {
    return process.env.NODE_ENV !== 'production' && process.env.TRADINGCORE_ALLOW_IN_MEMORY_OAUTH_STATE === 'true';
  }

  static async issue(state: string, userId: string, brokerId: string, expiresAt: Date): Promise<void> {
    if (!this.supabase && !this.allowMemoryFallback()) {
      throw new Error('OAuth state storage is not configured. Set Supabase server credentials.');
    }
    const row: OAuthStateRow = {
      state_hash: this.hash(state),
      user_id: userId,
      broker_id: brokerId.toLowerCase(),
      expires_at: expiresAt.toISOString(),
      consumed_at: null,
    };
    if (this.supabase) {
      const { error } = await this.supabase.from('oauth_states').insert(row);
      if (error) throw new Error(`Unable to persist OAuth state: ${error.message}`);
      return;
    }
    this.memory.set(row.state_hash, row);
  }

  /** Atomically consumes a state so a callback code cannot be replayed. */
  static async consume(state: string, userId: string, brokerId: string): Promise<boolean> {
    const stateHash = this.hash(state);
    const normalizedBroker = brokerId.toLowerCase();
    if (!this.supabase && !this.allowMemoryFallback()) return false;

    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('oauth_states')
        .update({ consumed_at: new Date().toISOString() })
        .eq('state_hash', stateHash)
        .eq('user_id', userId)
        .eq('broker_id', normalizedBroker)
        .is('consumed_at', null)
        .gt('expires_at', new Date().toISOString())
        .select('state_hash')
        .maybeSingle();
      if (error) throw new Error(`Unable to consume OAuth state: ${error.message}`);
      return Boolean(data);
    }

    const row = this.memory.get(stateHash);
    if (!row || row.user_id !== userId || row.broker_id !== normalizedBroker || row.consumed_at || new Date(row.expires_at).getTime() <= Date.now()) return false;
    row.consumed_at = new Date().toISOString();
    return true;
  }
}
