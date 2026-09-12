export type MarketFeedStatus = 'connecting' | 'connected' | 'reconnecting' | 'disconnected';

export interface MarketDepthLevel {
  price: number;
  quantity: number;
  orders?: number;
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
  totalBuyQuantity?: number;
  totalSellQuantity?: number;
  receivedAt?: string;
}

export type MarketFeedEvent =
  | { type: 'status'; status: MarketFeedStatus }
  | { type: 'tick'; tick: NormalizedMarketTick }
  | { type: 'error'; error: string };
