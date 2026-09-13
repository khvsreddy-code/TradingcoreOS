import { OptionChain } from '../../types/market';

export interface OrderRequest {
  symbol: string;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  orderType: 'Market' | 'Limit' | 'SL' | 'SL-M';
  side: 'Buy' | 'Sell';
  product: 'CNC' | 'MIS' | 'NRML';
  /** Optional broker-native smart risk fields. FYERS supports stop-loss/target at entry. */
  stopLoss?: number;
  takeProfit?: number;
  /** UI/risk-plan value; broker adapters may support this separately from entry. */
  trailingStopLoss?: number;
  /** Client-generated key used to make live order submission retry-safe. */
  idempotencyKey?: string;
}

export interface OrderResult {
  orderId: string;
  status: 'COMPLETE' | 'REJECTED' | 'PENDING';
  message?: string;
  timestamp: string;
}

export interface Position {
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  product: string;
}

export interface Holding {
  id: string;
  symbol: string;
  quantity: number;
  avgPrice: number;
  ltp: number;
  pnl: number;
  dayChange: number;
}

export interface TradeRecord {
  tradeId: string;
  orderId: string;
  symbol: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  price: number;
  timestamp: string;
  product: string;
  pnl?: number;
}

export interface AccountFunds {
  totalCapital: number;
  availableMargin: number;
  usedMargin: number;
  collateralMargin: number;
}

export interface ApiCredentials {
  apiKey: string;
  apiSecret: string;
  accessToken?: string;
  clientId?: string;
  requestToken?: string;
}

export interface HistoricalCandle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type BrokerConnectionStatus =
  | 'Connected'
  | 'Refreshing Session'
  | 'Authentication Required'
  | 'Syncing Portfolio'
  | 'Offline'
  | 'Maintenance'
  | 'Read Only'
  | 'OAuth Pending'
  | 'Connecting...';

export interface BrokerCapabilities {
  supportsEquity: boolean;
  supportsFO: boolean;
  supportsCommodity: boolean;
  supportsCurrency: boolean;
  supportsBasketOrders: boolean;
  supportsGTT: boolean;
  supportsWebSocket: boolean;
  supportsHistoricalData: boolean;
  supportsOrderModification: boolean;
  supportsOrderCancellation: boolean;
  supportsOptions: boolean;
  supportsBracketOrders: boolean;
  supportsMarginTrading: boolean;
}

export interface BrokerAdapter {
  readonly id: string;
  readonly name: string;
  readonly supportsOAuth: boolean;
  readonly supportsAPIKeys: boolean;
  readonly supportedSegments: string[];
  readonly developerPortalUrl?: string;
  readonly capabilities: BrokerCapabilities;

  authenticateOAuth(authCode?: string): Promise<{ success: boolean; sessionToken?: string; error?: string }>;
  saveApiKeys(credentials: ApiCredentials): Promise<{ success: boolean; error?: string }>;
  validateApiKeys(credentials: ApiCredentials): Promise<{ isValid: boolean; message?: string }>;
  fetchProfile(): Promise<{ userId: string; name: string; email: string; broker: string }>;
  fetchFunds(): Promise<AccountFunds>;
  fetchHoldings(): Promise<Holding[]>;
  fetchPositions(): Promise<Position[]>;
  fetchOrders(): Promise<OrderResult[]>;
  fetchTradeHistory(): Promise<TradeRecord[]>;
  getMarketData(symbols: string[]): Promise<Record<string, { ltp: number; chg: string; volume: number }>>;
  getHistoricalData(symbol: string, timeframe: string): Promise<HistoricalCandle[]>;
  placeOrder(order: OrderRequest): Promise<OrderResult>;
  modifyOrder(orderId: string, updates: Partial<OrderRequest>): Promise<OrderResult>;
  cancelOrder(orderId: string): Promise<{ success: boolean; message?: string }>;
  squareOff(positionId: string): Promise<{ success: boolean; message?: string }>;
  exitAll(): Promise<{ success: boolean; closedCount: number }>;
  getOptionChain(instrumentKey: string, expiryDate?: string): Promise<OptionChain>;
  subscribeWebSocket(symbols: string[], callback: (tick: any) => void): () => void;
  logout(): Promise<void>;
}
