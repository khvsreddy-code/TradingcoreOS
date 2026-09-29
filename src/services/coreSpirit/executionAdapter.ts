/**
 * Host-owned execution adapter contract.
 * CoreSpirit can describe an approved order request, but only TradingCoreOS
 * supplies a concrete broker adapter implementation.
 */
export const CORE_SPIRIT_EXECUTION_ADAPTER_VERSION = 1 as const;

export interface CoreSpiritExecutionOrder {
  intentId: string;
  symbol: string;
  side: 'buy' | 'sell';
  quantity: number;
  venue: string;
  policyId: string;
  idempotencyKey: string;
}

export interface CoreSpiritExecutionReceipt {
  accepted: boolean;
  adapterId: string;
  executionId?: string;
  brokerOrderId?: string;
  status: 'SIMULATED' | 'SUBMITTED' | 'REJECTED';
  reason: string;
  timestamp: number;
}

export interface CoreSpiritExecutionAdapter {
  readonly adapterId: string;
  submit(order: CoreSpiritExecutionOrder): Promise<CoreSpiritExecutionReceipt>;
}

export interface CoreSpiritExecutionAdapterCapabilities {
  adapterId: string;
  brokerName: string;
  supportsLive: boolean;
  supportsPaper: boolean;
  supportsIdempotency: boolean;
}

export class CoreSpiritExecutionAdapterRegistry {
  private readonly adapters = new Map<string, CoreSpiritExecutionAdapter>();

  register(adapter: CoreSpiritExecutionAdapter): void {
    if (this.adapters.has(adapter.adapterId)) throw new Error(`execution adapter '${adapter.adapterId}' is already registered`);
    this.adapters.set(adapter.adapterId, adapter);
  }

  get(adapterId: string): CoreSpiritExecutionAdapter {
    const adapter = this.adapters.get(adapterId);
    if (!adapter) throw new Error(`execution adapter '${adapterId}' is not registered`);
    return adapter;
  }

  has(adapterId: string): boolean { return this.adapters.has(adapterId); }
  list(): string[] { return [...this.adapters.keys()].sort(); }
}
