export type MarketFeedStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'authentication_failed';

export interface MarketDepthLevel {
  price: number;
  quantity: number;
  orders?: number;
}

export interface NormalizedOHLC {
  interval: string;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  timestamp?: string;
}

export interface NormalizedMarketTick {
  instrumentKey: string;
  ltp?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  change?: number;
  changePercent?: number;
  lastTradeTimestamp?: string;
  volume?: number;
  bid?: MarketDepthLevel[];
  ask?: MarketDepthLevel[];
  oi?: number;
  iv?: number;
  totalBuyQuantity?: number;
  totalSellQuantity?: number;
  ohlc?: NormalizedOHLC[];
  receivedAt?: string;
}

export type MarketFeedEvent =
  | { type: 'status'; status: MarketFeedStatus }
  | { type: 'tick'; tick: NormalizedMarketTick }
  | { type: 'market_status'; marketStatus: Record<string, string> }
  | { type: 'error'; error: string };

export interface OptionQuote {
  instrumentKey?: string;
  ltp?: number;
  volume?: number;
  oi?: number;
  previousOi?: number;
  bidPrice?: number;
  bidQuantity?: number;
  askPrice?: number;
  askQuantity?: number;
}

export interface OptionContract {
  strike: number;
  expiry?: string;
  underlyingKey?: string;
  call?: OptionQuote;
  put?: OptionQuote;
}

export interface OptionChain {
  underlyingKey: string;
  expiry: string;
  spot?: number;
  contracts: OptionContract[];
}

export interface OIObservation {
  strike: number;
  callOi: number;
  callChangeOi: number;
  putOi: number;
  putChangeOi: number;
}
