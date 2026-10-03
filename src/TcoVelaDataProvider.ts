import type { DataProvider, ProviderInfo, SymbolDescriptor } from '../vendor/vela/src/core/ports/DataProvider';
import type { BarRange } from '../vendor/vela/src/core/ports/MarketDataFeed';
import type { OHLCV } from '../vendor/vela/src/core/model/ohlcv';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import type { MarketFeedEvent, NormalizedMarketTick } from './types/market';

const SYMBOLS: readonly SymbolDescriptor[] = [
  { ticker: 'NIFTY50-INDEX', prefix: 'NSE', description: 'NIFTY 50', type: 'index' },
  { ticker: 'NIFTYBANK-INDEX', prefix: 'NSE', description: 'NIFTY BANK', type: 'index' },
];

function runtimeSymbol(ticker: string): string {
  const value = String(ticker || '').trim();
  if (!value) return 'NSE:NIFTY50-INDEX';
  return value.includes(':') ? value : `NSE:${value}`;
}

function epoch(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function asBar(row: { timestamp?: string | number; open: number; high: number; low: number; close: number; volume?: number }): OHLCV {
  return {
    time: epoch(row.timestamp),
    open: Number(row.open),
    high: Number(row.high),
    low: Number(row.low),
    close: Number(row.close),
    volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : undefined,
  };
}

function dedupe(rows: OHLCV[]): OHLCV[] {
  const byTime = new Map<number, OHLCV>();
  for (const row of rows) {
    if (![row.time, row.open, row.high, row.low, row.close].every(Number.isFinite)) continue;
    byTime.set(Number(row.time), row);
  }
  return [...byTime.values()].sort((a, b) => Number(a.time) - Number(b.time));
}

function timeframeMs(timeframe: string): number {
  const match = String(timeframe).trim().match(/^(\d+)([smhdw]?)$/i);
  if (!match) return 5 * 60_000;
  const n = Math.max(1, Number(match[1]));
  switch (String(match[2]).toLowerCase()) {
    case 's': return n * 1000;
    case 'h': return n * 60 * 60_000;
    case 'd': return n * 24 * 60 * 60_000;
    case 'w': return n * 7 * 24 * 60 * 60_000;
    default: return n * 60_000;
  }
}

function tickToBar(tick: NormalizedMarketTick, previous: OHLCV | undefined, timeframe: string): OHLCV | undefined {
  const price = Number(tick.ltp ?? tick.close ?? tick.ohlc?.at(-1)?.close);
  if (!Number.isFinite(price)) return undefined;
  const stamp = epoch(tick.lastTradeTimestamp ?? tick.receivedAt);
  const interval = timeframeMs(timeframe);
  const bucket = Math.floor(stamp / interval) * interval;
  if (!previous || Number(previous.time) < bucket) {
    return {
      time: bucket,
      open: Number.isFinite(Number(tick.open)) ? Number(tick.open) : price,
      high: Math.max(Number.isFinite(Number(tick.high)) ? Number(tick.high) : price, price),
      low: Math.min(Number.isFinite(Number(tick.low)) ? Number(tick.low) : price, price),
      close: price,
      volume: Number.isFinite(Number(tick.volume)) ? Number(tick.volume) : undefined,
    };
  }
  const time = Number(previous.time);
  return {
    time,
    open: Number.isFinite(Number(previous.open)) ? Number(previous.open) : price,
    high: Math.max(Number(previous.high), price),
    low: Math.min(Number(previous.low), price),
    close: price,
    volume: Number.isFinite(Number(tick.volume)) ? Number(tick.volume) : previous.volume,
  };
}

export class TcoVelaDataProvider implements DataProvider {
  info(): ProviderInfo {
    return {
      name: 'tco',
      displayName: 'TradingCoreOS',
      supportedTimeframes: ['1', '3', '5', '10', '15'],
      capabilities: { enumerate: true, stream: true, symbolInfo: true },
    };
  }

  listSymbols(): Promise<SymbolDescriptor[]> {
    return Promise.resolve(SYMBOLS.map(symbol => ({ ...symbol })));
  }

  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
    const symbol = runtimeSymbol(ticker);
    const limit = Math.max(100, Math.min(10000, Math.floor(Number(range.limit) || 1000)));
    const rows = await tradingCoreRuntime.getHistoricalData(symbol, timeframe, undefined, limit);
    let bars = dedupe((rows || []).map(row => asBar(row)));
    if (range.from != null) bars = bars.filter(bar => Number(bar.time) >= Number(range.from));
    if (range.to != null) bars = bars.filter(bar => Number(bar.time) <= Number(range.to));
    return bars.slice(-limit);
  }

  async getBarsProgressive(ticker: string, timeframe: string, range: BarRange, onBatch: (bars: OHLCV[]) => void, opts?: { signal?: AbortSignal }): Promise<OHLCV[]> {
    if (opts?.signal?.aborted) return [];
    const bars = await this.getBars(ticker, timeframe, range);
    if (!opts?.signal?.aborted && bars.length) onBatch(bars);
    return bars;
  }

  getSymbolInfo(ticker: string) {
    return Promise.resolve({ ticker: runtimeSymbol(ticker), exchange: 'NSE', type: 'index' });
  }

  subscribe(ticker: string, timeframe: string, onBar: (bar: OHLCV) => void): () => void {
    const symbol = runtimeSymbol(ticker);
    let previous: OHLCV | undefined;
    const onEvent = (event: MarketFeedEvent) => {
      if (event.type !== 'tick' || !event.tick || String(event.tick.instrumentKey) !== symbol) return;
      const next = tickToBar(event.tick, previous, timeframe);
      if (!next) return;
      previous = next;
      onBar(next);
    };
    return tradingCoreRuntime.subscribeMarketData([symbol], onEvent);
  }
}

export function createTcoVelaDataProvider(): TcoVelaDataProvider {
  return new TcoVelaDataProvider();
}
