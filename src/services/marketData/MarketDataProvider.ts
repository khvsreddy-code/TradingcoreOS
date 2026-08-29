export interface MarketTick {
  symbol: string;
  ltp: number;
  chg: string;
  chgValue: number;
  volume: number;
  high: number;
  low: number;
  open: number;
  close: number;
  isDelayed: boolean;
  timestamp: string;
}

export interface MarketDataProvider {
  readonly providerName: string;
  readonly isLiveFeed: boolean;
  
  getQuote(symbol: string): Promise<MarketTick>;
  getWatchlistQuotes(symbols: string[]): Promise<MarketTick[]>;
  subscribeTicks(symbols: string[], callback: (tick: MarketTick) => void): () => void;
}
