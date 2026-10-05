import { createClient } from '@supabase/supabase-js';

export type BackgroundJobStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface BackgroundJobRecord {
  id: string;
  userId: string;
  kind: string;
  status: BackgroundJobStatus;
  payload: Record<string, unknown>;
  result: unknown;
  error: string | null;
  progress: number;
  queueMessageId: string | null;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
}

function createServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function fromRow(row: Record<string, unknown>): BackgroundJobRecord {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    kind: String(row.kind),
    status: String(row.status) as BackgroundJobStatus,
    payload: (row.payload && typeof row.payload === 'object' ? row.payload : {}) as Record<string, unknown>,
    result: row.result ?? null,
    error: typeof row.error === 'string' ? row.error : null,
    progress: Number(row.progress ?? 0),
    queueMessageId: typeof row.queue_message_id === 'string' ? row.queue_message_id : null,
    attempts: Number(row.attempts ?? 0),
    createdAt: String(row.created_at),
    startedAt: typeof row.started_at === 'string' ? row.started_at : null,
    completedAt: typeof row.completed_at === 'string' ? row.completed_at : null,
    updatedAt: String(row.updated_at),
  };
}

export class BackgroundJobRepository {
  static async create(userId: string, kind: string, payload: Record<string, unknown>): Promise<BackgroundJobRecord> {
    const db = createServerClient();
    if (!db) throw new Error('Background job storage is not configured');
    const { data, error } = await db.from('background_jobs').insert({
      user_id: userId,
      kind,
      status: 'queued',
      payload,
      progress: 0,
      attempts: 0,
    }).select('*').single();
    if (error || !data) throw new Error('Unable to create background job: ' + (error?.message || 'no row returned'));
    return fromRow(data);
  }

  static async getForUser(id: string, userId: string): Promise<BackgroundJobRecord | undefined> {
    const db = createServerClient();
    if (!db) throw new Error('Background job storage is not configured');
    const { data, error } = await db.from('background_jobs').select('*').eq('id', id).eq('user_id', userId).maybeSingle();
    if (error) throw new Error('Unable to load background job: ' + error.message);
    return data ? fromRow(data) : undefined;
  }

  static async get(id: string): Promise<BackgroundJobRecord | undefined> {
    const db = createServerClient();
    if (!db) throw new Error('Background job storage is not configured');
    const { data, error } = await db.from('background_jobs').select('*').eq('id', id).maybeSingle();
    if (error) throw new Error('Unable to load background job: ' + error.message);
    return data ? fromRow(data) : undefined;
  }

  static async markQueued(id: string, messageId: string | null): Promise<void> {
    await this.update(id, {
      queue_message_id: messageId,
      error: null,
      updated_at: new Date().toISOString(),
    }, 'queued');
  }

  static async markRunning(id: string, attempts: number): Promise<void> {
    const now = new Date().toISOString();
    await this.update(id, {
      status: 'running',
      attempts,
      started_at: now,
      updated_at: now,
      error: null,
    });
  }

  static async markSucceeded(id: string, result: unknown): Promise<void> {
    await this.update(id, {
      status: 'succeeded',
      result,
      progress: 100,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      error: null,
    });
  }

  static async markRetrying(id: string, error: string): Promise<void> {
    await this.update(id, {
      status: 'queued',
      error: error.slice(0, 4000),
      updated_at: new Date().toISOString(),
    });
  }

  static async markFailed(id: string, error: string): Promise<void> {
    await this.update(id, {
      status: 'failed',
      error: error.slice(0, 4000),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, 'queued');
  }

  private static async update(id: string, patch: Record<string, unknown>, expectedStatus?: BackgroundJobStatus): Promise<void> {
    const db = createServerClient();
    if (!db) throw new Error('Background job storage is not configured');
    let query = db.from('background_jobs').update(patch).eq('id', id);
    if (expectedStatus) query = query.eq('status', expectedStatus);
    const { error } = await query;
    if (error) throw new Error('Unable to update background job: ' + error.message);
  }
}
