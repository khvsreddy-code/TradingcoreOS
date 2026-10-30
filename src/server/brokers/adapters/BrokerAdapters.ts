import crypto from 'node:crypto';
import { BaseBroker, TokenExchangeResult } from './BaseBroker.js';
import { withBrokerRequestGate } from '../BrokerRequestGate.js';
import { FyersApiClient } from '../../fyers/core/FyersApiClient.js';
import {
  assertFyersQuoteBatch,
  DEFAULT_FYERS_CAPABILITIES,
  resolveFyersCapabilities,
  resolveFyersAdmissionBudget,
  type FyersApiCategory,
  type FyersCapabilities,
} from '../../fyers/core/FyersCapabilities.js';
import { recordFyersQuotaAttempt, recordFyersQuotaResponse } from '../../fyers/core/FyersQuotaTelemetry.js';
import { API_LATENCY_BUDGET_MS, timeoutSignal } from '../../latency/budgets.js';
import type {
  BrokerHistory,
  BrokerMarketQuotes,
  BrokerOptionChain,
  BrokerOrderPayload,
  BrokerProfile,
  CancelResult,
  OrderMutationResult,
} from '../contracts.js';

export class FyersAdapter extends BaseBroker {
  readonly brokerId = 'fyers';
  readonly name = 'Fyers Direct';

  getAuthUrl(redirectUri: string, state: string, _clientId?: string): string {
    const appId = process.env.FYERS_CLIENT_ID;
    if (!appId) throw new Error('FYERS_CLIENT_ID is not configured');
    return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${encodeURIComponent(appId)}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${encodeURIComponent(state)}`;
  }

  async exchangeCodeForToken(code: string, _redirectUri: string, _clientId?: string, rateLimitIdentity?: string): Promise<TokenExchangeResult> {
    const identity = String(rateLimitIdentity || '').trim();
    if (!identity) return { success: false, error: 'Authenticated TradingCore user identity is required for FYERS quota enforcement.' };
    const capabilities = resolveFyersCapabilities(identity);
    const budget = resolveFyersAdmissionBudget(capabilities, 'user-info');
    const appId = process.env.FYERS_CLIENT_ID;
    const secret = process.env.FYERS_CLIENT_SECRET;
    if (!appId || !secret) {
      return { success: false, error: 'Fyers OAuth is not configured. Set FYERS_CLIENT_ID and FYERS_CLIENT_SECRET on the server.' };
    }

    try {
      const appIdHash = crypto.createHash('sha256').update(`${appId}:${secret}`).digest('hex');
      const response = await withBrokerRequestGate('fyers', identity, async (gateSignal) => {
        recordFyersQuotaAttempt('user-info', capabilities.plan, '/validate-authcode');
        try {
          const upstream = await fetch('https://api-t1.fyers.in/api/v3/validate-authcode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
            body: JSON.stringify({ grant_type: 'authorization_code', appIdHash, code }),
            signal: gateSignal || timeoutSignal(12_000),
          });
          recordFyersQuotaResponse('user-info', capabilities.plan, '/validate-authcode', upstream.status);
          return upstream;
        } catch (error) {
          recordFyersQuotaResponse('user-info', capabilities.plan, '/validate-authcode', 0);
          throw error;
        }
      }, timeoutSignal(12_000), {
        // OAuth token exchange consumes the combined FYERS account/API pool too;
        // its observability category remains user-info, but its admission bucket
        // must match the shared User Info + Transaction budget in FyersApiClient.
        budgetKey: 'account',
        minIntervalMs: Math.ceil(1000 / budget.requestsPerSecond),
        maxPerMinute: budget.requestsPerMinute,
        maxPerDay: budget.requestsPerDay,
        priority: 'interactive',
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
      const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
      return { success: false, error: timedOut
        ? 'FYERS token exchange timed out. Start broker authorization again.'
        : err?.message || 'Failed to connect to Fyers API' };
    }
  }

  async refreshToken(_refreshToken: string): Promise<TokenExchangeResult> {
    // Do not place a user's trading PIN in a global server environment variable.
    // Fyers refresh-token rotation may require user-specific broker auth state;
    // until that flow is implemented safely, TradingCore asks the user to
    // re-authorize instead of storing or forwarding a PIN.
    return { success: false, error: 'Fyers session refresh requires broker re-authorization.' };

  }

  private async fyersFetch(
    path: string,
    accessToken: string,
    options: RequestInit = {},
    rateLimitIdentity?: string,
    category?: FyersApiCategory,
  ): Promise<any> {
    const identity = String(rateLimitIdentity || '').trim();
    if (!identity) throw Object.assign(new Error('Authenticated TradingCore user identity is required for FYERS quota enforcement.'), { status:503, code:'BROKER_IDENTITY_REQUIRED' });
    const timeoutMs = path.startsWith('/orders') ? API_LATENCY_BUDGET_MS.order : API_LATENCY_BUDGET_MS.account;
    let body: unknown = options.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { /* Preserve valid non-JSON body formats as-is. */ }
    }
    const client = new FyersApiClient(accessToken, undefined, resolveFyersCapabilities(identity), identity);
    const method = String(options.method || 'GET').toUpperCase();
    const resolvedCategory: FyersApiCategory = category || (method === 'GET' ? 'user-info' : 'transactions');
    return client.apiRequest(path, {
      method,
      body,
      signal: options.signal || timeoutSignal(timeoutMs),
      timeoutMs,
      category: resolvedCategory,
      // This adapter is used by interactive account/order surfaces; speculative
      // history and F&O warm-up use the explicit background priority elsewhere.
      priority: 'interactive',
    });
  }

  async getProfile(accessToken: string, rateLimitIdentity?: string): Promise<BrokerProfile> {
    const data = await this.fyersFetch('/profile', accessToken, {}, rateLimitIdentity, 'user-info');
    const p = data?.data || {};
    return {
      userId: p.fy_id,
      name: p.name || p.display_name || p.fy_id,
      email: p.email_id || '',
      broker: 'Fyers',
    };
  }

  async getFunds(accessToken: string, rateLimitIdentity?: string): Promise<import('../../../services/brokers/BrokerAdapter.js').AccountFunds> {
    const data = await this.fyersFetch('/funds', accessToken, {}, rateLimitIdentity, 'user-info');
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

  async getHoldings(accessToken: string, rateLimitIdentity?: string): Promise<import('../../../services/brokers/BrokerAdapter.js').Holding[]> {
    const data = await this.fyersFetch('/holdings', accessToken, {}, rateLimitIdentity, 'user-info');
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

  async getPositions(accessToken: string, rateLimitIdentity?: string): Promise<import('../../../services/brokers/BrokerAdapter.js').Position[]> {
    const data = await this.fyersFetch('/positions', accessToken, {}, rateLimitIdentity, 'user-info');
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

  async getOrders(accessToken: string, rateLimitIdentity?: string): Promise<import('../../../services/brokers/BrokerAdapter.js').OrderResult[]> {
    const data = await this.fyersFetch('/orders', accessToken, {}, rateLimitIdentity, 'user-info');
    const rows = data?.orderBook || [];
    return rows.map((o: any) => ({
      orderId: o.id || o.orderId,
      status: o.status || o.orderStatus || 'UNKNOWN',
      message: o.message || o.messageString || '',
      timestamp: o.orderDateTime || o.orderDate || new Date().toISOString(),
    }));
  }

  async getTrades(accessToken: string, rateLimitIdentity?: string): Promise<import('../../../services/brokers/BrokerAdapter.js').TradeRecord[]> {
    const data = await this.fyersFetch('/tradebook', accessToken, {}, rateLimitIdentity, 'user-info');
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

  async getMarketQuotes(
    accessToken: string,
    instrumentKeys: string[],
    capabilities: FyersCapabilities = DEFAULT_FYERS_CAPABILITIES,
    rateLimitIdentity?: string,
  ): Promise<BrokerMarketQuotes> {
    const symbols = [...new Set(instrumentKeys.map(value => String(value || '').trim()).filter(Boolean))];
    if (!symbols.length) return {};
    assertFyersQuoteBatch(symbols, capabilities);
    const client = new FyersApiClient(accessToken, undefined, capabilities, rateLimitIdentity);
    const data = await client.dataGet<any>(
      '/quotes',
      { symbols: symbols.join(',') },
      timeoutSignal(API_LATENCY_BUDGET_MS.quote),
      API_LATENCY_BUDGET_MS.quote,
      'interactive',
    );
    return Object.fromEntries((data?.d || []).map((quote: any) => [
      quote.n || quote.v?.symbol,
      {
        ltp: Number(quote.v?.lp || 0),
        chg: String(quote.v?.chp ?? quote.v?.ch ?? 0),
        change: Number(quote.v?.ch ?? 0),
        changePercent: Number(quote.v?.chp ?? 0),
        volume: Number(quote.v?.volume ?? 0),
        bid: Number(quote.v?.bid ?? 0),
        ask: Number(quote.v?.ask ?? 0),
        timestamp: new Date().toISOString(),
      },
    ]));
  }

  async getHistoricalData(
    accessToken: string,
    instrumentKey: string,
    interval: string,
    limit = 2_000,
    capabilities: FyersCapabilities = DEFAULT_FYERS_CAPABILITIES,
    rateLimitIdentity?: string,
  ): Promise<BrokerHistory> {
    const resolutionMap: Record<string, string> = {
      '1minute':'1','2minute':'2','3minute':'3','5minute':'5','10minute':'10',
      '15minute':'15','20minute':'20','30minute':'30','45minute':'45','60minute':'60',
      '120minute':'120','240minute':'240','day':'D','1day':'D','week':'1W','month':'1M',
    };
    const secondsMatch = /^([0-9]+)(?:s|sec|second|seconds)$/i.exec(interval.trim()) || /^([0-9]+)S$/i.exec(interval.trim());
    const resolution = secondsMatch ? `${Number(secondsMatch[1])}S` : (resolutionMap[interval] || interval);
    if (!resolution) throw new Error(`Unsupported Fyers history interval: ${interval}`);
    const secondsInterval = Boolean(secondsMatch);
    if (secondsInterval && !capabilities.secondData) {
      throw Object.assign(
        new Error('Seconds-level historical data requires a verified FYERS Prime entitlement.'),
        { status:403, code:'FYERS_SECONDS_DATA_REQUIRES_PRIME' },
      );
    }

    const requestedLimit = Math.max(2, Math.min(2_000, Math.floor(Number(limit) || 2_000)));
    const now = new Date();
    const to = Math.floor(now.getTime() / 1000);
    const dailyResolution = ['D','1D','1W','1M','W','M'].includes(resolution.toUpperCase());
    const allowedYears = dailyResolution ? capabilities.historyDepth.dailyYears : capabilities.historyDepth.intradayYears;
    const operationalYears = secondsInterval ? 2 : dailyResolution ? 30 : 15;
    const maxLookbackDays = Math.min(7, Math.min(operationalYears, allowedYears ?? operationalYears) * 365);
    const minuteResolution = Number(resolution);
    const barsPerDay = secondsInterval
      ? (6.25 * 60 * 60) / Number(secondsMatch?.[1] || 1)
      : Number.isFinite(minuteResolution) && minuteResolution > 0
        ? (6.25 * 60) / minuteResolution
        : resolution.toUpperCase() === '1W' || resolution.toUpperCase() === 'W'
          ? 1 / 5
          : resolution.toUpperCase() === '1M' || resolution.toUpperCase() === 'M'
            ? 1 / 21
            : 1;
    const estimatedCalendarDays = Math.ceil((requestedLimit / Math.max(1 / 30, barsPerDay)) * 1.65);
    const lookbackDays = Math.min(maxLookbackDays, Math.max(secondsInterval ? 1 : 7, estimatedCalendarDays));
    const from = Math.floor((now.getTime() - lookbackDays * 86_400_000) / 1000);
    const client = new FyersApiClient(accessToken, undefined, capabilities, rateLimitIdentity);

    // FYERS restricts the date span of an individual history request. Request
    // only the estimated lookback needed for the desired candle count, then split
    // that window into compliant chunks. The shared FYERS request gate still
    // enforces this account's per-second/minute/day quota across all chunks.
    const chunkDays = secondsInterval ? 1 : 7;
    const ranges: Array<{ from: number; to: number }> = [];
    let rangeEnd = to;
    while (rangeEnd > from) {
      const rangeStart = Math.max(from, rangeEnd - chunkDays * 86_400);
      ranges.push({ from: rangeStart, to: rangeEnd });
      rangeEnd = rangeStart - 1;
    }

    // Walk newest-to-oldest sequentially. Promise.all would queue every range
    // at once, letting older history sit ahead of later interactive API traffic
    // and causing each queued request's timeout to expire before it is admitted.
    const byTimestamp = new Map<number, { timestamp: string; open: number; high: number; low: number; close: number; volume: number }>();
    for (const range of ranges) {
      const payload = await client.dataGet<any>(
        '/history',
        {
          symbol: instrumentKey,
          resolution,
          date_format: '0',
          range_from: String(range.from),
          range_to: String(range.to),
          cont_flag: '1',
        },
        timeoutSignal(API_LATENCY_BUDGET_MS.history),
        API_LATENCY_BUDGET_MS.history,
        'interactive',
      );
      for (const candle of Array.isArray(payload?.candles) ? payload.candles : []) {
        const timestampMs = Number(candle?.[0]) * 1000;
        const open = Number(candle?.[1]), high = Number(candle?.[2]);
        const low = Number(candle?.[3]), close = Number(candle?.[4]);
        const rawVolume = candle?.[5];
        const volume = rawVolume == null || rawVolume === '' ? 0 : Number(rawVolume);
        if (!Number.isFinite(timestampMs) || timestampMs <= 0
          || ![open, high, low, close, volume].every(Number.isFinite)
          || volume < 0 || high < Math.max(open, close)
          || low > Math.min(open, close) || high < low) continue;
        byTimestamp.set(timestampMs, {
          timestamp: new Date(timestampMs).toISOString(),
          open, high, low, close, volume,
        });
      }
      // Ranges are ordered newest first. Once the requested candle target is
      // met, older pages add no value to this response and would consume quota.
      if (byTimestamp.size >= requestedLimit) break;
    }
    return [...byTimestamp.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, candle]) => candle)
      .slice(-requestedLimit);
  }

  async getOptionChain(
    accessToken: string,
    instrumentKey: string,
    expiryDate: string,
    capabilities: FyersCapabilities = DEFAULT_FYERS_CAPABILITIES,
    rateLimitIdentity?: string,
  ): Promise<BrokerOptionChain> {
    // Keep this legacy adapter compatible with the same Data API quota gate as
    // the dedicated FYERS route. The newer route preserves the fuller chain.
    const params:Record<string,string|number|undefined> = { symbol:instrumentKey, strikecount:'7' };
    if (expiryDate && expiryDate !== 'current_week' && /^[0-9]+$/.test(expiryDate)) params.timestamp=expiryDate;
    const client = new FyersApiClient(accessToken, undefined, capabilities, rateLimitIdentity);
    const payload = await client.dataGet<any>(
      '/options-chain-v3',
      params,
      timeoutSignal(API_LATENCY_BUDGET_MS.depth),
      API_LATENCY_BUDGET_MS.depth,
      'interactive',
    );

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
      ...(typeof orderData.orderTag === 'string' && /^[A-Za-z0-9]{1,30}$/.test(orderData.orderTag)
        ? { orderTag: orderData.orderTag }
        : {}),
    };
  }

  async placeOrder(accessToken: string, orderData: BrokerOrderPayload, rateLimitIdentity?: string): Promise<OrderMutationResult> {
    const data = await this.fyersFetch('/orders/sync', accessToken, {
      method: 'POST',
      body: JSON.stringify(this.orderPayload(orderData)),
    }, rateLimitIdentity, 'transactions');
    const result = data?.data || data;
    return {
      orderId: result?.id || result?.orderId,
      status: 'PENDING',
      message: data?.message || 'Order placed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  async modifyOrder(accessToken: string, orderId: string, orderData: BrokerOrderPayload, rateLimitIdentity?: string): Promise<OrderMutationResult> {
    const type = String(orderData.order_type || orderData.orderType || '').toUpperCase();
    const payload: Record<string, unknown> = { id: orderId };
    if (orderData.quantity || orderData.qty) payload.qty = Number(orderData.quantity || orderData.qty);
    if (orderData.price || orderData.limitPrice) payload.limitPrice = Number(orderData.price || orderData.limitPrice);
    if (orderData.triggerPrice || orderData.trigger_price) payload.stopPrice = Number(orderData.triggerPrice || orderData.trigger_price);
    if (type) payload.type = ({ MARKET: 2, LIMIT: 1, SL: 3, 'SL-M': 4 } as Record<string, number>)[type] || Number(orderData.type);
    const data = await this.fyersFetch('/orders/sync', accessToken, { method: 'PATCH', body: JSON.stringify(payload) }, rateLimitIdentity, 'transactions');
    return { orderId, status: 'PENDING', message: data?.message || 'Order modified successfully', timestamp: new Date().toISOString() };
  }

  async cancelOrder(accessToken: string, orderId: string, rateLimitIdentity?: string): Promise<CancelResult> {
    await this.fyersFetch(`/orders/sync?id=${encodeURIComponent(orderId)}`, accessToken, { method: 'DELETE' }, rateLimitIdentity, 'transactions');
    return { success: true, message: `Order ${orderId} cancelled` };
  }
}
