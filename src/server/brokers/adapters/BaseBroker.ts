import type { BrokerProfile, BrokerHistory, BrokerMarketQuotes, BrokerOptionChain, BrokerOrderPayload, OrderMutationResult, CancelResult } from '../contracts.js';
import type { AccountFunds, Holding, Position, OrderResult, TradeRecord } from '../../../services/brokers/BrokerAdapter.js' ;
export interface TokenExchangeResult {
  success: boolean;
  rawAccessToken?: string;
  rawRefreshToken?: string;
  expiresInSeconds?: number;
  clientCode?: string;
  error?: string;
}

export abstract class BaseBroker {
  abstract readonly brokerId: string;
  abstract readonly name: string;

  /**
   * Generates official broker OAuth authorization URL
   */
  abstract getAuthUrl(redirectUri: string, state: string, clientId?: string): string;

  /**
   * Performs server-side HTTPS token exchange
   */
  abstract exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult>;

  /**
   * Refreshes access token using refresh token
   */
  abstract refreshToken(refreshToken: string): Promise<TokenExchangeResult>;

  // --- Real Broker API Integration Methods ---

  async getProfile(accessToken: string): Promise<BrokerProfile> { throw new Error('Not implemented'); }
  async getFunds(accessToken: string): Promise<AccountFunds> { throw new Error('Not implemented'); }
  async getHoldings(accessToken: string): Promise<Holding[]> { throw new Error('Not implemented'); }
  async getPositions(accessToken: string): Promise<Position[]> { throw new Error('Not implemented'); }
  async getOrders(accessToken: string): Promise<OrderResult[]> { throw new Error('Not implemented'); }
  async getTrades(accessToken: string): Promise<TradeRecord[]> { throw new Error('Not implemented'); }
  async getHistoricalData(accessToken: string, instrumentKey: string, interval: string, _limit = 10000): Promise<BrokerHistory> { throw new Error('Not implemented'); }
  async getMarketQuotes(accessToken: string, instrumentKeys: string[]): Promise<BrokerMarketQuotes> { throw new Error('Not implemented'); }
  async getOptionChain(accessToken: string, instrumentKey: string, expiryDate: string): Promise<BrokerOptionChain> { throw new Error('Not implemented'); }
  async placeOrder(accessToken: string, orderData: BrokerOrderPayload): Promise<OrderMutationResult> { throw new Error('Not implemented'); }
  async modifyOrder(accessToken: string, orderId: string, orderData: BrokerOrderPayload): Promise<OrderMutationResult> { throw new Error('Not implemented'); }
  async cancelOrder(accessToken: string, orderId: string): Promise<CancelResult> { throw new Error('Not implemented'); }
}
