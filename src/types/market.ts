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
