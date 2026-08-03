import { BaseBrokerAdapter } from './BaseBrokerAdapter';
import { BrokerCapabilities } from './BrokerAdapter';

export class FyersAdapter extends BaseBrokerAdapter {
  readonly id = 'fyers';
  readonly name = 'Fyers';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity', 'Currency'];
  override readonly developerPortalUrl = 'https://myapi.fyers.in';

  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true,
    supportsFO: true,
    supportsCommodity: true,
    supportsCurrency: true,
    supportsBasketOrders: true,
    supportsGTT: true,
    supportsWebSocket: true,
    supportsHistoricalData: true,
    supportsOrderModification: true,
    supportsOrderCancellation: true,
    supportsOptions: true,
    supportsBracketOrders: true,
    supportsMarginTrading: true,
  };
}

export class ZerodhaAdapter extends BaseBrokerAdapter {
  readonly id = 'zerodha';
  readonly name = 'Zerodha';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity', 'Currency'];
  override readonly developerPortalUrl = 'https://kite.trade';

  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true,
    supportsFO: true,
    supportsCommodity: true,
    supportsCurrency: true,
    supportsBasketOrders: true,
    supportsGTT: true,
    supportsWebSocket: true,
    supportsHistoricalData: true,
    supportsOrderModification: true,
    supportsOrderCancellation: true,
    supportsOptions: true,
    supportsBracketOrders: false,
    supportsMarginTrading: true,
  };
}

export class DhanAdapter extends BaseBrokerAdapter {
  readonly id = 'dhan';
  readonly name = 'Dhan';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity', 'Currency'];
  override readonly developerPortalUrl = 'https://dhanhq.co';

  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true,
    supportsFO: true,
    supportsCommodity: true,
    supportsCurrency: true,
    supportsBasketOrders: true,
    supportsGTT: true,
    supportsWebSocket: true,
    supportsHistoricalData: true,
    supportsOrderModification: true,
    supportsOrderCancellation: true,
    supportsOptions: true,
    supportsBracketOrders: true,
    supportsMarginTrading: true,
  };
}

export class UpstoxAdapter extends BaseBrokerAdapter {
  readonly id = 'upstox';
  readonly name = 'Upstox';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity', 'Currency'];
  override readonly developerPortalUrl = 'https://upstox.com/developer/api-documentation';

  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true,
    supportsFO: true,
    supportsCommodity: true,
    supportsCurrency: true,
    supportsBasketOrders: false,
    supportsGTT: true,
    supportsWebSocket: true,
    supportsHistoricalData: true,
    supportsOrderModification: true,
    supportsOrderCancellation: true,
    supportsOptions: true,
    supportsBracketOrders: false,
    supportsMarginTrading: true,
  };
}

export class AngelOneAdapter extends BaseBrokerAdapter {
  readonly id = 'angelone';
  readonly name = 'Angel One';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity', 'Currency'];
  override readonly developerPortalUrl = 'https://smartapi.angelone.in';

  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true,
    supportsFO: true,
    supportsCommodity: true,
    supportsCurrency: true,
    supportsBasketOrders: true,
    supportsGTT: true,
    supportsWebSocket: true,
    supportsHistoricalData: true,
    supportsOrderModification: true,
    supportsOrderCancellation: true,
    supportsOptions: true,
    supportsBracketOrders: true,
    supportsMarginTrading: true,
  };
}

export class GrowwAdapter extends BaseBrokerAdapter {
  readonly id = 'groww';
  readonly name = 'Groww';
  readonly supportedSegments = ['Equity', 'F&O'];
  override readonly developerPortalUrl = 'https://groww.in/developer';

  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true,
    supportsFO: true,
    supportsCommodity: false,
    supportsCurrency: false,
    supportsBasketOrders: false,
    supportsGTT: false,
    supportsWebSocket: true,
    supportsHistoricalData: true,
    supportsOrderModification: true,
    supportsOrderCancellation: true,
    supportsOptions: true,
    supportsBracketOrders: false,
    supportsMarginTrading: false,
  };
}

export class ICICIDirectAdapter extends BaseBrokerAdapter {
  readonly id = 'icicidirect';
  readonly name = 'ICICI Direct';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity', 'Currency'];
  override readonly developerPortalUrl = 'https://api.icicidirect.in';

  override readonly capabilities: BrokerCapabilities = {
    supportsEquity: true,
    supportsFO: true,
    supportsCommodity: true,
    supportsCurrency: true,
    supportsBasketOrders: true,
    supportsGTT: true,
    supportsWebSocket: true,
    supportsHistoricalData: true,
    supportsOrderModification: true,
    supportsOrderCancellation: true,
    supportsOptions: true,
    supportsBracketOrders: true,
    supportsMarginTrading: true,
  };
}

export class BrokerAdapterRegistry {
  private static adapters: Map<string, BaseBrokerAdapter> = new Map<string, BaseBrokerAdapter>([
    ['fyers', new FyersAdapter()],
    ['zerodha', new ZerodhaAdapter()],
    ['dhan', new DhanAdapter()],
    ['upstox', new UpstoxAdapter()],
    ['angelone', new AngelOneAdapter()],
    ['groww', new GrowwAdapter()],
    ['icicidirect', new ICICIDirectAdapter()],
  ]);

  static getAdapter(id: string): BaseBrokerAdapter | undefined {
    return this.adapters.get(id.toLowerCase());
  }

  static getAllAdapters(): BaseBrokerAdapter[] {
    return Array.from(this.adapters.values());
  }
}
