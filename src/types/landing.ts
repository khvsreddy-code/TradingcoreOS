export interface FAQItem {
  category: string;
  question: string;
  answer: string;
}

export interface WatchlistItem {
  symbol: string;
  ltp: number;
  change: number;
  changePercent: number;
}

export interface DepthRow {
  bidQty: number;
  bidPrice: number;
  askPrice: number;
  askQty: number;
}

export interface PositionItem {
  id: string;
  symbol: string;
  type: string;
  lots: number;
  pnl: number;
  ltp: number;
}
