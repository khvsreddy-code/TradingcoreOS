import type { DataProvider, ProviderInfo, SymbolDescriptor, BarRange, OHLCV } from './services/core/chart/velaChartFacade';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import type { MarketFeedEvent, NormalizedMarketTick } from './types/market';

const SYMBOLS: readonly SymbolDescriptor[] = [
  { ticker: 'NIFTY50-INDEX', prefix: 'NSE', description: 'NIFTY 50', type: 'index', provider: 'fyers' },
  { ticker: 'NIFTYBANK-INDEX', prefix: 'NSE', description: 'NIFTY BANK', type: 'index', provider: 'fyers' },
  { ticker: 'FINNIFTY-INDEX', prefix: 'NSE', description: 'FINNIFTY', type: 'index', provider: 'fyers' },
  { ticker: 'MIDCPNIFTY-INDEX', prefix: 'NSE', description: 'MIDCAP NIFTY', type: 'index', provider: 'fyers' },
  { ticker: 'SENSEX-INDEX', prefix: 'BSE', description: 'SENSEX', type: 'index', provider: 'fyers' },
];

const intervalMap: Record<string, string> = {
  '1': '1minute',
  '3': '3minute',
  '5': '5minute',
  '10': '10minute',
  '15': '15minute',
  '30': '30minute',
  '60': '60minute',
  '240': '240minute',
  D: 'day',
  W: 'week',
  M: 'month',
};

export function toFyersVelaSymbol(symbol: string): string {
  const value = String(symbol || '').trim();
  if (!value) return 'fyers:NSE:NIFTY50-INDEX';
  if (value.toLowerCase().startsWith('fyers:')) return value;
  return 'fyers:' + value;
}

function runtimeSymbol(ticker: string): string {
  const value = String(ticker || '').trim();
  if (!value) return 'NSE:NIFTY50-INDEX';
  return value.includes(':') ? value : 'NSE:' + value;
}

function epoch(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (Number.isFinite(numeric)) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function asBar(row: { timestamp?: string | number; open: number; high: number; low: number; close: number; volume?: number }): OHLCV | undefined {
  const time = epoch(row.timestamp);
  const open = Number(row.open);
  const high = Number(row.high);
  const low = Number(row.low);
  const close = Number(row.close);
  if (!Number.isFinite(time) || ![open, high, low, close].every(Number.isFinite)) return undefined;
  return {
    time,
    open,
    high: Math.max(high, open, close),
    low: Math.min(low, open, close),
    close,
    volume: Number.isFinite(Number(row.volume)) ? Number(row.volume) : undefined,
  };
}

function dedupe(rows: OHLCV[]): OHLCV[] {
  const byTime = new Map<number, OHLCV>();
  for (const row of rows) {
    if (!Number.isFinite(Number(row.time))) continue;
    byTime.set(Number(row.time), row);
  }
  return [...byTime.values()].sort((a, b) => Number(a.time) - Number(b.time));
}

function timeframeMs(timeframe: string): number {
  const key = String(timeframe).trim();
  if (key === 'D') return 86_400_000;
  if (key === 'W') return 7 * 86_400_000;
  if (key === 'M') return 30 * 86_400_000;
  const minutes = Number(key);
  return Number.isFinite(minutes) && minutes > 0 ? minutes * 60_000 : 5 * 60_000;
}

function tickToBar(tick: NormalizedMarketTick, previous: OHLCV | undefined, timeframe: string): OHLCV | undefined {
  const price = Number(tick.ltp ?? tick.close ?? tick.ohlc?.at(-1)?.close);
  if (!Number.isFinite(price) || price <= 0) return undefined;

  const stamp = epoch(tick.lastTradeTimestamp ?? tick.receivedAt);
  if (!Number.isFinite(stamp)) return undefined;

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

  return {
    time: Number(previous.time),
    open: Number(previous.open),
    high: Math.max(Number(previous.high), price),
    low: Math.min(Number(previous.low), price),
    close: price,
    volume: Number.isFinite(Number(tick.volume)) ? Number(tick.volume) : previous.volume,
  };
}

export class TcoVelaDataProvider implements DataProvider {
  info(): ProviderInfo {
    return {
      name: 'fyers',
      displayName: 'TradingCoreOS · FYERS',
      requiresApiKey: false,
      supportedTimeframes: Object.keys(intervalMap),
      capabilities: { enumerate: true, stream: true, symbolInfo: true },
    };
  }

  listSymbols(): Promise<SymbolDescriptor[]> {
    return Promise.resolve(SYMBOLS.map((symbol) => ({ ...symbol })));
  }

  async getBars(ticker: string, timeframe: string, range: BarRange): Promise<OHLCV[]> {
    const symbol = runtimeSymbol(ticker);
    const brokerInterval = intervalMap[String(timeframe).trim()] || String(timeframe).trim();
    const requested = Math.max(100, Math.min(5_000, Math.floor(Number(range.limit) || 2_500)));
    const rows = await tradingCoreRuntime.getHistoricalData(symbol, brokerInterval, undefined, requested);
    let bars = dedupe((rows || []).map(asBar).filter((bar): bar is OHLCV => Boolean(bar)));
    if (range.from != null) bars = bars.filter((bar) => Number(bar.time) >= Number(range.from));
    if (range.to != null) bars = bars.filter((bar) => Number(bar.time) <= Number(range.to));
    return bars.slice(-requested);
  }

  async getBarsProgressive(
    ticker: string,
    timeframe: string,
    range: BarRange,
    onBatch: (bars: OHLCV[]) => void,
    opts?: { signal?: AbortSignal },
  ): Promise<OHLCV[]> {
    if (opts?.signal?.aborted) return [];
    const bars = await this.getBars(ticker, timeframe, range);
    if (!opts?.signal?.aborted && bars.length) onBatch(bars);
    return bars;
  }

  getSymbolInfo(ticker: string) {
    const symbol = runtimeSymbol(ticker);
    const exchange = symbol.split(':')[0] || 'NSE';
    const type = /-INDEX$/i.test(symbol) ? 'index' : /(?:-FUT|-CE|-PE)$/i.test(symbol) ? 'derivative' : 'equity';
    return Promise.resolve({ ticker: symbol, exchange, type });
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
