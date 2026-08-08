export type WatchlistInstrument = {
  symbol: string;
  venue: string;
  lastTradedPrice: string;
  changePercent: string;
  sparkline: number[];
};

export type OptionSide = {
  ltp: string;
  bid: string;
  ask: string;
  oi: string;
  changeInOi: string;
};

export type OptionChainRow = {
  strike: string;
  call: OptionSide;
  put: OptionSide;
};

export type MarketDepthLevel = {
  quantity: string;
  price: string;
};

export type PositionPreview = {
  symbol: string;
  product: string;
  pnl: string;
};

export type PortfolioStat = {
  label: string;
  value: string;
};

export type HeroStat = {
  label: string;
  value: string;
};

export type PreviewConfig = {
  market: {
    region: string;
    displayName: string;
    timezone: string;
    currencySymbol: string;
    exchanges: string[];
    openTime: string;
    closeTime: string;
    expiryCycles: string[];
  };
  hero: {
    badge: string;
    heading: string;
    accent: string;
    description: string;
    primaryCta: string;
    secondaryCta: string;
    trustPills: string[];
    stats: HeroStat[];
  };
  chart: {
    symbol: string;
    venue: string;
    price: string;
    change: string;
    changePercent: string;
    timeframe: string;
    timestamp: string;
    sourceLabel: string;
    levels: string[];
    series: number[];
    volume: number[];
  };
  watchlist: WatchlistInstrument[];
  orderPanel: {
    exchange: string;
    instrument: string;
    product: string;
    orderType: string;
    quantity: string;
    price: string;
    estimatedValue: string;
  };
  positions: PositionPreview[];
  portfolio: PortfolioStat[];
  marketDepth: {
    bids: MarketDepthLevel[];
    asks: MarketDepthLevel[];
  };
  optionChain: {
    symbol: string;
    expiry: string;
    rows: OptionChainRow[];
  };
  news: string[];
  aiInsights: string[];
};

export const indiaMarketPreview: PreviewConfig = {
  market: {
    region: "india",
    displayName: "Indian Markets",
    timezone: "Asia/Kolkata",
    currencySymbol: "₹",
    exchanges: ["NSE", "BSE", "NFO"],
    openTime: "09:15",
    closeTime: "15:30",
    expiryCycles: ["Weekly", "Monthly"],
  },
  hero: {
    badge: "India-first trading OS for active traders",
    heading: "The Trading Operating System for",
    accent: "Indian Markets",
    description:
      "Trade NSE, BSE, and F&O workflows with institutional-grade charting, option analytics, order execution, and AI copilots inside one premium workspace.",
    primaryCta: "Start Trading Now",
    secondaryCta: "Explore Features",
    trustPills: ["NSE Real-Time", "Multi-Broker", "AI Insights", "F&O Ready"],
    stats: [
      { label: "Watchlist Coverage", value: "NIFTY 50 + F&O" },
      { label: "Market Timing", value: "09:15 - 15:30 IST" },
      { label: "Workspace Modes", value: "Cash, F&O, Research" },
      { label: "Execution Profiles", value: "CNC, MIS, NRML" },
    ],
  },
  chart: {
    symbol: "NIFTY 50",
    venue: "NSE",
    price: "₹24,865.35",
    change: "+₹312.40",
    changePercent: "+1.27%",
    timeframe: "1D",
    timestamp: "15:29",
    sourceLabel: "Sample NSE-style preview · Asia/Kolkata",
    levels: ["24,600", "24,720", "24,840", "24,960"],
    series: [28, 34, 31, 46, 41, 52, 58, 61, 57, 68, 72, 78],
    volume: [32, 44, 38, 56, 42, 64, 58, 71, 49, 76, 82, 88],
  },
  watchlist: [
    {
      symbol: "NIFTY 50",
      venue: "NSE",
      lastTradedPrice: "₹24,865.35",
      changePercent: "+1.27%",
      sparkline: [42, 48, 51, 50, 57, 63, 68, 72],
    },
    {
      symbol: "BANKNIFTY",
      venue: "NSE",
      lastTradedPrice: "₹58,420.80",
      changePercent: "+0.94%",
      sparkline: [38, 37, 41, 46, 52, 54, 58, 61],
    },
    {
      symbol: "RELIANCE",
      venue: "NSE",
      lastTradedPrice: "₹2,987.50",
      changePercent: "+1.18%",
      sparkline: [35, 39, 45, 44, 49, 55, 59, 64],
    },
    {
      symbol: "HDFCBANK",
      venue: "NSE",
      lastTradedPrice: "₹1,742.30",
      changePercent: "-0.32%",
      sparkline: [68, 66, 65, 63, 61, 60, 58, 55],
    },
    {
      symbol: "TCS",
      venue: "NSE",
      lastTradedPrice: "₹3,982.10",
      changePercent: "+0.71%",
      sparkline: [44, 45, 49, 52, 55, 57, 60, 63],
    },
    {
      symbol: "ICICIBANK",
      venue: "NSE",
      lastTradedPrice: "₹1,268.60",
      changePercent: "+0.53%",
      sparkline: [39, 42, 41, 46, 48, 52, 55, 58],
    },
  ],
  orderPanel: {
    exchange: "NSE",
    instrument: "RELIANCE",
    product: "MIS",
    orderType: "Limit",
    quantity: "25",
    price: "₹2,987.50",
    estimatedValue: "₹74,687.50",
  },
  positions: [
    { symbol: "RELIANCE", product: "MIS", pnl: "+₹1,540" },
    { symbol: "HDFCBANK", product: "CNC", pnl: "-₹320" },
    { symbol: "TCS", product: "CNC", pnl: "+₹840" },
  ],
  portfolio: [
    { label: "Today's P&L", value: "+₹8,245" },
    { label: "Portfolio Value", value: "₹12,48,520" },
    { label: "Available Margin", value: "₹3,45,800" },
  ],
  marketDepth: {
    bids: [
      { quantity: "1,250", price: "₹2,987.45" },
      { quantity: "1,875", price: "₹2,987.40" },
      { quantity: "2,100", price: "₹2,987.35" },
      { quantity: "2,650", price: "₹2,987.30" },
    ],
    asks: [
      { price: "₹2,987.55", quantity: "1,180" },
      { price: "₹2,987.60", quantity: "1,640" },
      { price: "₹2,987.65", quantity: "2,060" },
      { price: "₹2,987.70", quantity: "2,420" },
    ],
  },
  optionChain: {
    symbol: "NIFTY",
    expiry: "Weekly Expiry",
    rows: [
      {
        strike: "25500",
        call: { ltp: "142.35", bid: "141.90", ask: "142.80", oi: "18.4L", changeInOi: "+2.6L" },
        put: { ltp: "118.20", bid: "117.75", ask: "118.60", oi: "16.9L", changeInOi: "+1.8L" },
      },
      {
        strike: "25600",
        call: { ltp: "96.40", bid: "95.95", ask: "96.85", oi: "14.1L", changeInOi: "+1.2L" },
        put: { ltp: "152.65", bid: "152.10", ask: "153.20", oi: "19.7L", changeInOi: "+2.1L" },
      },
      {
        strike: "25700",
        call: { ltp: "61.10", bid: "60.80", ask: "61.40", oi: "11.3L", changeInOi: "+0.9L" },
        put: { ltp: "198.55", bid: "197.80", ask: "199.10", oi: "22.4L", changeInOi: "+3.0L" },
      },
    ],
  },
  news: [
    "RBI maintains repo rate, rate-sensitive stocks steady.",
    "NIFTY closes near day high as financials lead gains.",
    "FIIs turn net buyers in afternoon session.",
    "Reliance announces quarterly results ahead of estimates.",
  ],
  aiInsights: [
    "NIFTY is trading above VWAP with broad-based participation across financials.",
    "BANKNIFTY has broken yesterday's high with stronger private bank momentum.",
    "RELIANCE is approaching weekly resistance near ₹3,000 with steady delivery volume.",
  ],
};

export const marketPreviewByRegion: Record<string, PreviewConfig> = {
  india: indiaMarketPreview,
};
