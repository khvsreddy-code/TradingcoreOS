import { createClient } from '@supabase/supabase-js';
import { canonicalSha256 } from '../utils/canonicalJson.js';

export type OrderIdempotencyState = 'pending' | 'completed' | 'failed' | 'unknown' | 'expired' | 'recovery_required';

export interface OrderIdempotencyRecord {
  userId: string;
  brokerId: string;
  key: string;
  requestHash: string;
  state: OrderIdempotencyState;
  response: unknown;
  brokerOrderId: string | null;
  attempts: number;
  expiresAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export class OrderIdempotencyRepository {
  private static supabase = OrderIdempotencyRepository.createClient();
  private static readonly DEFAULT_TTL_MS = 10 * 60_000;

  private static createClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  private static hash(value: unknown): string {
    return canonicalSha256(value);
  }

  static async claim(userId: string, brokerId: string, key: string, body: unknown): Promise<{ claimed: boolean; record?: OrderIdempotencyRecord; conflict?: 'in_flight' | 'request_mismatch' | 'recovery_required' }> {
    if (!this.supabase) throw new Error('Order idempotency storage is not configured');
    const requestHash = this.hash(body);
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + this.DEFAULT_TTL_MS).toISOString();
    const normalizedBroker = brokerId.toLowerCase();
    const insert = await this.supabase.from('order_idempotency').insert({
      user_id: userId,
      broker_id: normalizedBroker,
      idempotency_key: key,
      request_hash: requestHash,
      state: 'pending',
      response: null,
      broker_order_id: null,
      attempts: 1,
      expires_at: expiresAt,
      last_error: null,
      created_at: createdAt,
      updated_at: createdAt,
    }).select('*').maybeSingle();

    if (!insert.error && insert.data) return { claimed: true, record: this.fromRow(insert.data) };
    if (insert.error?.code !== '23505') throw new Error(`Unable to reserve order idempotency key: ${insert.error?.message || 'unknown error'}`);

    let existing = await this.get(userId, normalizedBroker, key);
    if (!existing) throw new Error('Unable to load existing order idempotency record');
    if (existing.requestHash !== requestHash) return { claimed: false, conflict: 'request_mismatch', record: existing };

    if (existing.state === 'pending' && existing.expiresAt && new Date(existing.expiresAt).getTime() <= Date.now()) {
      existing = await this.markRecoveryRequired(userId, normalizedBroker, key, null, 'Previous order attempt expired before a terminal broker result was recorded.') || existing;
    }
    if (existing.state === 'pending') return { claimed: false, conflict: 'in_flight', record: existing };
    if (existing.state === 'unknown' || existing.state === 'recovery_required') return { claimed: false, conflict: 'recovery_required', record: existing };
    return { claimed: false, record: existing };
  }

  static async get(userId: string, brokerId: string, key: string): Promise<OrderIdempotencyRecord | undefined> {
    if (!this.supabase) throw new Error('Order idempotency storage is not configured');
    const { data, error } = await this.supabase.from('order_idempotency').select('*').eq('user_id', userId).eq('broker_id', brokerId.toLowerCase()).eq('idempotency_key', key).maybeSingle();
    if (error) throw new Error(`Unable to load order idempotency record: ${error.message}`);
    return data ? this.fromRow(data) : undefined;
  }

  static async complete(userId: string, brokerId: string, key: string, response: unknown): Promise<void> {
    await this.update(userId, brokerId, key, 'completed', response, this.extractBrokerOrderId(response), null);
  }

  static async fail(userId: string, brokerId: string, key: string, response: unknown): Promise<void> {
    await this.update(userId, brokerId, key, 'failed', response, this.extractBrokerOrderId(response), this.extractError(response));
  }

  static async markUnknown(userId: string, brokerId: string, key: string, response: unknown, errorMessage?: string): Promise<void> {
    await this.update(userId, brokerId, key, 'unknown', response, this.extractBrokerOrderId(response), errorMessage || this.extractError(response));
  }

  static async markRecoveryRequired(userId: string, brokerId: string, key: string, response: unknown = null, reason = 'Order outcome requires reconciliation.'): Promise<OrderIdempotencyRecord | undefined> {
    if (!this.supabase) throw new Error('Order idempotency storage is not configured');
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.from('order_idempotency')
      .update({ state: 'recovery_required', response, broker_order_id: this.extractBrokerOrderId(response), last_error: reason, updated_at: now })
      .eq('user_id', userId).eq('broker_id', brokerId.toLowerCase()).eq('idempotency_key', key)
      .select('*').maybeSingle();
    if (error) throw new Error(`Unable to mark order recovery state: ${error.message}`);
    return data ? this.fromRow(data) : undefined;
  }

  static async expireStale(limit = 100): Promise<number> {
    if (!this.supabase) return 0;
    const cutoff = new Date().toISOString();
    const { data, error } = await this.supabase.from('order_idempotency')
      .update({ state: 'recovery_required', last_error: 'Idempotency reservation expired without a terminal broker result.', updated_at: cutoff })
      .eq('state', 'pending').lt('expires_at', cutoff).limit(limit).select('idempotency_key');
    if (error) throw new Error(`Unable to expire stale idempotency rows: ${error.message}`);
    return data?.length ?? 0;
  }

  private static async update(userId: string, brokerId: string, key: string, state: OrderIdempotencyState, response: unknown, brokerOrderId: string | null, lastError: string | null): Promise<void> {
    if (!this.supabase) throw new Error('Order idempotency storage is not configured');
    const { error } = await this.supabase.from('order_idempotency').update({ state, response, broker_order_id: brokerOrderId, last_error: lastError, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('broker_id', brokerId.toLowerCase()).eq('idempotency_key', key);
    if (error) throw new Error(`Unable to update order idempotency record: ${error.message}`);
  }

  private static extractBrokerOrderId(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const root = response as Record<string, unknown>;
    const data = root.data && typeof root.data === 'object' ? root.data as Record<string, unknown> : root;
    const id = data.orderId ?? data.order_id ?? data.id;
    return typeof id === 'string' && id.trim() ? id.trim() : null;
  }

  private static extractError(response: unknown): string | null {
    if (!response || typeof response !== 'object') return null;
    const value = (response as Record<string, unknown>).error;
    return typeof value === 'string' ? value : null;
  }

  private static fromRow(row: unknown): OrderIdempotencyRecord {
    if (!row || typeof row !== 'object') throw new Error('Invalid order idempotency row');
    const r = row as Record<string, unknown>;
    return {
      userId: String(r.user_id ?? ''),
      brokerId: String(r.broker_id ?? ''),
      key: String(r.idempotency_key ?? ''),
      requestHash: String(r.request_hash ?? ''),
      state: String(r.state ?? 'pending') as OrderIdempotencyState,
      response: r.response ?? null,
      brokerOrderId: typeof r.broker_order_id === 'string' ? r.broker_order_id : null,
      attempts: Number.isInteger(Number(r.attempts)) ? Number(r.attempts) : 1,
      expiresAt: typeof r.expires_at === 'string' ? r.expires_at : null,
      lastError: typeof r.last_error === 'string' ? r.last_error : null,
      createdAt: String(r.created_at ?? ''),
      updatedAt: String(r.updated_at ?? ''),
    };
  }
}
