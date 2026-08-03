import { BaseBroker, TokenExchangeResult } from './BaseBroker.js';

export class ZerodhaAdapter extends BaseBroker {
  readonly brokerId = 'zerodha';
  readonly name = 'Zerodha Kite';

  getAuthUrl(redirectUri: string, state: string, clientId?: string): string {
    const key = clientId || process.env.ZERODHA_CLIENT_ID || 'zerodha_app_key';
    return `https://kite.zerodha.com/connect/login?v=3&api_key=${encodeURIComponent(key)}&redirect_params=state%3D${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `zk_access_${code.substring(0, 10)}_${Date.now()}`,
      rawRefreshToken: `zk_refresh_${Date.now()}`,
      expiresInSeconds: 86400,
      clientCode: `ZER_${Math.floor(1000 + Math.random() * 9000)}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `zk_access_refreshed_${refreshToken.substring(0, 6)}_${Date.now()}`,
      expiresInSeconds: 86400,
    };
  }
}

export class UpstoxAdapter extends BaseBroker {
  readonly brokerId = 'upstox';
  readonly name = 'Upstox Pro';

  getAuthUrl(redirectUri: string, state: string, clientId?: string): string {
    const key = clientId || process.env.UPSTOX_CLIENT_ID || '677850d3-7555-4a18-924c-8f9af996a3e9';
    return `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(key)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult> {
    const key = clientId || process.env.UPSTOX_CLIENT_ID || '677850d3-7555-4a18-924c-8f9af996a3e9';
    const secret = process.env.UPSTOX_CLIENT_SECRET || 'vh6qky2yje';

    try {
      const response = await fetch('https://api.upstox.com/v2/login/authorization/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          code,
          client_id: key,
          client_secret: secret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data?.errors?.[0]?.message || data?.message || 'Token exchange failed',
        };
      }

      return {
        success: true,
        rawAccessToken: data.access_token,
        rawRefreshToken: data.refresh_token,
        expiresInSeconds: data.expires_in || 86400,
        clientCode: data.user_id, // Often provided in token or profile response, Upstox might not return it here, but let's assume if it does or just use a default format.
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to connect to Upstox API',
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<TokenExchangeResult> {
    const key = process.env.UPSTOX_CLIENT_ID || '677850d3-7555-4a18-924c-8f9af996a3e9';
    const secret = process.env.UPSTOX_CLIENT_SECRET || 'vh6qky2yje';

    try {
      const response = await fetch('https://api.upstox.com/v2/login/authorization/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          client_id: key,
          client_secret: secret,
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: data?.errors?.[0]?.message || data?.message || 'Token refresh failed',
        };
      }

      return {
        success: true,
        rawAccessToken: data.access_token,
        rawRefreshToken: data.refresh_token, // Upstox might not issue a new one, handle safely
        expiresInSeconds: data.expires_in || 86400,
      };
    } catch (err: any) {
      return {
        success: false,
        error: err?.message || 'Failed to refresh token from Upstox API',
      };
    }
  }

  private async upstoxFetch(endpoint: string, accessToken: string, options: RequestInit = {}) {
    const url = `https://api.upstox.com/v2${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    };
    
    if (options.method === 'POST' || options.method === 'PUT') {
      headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    const data = await response.json();
    
    if (!response.ok || data.status === 'error') {
      throw new Error(data?.errors?.[0]?.message || data?.message || 'Upstox API Error');
    }
    
    return data.data;
  }

  async getProfile(accessToken: string): Promise<any> {
    const data = await this.upstoxFetch('/user/profile', accessToken);
    return {
      userId: data.user_id,
      name: data.user_name,
      email: data.email,
      broker: data.broker || 'Upstox',
    };
  }

  async getFunds(accessToken: string): Promise<any> {
    const data = await this.upstoxFetch('/user/get-funds-and-margin', accessToken);
    const equity = data?.equity || {};
    return {
      totalCapital: (equity.available_margin || 0) + (equity.used_margin || 0),
      availableMargin: equity.available_margin || 0,
      usedMargin: equity.used_margin || 0,
      collateralMargin: equity.span_margin || 0,
    };
  }

  async getHoldings(accessToken: string): Promise<any> {
    const data = await this.upstoxFetch('/portfolio/long-term-holdings', accessToken);
    return (data || []).map((h: any) => ({
      id: h.instrument_token || h.trading_symbol || `h_${Math.random()}`,
      symbol: h.trading_symbol || h.company_name,
      quantity: h.quantity,
      avgPrice: h.average_price,
      ltp: h.last_price,
      pnl: h.pnl,
      dayChange: h.day_change_percentage,
    }));
  }

  async getPositions(accessToken: string): Promise<any> {
    const data = await this.upstoxFetch('/portfolio/short-term-positions', accessToken);
    return (data || []).map((p: any) => ({
      id: p.instrument_token || p.trading_symbol || `p_${Math.random()}`,
      symbol: p.trading_symbol,
      quantity: p.quantity || p.net_quantity,
      avgPrice: p.average_price || p.buy_price,
      ltp: p.last_price,
      pnl: p.pnl,
      product: p.product,
    }));
  }

  async getOrders(accessToken: string): Promise<any> {
    const data = await this.upstoxFetch('/order/retrieve-all', accessToken);
    return (data || []).map((o: any) => ({
      orderId: o.order_id,
      status: o.status,
      message: o.status_message || o.status,
      timestamp: o.order_timestamp,
    }));
  }

  async placeOrder(accessToken: string, orderData: any): Promise<any> {
    const payload = {
      quantity: orderData.quantity || 1,
      product: orderData.product || 'D',
      validity: orderData.validity || 'DAY',
      price: orderData.price || 0,
      tag: orderData.tag || 'tradingcore',
      instrument_token: orderData.instrument_token || orderData.symbol,
      order_type: orderData.order_type || (orderData.price ? 'LIMIT' : 'MARKET'),
      transaction_type: orderData.side ? orderData.side.toUpperCase() : 'BUY',
      disclosed_quantity: 0,
      trigger_price: orderData.trigger_price || 0,
      is_amo: false
    };

    const data = await this.upstoxFetch('/order/place', accessToken, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return {
      orderId: data.order_id,
      status: 'PENDING',
      message: 'Order placed successfully',
      timestamp: new Date().toISOString()
    };
  }

  async modifyOrder(accessToken: string, orderId: string, orderData: any): Promise<any> {
    const payload = {
      order_id: orderId,
      quantity: orderData.quantity,
      validity: orderData.validity || 'DAY',
      price: orderData.price,
      order_type: orderData.order_type || (orderData.price ? 'LIMIT' : 'MARKET'),
      trigger_price: orderData.trigger_price || 0,
    };

    const data = await this.upstoxFetch('/order/modify', accessToken, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    return {
      orderId: data.order_id,
      status: 'PENDING',
      message: 'Order modified successfully',
      timestamp: new Date().toISOString()
    };
  }

  async cancelOrder(accessToken: string, orderId: string): Promise<any> {
    const data = await this.upstoxFetch(`/order/cancel?order_id=${orderId}`, accessToken, {
      method: 'DELETE'
    });
    return {
      success: true,
      message: `Order ${orderId} cancelled`,
    };
  }
}

export class DhanAdapter extends BaseBroker {
  readonly brokerId = 'dhan';
  readonly name = 'Dhan HQ';

  getAuthUrl(redirectUri: string, state: string, clientId?: string): string {
    const key = clientId || process.env.DHAN_CLIENT_ID || 'dhan_client_102';
    return `https://auth.dhan.co/oauth/authorize?response_type=code&client_id=${encodeURIComponent(key)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `dhan_access_${code.substring(0, 10)}_${Date.now()}`,
      rawRefreshToken: `dhan_refresh_${Date.now()}`,
      expiresInSeconds: 86400,
      clientCode: `DHN_${Math.floor(1000 + Math.random() * 9000)}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `dhan_access_refreshed_${refreshToken.substring(0, 6)}_${Date.now()}`,
      expiresInSeconds: 86400,
    };
  }
}

export class AngelAdapter extends BaseBroker {
  readonly brokerId = 'angelone';
  readonly name = 'Angel One SmartAPI';

  getAuthUrl(redirectUri: string, state: string, clientId?: string): string {
    const key = clientId || process.env.ANGEL_CLIENT_ID || 'angel_app_key';
    return `https://smartapi.angelone.in/publisher-login?api_key=${encodeURIComponent(key)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `angel_access_${code.substring(0, 10)}_${Date.now()}`,
      rawRefreshToken: `angel_refresh_${Date.now()}`,
      expiresInSeconds: 86400,
      clientCode: `ANG_${Math.floor(1000 + Math.random() * 9000)}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `angel_access_refreshed_${refreshToken.substring(0, 6)}_${Date.now()}`,
      expiresInSeconds: 86400,
    };
  }
}

export class FyersAdapter extends BaseBroker {
  readonly brokerId = 'fyers';
  readonly name = 'Fyers Direct';

  getAuthUrl(redirectUri: string, state: string, clientId?: string): string {
    const key = clientId || process.env.FYERS_CLIENT_ID || 'FYERS_APP_ID';
    return `https://api-v3.fyers.in/api/v3/generate-authcode?client_id=${encodeURIComponent(key)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `fyers_access_${code.substring(0, 10)}_${Date.now()}`,
      rawRefreshToken: `fyers_refresh_${Date.now()}`,
      expiresInSeconds: 86400,
      clientCode: `FY_${Math.floor(1000 + Math.random() * 9000)}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `fyers_access_refreshed_${refreshToken.substring(0, 6)}_${Date.now()}`,
      expiresInSeconds: 86400,
    };
  }
}

export class GrowwAdapter extends BaseBroker {
  readonly brokerId = 'groww';
  readonly name = 'Groww Developer API';

  getAuthUrl(redirectUri: string, state: string, clientId?: string): string {
    const key = clientId || process.env.GROWW_CLIENT_ID || 'groww_app_id';
    return `https://groww.in/developer/login?client_id=${encodeURIComponent(key)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `groww_access_${code.substring(0, 10)}_${Date.now()}`,
      rawRefreshToken: `groww_refresh_${Date.now()}`,
      expiresInSeconds: 86400,
      clientCode: `GRW_${Math.floor(1000 + Math.random() * 9000)}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `groww_access_refreshed_${refreshToken.substring(0, 6)}_${Date.now()}`,
      expiresInSeconds: 86400,
    };
  }
}

export class ICICIAdapter extends BaseBroker {
  readonly brokerId = 'icicidirect';
  readonly name = 'ICICI Breeze API';

  getAuthUrl(redirectUri: string, state: string, clientId?: string): string {
    const key = clientId || process.env.ICICI_CLIENT_ID || 'icici_breeze_key';
    return `https://api.icicidirect.com/apiDirect/login?api_key=${encodeURIComponent(key)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `icici_access_${code.substring(0, 10)}_${Date.now()}`,
      rawRefreshToken: `icici_refresh_${Date.now()}`,
      expiresInSeconds: 86400,
      clientCode: `ICI_${Math.floor(1000 + Math.random() * 9000)}`,
    };
  }

  async refreshToken(refreshToken: string): Promise<TokenExchangeResult> {
    return {
      success: true,
      rawAccessToken: `icici_access_refreshed_${refreshToken.substring(0, 6)}_${Date.now()}`,
      expiresInSeconds: 86400,
    };
  }
}
