/**
 * CoreSpirit-owned market data contracts.
 *
 * CoreSpirit must not depend on broker adapters. Brokers, files, databases,
 * websockets and research datasets adapt into these neutral host contracts.
 */
export const CORE_SPIRIT_MARKET_DATA_VERSION = 1 as const;

export interface CoreSpiritMarketBar {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface CoreSpiritMarketTick {
  timestamp: number;
  price: number;
  volume?: number;
  bid?: number;
  ask?: number;
  side?: 'buy' | 'sell' | 'unknown';
}

export interface CoreSpiritMarketDataset {
  version: typeof CORE_SPIRIT_MARKET_DATA_VERSION;
  id: string;
  symbol: string;
  timeframe: string;
  bars: readonly CoreSpiritMarketBar[];
  source: 'broker' | 'file' | 'database' | 'research' | 'synthetic' | 'replay';
  checksum?: string;
}

export function validateCoreSpiritMarketBar(bar: CoreSpiritMarketBar): void {
  if (!bar.timestamp) throw new Error('market bar timestamp is required');
  for (const [name, value] of Object.entries(bar)) {
    if (name === 'timestamp') continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`market bar '${name}' must be finite`);
    }
  }
  if (bar.high < Math.max(bar.open, bar.close, bar.low)) throw new Error('market bar high is invalid');
  if (bar.low > Math.min(bar.open, bar.close, bar.high)) throw new Error('market bar low is invalid');
  if (bar.volume < 0) throw new Error('market bar volume cannot be negative');
}

export function normalizeCoreSpiritMarketDataset(
  dataset: Omit<CoreSpiritMarketDataset, 'version'> & { version?: typeof CORE_SPIRIT_MARKET_DATA_VERSION },
): CoreSpiritMarketDataset {
  const bars = dataset.bars.map(bar => ({ ...bar }));
  bars.forEach(validateCoreSpiritMarketBar);
  return {
    version: CORE_SPIRIT_MARKET_DATA_VERSION,
    id: dataset.id,
    symbol: dataset.symbol,
    timeframe: dataset.timeframe,
    bars,
    source: dataset.source,
    checksum: dataset.checksum,
  };
}
