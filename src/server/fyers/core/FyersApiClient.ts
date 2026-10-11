import { withBrokerRequestGate } from '../../brokers/BrokerRequestGate.js';
import { DEFAULT_FYERS_CAPABILITIES, type FyersCapabilities } from './FyersCapabilities.js';
import { API_LATENCY_BUDGET_MS, timeoutSignal } from '../../latency/budgets.js';

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
  if (ms > 0) return ms;
  const seconds = Number(response.headers.get('retry-after') || 0);
  return seconds > 0 ? seconds * 1000 : undefined;
}

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
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
    timer = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class FyersApiClient {
  constructor(
    private readonly accessToken: string,
    private readonly appId = process.env.FYERS_CLIENT_ID || '',
    private readonly capabilities: FyersCapabilities = DEFAULT_FYERS_CAPABILITIES,
  ) {}

  async dataGet<T = unknown>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal, timeoutMs: number = API_LATENCY_BUDGET_MS.quote): Promise<T> {
    return this.request<T>(DATA_BASE, path, params, signal, 'GET', undefined, timeoutMs, 'data');
  }

  async apiGet<T = unknown>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal, timeoutMs: number = API_LATENCY_BUDGET_MS.account): Promise<T> {
    return this.request<T>(API_BASE, path, params, signal, 'GET', undefined, timeoutMs);
  }

  async apiPost<T = unknown>(path: string, body: unknown, signal?: AbortSignal, timeoutMs: number = API_LATENCY_BUDGET_MS.order): Promise<T> {
    return this.request<T>(API_BASE, path, {}, signal, 'POST', body, timeoutMs);
  }

private async request<T>(base: string, path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal, method = 'GET', body?: unknown, timeoutMs: number = API_LATENCY_BUDGET_MS.quote, budget: 'data' | 'general' = 'general'): Promise<T> {
    const deadlineSignal = timeoutSignal(timeoutMs, signal);
    const execute = async (): Promise<T> => {
      const requestSignal = deadlineSignal;
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
      const url = `${base}${path}${query.toString() ? `?${query.toString()}` : ''}`;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (requestSignal.aborted) throw Object.assign(new Error('FYERS request aborted'), { name: 'AbortError' });
        try {
          // Admit each actual HTTP attempt, not just the logical operation.
          // Otherwise one operation's automatic retries could bypass per-minute
          // or per-day quotas during broker errors/rate-limit responses.
          const response = await this.withRequestBudget(
            budget,
            (requestSignal) => fetch(url, {
              method,
              signal: requestSignal || deadlineSignal,
              headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `${this.appId}:${this.accessToken}` },
              body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
            }),
            deadlineSignal,
          );
          const text = await response.text();
          let payload: unknown = null;
          try { payload = text ? JSON.parse(text) : null; } catch {
            throw new FyersApiError(`FYERS returned non-JSON (${response.status})`, response.status);
          }
          const payloadRecord = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
          const brokerCode = Number(payloadRecord.code);
          const errorState = !response.ok || String(payloadRecord.s || '').toLowerCase() === 'error';
          if (!errorState) return payload as T;
          const status = response.status === 429 || brokerCode === 429 ? 429 : response.status;
          const err = new FyersApiError(typeof payloadRecord.message === 'string' ? payloadRecord.message : `FYERS request failed (${status})`, status, Number.isFinite(brokerCode) ? brokerCode : undefined, retryDelay(response), payload);
          lastError = err;
          if (!isRetryableStatus(status) || attempt === 2) throw err;
          const delay = Math.min(15000, Math.max(err.retryAfterMs || 0, 500 * 2 ** attempt));
          await sleep(delay, requestSignal);
        } catch (error: unknown) {
          if (error instanceof Error && error.name === 'AbortError') throw error;
          const errorRecord = error && typeof error === 'object' ? error as Record<string, unknown> : {};
          // Rate-gate denials and fail-closed coordination errors are local
          // admission decisions, not provider failures. Retrying them would
          // burn more quota and cannot make the denied request eligible.
          if (typeof errorRecord.code === 'string' && errorRecord.code.startsWith('BROKER_')) throw error;
          lastError = error;
          const status = Number(errorRecord.status || 0);
          if ((!isRetryableStatus(status)) || attempt === 2) throw error;
          await sleep(Math.min(15000, Math.max(Number(errorRecord.retryAfterMs || 0), 500 * 2 ** attempt)), requestSignal);
        }
      }
      throw lastError || new Error('FYERS request failed');
    };

    return execute();
  }

  private withRequestBudget<T>(
    budget: 'data' | 'general',
    task: (signal?: AbortSignal) => Promise<T>,
    signal: AbortSignal,
  ): Promise<T> {
    if (budget === 'data') {
      const limits = this.capabilities.dataApiRateLimits;
      return withBrokerRequestGate('fyers', this.accessToken, task, signal, {
        budgetKey: 'data',
        minIntervalMs: Math.ceil(1000 / limits.requestsPerSecond),
        maxPerMinute: limits.requestsPerMinute,
        maxPerDay: limits.requestsPerDay,
      });
    }
    return withBrokerRequestGate('fyers', this.accessToken, task, signal);
  }
}
