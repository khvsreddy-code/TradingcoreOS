export type MarketFeedStatus = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'authentication_failed' | 'error';

export interface MarketDepthLevel { price: number; quantity: number; orders?: number; }
export interface NormalizedMarketTick {
  instrumentKey: string;
  ltp?: number;
  close?: number;
  change?: number;
  changePercent?: number;
  lastTradeTimestamp?: string;
  volume?: number;
  oi?: number;
  iv?: number;
  totalBuyQuantity?: number;
  totalSellQuantity?: number;
  bid?: MarketDepthLevel[];
  ask?: MarketDepthLevel[];
  ohlc?: Array<{ interval: string; open: number; high: number; low: number; close: number; volume: number; timestamp: string }>;
  receivedAt: string;
}

export interface MarketFeedEvent {
  type: 'tick' | 'status' | 'market_status' | 'error';
  tick?: NormalizedMarketTick;
  status?: MarketFeedStatus;
  marketStatus?: Record<string, string>;
  error?: string;
}

export interface OptionQuote { instrumentKey: string; ltp?: number; volume?: number; oi?: number; previousOi?: number; bidPrice?: number; bidQuantity?: number; askPrice?: number; askQuantity?: number; }
export interface OptionContract { strike: number; expiry: string; underlyingKey: string; call?: OptionQuote; put?: OptionQuote; }
export interface OptionChain { underlyingKey: string; expiry: string; spot?: number; contracts: OptionContract[]; }
export interface OIObservation { strike: number; callOi?: number; callChangeOi?: number; putOi?: number; putChangeOi?: number; }
