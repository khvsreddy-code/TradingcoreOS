import { tradingApi } from '../http/tradingApi';

const SEARCH_CACHE_TTL_MS = 10_000;
const searchCache = new Map<string, { expiresAt: number; data: SearchInstrument[] }>();
const searchInFlight = new Map<string, Promise<SearchInstrument[]>>();

export type InstrumentSearchSegment = 'all' | 'stocks' | 'futures' | 'options' | 'commodities' | 'currency';

export interface SearchInstrument {
  key: string;
  label: string;
  symbol: string;
  description?: string;
  exchange?: string;
  type?: string;
  isin?: string;
  expiry?: string;
  strike?: number;
  optionType?: string;
  lotSize?: number;
}

export async function searchFyersInstruments(q: string, segment: InstrumentSearchSegment = 'all', limit = 60): Promise<SearchInstrument[]> {
  return searchBrokerInstruments('fyers', q, segment, limit);
}

export async function searchBrokerInstruments(brokerId: string, q: string, segment: InstrumentSearchSegment = 'all', limit = 60): Promise<SearchInstrument[]> {
  const normalizedQuery = q.trim();
  if (normalizedQuery.length < 2) return [];
  const boundedLimit = Math.min(Math.max(limit, 1), 100);
  const key = `${brokerId.toLowerCase()}:${segment}:${normalizedQuery.toLowerCase()}:${boundedLimit}`;
  const cached = searchCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const existing = searchInFlight.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const response = await tradingApi(`/api/trading/${encodeURIComponent(brokerId)}/instruments/search?q=${encodeURIComponent(normalizedQuery)}&segment=${encodeURIComponent(segment)}&limit=${boundedLimit}`);
    const payload = await response.json();
    if (!response.ok || !payload?.success) throw new Error(payload?.error || `Instrument search failed (${response.status})`);
    const data = Array.isArray(payload.data) ? payload.data : [];
    searchCache.set(key, { expiresAt: Date.now() + SEARCH_CACHE_TTL_MS, data });
    return data;
  })().finally(() => searchInFlight.delete(key));

  searchInFlight.set(key, promise);
  return promise;
}
