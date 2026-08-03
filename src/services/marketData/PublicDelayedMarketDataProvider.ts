import { MarketDataProvider, MarketTick } from './MarketDataProvider';

export class PublicDelayedMarketDataProvider implements MarketDataProvider {
  readonly providerName = 'Public Simulated Feed (15-Min Delayed)';
  readonly isLiveFeed = false;

  private baseQuotes: Record<string, { ltp: number; chg: string; chgVal: number }> = {
    BANKNIFTY: { ltp: 48250.5, chg: '+1.24%', chgVal: 591.2 },
    NIFTY50: { ltp: 22480.1, chg: '+0.85%', chgVal: 189.5 },
    RELIANCE: { ltp: 2980.0, chg: '+0.42%', chgVal: 12.4 },
    HDFCBANK: { ltp: 1540.2, chg: '-0.35%', chgVal: -5.4 },
    INFY: { ltp: 1620.8, chg: '+1.10%', chgVal: 17.6 },
    TCS: { ltp: 3950.4, chg: '+0.15%', chgVal: 5.9 },
  };

  async getQuote(symbol: string): Promise<MarketTick> {
    const base = this.baseQuotes[symbol] || { ltp: 1000.0, chg: '+0.00%', chgVal: 0 };
    return {
      symbol,
      ltp: base.ltp,
      chg: base.chg,
      chgValue: base.chgVal,
      volume: 4500000,
      high: base.ltp * 1.01,
      low: base.ltp * 0.99,
      open: base.ltp * 0.995,
      close: base.ltp - base.chgVal,
      isDelayed: true,
      timestamp: new Date().toISOString(),
    };
  }

  async getWatchlistQuotes(symbols: string[]): Promise<MarketTick[]> {
    return Promise.all(symbols.map((sym) => this.getQuote(sym)));
  }

  subscribeTicks(symbols: string[], callback: (tick: MarketTick) => void): () => void {
    const interval = setInterval(() => {
      symbols.forEach(async (sym) => {
        const baseQuote = await this.getQuote(sym);
        // Small realistic micro fluctuation
        const delta = (Math.random() - 0.48) * (baseQuote.ltp * 0.0005);
        const newLtp = Number((baseQuote.ltp + delta).toFixed(2));
        
        callback({
          ...baseQuote,
          ltp: newLtp,
          timestamp: new Date().toISOString(),
        });
      });
    }, 2000);

    return () => clearInterval(interval);
  }
}
