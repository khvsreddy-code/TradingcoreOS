import { BaseBrokerAdapter } from './BaseBrokerAdapter';

export class FyersAdapter extends BaseBrokerAdapter {
  readonly id = 'fyers';
  readonly name = 'Fyers';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity'];
  override readonly developerPortalUrl = 'https://myapi.fyers.in';
}

export class ZerodhaAdapter extends BaseBrokerAdapter {
  readonly id = 'zerodha';
  readonly name = 'Zerodha';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity'];
  override readonly developerPortalUrl = 'https://kite.trade';
}

export class DhanAdapter extends BaseBrokerAdapter {
  readonly id = 'dhan';
  readonly name = 'Dhan';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity'];
  override readonly developerPortalUrl = 'https://dhanhq.co';
}

export class UpstoxAdapter extends BaseBrokerAdapter {
  readonly id = 'upstox';
  readonly name = 'Upstox';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity'];
  override readonly developerPortalUrl = 'https://upstox.com/developer/api-documentation';
}

export class AngelOneAdapter extends BaseBrokerAdapter {
  readonly id = 'angelone';
  readonly name = 'Angel One';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity'];
  override readonly developerPortalUrl = 'https://smartapi.angelone.in';
}

export class GrowwAdapter extends BaseBrokerAdapter {
  readonly id = 'groww';
  readonly name = 'Groww';
  readonly supportedSegments = ['Equity', 'F&O'];
  override readonly developerPortalUrl = 'https://groww.in/developer';
}

export class ICICIDirectAdapter extends BaseBrokerAdapter {
  readonly id = 'icicidirect';
  readonly name = 'ICICI Direct';
  readonly supportedSegments = ['Equity', 'F&O', 'Commodity'];
  override readonly developerPortalUrl = 'https://api.icicidirect.in';
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
