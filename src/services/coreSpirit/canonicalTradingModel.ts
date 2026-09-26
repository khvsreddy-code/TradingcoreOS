/**
 * CoreSpirit canonical trading model — #18.1.
 *
 * This is the neutral vocabulary shared by market data, research, models,
 * signals and automation. Broker-specific request/response types stay outside
 * this contract and adapt into it at the host boundary.
 */
import { coreSpiritChecksum } from './artifact';
import type { CoreSpiritMarketBar, CoreSpiritMarketDataset } from './marketData';

export const CORE_SPIRIT_TRADING_MODEL_VERSION = 1 as const;

export type CoreSpiritAssetClass =
  | 'equity'
  | 'etf'
  | 'index'
  | 'future'
  | 'option'
  | 'currency'
  | 'crypto'
  | 'commodity'
  | 'bond'
  | 'synthetic'
  | 'other';

export interface CoreSpiritInstrument {
  instrumentId: string;
  symbol: string;
  assetClass: CoreSpiritAssetClass;
  exchange?: string;
  currency?: string;
  timezone: string;
  tickSize?: number;
  lotSize?: number;
  contractMultiplier?: number;
  expiry?: string;
  optionType?: 'call' | 'put';
  strike?: number;
  metadata?: Readonly<Record<string, unknown>>;
}

export interface CoreSpiritTradingSession {
  id: string;
  marketDate: string;
  timezone: string;
  phase: 'pre' | 'open' | 'post' | 'closed' | 'unknown';
  isOpen: boolean;
  opensAt?: number;
  closesAt?: number;
}

export interface CoreSpiritQuote {
  timestamp: number;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  bidSize?: number | null;
  askSize?: number | null;
}

export interface CoreSpiritDepthLevel {
  price: number;
  size: number;
  orders?: number;
}

export interface CoreSpiritDepthSnapshot {
  timestamp: number;
  bids: readonly CoreSpiritDepthLevel[];
  asks: readonly CoreSpiritDepthLevel[];
  imbalance?: number | null;
}

export interface CoreSpiritPositionSnapshot {
  symbol: string;
  quantity: number;
  averagePrice?: number | null;
  realizedPnl?: number | null;
  unrealizedPnl?: number | null;
  marketValue?: number | null;
  side?: 'long' | 'short' | 'flat';
}

export interface CoreSpiritPortfolioSnapshot {
  timestamp: number;
  equity?: number | null;
  cash?: number | null;
  buyingPower?: number | null;
  grossExposure?: number | null;
  netExposure?: number | null;
  positions: readonly CoreSpiritPositionSnapshot[];
  metadata?: Readonly<Record<string, unknown>>;
}

export type CoreSpiritTradingCapability =
  | 'visual'
  | 'research'
  | 'model'
  | 'signal'
  | 'automation'
  | 'risk'
  | 'execution';

export interface CoreSpiritTradingSnapshot {
  version: typeof CORE_SPIRIT_TRADING_MODEL_VERSION;
  snapshotId: string;
  timestamp: number;
  mode: 'historical' | 'realtime' | 'replay' | 'backtest' | 'historicalTick';
  instrument: CoreSpiritInstrument;
  timeframe: string;
  session: CoreSpiritTradingSession;
  bar?: CoreSpiritMarketBar;
  quote?: CoreSpiritQuote;
  depth?: CoreSpiritDepthSnapshot;
  portfolio?: CoreSpiritPortfolioSnapshot;
  capabilities: readonly CoreSpiritTradingCapability[];
  source: 'broker' | 'file' | 'database' | 'research' | 'synthetic' | 'replay';
}

export type CoreSpiritTradingEvent =
  | { type: 'market.bar'; snapshot: CoreSpiritTradingSnapshot }
  | { type: 'market.quote'; snapshotId: string; quote: CoreSpiritQuote }
  | { type: 'market.depth'; snapshotId: string; depth: CoreSpiritDepthSnapshot }
  | { type: 'portfolio.update'; snapshotId: string; portfolio: CoreSpiritPortfolioSnapshot }
  | { type: 'runtime.signal'; snapshotId: string; signalId: string; payload: Readonly<Record<string, unknown>> }
  | { type: 'order.intent'; snapshotId: string; intentId: string; payload: Readonly<Record<string, unknown>> };

export function validateCoreSpiritInstrument(instrument: CoreSpiritInstrument): void {
  if (!instrument.instrumentId || !instrument.symbol) throw new Error('instrumentId and symbol are required');
  if (!instrument.timezone) throw new Error('instrument timezone is required');
  if (instrument.tickSize != null && (!Number.isFinite(instrument.tickSize) || instrument.tickSize <= 0)) {
    throw new Error('instrument tickSize must be positive');
  }
  if (instrument.lotSize != null && (!Number.isFinite(instrument.lotSize) || instrument.lotSize <= 0)) {
    throw new Error('instrument lotSize must be positive');
  }
}

export function validateCoreSpiritTradingSnapshot(snapshot: CoreSpiritTradingSnapshot): void {
  if (snapshot.version !== CORE_SPIRIT_TRADING_MODEL_VERSION) throw new Error('unsupported CoreSpirit trading model version');
  if (!snapshot.snapshotId || !snapshot.timeframe) throw new Error('snapshotId and timeframe are required');
  if (!Number.isFinite(snapshot.timestamp)) throw new Error('snapshot timestamp must be finite');
  validateCoreSpiritInstrument(snapshot.instrument);
  if (snapshot.bar) {
    const { open, high, low, close, volume } = snapshot.bar;
    if (![open, high, low, close, volume].every(Number.isFinite)) throw new Error('snapshot bar contains a non-finite value');
    if (high < Math.max(open, low, close)) throw new Error('snapshot bar high is invalid');
    if (low > Math.min(open, high, close)) throw new Error('snapshot bar low is invalid');
    if (volume < 0) throw new Error('snapshot bar volume cannot be negative');
  }
}

export function tradingSnapshotChecksum(snapshot: CoreSpiritTradingSnapshot): string {
  validateCoreSpiritTradingSnapshot(snapshot);
  return coreSpiritChecksum(snapshot);
}

export function coreSpiritTradingSnapshotFromDataset(
  dataset: CoreSpiritMarketDataset,
  options: {
    instrument: CoreSpiritInstrument;
    mode?: CoreSpiritTradingSnapshot['mode'];
    session: CoreSpiritTradingSession;
    index: number;
    capabilities?: readonly CoreSpiritTradingCapability[];
    timestamp?: number;
  },
): CoreSpiritTradingSnapshot {
  if (options.index < 0 || options.index >= dataset.bars.length) throw new Error('dataset index is out of range');
  const bar = dataset.bars[options.index];
  const snapshot: CoreSpiritTradingSnapshot = {
    version: CORE_SPIRIT_TRADING_MODEL_VERSION,
    snapshotId: `${dataset.id}:${options.index}`,
    timestamp: options.timestamp ?? Date.parse(bar.timestamp),
    mode: options.mode ?? 'historical',
    instrument: { ...options.instrument },
    timeframe: dataset.timeframe,
    session: { ...options.session },
    bar: { ...bar },
    capabilities: Object.freeze([...(options.capabilities ?? ['visual', 'research', 'signal'])]),
    source: dataset.source,
  };
  validateCoreSpiritTradingSnapshot(snapshot);
  return snapshot;
}
