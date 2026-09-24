import crypto from 'node:crypto';
import { BaseBroker, TokenExchangeResult } from './BaseBroker.js';
import { withBrokerRequestGate } from '../BrokerRequestGate.js';

export class UpstoxAdapter extends BaseBroker {
  readonly brokerId = 'upstox';
  readonly name = 'Upstox Pro';

  getAuthUrl(redirectUri: string, state: string, clientId?: string): string {
    const key = process.env.UPSTOX_CLIENT_ID;
    if (!key) throw new Error('UPSTOX_CLIENT_ID is not configured');
    return `https://api.upstox.com/v2/login/authorization/dialog?response_type=code&client_id=${encodeURIComponent(key)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, redirectUri: string, clientId?: string): Promise<TokenExchangeResult> {
    const key = process.env.UPSTOX_CLIENT_ID;
    const secret = process.env.UPSTOX_CLIENT_SECRET;
    if (!key || !secret) return { success: false, error: 'Upstox OAuth is not configured' };

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
    const key = process.env.UPSTOX_CLIENT_ID;
    const secret = process.env.UPSTOX_CLIENT_SECRET;
    if (!key || !secret) return { success: false, error: 'Upstox OAuth is not configured' };

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
    // Upstox Fund & Margin V3 is now the preferred endpoint.
    const response = await fetch('https://api.upstox.com/v3/user/get-funds-and-margin', {
      headers: { Accept: 'application/json', 'Api-Version': '3.0', Authorization: `Bearer ${accessToken}` },
    });
    const payload = await response.json();
    if (!response.ok || payload?.status === 'error') {
      throw new Error(payload?.errors?.[0]?.message || payload?.message || 'Upstox funds API error');
    }
    const data = payload?.data || {};
    const available = Number(data?.available_to_trade?.total || 0);
    const cash = data?.available_to_trade?.cash_available_to_trade || {};
    const marginUsed = Number(cash?.margin_used?.total || data?.available_to_trade?.pledge_available_to_trade?.margin_used?.total || 0);
    return {
      totalCapital: available + marginUsed,
      availableMargin: available,
      usedMargin: marginUsed,
      collateralMargin: Number(data?.available_to_trade?.pledge_available_to_trade?.total || 0),
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

  async getTrades(accessToken: string): Promise<any> {
    const data = await this.upstoxFetch('/order/trades/get-trades-for-day', accessToken);
    return (data || []).map((trade: any) => ({ tradeId: trade.trade_id, orderId: trade.order_id, symbol: trade.trading_symbol, side: trade.transaction_type, quantity: trade.quantity, price: trade.average_price, timestamp: trade.trade_timestamp, product: trade.product }));
  }

  async getMarketQuotes(accessToken: string, instrumentKeys: string[]): Promise<any> {
    if (!instrumentKeys.length) return {};
    // Chart heartbeat lane: quotes are sampled every few seconds by the browser.
    // Keep this request independent from the heavier shared REST queue and give
    // the broker call a hard timeout so one stalled upstream request can never
    // freeze the chart until Vercel's 300-second function timeout.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_500);
    try {
      const query = encodeURIComponent(instrumentKeys.join(','));
      const response = await fetch(`https://api-t1.fyers.in/data/quotes?symbols=${query}`, {
        signal: controller.signal,
        headers: { Accept: 'application/json', Authorization: this.authorization(accessToken), version: '3' },
      });
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        const error: any = new Error(`Fyers quotes returned a non-JSON response (${response.status})`);
        error.status = response.status;
        throw error;
      }
      if (!response.ok || data?.s === 'error') {
        const error: any = new Error(data?.message || `Fyers quotes failed (${response.status})`);
        error.status = response.status;
        error.brokerRateLimited = response.status === 429 || Number(data?.code) === 429;
        throw error;
      }
      return Object.fromEntries((data?.d || []).map((q: any) => [
        q.n || q.v?.symbol,
        {
          ltp: Number(q.v?.lp || 0),
          chg: String(q.v?.chp ?? q.v?.ch ?? 0),
          change: Number(q.v?.ch ?? 0),
          changePercent: Number(q.v?.chp ?? 0),
          volume: Number(q.v?.volume ?? 0),
          bid: Number(q.v?.bid ?? 0),
          ask: Number(q.v?.ask ?? 0),
          timestamp: new Date().toISOString(),
        },
      ]));
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        const timeoutError: any = new Error('Fyers quotes request timed out');
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
  async getHistoricalData(accessToken: string, instrumentKey: string, interval: string): Promise<any> {
    // Upstox Historical Candle V3 uses /{unit}/{interval}; do not send the old
    // V2-style `5minute` path. V3 supports minutes 1-300, hours 1-5 and day.
    const v3: Record<string, { unit: string; value: string }> = {
      '1minute': { unit: 'minutes', value: '1' },
      '3minute': { unit: 'minutes', value: '3' },
      '5minute': { unit: 'minutes', value: '5' },
      '15minute': { unit: 'minutes', value: '15' },
      '30minute': { unit: 'minutes', value: '30' },
      '60minute': { unit: 'hours', value: '1' },
      'day': { unit: 'days', value: '1' },
    };
    const config = v3[interval];
    if (!config) throw new Error(`Unsupported Upstox V3 interval: ${interval}`);

    const toDate = new Date().toISOString().slice(0, 10);
    // Keep enough history for VWAP, ATR and structural levels. V3 allows
    // minute/hour history from Jan 2022 with interval-specific retrieval limits.
    const minutesPerCandle = config.unit === 'minutes' ? Number(config.value) : config.unit === 'hours' ? Number(config.value) * 60 : 1440;
    // Request enough calendar history to target 25,000 bars; exchanges may impose their own maximum.
    const lookbackDays = config.unit === 'days' ? 25000 : Math.min(3650, Math.max(30, Math.ceil((25000 * minutesPerCandle) / (24 * 60)) + 7));
    const fromDate = new Date(Date.now() - lookbackDays * 86400000).toISOString().slice(0, 10);
    const response = await fetch(
      `https://api.upstox.com/v3/historical-candle/${encodeURIComponent(instrumentKey)}/${config.unit}/${config.value}/${toDate}/${fromDate}`,
      { headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` } },
    );
    const payload = await response.json();
    if (!response.ok || payload?.status === 'error') {
      throw new Error(payload?.errors?.[0]?.message || payload?.message || 'Upstox V3 historical candle API error');
    }
    return (payload?.data?.candles || []).map((candle: any[]) => ({
      timestamp: candle[0], open: Number(candle[1]), high: Number(candle[2]), low: Number(candle[3]), close: Number(candle[4]), volume: Number(candle[5] || 0),
    })).slice(-25000);
  }

  async getOptionChain(accessToken: string, instrumentKey: string, expiryDate: string): Promise<any> {
    const data = await this.upstoxFetch(`/option/chain?instrument_key=${encodeURIComponent(instrumentKey)}&expiry_date=${encodeURIComponent(expiryDate)}`, accessToken);
    const rows = (data || []).map((row: any) => ({ strike: Number(row.strike_price), expiry: row.expiry, underlyingKey: row.underlying_key, call: normalizeOptionQuote(row.call_options), put: normalizeOptionQuote(row.put_options) })).filter((row: any) => Number.isFinite(row.strike));
    const spot = Number(data?.[0]?.underlying_spot_price || 0);
    // Keep the wire payload tight: seven strikes on either side of ATM is enough
    // for the chart's compact OI support/resistance selection.
    const strikes: number[] = [...new Set<number>(rows.map((r: any) => Number(r.strike)).filter(Number.isFinite))].sort((a, b) => a - b);
    const atm = strikes.reduce((best: number, strike: number, i: number) => Math.abs(strike - spot) < Math.abs(strikes[best] - spot) ? i : best, 0);
    const keep = new Set(strikes.slice(Math.max(0, atm - 7), atm + 8));
    return { underlyingKey: instrumentKey, expiry: data?.[0]?.expiry || expiryDate, spot, contracts: rows.filter((row: any) => keep.has(row.strike)) };
  }

  async placeOrder(accessToken: string, orderData: any): Promise<any> {
    validateUpstoxOrder(orderData);
    const payload = {
      quantity: orderData.quantity || 1,
      product: normalizeUpstoxProduct(orderData.product),
      validity: orderData.validity || 'DAY',
      price: orderData.price || 0,
      tag: orderData.tag || 'tradingcore',
      instrument_token: orderData.instrument_token,
      order_type: normalizeUpstoxOrderType(orderData.order_type || orderData.orderType),
      transaction_type: orderData.side ? orderData.side.toUpperCase() : 'BUY',
      disclosed_quantity: 0,
      trigger_price: orderData.trigger_price || 0,
      is_amo: Boolean(orderData.is_amo),
      slice: Boolean(orderData.slice),
      market_protection: orderData.market_protection ?? -1,
    };

    const data = await this.upstoxHftFetch('/v3/order/place', accessToken, {
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

    const data = await this.upstoxHftFetch('/v3/order/modify', accessToken, {
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
    const data = await this.upstoxHftFetch(`/v3/order/cancel?order_id=${encodeURIComponent(orderId)}`, accessToken, {
      method: 'DELETE'
    });
    return {
      success: true,
      message: `Order ${orderId} cancelled`,
    };
  }

  private async upstoxHftFetch(path: string, accessToken: string, options: RequestInit = {}) {
    const response = await fetch(`https://api-hft.upstox.com${path}`, { ...options, headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json', ...options.headers } });
    const data = await response.json();
    if (!response.ok || data.status === 'error') throw new Error(data?.errors?.[0]?.message || data?.message || 'Upstox API error');
    return data.data;
  }
}

function validateUpstoxOrder(order: any): void {
  if (!Number.isInteger(order.quantity) || order.quantity <= 0) throw new Error('Quantity must be a positive whole number');
  if (!/^[A-Z_]+\|.+$/.test(order.instrument_token || '')) throw new Error('A valid Upstox instrument token is required');
  if (!['BUY', 'SELL', 'Buy', 'Sell'].includes(order.side)) throw new Error('Order side must be BUY or SELL');
  if (!['D', 'I', 'MTF', 'CNC', 'MIS', 'NRML'].includes(order.product)) throw new Error('Unsupported product');
  if (!['MARKET', 'LIMIT', 'SL', 'SL-M', 'Market', 'Limit'].includes(order.order_type || order.orderType)) throw new Error('Unsupported order type');
  const type = (order.order_type || order.orderType).toUpperCase();
  if ((type === 'LIMIT' || type === 'SL') && !(Number(order.price) > 0)) throw new Error('A positive price is required for limit and SL orders');
  if ((type === 'SL' || type === 'SL-M') && !(Number(order.trigger_price ?? order.triggerPrice) > 0)) throw new Error('A positive trigger price is required for stop-loss orders');
}

function normalizeUpstoxProduct(product: string): string {
  return ({ CNC: 'D', MIS: 'I', NRML: 'D' } as Record<string, string>)[product] || product;
}

function normalizeUpstoxOrderType(orderType: string): string {
  return ({ Market: 'MARKET', Limit: 'LIMIT' } as Record<string, string>)[orderType] || orderType;
}

function normalizeOptionQuote(option: any) {
  if (!option) return undefined;
  const market = option.market_data || {};
  return { instrumentKey: option.instrument_key, ltp: market.ltp, volume: market.volume, oi: market.oi, previousOi: market.prev_oi, bidPrice: market.bid_price, bidQuantity: market.bid_qty, askPrice: market.ask_price, askQuantity: market.ask_qty };
}

export class FyersAdapter extends BaseBroker {
  readonly brokerId = 'fyers';
  readonly name = 'Fyers Direct';

  getAuthUrl(redirectUri: string, state: string, _clientId?: string): string {
    const appId = process.env.FYERS_CLIENT_ID;
    if (!appId) throw new Error('FYERS_CLIENT_ID is not configured');
    return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, _redirectUri: string, _clientId?: string): Promise<TokenExchangeResult> {
    const appId = process.env.FYERS_CLIENT_ID;
    const secret = process.env.FYERS_CLIENT_SECRET;
    if (!appId || !secret) {
      return { success: false, error: 'Fyers OAuth is not configured. Set FYERS_CLIENT_ID and FYERS_CLIENT_SECRET on the server.' };
    }

    try {
      const appIdHash = crypto.createHash('sha256').update(`${appId}:${secret}`).digest('hex');
      const response = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ grant_type: 'authorization_code', appIdHash, code }),
      });

      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); }
      catch { return { success: false, error: `Fyers returned a non-JSON response (${response.status}).` }; }

      if (!response.ok || data?.s === 'error' || !data?.access_token) {
        return {
          success: false,
          error: data?.message || data?.error?.message || `Fyers token exchange failed (${response.status}).`,
        };
      }

      return {
        success: true,
        rawAccessToken: data.access_token,
        rawRefreshToken: data.refresh_token,
        expiresInSeconds: Number(data.expires_in || data.expiresIn || 86400),
        clientCode: data.fy_id || data.user_id || data.client_id,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Failed to connect to Fyers API' };
    }
  }

  async refreshToken(_refreshToken: string): Promise<TokenExchangeResult> {
    // Do not place a user's trading PIN in a global server environment variable.
    // Fyers refresh-token rotation may require user-specific broker auth state;
    // until that flow is implemented safely, TradingCore asks the user to
    // re-authorize instead of storing or forwarding a PIN.
    return { success: false, error: 'Fyers session refresh requires broker re-authorization.' };

  }

  private authorization(accessToken: string): string {
    const appId = process.env.FYERS_CLIENT_ID;
    if (!appId) throw new Error('FYERS_CLIENT_ID is not configured');
    return `${appId}:${accessToken}`;
  }

  private async fyersFetch(path: string, accessToken: string, options: RequestInit = {}): Promise<any> {
    // FYERS rate limits are account-wide across REST endpoints, not just the
    // history endpoint. Route every ordinary FYERS REST call through the same
    // per-token gate so portfolio polling, quotes, options and order activity
    // cannot consume the history budget behind the chart's back.
    return withBrokerRequestGate('fyers', accessToken, async () => {
      const response = await fetch(`https://api-t1.fyers.in/api/v3${path}`, {
        ...options,
        headers: {
          Accept: 'application/json',
          Authorization: this.authorization(accessToken),
          'Content-Type': 'application/json',
          version: '3',
          ...(options.headers || {}),
        },
      });
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); }
      catch {
        const error: any = new Error(`Fyers returned a non-JSON response (${response.status})`);
        error.status = response.status;
        throw error;
      }

      if (!response.ok || data?.s === 'error' || (typeof data?.code === 'number' && data.code < 0)) {
        const error: any = new Error(data?.message || `Fyers API error (${response.status})`);
        error.status = response.status || (Number(data?.code) === 429 ? 429 : 0);
        error.brokerRateLimited = error.status === 429 || Number(data?.code) === 429;
        throw error;
      }
      return data;
    });
  }

  async getProfile(accessToken: string): Promise<any> {
    const data = await this.fyersFetch('/profile', accessToken);
    const p = data?.data || {};
    return {
      userId: p.fy_id,
      name: p.name || p.display_name || p.fy_id,
      email: p.email_id || '',
      broker: 'Fyers',
    };
  }

  async getFunds(accessToken: string): Promise<any> {
    const data = await this.fyersFetch('/funds', accessToken);
    const limits = Array.isArray(data?.fund_limit) ? data.fund_limit : [];
    const pick = (keys: string[]) => {
      const row = limits.find((x: any) => keys.some((k) => String(x?.title || '').toLowerCase().includes(k)));
      return Number(row?.availableAmount ?? row?.available_amount ?? row?.equityAmount ?? row?.amount ?? 0) || 0;
    };
    const availableMargin = pick(['available', 'cash', 'equity']);
    const usedMargin = Number(data?.usedMargin ?? data?.utilizedAmount ?? 0) || 0;
    const totalCapital = Number(data?.totalCapital ?? data?.equityAmount ?? 0) || (availableMargin + usedMargin);
    return { totalCapital, availableMargin, usedMargin, collateralMargin: 0 };
  }

  async getHoldings(accessToken: string): Promise<any> {
    const data = await this.fyersFetch('/holdings', accessToken);
    const rows = data?.holdings || [];
    return rows.map((h: any) => ({
      id: h.fytoken || h.symbol,
      symbol: h.symbol,
      quantity: Number(h.remainingQuantity ?? h.quantity ?? 0),
      avgPrice: Number(h.costPrice ?? h.avgPrice ?? 0),
      ltp: Number(h.ltp ?? 0),
      pnl: Number(h.pnl ?? 0),
      dayChange: Number(h.dayChange ?? h.chp ?? 0),
    }));
  }

  async getPositions(accessToken: string): Promise<any> {
    const data = await this.fyersFetch('/positions', accessToken);
    const rows = data?.netPositions || [];
    return rows.map((p: any) => ({
      id: p.id || `${p.symbol}-${p.productType || ''}`,
      symbol: p.symbol,
      quantity: Number(p.netQty ?? p.qty ?? 0),
      avgPrice: Number(p.buyAvg ?? p.avgPrice ?? 0),
      ltp: Number(p.ltp ?? 0),
      pnl: Number(p.pl ?? p.pnl ?? 0),
      product: p.productType || 'INTRADAY',
    }));
  }

  async getOrders(accessToken: string): Promise<any> {
    const data = await this.fyersFetch('/orders', accessToken);
    const rows = data?.orderBook || [];
    return rows.map((o: any) => ({
      orderId: o.id || o.orderId,
      status: o.status || o.orderStatus || 'UNKNOWN',
      message: o.message || o.messageString || '',
      timestamp: o.orderDateTime || o.orderDate || new Date().toISOString(),
    }));
  }

  async getTrades(accessToken: string): Promise<any> {
    const data = await this.fyersFetch('/tradebook', accessToken);
    const rows = data?.tradeBook || [];
    return rows.map((t: any) => ({
      tradeId: t.tradeId || t.id,
      orderId: t.orderNumber || t.orderId,
      symbol: t.symbol,
      side: Number(t.side) === -1 ? 'Sell' : 'Buy',
      quantity: Number(t.tradedQty ?? t.qty ?? 0),
      price: Number(t.tradePrice ?? t.price ?? 0),
      timestamp: t.orderDateTime || t.tradeDateTime || new Date().toISOString(),
      product: t.productType || 'INTRADAY',
    }));
  }

  async getMarketQuotes(accessToken: string, instrumentKeys: string[]): Promise<any> {
    return withBrokerRequestGate('fyers', accessToken, async () => {
      const query = encodeURIComponent(instrumentKeys.join(','));
      const response = await fetch(`https://api-t1.fyers.in/data/quotes?symbols=${query}`, {
        headers: { Accept: 'application/json', Authorization: this.authorization(accessToken), version: '3' },
      });
      const text = await response.text();
      let data: any;
      try { data = JSON.parse(text); } catch {
        const error: any = new Error(`Fyers quotes returned a non-JSON response (${response.status})`);
        error.status = response.status;
        throw error;
      }
      if (!response.ok || data?.s === 'error') {
        const error: any = new Error(data?.message || `Fyers quotes failed (${response.status})`);
        error.status = response.status;
        error.brokerRateLimited = response.status === 429 || Number(data?.code) === 429;
        throw error;
      }
      return Object.fromEntries((data?.d || []).map((q: any) => [
        q.n || q.v?.symbol,
        { ltp: Number(q.v?.lp || 0), chg: String(q.v?.chp ?? q.v?.ch ?? 0), volume: Number(q.v?.volume ?? 0), bid: Number(q.v?.bid ?? 0), ask: Number(q.v?.ask ?? 0), timestamp: new Date().toISOString() },
      ]));
    });
  }

  async getHistoricalData(accessToken: string, instrumentKey: string, interval: string): Promise<any> {
    const resolutionMap: Record<string, string> = {
      '1minute': '1', '2minute': '2', '3minute': '3', '5minute': '5', '10minute': '10',
      '15minute': '15', '20minute': '20', '30minute': '30', '60minute': '60',
      '120minute': '120', '240minute': '240', 'day': 'D', '1day': 'D', 'week': '1W', 'month': '1M',
    };
    const resolution = resolutionMap[interval] || interval;
    if (!resolution) throw new Error(`Unsupported Fyers history interval: ${interval}`);
    const to = Math.floor(Date.now() / 1000);
    const minutesPerCandle = /^\d+$/.test(resolution) ? Math.max(1, Number(resolution)) : 1440;
    const lookbackDays = resolution === 'D' ? 366 : Math.min(100, Math.max(30, Math.ceil((25000 * minutesPerCandle) / 375 * 1.1)));
    const from = to - lookbackDays * 86400;
    const params = new URLSearchParams({ symbol: instrumentKey, resolution, date_format: '0', range_from: String(from), range_to: String(to) });
    const response = await fetch(`https://api-t1.fyers.in/data/history?${params.toString()}`, { headers: { Accept: 'application/json', Authorization: this.authorization(accessToken) } });
    const text = await response.text();
    let data: any;
    try { data = JSON.parse(text); } catch { throw Object.assign(new Error(`Fyers history returned a non-JSON response (${response.status})`), { status: response.status }); }
    if (!response.ok || data?.s === 'error') {
      const error: any = new Error(data?.message || `Fyers history failed (${response.status})`);
      error.status = response.status || (Number(data?.code) === 429 ? 429 : 0);
      error.brokerCode = Number(data?.code) || undefined;
      throw error;
    }
    return (data?.candles || []).map((c: any[]) => ({ timestamp: new Date(Number(c[0]) * 1000).toISOString(), open: Number(c[1]), high: Number(c[2]), low: Number(c[3]), close: Number(c[4]), volume: Number(c[5] || 0) })).slice(-25000);
  }

  async getOptionChain(accessToken: string, instrumentKey: string, expiryDate: string): Promise<any> {
    // FYERS v3 options-chain endpoint returns CE/PE legs, OI, change-OI and
    // previous-session OI in one snapshot. Keep the request centred on ATM
    // with seven strikes on either side so the chart can select meaningful
    // 3–7 strike OI support/resistance without downloading the full chain.
    const params = new URLSearchParams({ symbol: instrumentKey, strikecount: '7' });
    if (expiryDate && expiryDate !== 'current_week' && /^\d+$/.test(expiryDate)) params.set('timestamp', expiryDate);
    const response = await withBrokerRequestGate('fyers', accessToken, () => fetch(`https://api-t1.fyers.in/data/options-chain-v3?${params.toString()}`, {
      headers: { Accept: 'application/json', Authorization: this.authorization(accessToken) },
    }));
    const text = await response.text();
    let payload: any;
    try { payload = JSON.parse(text); } catch {
      const error: any = new Error(`Fyers option-chain returned a non-JSON response (${response.status})`);
      error.status = response.status;
      throw error;
    }
    if (!response.ok || payload?.s === 'error') {
      const error: any = new Error(payload?.message || `Fyers option-chain failed (${response.status})`);
      error.status = response.status;
      error.brokerRateLimited = response.status === 429 || Number(payload?.code) === 429;
      throw error;
    }

    const data = payload?.data || {};
    const rows = Array.isArray(data?.optionsChain) ? data.optionsChain : [];
    const spotRow = rows.find((row: any) => !row?.option_type || row?.strike_price === -1);
    const spot = Number(spotRow?.ltp || 0) || undefined;
    const selectedExpiry = String(expiryDate && expiryDate !== 'current_week' ? expiryDate : data?.expiryData?.[0]?.expiry || 'current_week');
    const byStrike = new Map<number, any>();
    for (const row of rows) {
      const optionType = String(row?.option_type || '').toUpperCase();
      const strike = Number(row?.strike_price);
      if (!Number.isFinite(strike) || strike < 0 || (optionType !== 'CE' && optionType !== 'PE')) continue;
      const current = byStrike.get(strike) || { strike, expiry: selectedExpiry, underlyingKey: instrumentKey };
      const quote = {
        instrumentKey: row?.fyToken || row?.symbol,
        ltp: Number(row?.ltp || 0),
        volume: Number(row?.volume || 0),
        oi: Number(row?.oi || 0),
        previousOi: Number(row?.prev_oi ?? row?.oi ?? 0),
        bidPrice: Number(row?.bid || 0),
        askPrice: Number(row?.ask || 0),
      };
      if (optionType === 'CE') current.call = quote;
      else current.put = quote;
      byStrike.set(strike, current);
    }
    return { underlyingKey: instrumentKey, expiry: selectedExpiry, spot, contracts: [...byStrike.values()].sort((a, b) => a.strike - b.strike) };
  }

  private orderPayload(orderData: any): any {
    const typeMap: Record<string, number> = { MARKET: 2, LIMIT: 1, SL: 3, 'SL-M': 4 };
    const productMap: Record<string, string> = { CNC: 'CNC', MIS: 'INTRADAY', NRML: 'MARGIN' };
    const type = String(orderData.order_type || orderData.orderType || 'MARKET').toUpperCase();
    return {
      symbol: orderData.symbol,
      qty: Number(orderData.quantity || orderData.qty || 0),
      type: typeMap[type] || Number(orderData.type || 2),
      side: String(orderData.side || '').toUpperCase() === 'SELL' || orderData.side === -1 ? -1 : 1,
      productType: productMap[orderData.product] || orderData.product || 'INTRADAY',
      limitPrice: Number(orderData.price || orderData.limitPrice || 0),
      stopPrice: Number(orderData.triggerPrice || orderData.trigger_price || orderData.stopPrice || 0),
      validity: orderData.validity || 'DAY',
      disclosedQty: Number(orderData.disclosedQty || 0),
      offlineOrder: Boolean(orderData.offlineOrder),
      stopLoss: Number(orderData.stopLoss || 0),
      takeProfit: Number(orderData.takeProfit || 0),
    };
  }

  async placeOrder(accessToken: string, orderData: any): Promise<any> {
    const data = await this.fyersFetch('/orders/sync', accessToken, {
      method: 'POST',
      body: JSON.stringify(this.orderPayload(orderData)),
    });
    const result = data?.data || data;
    return {
      orderId: result?.id || result?.orderId,
      status: 'PENDING',
      message: data?.message || 'Order placed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  async modifyOrder(accessToken: string, orderId: string, orderData: any): Promise<any> {
    const type = String(orderData.order_type || orderData.orderType || '').toUpperCase();
    const payload: any = { id: orderId };
    if (orderData.quantity || orderData.qty) payload.qty = Number(orderData.quantity || orderData.qty);
    if (orderData.price || orderData.limitPrice) payload.limitPrice = Number(orderData.price || orderData.limitPrice);
    if (orderData.triggerPrice || orderData.trigger_price) payload.stopPrice = Number(orderData.triggerPrice || orderData.trigger_price);
    if (type) payload.type = ({ MARKET: 2, LIMIT: 1, SL: 3, 'SL-M': 4 } as Record<string, number>)[type] || Number(orderData.type);
    const data = await this.fyersFetch('/orders/sync', accessToken, { method: 'PATCH', body: JSON.stringify(payload) });
    return { orderId, status: 'PENDING', message: data?.message || 'Order modified successfully', timestamp: new Date().toISOString() };
  }

  async cancelOrder(accessToken: string, orderId: string): Promise<any> {
    await this.fyersFetch(`/orders/sync?id=${encodeURIComponent(orderId)}`, accessToken, { method: 'DELETE' });
    return { success: true, message: `Order ${orderId} cancelled` };
  }
}
