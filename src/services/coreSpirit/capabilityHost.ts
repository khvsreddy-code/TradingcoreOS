import type { CoreSpiritDataResolver, CoreSpiritDataRequest, CoreSpiritDataResolutionContext } from './types';

export type CoreSpiritCapabilityAccounting = Readonly<{
  onDataRequest?: (request: CoreSpiritDataRequest) => void;
  onModelCall?: () => void;
  onResolvedValue?: (value: unknown) => void;
}>;

export class CoreSpiritCapabilityHost {
  constructor(
    private readonly executionTarget: string,
    private readonly dataResolver?: CoreSpiritDataResolver,
    private readonly modelOutputResolver?: (input: { modelName: string; field: string; binding?: unknown }) => unknown,
    private readonly eventResolver?: (eventName: string) => boolean | unknown,
    private readonly accounting: CoreSpiritCapabilityAccounting = {},
  ) {}

  private track<T>(value: T): T {
    this.accounting.onResolvedValue?.(value);
    if (value && typeof (value as any).then === 'function') {
      return (value as any).then((resolved: unknown) => {
        this.accounting.onResolvedValue?.(resolved);
        return resolved;
      }) as T;
    }
    return value;
  }

  assert(name: string): void {
    if (!name.startsWith('visual.') && !name.startsWith('ui.') && !name.startsWith('app.')) return;
    const capability = name.startsWith('ui.') ? 'interactive-ui' : 'visuals';
    if (!['chart', 'replay'].includes(this.executionTarget)) {
      throw new Error(`execution target '${this.executionTarget}' does not allow capability '${capability}'`);
    }
  }

  resolveEvent(name: string): boolean | unknown {
    return this.eventResolver?.(name) ?? false;
  }

  resolveModel(input: { modelName: string; field: string; binding?: unknown }): unknown {
    this.accounting.onModelCall?.();
    return this.track(this.modelOutputResolver?.(input) ?? null);
  }

  requestAt(request: CoreSpiritDataRequest, context: CoreSpiritDataResolutionContext): unknown {
    this.accounting.onDataRequest?.(request);
    if (this.dataResolver?.requestAt) return this.track(this.dataResolver.requestAt(request, context));
    return this.track(this.dataResolver?.request?.(request) ?? null);
  }

  request(request: CoreSpiritDataRequest): unknown {
    this.accounting.onDataRequest?.(request);
    return this.track(this.dataResolver?.request?.(request) ?? null);
  }

  lowerTimeframe(timeframe: string, field: CoreSpiritDataRequest['field']): number[] | Promise<number[]> | null {
    this.accounting.onDataRequest?.({ symbol: '', timeframe, field });
    return this.track(this.dataResolver?.lowerTimeframe?.(timeframe, field) ?? null);
  }

  intrabars(timeframe: string) {
    this.accounting.onDataRequest?.({ symbol: '', timeframe, field: 'time' });
    return this.track(this.dataResolver?.intrabars?.(timeframe) ?? null);
  }

  footprint() {
    this.accounting.onDataRequest?.({ symbol: '', timeframe: 'chart', field: 'volume' });
    return this.track(this.dataResolver?.footprint?.() ?? undefined);
  }

  depthImbalance() {
    this.accounting.onDataRequest?.({ symbol: '', timeframe: 'chart', field: 'volume' });
    return this.track(this.dataResolver?.depthImbalance?.() ?? null);
  }
}
