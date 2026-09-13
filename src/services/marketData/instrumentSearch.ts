import { tradingApi } from '../http/tradingApi';

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

export async function searchUpstoxInstruments(q: string, segment: InstrumentSearchSegment = 'all', limit = 30): Promise<SearchInstrument[]> {
  return searchBrokerInstruments('upstox', q, segment, Math.min(limit, 30));
}

export async function searchBrokerInstruments(brokerId: string, q: string, segment: InstrumentSearchSegment = 'all', limit = 60): Promise<SearchInstrument[]> {
  const response = await tradingApi(`/api/trading/${encodeURIComponent(brokerId)}/instruments/search?q=${encodeURIComponent(q)}&segment=${encodeURIComponent(segment)}&limit=${Math.min(Math.max(limit, 1), 100)}`);
  const payload = await response.json();
  if (!response.ok || !payload?.success) throw new Error(payload?.error || `Instrument search failed (${response.status})`);
  return Array.isArray(payload.data) ? payload.data : [];
}
