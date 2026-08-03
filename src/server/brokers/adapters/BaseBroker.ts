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

  async getProfile(accessToken: string): Promise<any> { throw new Error('Not implemented'); }
  async getFunds(accessToken: string): Promise<any> { throw new Error('Not implemented'); }
  async getHoldings(accessToken: string): Promise<any> { throw new Error('Not implemented'); }
  async getPositions(accessToken: string): Promise<any> { throw new Error('Not implemented'); }
  async getOrders(accessToken: string): Promise<any> { throw new Error('Not implemented'); }
  async placeOrder(accessToken: string, orderData: any): Promise<any> { throw new Error('Not implemented'); }
  async modifyOrder(accessToken: string, orderId: string, orderData: any): Promise<any> { throw new Error('Not implemented'); }
  async cancelOrder(accessToken: string, orderId: string): Promise<any> { throw new Error('Not implemented'); }
}
