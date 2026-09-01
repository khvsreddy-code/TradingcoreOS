import { EncryptedPayload } from '../encryption/EncryptionService.js';
import { createClient } from '@supabase/supabase-js';

export interface BrokerSessionRecord {
  brokerId: string;
  userId: string;
  accessTokenEncrypted: EncryptedPayload;
  refreshTokenEncrypted?: EncryptedPayload;
  expiresAt: string;
  status: 'Connected' | 'Expired' | 'Disconnected';
  connectedAt: string;
  clientCode?: string;
}

export class BrokerRepository {
  private static supabase = BrokerRepository.createSupabaseClient();

  private static requireSupabaseForProduction(): void {
    if (!this.supabase && !(process.env.NODE_ENV !== 'production' && process.env.TRADINGCORE_ALLOW_IN_MEMORY_SESSIONS === 'true')) {
      throw new Error('Broker session database is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    }
  }

  private static createSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  private static devStore(): Map<string, BrokerSessionRecord> {
    const globalStore = globalThis as typeof globalThis & { __tradingCoreDevBrokerStore?: Map<string, BrokerSessionRecord> };
    if (!globalStore.__tradingCoreDevBrokerStore) globalStore.__tradingCoreDevBrokerStore = new Map();
    return globalStore.__tradingCoreDevBrokerStore;
  }

  private static getKey(session: Pick<BrokerSessionRecord, 'userId' | 'brokerId'>): string {
    return `${session.userId}:${session.brokerId.toLowerCase()}`;
  }

  private static fromRow(row: any): BrokerSessionRecord {
    return {
      brokerId: row.broker_id,
      userId: row.user_id,
      accessTokenEncrypted: row.access_token_encrypted,
      refreshTokenEncrypted: row.refresh_token_encrypted || undefined,
      expiresAt: row.expires_at,
      status: row.status,
      connectedAt: row.connected_at,
      clientCode: row.client_code || undefined,
    };
  }

  private static toRow(session: BrokerSessionRecord) {
    return {
      broker_id: session.brokerId.toLowerCase(),
      user_id: session.userId,
      access_token_encrypted: session.accessTokenEncrypted,
      refresh_token_encrypted: session.refreshTokenEncrypted || null,
      expires_at: session.expiresAt,
      status: session.status,
      connected_at: session.connectedAt,
      client_code: session.clientCode || null,
      updated_at: new Date().toISOString(),
    };
  }

  public static async saveSession(session: BrokerSessionRecord): Promise<void> {
    if (!session.userId) throw new Error('Authenticated TradingCore user is required');
    this.requireSupabaseForProduction();

    const key = `${session.userId}:${session.brokerId.toLowerCase()}`;

    if (this.supabase) {
      const { error } = await this.supabase
        .from('broker_sessions')
        .upsert(this.toRow(session), { onConflict: 'user_id,broker_id' });

      if (error) {
        throw new Error(`Unable to persist broker session: ${error.message}`);
      }
    }

    if (!this.supabase) this.devStore().set(key, session);
  }

  public static async getSession(brokerId: string, userId: string): Promise<BrokerSessionRecord | undefined> {
    if (!userId) throw new Error('Authenticated TradingCore user is required');
    this.requireSupabaseForProduction();
    const key = `${userId}:${brokerId.toLowerCase()}`;
    if (!this.supabase) return this.devStore().get(key);

    const { data, error } = await this.supabase
      .from('broker_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('broker_id', brokerId.toLowerCase())
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load broker session: ${error.message}`);
    }
    if (!data) return undefined;

    return this.fromRow(data);
  }

  public static async getUserSessions(userId: string): Promise<BrokerSessionRecord[]> {
    if (!userId) throw new Error('Authenticated TradingCore user is required');
    this.requireSupabaseForProduction();
    if (this.supabase) {
      const { data, error } = await this.supabase
        .from('broker_sessions')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        throw new Error(`Unable to load broker sessions: ${error.message}`);
      }

      return (data || []).map((row) => this.fromRow(row));
    }

    const list: BrokerSessionRecord[] = [];
    this.devStore().forEach((session) => {
      if (session.userId === userId) {
        list.push(session);
      }
    });
    return list;
  }

  public static async updateStatus(brokerId: string, userId: string, status: BrokerSessionRecord['status']): Promise<void> {
    if (!userId) throw new Error('Authenticated TradingCore user is required');
    this.requireSupabaseForProduction();
    if (this.supabase) {
      const { error } = await this.supabase
        .from('broker_sessions')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
        .eq('broker_id', brokerId.toLowerCase());
      if (error) throw new Error(`Unable to update broker session: ${error.message}`);
      return;
    }
    const session = this.devStore().get(`${userId}:${brokerId.toLowerCase()}`);
    if (session) session.status = status;
  }

  public static async deleteSession(brokerId: string, userId: string): Promise<boolean> {
    if (!userId) throw new Error('Authenticated TradingCore user is required');
    this.requireSupabaseForProduction();
    const key = `${userId}:${brokerId.toLowerCase()}`;
    const deletedFromMemory = this.devStore().delete(key);

    if (!this.supabase) return deletedFromMemory;

    const { error } = await this.supabase
      .from('broker_sessions')
      .delete()
      .eq('user_id', userId)
      .eq('broker_id', brokerId.toLowerCase());

    if (error) {
      throw new Error(`Unable to delete broker session: ${error.message}`);
    }

    return true;
  }
}
