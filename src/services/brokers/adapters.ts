import { BaseBrokerAdapter } from './BaseBrokerAdapter';
import { BrokerCapabilities } from './BrokerAdapter';

export class FyersAdapter extends BaseBrokerAdapter {
  readonly id = 'fyers';
  readonly name = 'Fyers';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity', 'Currency'];
  override readonly developerPortalUrl = 'https://myapi.fyers.in';
  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true, supportsFO: true, supportsCommodity: true, supportsCurrency: true,
    supportsBasketOrders: true, supportsGTT: true, supportsWebSocket: true, supportsHistoricalData: true,
    supportsOrderModification: true, supportsOrderCancellation: true, supportsOptions: true,
    supportsBracketOrders: true, supportsMarginTrading: true,
  };
}

export class UpstoxAdapter extends BaseBrokerAdapter {
  readonly id = 'upstox';
  readonly name = 'Upstox';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity', 'Currency'];
  override readonly developerPortalUrl = 'https://upstox.com/developer/api-documentation';
  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true, supportsFO: true, supportsCommodity: true, supportsCurrency: true,
    supportsBasketOrders: false, supportsGTT: true, supportsWebSocket: true, supportsHistoricalData: true,
    supportsOrderModification: true, supportsOrderCancellation: true, supportsOptions: true,
    supportsBracketOrders: false, supportsMarginTrading: true,
  };
}

export class BrokerAdapterRegistry {
  private static adapters: Map<string, BaseBrokerAdapter> = new Map<string, BaseBrokerAdapter>([
    ['upstox', new UpstoxAdapter()],
    ['fyers', new FyersAdapter()],
  ]);

  static getAdapter(id: string): BaseBrokerAdapter | undefined { return this.adapters.get(id.toLowerCase()); }
  static getAllAdapters(): BaseBrokerAdapter[] { return Array.from(this.adapters.values()); }
}
