import type { MarketDepthLevel } from '../../types/market';

export interface TerminalOrderBookDepthMetrics {
  bidQuantity: number;
  askQuantity: number;
  imbalancePercent: number | null;
  bidLevels: number;
  askLevels: number;
  bidOrders: number | null;
  askOrders: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
}

function validQuantity(value: unknown): number {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function validPrice(value: unknown): number | null {
  const price = Number(value);
  return Number.isFinite(price) && price > 0 ? price : null;
}

/** Summarises real broker Level-2 levels; this is displayed depth, not executed flow. */
export function calculateTerminalOrderBookDepth(
  bid: readonly MarketDepthLevel[] | null | undefined,
  ask: readonly MarketDepthLevel[] | null | undefined,
  levelLimit = 8,
): TerminalOrderBookDepthMetrics {
  const limit = Number.isFinite(levelLimit) ? Math.max(1, Math.min(20, Math.floor(levelLimit))) : 8;
  const bids = (Array.isArray(bid) ? bid : []).slice(0, limit);
  const asks = (Array.isArray(ask) ? ask : []).slice(0, limit);
  const bidQuantity = bids.reduce((sum, level) => sum + validQuantity(level?.quantity), 0);
  const askQuantity = asks.reduce((sum, level) => sum + validQuantity(level?.quantity), 0);
  const total = bidQuantity + askQuantity;
  const bidOrderValues = bids.map(level => Number(level?.orders)).filter(value => Number.isFinite(value) && value >= 0);
  const askOrderValues = asks.map(level => Number(level?.orders)).filter(value => Number.isFinite(value) && value >= 0);
  const bestBid = bids.length ? validPrice(bids[0]?.price) : null;
  const bestAsk = asks.length ? validPrice(asks[0]?.price) : null;
  const spread = bestBid != null && bestAsk != null ? bestAsk - bestBid : null;

  return {
    bidQuantity,
    askQuantity,
    imbalancePercent: total > 0 ? ((bidQuantity - askQuantity) / total) * 100 : null,
    bidLevels: bids.filter(level => validPrice(level?.price) != null && validQuantity(level?.quantity) > 0).length,
    askLevels: asks.filter(level => validPrice(level?.price) != null && validQuantity(level?.quantity) > 0).length,
    bidOrders: bidOrderValues.length ? bidOrderValues.reduce((sum, value) => sum + value, 0) : null,
    askOrders: askOrderValues.length ? askOrderValues.reduce((sum, value) => sum + value, 0) : null,
    bestBid,
    bestAsk,
    spread: spread != null && spread >= 0 ? spread : null,
  };
}
