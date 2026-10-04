import type { CoreSpiritDataResolver, CoreSpiritDataRequest, CoreSpiritDataResolutionContext, CoreSpiritExecutionContext } from './types';

export class CoreSpiritCapabilityHost {
  constructor(
    private readonly executionTarget: string,
    private readonly dataResolver?: CoreSpiritDataResolver,
    private readonly modelOutputResolver?: (input: { modelName: string; field: string; binding?: { kind: string; locator: string } }) => unknown,
    private readonly eventResolver?: (eventName: string) => boolean | unknown,
  ) {}

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

  resolveModel(input: { modelName: string; field: string; binding?: { kind: string; locator: string } }): unknown {
    return this.modelOutputResolver?.(input) ?? null;
  }

  requestAt(request: CoreSpiritDataRequest, context: CoreSpiritDataResolutionContext): unknown {
    if (this.dataResolver?.requestAt) return this.dataResolver.requestAt(request, context);
    return this.dataResolver?.request?.(request) ?? null;
  }

  request(request: CoreSpiritDataRequest): unknown {
    return this.dataResolver?.request?.(request) ?? null;
  }

  lowerTimeframe(timeframe: string, field: CoreSpiritDataRequest['field']): number[] | Promise<number[]> | null {
    return this.dataResolver?.lowerTimeframe?.(timeframe, field) ?? null;
  }

  intrabars(timeframe: string) {
    return this.dataResolver?.intrabars?.(timeframe) ?? null;
  }

  footprint() {
    return this.dataResolver?.footprint?.() ?? undefined;
  }

  depthImbalance() {
    return this.dataResolver?.depthImbalance?.() ?? null;
  }
}
