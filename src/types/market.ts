import type { DomainMarketEvent } from './market-events.js';

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
  /** Normalized domain-event metadata; optional for compatibility with cached/polled ticks. */
  sequence?: number;
  timestamp?: number;
  receivedAtEpoch?: number;
  brokerTimestamp?: number;
  source?: 'fyers' | 'upstox' | 'investiny' | 'yahoo' | 'paper' | 'replay' | 'backtest' | 'simulator';
  revision?: number;
  feedClass?: 'lite' | 'full' | 'depth';
}

export type MarketFeedEvent =
  | { type: 'status'; status: MarketFeedStatus }
  | { type: 'tick'; tick: NormalizedMarketTick; domainEvent?: DomainMarketEvent }
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
  observedAt?: string;
  source?: string;
}

export interface OptionContract {
  strike: number;
  expiry?: string;
  underlyingKey?: string;
  instrumentId?: string;
  exchange?: 'NSE' | 'BSE';
  lotSize?: number;
  tickSize?: number;
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
