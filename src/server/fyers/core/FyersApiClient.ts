import { withBrokerRequestGate } from '../../brokers/BrokerRequestGate.js';
import {
  DEFAULT_FYERS_CAPABILITIES,
  resolveFyersAdmissionBudget,
  toFyersAdmissionPriority,
  type FyersApiCategory,
  type FyersCapabilities,
  type FyersRequestPriority,
} from './FyersCapabilities.js';
import { recordFyersQuotaAttempt, recordFyersQuotaDenial, recordFyersQuotaResponse } from './FyersQuotaTelemetry.js';
import { API_LATENCY_BUDGET_MS, timeoutSignal } from '../../latency/budgets.js';
import { clampFyersHistoryRange, FyersHistoryWindowError } from './FyersHistoryWindow.js';

export class FyersApiError extends Error {
  status: number;
  brokerCode?: number;
  retryAfterMs?: number;
  payload?: unknown;
  constructor(message: string, status: number, brokerCode?: number, retryAfterMs?: number, payload?: unknown) {
    super(message);
    this.name = 'FyersApiError';
    this.status = status;
    this.brokerCode = brokerCode;
    this.retryAfterMs = retryAfterMs;
    this.payload = payload;
  }
}
const DATA_BASE = 'https://api-t1.fyers.in/data';
const API_BASE = 'https://api-t1.fyers.in/api/v3';

function retryDelay(response: Response): number | undefined {
  const ms = Number(response.headers.get('x-retry-after-ms') || 0);
  if (Number.isFinite(ms) && ms > 0) return ms;
  const header = String(response.headers.get('retry-after') || '').trim();
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
function isRetryableStatus(status: number): boolean { return status === 429 || status >= 500; }
function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof TypeError)) return false;
  const detail = error as TypeError & { cause?: unknown };
  const cause = detail.cause && typeof detail.cause === 'object'
    ? detail.cause as { code?: unknown; message?: unknown }
    : undefined;
  const diagnostic = `${detail.message || ''} ${String(cause?.code || '')} ${String(cause?.message || '')}`;
  // Retry only fetch/network transport failures. Abort and broker-gate errors are
  // handled before this predicate; programmer/input errors are never retried.
  return /fetch failed|failed to fetch|network|socket|econnreset|etimedout|eai_again|ehostunreach|und_err/i.test(diagnostic);
}
function backoff(attempt: number, retryAfterMs?: number): number {
  const exponential = Math.min(15_000, 500 * 2 ** attempt);
  const jitter = Math.floor(Math.random() * Math.max(1, exponential * 0.25));
  return Math.max(Number(retryAfterMs) || 0, exponential + jitter);
}
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(Object.assign(new Error('FYERS request aborted'), { name: 'AbortError' }));
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => {
      if (timer) clearTimeout(timer);
      cleanup();
      reject(Object.assign(new Error('FYERS request aborted'), { name: 'AbortError' }));
    };
    timer = setTimeout(() => { cleanup(); resolve(); }, ms);
    if (signal?.aborted) { abort(); return; }
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export type FyersApiRequestOptions = Readonly<{
  method?: string;
  params?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
  timeoutMs?: number;
  category?: FyersApiCategory;
  priority?: FyersRequestPriority;
}>;

export class FyersApiClient {
  private readonly rateLimitIdentity: string;

  constructor(
    private readonly accessToken: string,
    private readonly appId = process.env.FYERS_CLIENT_ID || '',
    private readonly capabilities: FyersCapabilities = DEFAULT_FYERS_CAPABILITIES,
    rateLimitIdentity?: string,
  ) {
    const identity = String(rateLimitIdentity || '').trim();
    if (!identity) {
      throw Object.assign(new Error('Stable FYERS account or application identity is required for quota enforcement.'), {
        status: 503,
        code: 'BROKER_IDENTITY_REQUIRED',
      });
    }
    // Never key quota admission by the rotating access token.
    this.rateLimitIdentity = identity;
  }

  /** Internal cache partition only; never serialize this identity to clients. */
  get quotaIdentity(): string {
    return this.rateLimitIdentity;
  }

  dataGet<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal,
    timeoutMs: number = API_LATENCY_BUDGET_MS.quote,
    priority: FyersRequestPriority = 'medium',
  ): Promise<T> {
    return this.request<T>(DATA_BASE, path, params, signal, 'GET', undefined, timeoutMs, 'data', priority);
  }

  apiGet<T = unknown>(
    path: string,
    params: Record<string, string | number | undefined> = {},
    signal?: AbortSignal,
    timeoutMs: number = API_LATENCY_BUDGET_MS.account,
    priority: FyersRequestPriority = 'high',
  ): Promise<T> {
    return this.request<T>(API_BASE, path, params, signal, 'GET', undefined, timeoutMs, 'user-info', priority);
  }

  apiPost<T = unknown>(
    path: string,
    body: unknown,
    signal?: AbortSignal,
    timeoutMs: number = API_LATENCY_BUDGET_MS.order,
    category: FyersApiCategory = 'transactions',
    priority: FyersRequestPriority = 'critical',
  ): Promise<T> {
    return this.request<T>(API_BASE, path, {}, signal, 'POST', body, timeoutMs, category, priority);
  }

  /** Shared quota-aware API v3 boundary for legacy adapter verbs and account calls. */
  apiRequest<T = unknown>(path: string, options: FyersApiRequestOptions = {}): Promise<T> {
    const method = String(options.method || 'GET').toUpperCase();
    const category = options.category || (method === 'GET' ? 'user-info' : 'transactions');
    const priority = options.priority || (category === 'transactions' ? 'critical' : 'high');
    const timeoutMs = options.timeoutMs ?? (category === 'transactions' ? API_LATENCY_BUDGET_MS.order : API_LATENCY_BUDGET_MS.account);
    return this.request<T>(API_BASE, path, options.params || {}, options.signal, method, options.body, timeoutMs, category, priority);
  }

  private request<T>(
    base: string,
    path: string,
    params: Record<string, string | number | undefined>,
    signal: AbortSignal | undefined,
    method: string,
    body: unknown,
    timeoutMs: number,
    category: FyersApiCategory,
    priority: FyersRequestPriority,
  ): Promise<T> {
    const deadlineSignal = timeoutSignal(timeoutMs, signal);
    const execute = async (): Promise<T> => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
      const qIndex = path.indexOf('?');
      const pathOnly = qIndex >= 0 ? path.slice(0, qIndex) : path;
      const existing = qIndex >= 0 ? path.slice(qIndex + 1) : '';
      const combined = new URLSearchParams(existing);
      query.forEach((value, key) => combined.set(key, value));

      // Central boundary: clamp every FYERS endpoint whose path identifies a
      // historical request (including expired F&O history) before quota admission.
      // This prevents alternate history routes from bypassing the seven-day policy.
      const isHistoricalEndpoint = pathOnly.toLowerCase().includes('history');
      if ((base === DATA_BASE || base === API_BASE) && isHistoricalEndpoint
        && combined.has('range_from') && combined.has('range_to')) {
        const bounded = clampFyersHistoryRange(combined.get('range_from'), combined.get('range_to'));
        if (!bounded) throw new FyersHistoryWindowError('This FYERS history page is older than the permitted seven-day window; use the configured historical backfill source.');
        combined.set('range_from', String(Math.floor(bounded.fromMs / 1000)));
        combined.set('range_to', String(Math.floor(bounded.toMs / 1000)));
        combined.set('date_format', '0');
      }
      const url = `${base}${pathOnly}${combined.toString() ? `?${combined.toString()}` : ''}`;
      let lastError: unknown;
      // Never auto-retry a side-effecting transaction: its outcome may be ambiguous.
      const retrySafe = method === 'GET' || category === 'data' || (category === 'user-info' && method === 'POST');
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (deadlineSignal.aborted) throw Object.assign(new Error('FYERS request aborted'), { name: 'AbortError' });
        try {
          const response = await this.withRequestBudget(category, priority, async (gateSignal) => {
            recordFyersQuotaAttempt(category, this.capabilities.plan, pathOnly);
            try {
              const upstream = await fetch(url, {
                method,
                signal: gateSignal || deadlineSignal,
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                  Authorization: `${this.appId}:${this.accessToken}`,
                },
                body: method === 'GET' || method === 'HEAD' ? undefined : (typeof body === 'string' ? body : JSON.stringify(body ?? {})),
              });
              recordFyersQuotaResponse(category, this.capabilities.plan, pathOnly, upstream.status);
              return upstream;
            } catch (error) {
              recordFyersQuotaResponse(category, this.capabilities.plan, pathOnly, 0);
              throw error;
            }
          }, deadlineSignal);
          const text = await response.text();
          let payload: unknown = null;
          try { payload = text ? JSON.parse(text) : null; }
          catch { throw new FyersApiError(`FYERS returned non-JSON (${response.status})`, response.status); }
          const record = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
          const brokerCode = Number(record.code);
          const failed = !response.ok || String(record.s || '').toLowerCase() === 'error' || (Number.isFinite(brokerCode) && brokerCode < 0);
          if (!failed) return payload as T;
          const status = response.status === 429 || brokerCode === 429 ? 429 : response.status;
          const error = new FyersApiError(
            typeof record.message === 'string' ? record.message : `FYERS request failed (${status})`,
            status,
            Number.isFinite(brokerCode) ? brokerCode : undefined,
            retryDelay(response),
            payload,
          );
          lastError = error;
          if (!retrySafe || !isRetryableStatus(status) || attempt === 2) throw error;
          await sleep(backoff(attempt, error.retryAfterMs), deadlineSignal);
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') throw error;
          const detail = error && typeof error === 'object' ? error as Record<string, unknown> : {};
          // Admission failures are local decisions, never retryable provider failures.
          if (typeof detail.code === 'string' && detail.code.startsWith('BROKER_')) {
            recordFyersQuotaDenial(category, this.capabilities.plan, pathOnly, Number(detail.status) === 503 ? 503 : 429);
            throw error;
          }
          lastError = error;
          const retryableStatus = isRetryableStatus(Number(detail.status || 0));
          const retryableNetworkError = isRetryableNetworkError(error);
          if (!retrySafe || (!retryableStatus && !retryableNetworkError) || attempt === 2) throw error;
          await sleep(backoff(attempt, Number(detail.retryAfterMs) || undefined), deadlineSignal);
        }
      }
      throw lastError || new Error('FYERS request failed');
    };
    return execute();
  }

  private withRequestBudget<T>(
    category: FyersApiCategory,
    priority: FyersRequestPriority,
    task: (signal?: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ) {
    const budget = resolveFyersAdmissionBudget(this.capabilities, category);
    // FYERS publishes one Data API quota and one combined Transaction/User Info
    // quota. Keep category-level telemetry, but share the admission pool for
    // account reads and transaction calls so they cannot each consume the full
    // documented account/API ceiling independently.
    const budgetKey = category === 'data' ? 'data' : 'account';
    const primaryAdmission = {
      budgetKey,
      minIntervalMs: Math.ceil(1000 / budget.requestsPerSecond),
      maxPerMinute: budget.requestsPerMinute,
      maxPerDay: budget.requestsPerDay,
      priority: toFyersAdmissionPriority(priority),
    } as const;
    if (priority !== 'lowest') {
      return withBrokerRequestGate('fyers', this.rateLimitIdentity, task, signal, primaryAdmission);
    }

    // Historical/backfill work consumes both the shared background reserve and
    // a smaller nested reserve. This makes "lowest" pause before watchlist work
    // while keeping both counters atomic and account-scoped across app users.
    const lowestReserve = {
      budgetKey: `${budgetKey}:lowest`,
      minIntervalMs: 0,
      maxPerMinute: Math.max(1, Math.floor(budget.requestsPerMinute * 0.1)),
      maxPerDay: Math.max(1, Math.floor(budget.requestsPerDay * 0.1)),
      priority: 'background' as const,
    };
    return withBrokerRequestGate(
      'fyers',
      this.rateLimitIdentity,
      admissionSignal => withBrokerRequestGate('fyers', this.rateLimitIdentity, task, admissionSignal, lowestReserve),
      signal,
      primaryAdmission,
    );
  }
}
