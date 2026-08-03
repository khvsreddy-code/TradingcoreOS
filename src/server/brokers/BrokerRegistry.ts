import { BaseBroker } from './adapters/BaseBroker.js';
import {
  ZerodhaAdapter,
  UpstoxAdapter,
  DhanAdapter,
  AngelAdapter,
  FyersAdapter,
  GrowwAdapter,
  ICICIAdapter,
} from './adapters/BrokerAdapters.js';

export class BrokerRegistry {
  private static adapters: Map<string, BaseBroker> = new Map();

  public static initialize(): void {
    if (this.adapters.size > 0) return;

    const brokerList: BaseBroker[] = [
      new ZerodhaAdapter(),
      new UpstoxAdapter(),
      new DhanAdapter(),
      new AngelAdapter(),
      new FyersAdapter(),
      new GrowwAdapter(),
      new ICICIAdapter(),
    ];

    brokerList.forEach((adapter) => {
      this.adapters.set(adapter.brokerId.toLowerCase(), adapter);
    });
  }

  public static getAdapter(brokerId: string): BaseBroker {
    this.initialize();
    const adapter = this.adapters.get(brokerId.toLowerCase());
    if (!adapter) {
      // Fallback default to Upstox if unknown broker ID passed
      return this.adapters.get('upstox')!;
    }
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
