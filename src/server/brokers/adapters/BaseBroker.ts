import type { BrokerProfile, BrokerHistory, BrokerMarketQuotes, BrokerOptionChain, BrokerOrderPayload, OrderMutationResult, CancelResult } from '../contracts.js';
import type { AccountFunds, Holding, Position, OrderResult, TradeRecord } from '../../../services/brokers/BrokerAdapter.js';
import type { FyersCapabilities } from '../../fyers/core/FyersCapabilities.js';
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
  abstract exchangeCodeForToken(code: string, redirectUri: string, clientId?: string, rateLimitIdentity?: string): Promise<TokenExchangeResult>;

  /**
   * Refreshes access token using refresh token
   */
  abstract refreshToken(refreshToken: string): Promise<TokenExchangeResult>;

  // --- Real Broker API Integration Methods ---

  async getProfile(accessToken: string, rateLimitIdentity?: string): Promise<BrokerProfile> { throw new Error('Not implemented'); }
  async getFunds(accessToken: string, rateLimitIdentity?: string): Promise<AccountFunds> { throw new Error('Not implemented'); }
  async getHoldings(accessToken: string, rateLimitIdentity?: string): Promise<Holding[]> { throw new Error('Not implemented'); }
  async getPositions(accessToken: string, rateLimitIdentity?: string): Promise<Position[]> { throw new Error('Not implemented'); }
  async getOrders(accessToken: string, rateLimitIdentity?: string): Promise<OrderResult[]> { throw new Error('Not implemented'); }
  async getTrades(accessToken: string, rateLimitIdentity?: string): Promise<TradeRecord[]> { throw new Error('Not implemented'); }
  async getHistoricalData(accessToken: string, instrumentKey: string, interval: string, _limit = 10000, _capabilities?: FyersCapabilities, _rateLimitIdentity?: string): Promise<BrokerHistory> { throw new Error('Not implemented'); }
  async getMarketQuotes(accessToken: string, instrumentKeys: string[], _capabilities?: FyersCapabilities, _rateLimitIdentity?: string): Promise<BrokerMarketQuotes> { throw new Error('Not implemented'); }
  async getOptionChain(accessToken: string, instrumentKey: string, expiryDate: string, _capabilities?: FyersCapabilities, _rateLimitIdentity?: string): Promise<BrokerOptionChain> { throw new Error('Not implemented'); }
  async placeOrder(accessToken: string, orderData: BrokerOrderPayload, _rateLimitIdentity?: string): Promise<OrderMutationResult> { throw new Error('Not implemented'); }
  async modifyOrder(accessToken: string, orderId: string, orderData: BrokerOrderPayload, _rateLimitIdentity?: string): Promise<OrderMutationResult> { throw new Error('Not implemented'); }
  async cancelOrder(accessToken: string, orderId: string, _rateLimitIdentity?: string): Promise<CancelResult> { throw new Error('Not implemented'); }
}
