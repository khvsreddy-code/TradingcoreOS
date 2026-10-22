import { createClient } from '@supabase/supabase-js';

export type TradingCoreAuditEvent = Readonly<{
  userId?: string | null;
  workspaceId?: string | null;
  actorType: 'user' | 'system' | 'broker' | 'automation';
  eventType: string;
  requestId?: string | null;
  correlationId?: string | null;
  payload?: unknown;
}>;

export class AuditLogRepository {
  private static readonly supabase = AuditLogRepository.createClient();

  private static createClient() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  }

  /** Mandatory audit write for order-side effects. Unlike best-effort telemetry,
   * a missing audit store is a submission failure for callers using this method. */
  static async appendRequired(event: TradingCoreAuditEvent): Promise<void> {
    if (!this.supabase) throw new Error('Durable execution audit storage is unavailable.');
    if (!event.eventType) throw new Error('Execution audit event type is required.');
    await this.append(event);
  }

  static async append(event: TradingCoreAuditEvent): Promise<void> {
    if (!this.supabase || !event.eventType) return;
    const payload = event.payload ?? null;
    const { error } = await this.supabase.rpc('append_execution_audit_event', {
      p_user_id: event.userId || null,
      p_workspace_id: event.workspaceId || null,
      p_actor_type: event.actorType,
      p_event_type: event.eventType,
      p_request_id: event.requestId || null,
      p_correlation_id: event.correlationId || null,
      p_payload: payload,
    });
    if (error) throw new Error(`Unable to append audit event: ${error.message}`);
  }
}
