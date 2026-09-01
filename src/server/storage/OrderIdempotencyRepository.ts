import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export type OrderIdempotencyState = 'pending' | 'completed' | 'failed';

export interface OrderIdempotencyRecord {
  userId: string;
  brokerId: string;
  key: string;
  requestHash: string;
  state: OrderIdempotencyState;
  response: unknown;
  createdAt: string;
  updatedAt: string;
}

export class OrderIdempotencyRepository {
  private static supabase = OrderIdempotencyRepository.createClient();

  private static createClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  private static hash(value: unknown): string {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  static async claim(userId: string, brokerId: string, key: string, body: unknown): Promise<{ claimed: boolean; record?: OrderIdempotencyRecord; conflict?: 'in_flight' | 'request_mismatch' }> {
    if (!this.supabase) throw new Error('Order idempotency storage is not configured');
    const requestHash = this.hash(body);
    const now = new Date().toISOString();
    const { data, error } = await this.supabase.from('order_idempotency').insert({
      user_id: userId,
      broker_id: brokerId.toLowerCase(),
      idempotency_key: key,
      request_hash: requestHash,
      state: 'pending',
      response: null,
      created_at: now,
      updated_at: now,
    }).select('*').maybeSingle();

    if (!error && data) return { claimed: true, record: this.fromRow(data) };
    if (error?.code !== '23505') throw new Error(`Unable to reserve order idempotency key: ${error?.message || 'unknown error'}`);

    const existing = await this.get(userId, brokerId, key);
    if (!existing) throw new Error('Unable to load existing order idempotency record');
    if (existing.requestHash !== requestHash) return { claimed: false, conflict: 'request_mismatch', record: existing };
    if (existing.state === 'pending') return { claimed: false, conflict: 'in_flight', record: existing };
    return { claimed: false, record: existing };
  }

  static async get(userId: string, brokerId: string, key: string): Promise<OrderIdempotencyRecord | undefined> {
    if (!this.supabase) throw new Error('Order idempotency storage is not configured');
    const { data, error } = await this.supabase.from('order_idempotency').select('*').eq('user_id', userId).eq('broker_id', brokerId.toLowerCase()).eq('idempotency_key', key).maybeSingle();
    if (error) throw new Error(`Unable to load order idempotency record: ${error.message}`);
    return data ? this.fromRow(data) : undefined;
  }

  static async complete(userId: string, brokerId: string, key: string, response: unknown): Promise<void> {
    await this.update(userId, brokerId, key, 'completed', response);
  }

  static async fail(userId: string, brokerId: string, key: string, response: unknown): Promise<void> {
    await this.update(userId, brokerId, key, 'failed', response);
  }

  private static async update(userId: string, brokerId: string, key: string, state: OrderIdempotencyState, response: unknown): Promise<void> {
    if (!this.supabase) throw new Error('Order idempotency storage is not configured');
    const { error } = await this.supabase.from('order_idempotency').update({ state, response, updated_at: new Date().toISOString() }).eq('user_id', userId).eq('broker_id', brokerId.toLowerCase()).eq('idempotency_key', key);
    if (error) throw new Error(`Unable to update order idempotency record: ${error.message}`);
  }

  private static fromRow(row: any): OrderIdempotencyRecord {
    return { userId: row.user_id, brokerId: row.broker_id, key: row.idempotency_key, requestHash: row.request_hash, state: row.state, response: row.response, createdAt: row.created_at, updatedAt: row.updated_at };
  }
}
