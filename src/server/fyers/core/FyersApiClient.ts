import { withBrokerRequestGate } from '../../brokers/BrokerRequestGate.js';

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
    const timer = setTimeout(resolve, ms);
    const abort = () => { clearTimeout(timer); reject(Object.assign(new Error('FYERS request aborted'), { name: 'AbortError' })); };
    signal?.addEventListener('abort', abort, { once: true });
  });
}

export class FyersApiClient {
  constructor(private readonly accessToken: string, private readonly appId = process.env.FYERS_CLIENT_ID || '') {}

  async dataGet<T = any>(path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal): Promise<T> {
    return this.request<T>(DATA_BASE, path, params, signal);
  }

  async apiGet<T = any>(path: string, params: Record<string, string | number | undefined> = {}, signal?: AbortSignal): Promise<T> {
    return this.request<T>(API_BASE, path, params, signal, 'GET');
  }

  async apiPost<T = any>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return this.request<T>(API_BASE, path, {}, signal, 'POST', body);
  }

  private async request<T>(base: string, path: string, params: Record<string, string | number | undefined>, signal?: AbortSignal, method = 'GET', body?: unknown): Promise<T> {
    const execute = async (gateSignal?: AbortSignal): Promise<T> => {
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') query.set(key, String(value));
      const url = `${base}${path}${query.toString() ? `?${query.toString()}` : ''}`;
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        if (gateSignal?.aborted) throw Object.assign(new Error('FYERS request aborted'), { name: 'AbortError' });
        try {
          const response = await fetch(url, {
            method,
            signal: gateSignal,
            headers: { Accept: 'application/json', 'Content-Type': 'application/json', Authorization: `${this.appId}:${this.accessToken}` },
            body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
          });
          const text = await response.text();
          let payload: any = null;
          try { payload = text ? JSON.parse(text) : null; } catch {
            throw new FyersApiError(`FYERS returned non-JSON (${response.status})`, response.status);
          }
          const brokerCode = Number(payload?.code);
          const errorState = !response.ok || String(payload?.s || '').toLowerCase() === 'error';
          if (!errorState) return payload as T;
          const status = response.status === 429 || brokerCode === 429 ? 429 : response.status;
          const err = new FyersApiError(payload?.message || `FYERS request failed (${status})`, status, Number.isFinite(brokerCode) ? brokerCode : undefined, retryDelay(response), payload);
          lastError = err;
          if (!isRetryableStatus(status) || attempt === 2) throw err;
          const delay = Math.min(15000, Math.max(err.retryAfterMs || 0, 500 * 2 ** attempt));
          await sleep(delay, gateSignal);
        } catch (error: any) {
          if (error?.name === 'AbortError') throw error;
          lastError = error;
          const status = Number(error?.status || 0);
          if ((!isRetryableStatus(status)) || attempt === 2) throw error;
          await sleep(Math.min(15000, Math.max(Number(error?.retryAfterMs || 0), 500 * 2 ** attempt)), gateSignal);
        }
      }
      throw lastError || new Error('FYERS request failed');
    };

    // Every FYERS REST call shares the authenticated-user scheduler. This keeps
    // history, quotes, option chain, depth and account calls from independently
    // consuming the same broker quota.
    return withBrokerRequestGate('fyers', this.accessToken, execute, signal);
  }
}
