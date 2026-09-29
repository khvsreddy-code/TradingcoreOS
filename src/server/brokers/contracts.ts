import type {
  AccountFunds,
  Holding,
  Position,
  OrderResult,
  TradeRecord,
  HistoricalCandle,
  OrderRequest,
} from '../../services/brokers/BrokerAdapter.js';
import type { OptionChain } from '../../types/market.js';

export interface BrokerProfile { userId: string; name: string; email: string; broker: string; }
export type BrokerMarketQuote = { ltp: number; chg: string; change: number; changePercent: number; volume: number; bid: number; ask: number; timestamp: string };
export type BrokerMarketQuotes = Record<string, BrokerMarketQuote>;
export type BrokerOrderPayload = OrderRequest & Record<string, unknown>;
export type BrokerPortfolioSnapshot = { funds: AccountFunds | null; holdings: Holding[]; positions: Position[]; orders: OrderResult[]; trades: TradeRecord[] };
export type BrokerHistory = HistoricalCandle[];
export type BrokerOptionChain = OptionChain;
export type OrderMutationResult = OrderResult;
export type CancelResult = { success: true; message?: string };
