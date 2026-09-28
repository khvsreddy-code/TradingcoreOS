import type { CoreSpiritComponentRegistry } from './coreSpiritComponents';

export type CoreSpiritVMHost = Readonly<{
  componentRegistry?: CoreSpiritComponentRegistry;
  symbol?: string;
  timeframe?: string;
  barIndex?: number;
  timestamp?: number;
}>;

export class CoreSpiritVM {
  public constructor(private readonly host: CoreSpiritVMHost = {}) {}

  public executeComponent(componentId: string, args: readonly unknown[], context: Partial<{
    symbol:string; timeframe:string; barIndex:number; timestamp:number;
  }> = {}): unknown {
    const componentRegistry = this.host.componentRegistry;
    if (!componentRegistry) {
      throw new Error(`CoreSpirit component registry is unavailable for '${componentId}'`);
    }
    const executor = componentRegistry.executor(componentId);
    if (!executor) {
      throw new Error(`CoreSpirit component '${componentId}' is not registered with an executor`);
    }
    const contract = componentRegistry.resolve(componentId);
    if (!contract) {
      throw new Error(`CoreSpirit component contract '${componentId}' is not registered`);
    }
    return executor({
      component: contract,
      args,
      symbol: context.symbol ?? this.host.symbol ?? '',
      timeframe: context.timeframe ?? this.host.timeframe ?? '',
      barIndex: context.barIndex ?? this.host.barIndex ?? -1,
      timestamp: context.timestamp ?? this.host.timestamp ?? 0,
    });
  }
}
