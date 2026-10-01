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
export interface BrokerOrderPayload extends OrderRequest {
  /** Legacy/native aliases retained at the broker adapter boundary. */
  order_type?: OrderRequest['orderType'];
  instrument_token?: string;
  validity?: string;
  trigger_price?: number;
  is_amo?: boolean;
  slice?: boolean;
  market_protection?: number;
  qty?: number;
  limitPrice?: number;
  stopPrice?: number;
  type?: number;
  disclosedQty?: number;
  offlineOrder?: boolean;
  [key: string]: unknown;
}
export type BrokerPortfolioSnapshot = { funds: AccountFunds | null; holdings: Holding[]; positions: Position[]; orders: OrderResult[]; trades: TradeRecord[] };
export type BrokerHistory = HistoricalCandle[];
export type BrokerOptionChain = OptionChain;
export type OrderMutationResult = OrderResult;
export type CancelResult = { success: true; message?: string };
