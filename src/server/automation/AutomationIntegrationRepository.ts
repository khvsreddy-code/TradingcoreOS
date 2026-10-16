import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { canonicalSha256 } from '../utils/canonicalJson.js';

export type AutomationRequestState =
  | 'PROCESSING' | 'PAPER' | 'INTENT' | 'SUBMITTED' | 'ACKNOWLEDGED' | 'OPEN'
  | 'PARTIAL' | 'FILLED' | 'CANCEL_PENDING' | 'CANCELLED' | 'REJECTED'
  | 'EXPIRED' | 'UNKNOWN' | 'RECOVERY_REQUIRED';

export type AutomationIntegrationScope = 'market:read' | 'signals:read' | 'orders:request';

export interface AutomationRecord {
  id: string;
  name: string;
  status: string;
  lifecycleStatus: string;
  lifecycleState: string;
  allowOrderExecution: boolean;
  requireConfirmation: boolean;
}

export interface AutomationIntegration {
  id: string;
  userId: string;
  automationId: string;
  name: string;
  brokerId: 'fyers';
  tokenPrefix: string;
  scopes: AutomationIntegrationScope[];
  allowedSymbols: string[];
  maxOrderQuantity: number;
  maxOrderNotional: number;
  maxPositionNotional: number;
  maxAccountExposureNotional: number;
  maxDailyOrders: number;
  marginBufferPercent: number;
  allowLiveOrders: boolean;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  lastUsedAt: string | null;
}

export interface AutomationSignalRecord {
  id: string;
  integrationId: string;
  eventId: string;
  eventType: string;
  symbol: string;
  timeframe: string;
  sourceId: string;
  runId: string;
  mode: string;
  barIndex: number;
  signalTimestamp: string;
  createdAt: string;
  payload: Record<string, unknown>;
  payloadHash: string;
}

export interface AutomationOrderRequestRecord {
  id: string;
  integrationId: string;
  userId: string;
  automationId: string;
  externalRequestId: string;
  requestHash: string;
  state: AutomationRequestState;
  payload: Record<string, unknown>;
  response: Record<string, unknown> | null;
  clientOrderId: string | null;
  brokerOrderId: string | null;
  signalId: string | null;
  estimatedNotional: number | null;
  riskChecks: Record<string, unknown>[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateAutomationIntegrationInput {
  id: string;
  userId: string;
  automationId: string;
  name: string;
  brokerId: 'fyers';
  tokenHash: string;
  tokenPrefix: string;
  scopes: AutomationIntegrationScope[];
  allowedSymbols: string[];
  maxOrderQuantity: number;
  maxOrderNotional: number;
  maxPositionNotional: number;
  maxAccountExposureNotional: number;
  maxDailyOrders: number;
  marginBufferPercent: number;
  allowLiveOrders: boolean;
  expiresAt: string;
}

export class AutomationIntegrationRepository {
  private static readonly supabase: SupabaseClient | null = (() => {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
    return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  })();

  private static db(): SupabaseClient {
    if (!this.supabase) {
      throw new Error('Persistent automation integration storage is not configured. Set SUPABASE_URL and a server-side Supabase key.');
    }
    return this.supabase;
  }

  private static fromIntegration(row: Record<string, unknown>): AutomationIntegration {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      automationId: String(row.automation_id),
      name: String(row.name),
      brokerId: String(row.broker_id).toLowerCase() as 'fyers',
      tokenPrefix: String(row.token_prefix ?? ''),
      scopes: Array.isArray(row.scopes) ? row.scopes as AutomationIntegrationScope[] : [],
      allowedSymbols: Array.isArray(row.allowed_symbols) ? row.allowed_symbols.map(String) : [],
      maxOrderQuantity: Number(row.max_order_quantity),
      maxOrderNotional: Number(row.max_order_notional),
      maxPositionNotional: Number(row.max_position_notional),
      maxAccountExposureNotional: Number(row.max_account_exposure_notional),
      maxDailyOrders: Number(row.max_daily_orders),
      marginBufferPercent: Number(row.margin_buffer_percent ?? 15),
      allowLiveOrders: row.allow_live_orders === true,
      expiresAt: String(row.expires_at),
      revokedAt: typeof row.revoked_at === 'string' ? row.revoked_at : null,
      createdAt: String(row.created_at),
      lastUsedAt: typeof row.last_used_at === 'string' ? row.last_used_at : null,
    };
  }

  private static fromAutomation(row: Record<string, unknown>): AutomationRecord {
    return {
      id: String(row.id),
      name: String(row.name ?? 'Automation'),
      status: String(row.status ?? 'paused'),
      lifecycleStatus: String(row.lifecycle_status ?? 'paused').toLowerCase(),
      lifecycleState: String(row.lifecycle_state ?? 'CREATED').toUpperCase(),
      allowOrderExecution: row.allow_order_execution === true,
      requireConfirmation: row.require_confirmation !== false,
    };
  }

  private static fromSignal(row: Record<string, unknown>): AutomationSignalRecord {
    return {
      id: String(row.id),
      integrationId: String(row.integration_id),
      eventId: String(row.event_id),
      eventType: String(row.event_type),
      symbol: String(row.symbol),
      timeframe: String(row.timeframe ?? ''),
      sourceId: String(row.source_id ?? ''),
      runId: String(row.run_id ?? ''),
      mode: String(row.mode ?? ''),
      barIndex: Number(row.bar_index ?? -1),
      signalTimestamp: String(row.signal_timestamp),
      createdAt: String(row.created_at),
      payload: row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {},
      payloadHash: String(row.payload_hash ?? ''),
    };
  }

  private static fromRequest(row: Record<string, unknown>): AutomationOrderRequestRecord {
    return {
      id: String(row.id),
      integrationId: String(row.integration_id),
      userId: String(row.user_id),
      automationId: String(row.automation_id),
      externalRequestId: String(row.external_request_id),
      requestHash: String(row.request_hash),
      state: String(row.state) as AutomationRequestState,
      payload: row.payload && typeof row.payload === 'object' ? row.payload as Record<string, unknown> : {},
      response: row.response && typeof row.response === 'object' ? row.response as Record<string, unknown> : null,
      clientOrderId: typeof row.client_order_id === 'string' ? row.client_order_id : null,
      brokerOrderId: typeof row.broker_order_id === 'string' ? row.broker_order_id : null,
      signalId: typeof row.signal_id === 'string' ? row.signal_id : null,
      estimatedNotional: row.estimated_notional == null ? null : Number(row.estimated_notional),
      riskChecks: Array.isArray(row.risk_checks) ? row.risk_checks as Record<string, unknown>[] : [],
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  static async getAutomationForOwner(userId: string, automationId: string): Promise<AutomationRecord | undefined> {
    const { data, error } = await this.db().from('automations')
      .select('id,name,status,lifecycle_status,lifecycle_state,allow_order_execution,require_confirmation')
      .eq('id', automationId).eq('user_id', userId).maybeSingle();
    if (error) throw new Error(`Unable to load automation ownership and lifecycle: ${error.message}`);
    return data ? this.fromAutomation(data as Record<string, unknown>) : undefined;
  }

  static async getAutomationForIntegration(integration: AutomationIntegration): Promise<AutomationRecord | undefined> {
    return this.getAutomationForOwner(integration.userId, integration.automationId);
  }

  static async listAutomations(userId: string): Promise<AutomationRecord[]> {
    const { data, error } = await this.db().from('automations')
      .select('id,name,status,lifecycle_status,lifecycle_state,allow_order_execution,require_confirmation')
      .eq('user_id', userId).order('updated_at', { ascending: false }).limit(100);
    if (error) throw new Error(`Unable to list owned automations: ${error.message}`);
    return (data ?? []).map(row => this.fromAutomation(row as Record<string, unknown>));
  }

  static async create(input: CreateAutomationIntegrationInput): Promise<AutomationIntegration> {
    const { data, error } = await this.db().from('automation_integrations').insert({
      id: input.id,
      user_id: input.userId,
      automation_id: input.automationId,
      name: input.name,
      broker_id: input.brokerId,
      token_hash: input.tokenHash,
      token_prefix: input.tokenPrefix,
      scopes: input.scopes,
      allowed_symbols: input.allowedSymbols,
      max_order_quantity: input.maxOrderQuantity,
      max_order_notional: input.maxOrderNotional,
      max_position_notional: input.maxPositionNotional,
      max_account_exposure_notional: input.maxAccountExposureNotional,
      max_daily_orders: input.maxDailyOrders,
      margin_buffer_percent: input.marginBufferPercent,
      allow_live_orders: input.allowLiveOrders,
      expires_at: input.expiresAt,
    }).select('*').single();
    if (error || !data) throw new Error(`Unable to create automation integration: ${error?.message ?? 'record was not returned'}`);
    return this.fromIntegration(data as Record<string, unknown>);
  }

  static async listForUser(userId: string): Promise<AutomationIntegration[]> {
    const { data, error } = await this.db().from('automation_integrations')
      .select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(100);
    if (error) throw new Error(`Unable to list automation integrations: ${error.message}`);
    return (data ?? []).map(row => this.fromIntegration(row as Record<string, unknown>));
  }

  static async getById(integrationId: string): Promise<AutomationIntegration | undefined> {
    const { data, error } = await this.db().from('automation_integrations')
      .select('*').eq('id', integrationId).maybeSingle();
    if (error) throw new Error(`Unable to load automation integration: ${error.message}`);
    return data ? this.fromIntegration(data as Record<string, unknown>) : undefined;
  }

  static async getForOwner(userId: string, integrationId: string): Promise<AutomationIntegration | undefined> {
    const { data, error } = await this.db().from('automation_integrations')
      .select('*').eq('user_id', userId).eq('id', integrationId).maybeSingle();
    if (error) throw new Error(`Unable to load automation integration: ${error.message}`);
    return data ? this.fromIntegration(data as Record<string, unknown>) : undefined;
  }

  static async revoke(userId: string, integrationId: string): Promise<boolean> {
    const { data, error } = await this.db().from('automation_integrations')
      .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('user_id', userId).eq('id', integrationId).is('revoked_at', null)
      .select('id').maybeSingle();
    if (error) throw new Error(`Unable to revoke automation integration: ${error.message}`);
    return Boolean(data);
  }

  static async authenticateToken(token: string): Promise<{ integration: AutomationIntegration; automation: AutomationRecord } | undefined> {
    if (!/^tco_auto_[a-f0-9-]{36}_[A-Za-z0-9_-]{43}$/.test(token)) return undefined;
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const { data, error } = await this.db().from('automation_integrations')
      .select('*').eq('token_hash', tokenHash).maybeSingle();
    if (error) throw new Error(`Unable to validate automation credential: ${error.message}`);
    if (!data) return undefined;
    const integration = this.fromIntegration(data as Record<string, unknown>);
    if (integration.revokedAt || Date.parse(integration.expiresAt) <= Date.now()) return undefined;
    const automation = await this.getAutomationForIntegration(integration);
    if (!automation) return undefined;
    await this.db().from('automation_integrations').update({ last_used_at: new Date().toISOString() })
      .eq('id', integration.id).is('revoked_at', null).then(() => undefined, () => undefined);
    return { integration, automation };
  }

  static async publishSignal(input: {
    userId: string;
    integrationId: string;
    eventId: string;
    eventType: string;
    symbol: string;
    timeframe: string;
    sourceId: string;
    runId: string;
    mode: string;
    barIndex: number;
    timestamp: number;
    payload: Record<string, unknown>;
    trustedProducer?: boolean;
  }): Promise<{ inserted: boolean; signal: AutomationSignalRecord; conflict: boolean }> {
    const integration = await this.getForOwner(input.userId, input.integrationId);
    if (!integration || integration.revokedAt || Date.parse(integration.expiresAt) <= Date.now()) {
      throw new Error('Active integration not found for this account.');
    }
    if (input.mode === 'realtime' && input.trustedProducer !== true) {
      throw new Error('Realtime trading signals must come from the server-authenticated CoreSpirit signal producer.');
    }
    if (!integration.allowedSymbols.includes(input.symbol)) throw new Error('Signal symbol is outside the integration allowlist.');
    const signalTimestamp = new Date(input.timestamp).toISOString();
    // Canonical event identity always wins over caller metadata; a payload may
    // enrich a signal but cannot overwrite the symbol, mode, timestamp or event ID.
    const storedPayload = {
      ...input.payload,
      eventId: input.eventId, eventType: input.eventType, symbol: input.symbol,
      timeframe: input.timeframe, sourceId: input.sourceId, runId: input.runId,
      mode: input.mode, barIndex: input.barIndex, timestamp: input.timestamp,
    };
    const payloadHash = canonicalSha256(storedPayload);
    const { data, error } = await this.db().from('automation_signal_events').insert({
      integration_id: integration.id,
      user_id: integration.userId,
      automation_id: integration.automationId,
      event_id: input.eventId,
      event_type: input.eventType,
      symbol: input.symbol,
      timeframe: input.timeframe,
      source_id: input.sourceId,
      run_id: input.runId,
      mode: input.mode,
      bar_index: input.barIndex,
      signal_timestamp: signalTimestamp,
      payload: storedPayload,
      payload_hash: payloadHash,
    }).select('*').maybeSingle();
    if (!error && data) return { inserted: true, signal: this.fromSignal(data as Record<string, unknown>), conflict: false };
    if (error?.code !== '23505') throw new Error(`Unable to persist CoreSpirit signal event: ${error?.message ?? 'unknown error'}`);
    const existing = await this.getSignal(integration.id, input.eventId);
    if (!existing) throw new Error('Duplicate signal event exists but could not be loaded.');
    return { inserted: false, signal: existing, conflict: existing.payloadHash !== payloadHash };
  }

  static async getSignal(integrationId: string, eventId: string): Promise<AutomationSignalRecord | undefined> {
    const { data, error } = await this.db().from('automation_signal_events')
      .select('*').eq('integration_id', integrationId).eq('event_id', eventId).maybeSingle();
    if (error) throw new Error(`Unable to load signal event: ${error.message}`);
    return data ? this.fromSignal(data as Record<string, unknown>) : undefined;
  }

  static async listSignals(integrationId: string, after: string | undefined, limit: number): Promise<AutomationSignalRecord[]> {
    let query = this.db().from('automation_signal_events').select('*').eq('integration_id', integrationId);
    if (after) {
      query = query.gt('created_at', after).order('created_at', { ascending: true });
    } else {
      // First poll starts with the most recent bounded window, not the oldest
      // rows from an integration's lifetime.
      query = query.order('created_at', { ascending: false });
    }
    const { data, error } = await query.limit(limit);
    if (error) throw new Error(`Unable to read signal event stream: ${error.message}`);
    const rows = (data ?? []).map(row => this.fromSignal(row as Record<string, unknown>));
    return after ? rows : rows.reverse();
  }

  static async getBrokerOrderState(userId: string, brokerOrderId: string): Promise<{
    status: string;
    filledQuantity: number | null;
    averagePrice: number | null;
    updatedAt: string;
  } | undefined> {
    const { data, error } = await this.db().from('broker_order_states')
      .select('status,filled_quantity,average_price,updated_at')
      .eq('user_id', userId).eq('broker_id', 'fyers').eq('broker_order_id', brokerOrderId)
      .maybeSingle();
    if (error) throw new Error(`Unable to load reconciled broker order state: ${error.message}`);
    if (!data) return undefined;
    return {
      status: String(data.status),
      filledQuantity: data.filled_quantity == null ? null : Number(data.filled_quantity),
      averagePrice: data.average_price == null ? null : Number(data.average_price),
      updatedAt: String(data.updated_at),
    };
  }

  static async claimOrderRequest(input: {
    integrationId: string;
    externalRequestId: string;
    requestHash: string;
    payload: Record<string, unknown>;
  }): Promise<{ claimed: boolean; conflict?: 'request_mismatch' | 'daily_limit'; record?: AutomationOrderRequestRecord }> {
    const { data, error } = await this.db().rpc('claim_automation_order_request', {
      p_integration_id: input.integrationId,
      p_external_request_id: input.externalRequestId,
      p_request_hash: input.requestHash,
      p_payload: input.payload,
    });
    if (error) throw new Error(`Unable to claim durable automation request: ${error.message}`);
    const result = data as Record<string, unknown> | null;
    if (!result) throw new Error('Automation request claim returned no durable result.');
    const rawRecord = result.record && typeof result.record === 'object' ? result.record as Record<string, unknown> : undefined;
    return {
      claimed: result.claimed === true,
      conflict: result.conflict === 'request_mismatch' || result.conflict === 'daily_limit' ? result.conflict : undefined,
      record: rawRecord ? this.fromRequest(rawRecord) : undefined,
    };
  }

  static async updateOrderRequest(
    integrationId: string,
    externalRequestId: string,
    update: {
      state: AutomationRequestState;
      response: Record<string, unknown>;
      clientOrderId?: string | null;
      brokerOrderId?: string | null;
      signalId?: string | null;
      estimatedNotional?: number | null;
      riskChecks?: Record<string, unknown>[];
    },
  ): Promise<AutomationOrderRequestRecord> {
    const payload: Record<string, unknown> = {
      state: update.state,
      response: update.response,
      updated_at: new Date().toISOString(),
    };
    if (update.clientOrderId !== undefined) payload.client_order_id = update.clientOrderId;
    if (update.brokerOrderId !== undefined) payload.broker_order_id = update.brokerOrderId;
    if (update.signalId !== undefined) payload.signal_id = update.signalId;
    if (update.estimatedNotional !== undefined) payload.estimated_notional = update.estimatedNotional;
    if (update.riskChecks !== undefined) payload.risk_checks = update.riskChecks;
    const { data, error } = await this.db().from('automation_order_requests').update(payload)
      .eq('integration_id', integrationId).eq('external_request_id', externalRequestId).select('*').maybeSingle();
    if (error || !data) throw new Error(`Unable to persist automation order state: ${error?.message ?? 'request disappeared'}`);
    return this.fromRequest(data as Record<string, unknown>);
  }

  static async getOrderRequest(integrationId: string, externalRequestId: string): Promise<AutomationOrderRequestRecord | undefined> {
    const { data, error } = await this.db().from('automation_order_requests').select('*')
      .eq('integration_id', integrationId).eq('external_request_id', externalRequestId).maybeSingle();
    if (error) throw new Error(`Unable to load automation order request: ${error.message}`);
    return data ? this.fromRequest(data as Record<string, unknown>) : undefined;
  }
}
