import { EncryptedPayload } from '../encryption/EncryptionService.js';
import { createClient } from '@supabase/supabase-js';
import { getSharedRedis } from '../coordination/UpstashRedisRest.js';

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
  private static sessionCache = new Map<string, { session?: BrokerSessionRecord; expiresAt: number }>();
  private static accessTokenCache = new Map<string, { token: string; sessionFingerprint: string; expiresAt: number }>();
  private static readonly SESSION_CACHE_MS = 5000;
  private static readonly ACCESS_TOKEN_CACHE_MS = 2000;
  private static supabase = BrokerRepository.createSupabaseClient();

  private static requireSupabaseForProduction(): void {
    if (!this.supabase && !(process.env.NODE_ENV !== 'production' && process.env.TRADINGCORE_ALLOW_IN_MEMORY_SESSIONS === 'true')) {
      throw new Error('Broker session database is not configured. Set SUPABASE_URL and a server-side Supabase key.');
    }
  }

  private static createSupabaseClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
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

  private static getSharedCacheKey(userId: string, brokerId: string): string {
    return `tco:broker:session:${userId}:${brokerId.toLowerCase()}`;
  }

  private static accessTokenCacheKey(userId: string, brokerId: string): string {
    return `${userId}:${brokerId.toLowerCase()}`;
  }

  private static sessionFingerprint(session: BrokerSessionRecord): string {
    return JSON.stringify({
      accessTokenEncrypted: session.accessTokenEncrypted,
      expiresAt: session.expiresAt,
      status: session.status,
      connectedAt: session.connectedAt,
    });
  }

  private static invalidateSessionCaches(userId: string, brokerId: string): void {
    const key = `${userId}:${brokerId.toLowerCase()}`;
    this.sessionCache.delete(key);
    this.accessTokenCache.delete(this.accessTokenCacheKey(userId, brokerId));
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
    this.sessionCache.set(key, { session, expiresAt: Date.now() + this.SESSION_CACHE_MS });
    this.accessTokenCache.delete(this.accessTokenCacheKey(session.userId, session.brokerId));

    const shared = getSharedRedis();
    if (shared.configured) {
      await shared.set(
        this.getSharedCacheKey(session.userId, session.brokerId),
        JSON.stringify(session),
        { px: this.SESSION_CACHE_MS },
      ).catch(() => undefined);
    }
  }

  public static async getSession(brokerId: string, userId: string): Promise<BrokerSessionRecord | undefined> {
    if (!userId) throw new Error('Authenticated TradingCore user is required');
    this.requireSupabaseForProduction();
    const key = `${userId}:${brokerId.toLowerCase()}`;
    const cached = this.sessionCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.session;

    const shared = getSharedRedis();
    if (shared.configured) {
      const raw = await shared.get<string>(this.getSharedCacheKey(userId, brokerId)).catch(() => null);
      if (raw) {
        try {
          const session = JSON.parse(raw) as BrokerSessionRecord;
          this.sessionCache.set(key, { session, expiresAt: Date.now() + this.SESSION_CACHE_MS });
          return session;
        } catch {
          // Ignore malformed shared-cache entries and recover from the durable store.
        }
      }
    }

    if (!this.supabase) {
      const session = this.devStore().get(key);
      this.sessionCache.set(key, { session, expiresAt: Date.now() + this.SESSION_CACHE_MS });
      return session;
    }

    const { data, error } = await this.supabase
      .from('broker_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('broker_id', brokerId.toLowerCase())
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to load broker session: ${error.message}`);
    }
    if (!data) {
      this.sessionCache.set(key, { session: undefined, expiresAt: Date.now() + this.SESSION_CACHE_MS });
      if (shared.configured) await shared.del(this.getSharedCacheKey(userId, brokerId)).catch(() => undefined);
      return undefined;
    }

    const session = this.fromRow(data);
    this.sessionCache.set(key, { session, expiresAt: Date.now() + this.SESSION_CACHE_MS });
    if (shared.configured) {
      await shared.set(this.getSharedCacheKey(userId, brokerId), JSON.stringify(session), { px: this.SESSION_CACHE_MS }).catch(() => undefined);
    }
    return session;
  }

  public static async getUserSessions(userId: string): Promise<BrokerSessionRecord[]> {  public static async getAccessTokenForExecution(brokerId: string, userId: string): Promise<string | undefined> {
    const session = await this.getSession(brokerId, userId);
    if (!session || session.status !== 'Connected') return undefined;
    if (new Date(session.expiresAt).getTime() <= Date.now()) return undefined;

    const key = this.accessTokenCacheKey(userId, brokerId);
    const fingerprint = this.sessionFingerprint(session);
    const cached = this.accessTokenCache.get(key);
    if (cached && cached.expiresAt > Date.now() && cached.sessionFingerprint === fingerprint) return cached.token;

    const { EncryptionService } = await import('../encryption/EncryptionService.js');
    const token = EncryptionService.decrypt(session.accessTokenEncrypted);
    const remaining = Math.max(100, new Date(session.expiresAt).getTime() - Date.now() - 30_000);
    this.accessTokenCache.set(key, {
      token,
      sessionFingerprint: fingerprint,
      expiresAt: Date.now() + Math.min(this.ACCESS_TOKEN_CACHE_MS, remaining),
    });
    return token;
  }


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
      this.invalidateSessionCaches(userId, brokerId);
      await getSharedRedis().del(this.getSharedCacheKey(userId, brokerId)).catch(() => undefined);
      return;
    }
    const session = this.devStore().get(`${userId}:${brokerId.toLowerCase()}`);
    if (session) session.status = status;
      this.invalidateSessionCaches(userId, brokerId);
    await getSharedRedis().del(this.getSharedCacheKey(userId, brokerId)).catch(() => undefined);
  }

  public static async deleteSession(brokerId: string, userId: string): Promise<boolean> {
    if (!userId) throw new Error('Authenticated TradingCore user is required');
    this.requireSupabaseForProduction();
    const key = `${userId}:${brokerId.toLowerCase()}`;
    const deletedFromMemory = this.devStore().delete(key);

    this.invalidateSessionCaches(userId, brokerId);
    await getSharedRedis().del(this.getSharedCacheKey(userId, brokerId)).catch(() => undefined);
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
