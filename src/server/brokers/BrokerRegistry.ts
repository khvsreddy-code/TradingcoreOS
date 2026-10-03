import { BaseBroker } from './adapters/BaseBroker.js';
import { FyersAdapter } from './adapters/BrokerAdapters.js';

export class BrokerRegistry {
  private static adapters: Map<string, BaseBroker> = new Map();

  public static initialize(): void {
    if (this.adapters.size > 0) return;
    const brokerList: BaseBroker[] = [new FyersAdapter()];
    brokerList.forEach((adapter) => this.adapters.set(adapter.brokerId.toLowerCase(), adapter));
  }

  public static getAdapter(brokerId: string): BaseBroker {
    this.initialize();
    const adapter = this.adapters.get(brokerId.toLowerCase());
    if (!adapter) throw new Error('Unsupported broker. TradingCore supports Fyers.');
    return adapter;
  }

  public static hasAdapter(brokerId: string): boolean {
    this.initialize();
    return this.adapters.has(brokerId.toLowerCase());
  }

  public static getAllAdapters(): BaseBroker[] {
    this.initialize();
    return Array.from(this.adapters.values());
  }
}
