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

export interface BrokerItem {
  id: string;
  name: string;
  logoColor: string;
  apiName: string;
  latency: string;
  supported: boolean;
}

export interface PricingPlan {
  id: string;
  name: string;
  price: number;
  period: string;
  description: string;
  features: string[];
  popular?: boolean;
  ctaText: string;
}

export interface FutureModule {
  phase: string;
  title: string;
  description: string;
  status: 'Upcoming' | 'Planned' | 'In R&D' | 'Long Term';
  category: string;
}

export interface FAQItem {
  question: string;
  answer: string;
  category: 'General' | 'Security' | 'Execution' | 'Brokers';
}
