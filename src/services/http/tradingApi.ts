import { getSupabaseClient } from '../auth/supabaseClient';
import type { Session as SupabaseSession } from '@supabase/supabase-js';
import type { CoreSpiritResearchDataSet, CoreSpiritResearchDatasetQuery } from '../coreSpirit/researchApiContract';

let cachedSession: SupabaseSession | null | undefined;
let refreshPromise: Promise<SupabaseSession | null> | undefined;

function ensureSessionListener() {
  const supabase = getSupabaseClient();
  if (cachedSession !== undefined) return;
  cachedSession = null;
  supabase.auth.onAuthStateChange((_event, session) => { cachedSession = session; });
}

async function getFastSession(): Promise<SupabaseSession | null> {
  ensureSessionListener();
  const supabase = getSupabaseClient();
  if (cachedSession && (!cachedSession.expires_at || cachedSession.expires_at * 1000 > Date.now() + 30_000)) return cachedSession;
  if (!refreshPromise) {
    refreshPromise = supabase.auth.getSession().then(({ data }) => data.session).then(async (session) => {
      if (session && (!session.expires_at || session.expires_at * 1000 > Date.now() + 30_000)) { cachedSession = session; return session; }
      const refreshed = await supabase.auth.refreshSession();
      if (refreshed.error) throw refreshed.error;
      cachedSession = refreshed.data.session;
      return cachedSession;
    }).finally(() => { refreshPromise = undefined; });
  }
  return refreshPromise;
}

/** Authenticated API helper. Reuses the in-memory session and refreshes only when necessary. */
export async function tradingApi(path: string, options: RequestInit = {}): Promise<Response> {
  const session = await getFastSession();
  if (!session?.access_token) throw new Error('Your TradingCore login session expired. Please sign in again.');
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return fetch(path, { ...options, headers, credentials: 'same-origin', cache: options.cache ?? 'no-store' });
}


/** Parse TradingCore API responses without ever trying to JSON.parse an HTML/Vercel fallback page. */
export async function readTradingApiJson<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: any = null;
  try { payload = text ? JSON.parse(text) : null; }
  catch {
    const contentType = response.headers.get('content-type') || '';
    const preview = text.replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(`TradingCore API returned a non-JSON response (${response.status}${contentType ? `, ${contentType}` : ''}): ${preview || 'empty response'}`);
  }
  return payload as T;
}


// Host-side adapter for CoreSpirit research. CoreSpirit owns only the data
// contract; authenticated HTTP and provider access remain outside the runtime.
type CanonicalHistoryColumns = {
  time: number[];
  open: number[];
  high: number[];
  low: number[];
  close: number[];
  volume: number[];
  exchangeTime?: number[];
  ingestedAt?: number[];
  availableAt?: number[];
  revision?: number[];
};

type CanonicalHistoryResponse = {
  success: boolean;
  symbol?: string;
  timeframe?: string;
  data?: CanonicalHistoryColumns;
  error?: string;
};

function boundedHistoryLimit(value: number | undefined): number {
  const requested = Number(value);
  return Number.isFinite(requested) ? Math.max(1, Math.min(5000, Math.floor(requested))) : 5000;
}

function alignedNumericColumn(name: string, values: unknown, length: number): number[] | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length !== length) {
    throw new Error(`CoreSpirit research history returned a misaligned ${name} column.`);
  }
  return values.map(value => {
    const number = Number(value);
    return Number.isFinite(number) ? number : Number.NaN;
  });
}

/**
 * Loads chart-independent research history through the authenticated server
 * route. The server owns provider choice, broker credentials and source
 * validation; this adapter never calls providers or sends chart-owned arrays.
 */
export async function fetchCoreSpiritResearchHistory(
  query: CoreSpiritResearchDatasetQuery,
): Promise<CoreSpiritResearchDataSet> {
  const symbol = String(query?.symbol || '').trim();
  const timeframe = String(query?.timeframe || '').trim();
  if (!symbol || !timeframe) throw new Error('A symbol and timeframe are required for CoreSpirit research history.');

  const params = new URLSearchParams({
    symbol,
    timeframe,
    limit: String(boundedHistoryLimit(query.limit)),
    format: 'columns',
  });
  if (typeof query.end === 'number' && Number.isFinite(query.end) && query.end > 0) {
    params.set('before', String(query.end));
  }

  const response = await tradingApi(`/api/corespirit/research/history?${params.toString()}`);
  const payload = await readTradingApiJson<CanonicalHistoryResponse>(response);
  if (!response.ok || payload?.success !== true) {
    throw new Error(payload?.error || `CoreSpirit research history unavailable (${response.status}).`);
  }

  const data = payload.data;
  if (!data || !Array.isArray(data.time)) {
    throw new Error('CoreSpirit research history returned an invalid columnar dataset.');
  }
  const length = data.time.length;
  const timestamps = data.time.map(value => Number(value));
  const required = {
    open: alignedNumericColumn('open', data.open, length),
    high: alignedNumericColumn('high', data.high, length),
    low: alignedNumericColumn('low', data.low, length),
    close: alignedNumericColumn('close', data.close, length),
    volume: alignedNumericColumn('volume', data.volume, length),
  };
  if (Object.values(required).some(column => !column)) {
    throw new Error('CoreSpirit research history is missing a required OHLCV column.');
  }
  const optional = {
    exchangeTime: alignedNumericColumn('exchangeTime', data.exchangeTime, length),
    ingestedAt: alignedNumericColumn('ingestedAt', data.ingestedAt, length),
    availableAt: alignedNumericColumn('availableAt', data.availableAt, length),
    revision: alignedNumericColumn('revision', data.revision, length),
  };

  const start = typeof query.start === 'number' && Number.isFinite(query.start) && query.start > 0
    ? (query.start < 1e12 ? query.start * 1000 : query.start)
    : Number.NEGATIVE_INFINITY;
  const end = typeof query.end === 'number' && Number.isFinite(query.end) && query.end > 0
    ? (query.end < 1e12 ? query.end * 1000 : query.end)
    : Number.POSITIVE_INFINITY;
  const indexes = timestamps.map((timestamp, index) => ({ timestamp, index }))
    .filter(item => Number.isFinite(item.timestamp) && item.timestamp >= start && item.timestamp <= end);
  const project = (values: number[] | undefined) => values
    ? indexes.map(item => values[item.index])
    : undefined;
  const selectedTimestamps = indexes.map(item => item.timestamp);
  const columns: Record<string, readonly number[]> = {
    open: project(required.open)!,
    high: project(required.high)!,
    low: project(required.low)!,
    close: project(required.close)!,
    volume: project(required.volume)!,
    ...(optional.exchangeTime ? { exchangeTime: project(optional.exchangeTime)! } : {}),
    ...(optional.ingestedAt ? { ingestedAt: project(optional.ingestedAt)! } : {}),
    ...(optional.availableAt ? { availableAt: project(optional.availableAt)! } : {}),
    ...(optional.revision ? { revision: project(optional.revision)! } : {}),
  };
  const first = selectedTimestamps[0] ?? 'empty';
  const last = selectedTimestamps[selectedTimestamps.length - 1] ?? 'empty';
  return {
    datasetId: `canonical-history:${symbol}:${timeframe}:${first}:${last}:${selectedTimestamps.length}`,
    symbol: payload.symbol || symbol,
    timeframe: payload.timeframe || timeframe,
    timestamps: selectedTimestamps,
    columns,
  };
}
