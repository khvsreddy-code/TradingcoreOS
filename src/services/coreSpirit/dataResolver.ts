import type {
  CoreSpiritDataAlignment,
  CoreSpiritDataRequest,
  CoreSpiritDataResolver,
  CoreSpiritDataResolutionContext,
  CoreSpiritDataSnapshot,
  CoreSpiritExecutionContext,
} from './types';

/** Host-owned market/data access. The VM asks; the host decides how data is fulfilled. */
export class CoreSpiritDataResolverService {
  constructor(
    private readonly resolver: CoreSpiritDataResolver | undefined,
    private readonly context: () => CoreSpiritExecutionContext,
    private readonly currentBarAt: (index: number) => { timestamp: string } | undefined,
    private readonly toEpoch: (timestamp: string) => number,
    private readonly dataMemo: Map<string, unknown>,
    private readonly revision: () => number,
  ) {}

  resolutionContext(index: number, alignment: CoreSpiritDataAlignment = 'last-confirmed', maxStalenessMs?: number): CoreSpiritDataResolutionContext {
    const bar = this.currentBarAt(index);
    return {
      asOfTimestamp: bar ? this.toEpoch(bar.timestamp) : 0,
      baseSymbol: this.context().symbol,
      baseTimeframe: this.context().timeframe,
      executionMode: this.context().mode,
      revision: this.revision(),
      alignment,
      ...(maxStalenessMs != null ? { maxStalenessMs } : {}),
    };
  }

  resolveBatch(requests: CoreSpiritDataRequest[], index: number): CoreSpiritDataSnapshot[] | null {
    const resolver = this.resolver;
    if (!resolver?.requestBatch) {
      const values = requests.map((request) => {
        const value = resolver?.requestAt
          ? resolver.requestAt(request, this.resolutionContext(index, 'last-confirmed'))
          : resolver?.request?.(request);
        return value && typeof (value as any).then === 'function' ? null : value as CoreSpiritDataSnapshot | undefined;
      });
      if (values.some((value) => value == null)) return null;
      return values as CoreSpiritDataSnapshot[];
    }
    const value = resolver.requestBatch(requests);
    if (value && typeof (value as any).then === 'function') return null;
    const snapshots = value as CoreSpiritDataSnapshot[];
    if (snapshots.length !== requests.length) return null;
    return snapshots;
  }

  resolveValue(symbol: string, timeframe: string, field: any, index: number, offset = 0): number | null {
    const resolverAt = this.resolver?.requestAt;
    const resolver = this.resolver?.request;
    if (!resolverAt && !resolver) return null;
    const key = `request:${index}:${symbol}:${timeframe}:${field}:${offset}`;
    if (this.dataMemo.has(key)) return this.dataMemo.get(key) as number | null;
    const request: CoreSpiritDataRequest = { symbol, timeframe, field, offset };
    const value = resolverAt ? resolverAt(request, this.resolutionContext(index, 'last-confirmed')) : resolver!(request);
    if (value && typeof (value as any).then === 'function') return null;
    const snapshot = value as CoreSpiritDataSnapshot | undefined;
    const asOf = this.resolutionContext(index).asOfTimestamp;
    if (snapshot?.timestamp != null && Number(snapshot.timestamp) > asOf) return null;
    const resolved = snapshot?.value ?? null;
    this.dataMemo.set(key, resolved);
    return resolved;
  }

  resolveSeries(ref: any, field: any, index: number, length: number): number[] | null {
    const kind = String(ref?.kind ?? ref?.__coreSpiritDataRef ?? '');
    const symbol = kind === 'market' ? String(ref.symbol ?? this.context().symbol) : this.context().symbol;
    const timeframe = String(ref?.timeframe ?? this.context().timeframe);
    const alignment:CoreSpiritDataAlignment = ref && typeof ref==='object' && ref.alignment==='developing' ? 'developing' : 'last-confirmed';
    if(alignment==='developing' && this.context().mode!=='realtime') return null;
    const resolver = this.resolver?.series;
    if (resolver) {
      const request: CoreSpiritDataRequest = { symbol, timeframe, field, offset: 0 };
      const values = resolver(request, this.resolutionContext(index, alignment));
      if (values && typeof (values as any).then === 'function') return null;
      const series = (values as number[]).filter(Number.isFinite);
      return series.length ? series : null;
    }
    const values: number[] = [];
    const max = Math.max(1, Math.floor(length));
    for (let offset = 0; offset < max; offset++) {
      const request: CoreSpiritDataRequest = { symbol, timeframe, field, offset };
      const resolverAt = this.resolver?.requestAt;
      const resolverCurrent = this.resolver?.request;
      if (!resolverAt && !resolverCurrent) break;
      const snapshot = resolverAt
        ? resolverAt(request, this.resolutionContext(index, alignment))
        : resolverCurrent!(request);
      if (snapshot && typeof (snapshot as any).then === 'function') return null;
      const resolved = snapshot as CoreSpiritDataSnapshot | undefined;
      if (resolved?.timestamp != null && Number(resolved.timestamp) > this.resolutionContext(index).asOfTimestamp) return null;
      const value = Number(resolved?.value);
      if (Number.isFinite(value)) values.push(value);
    }
    return values.length ? values.reverse() : null;
  }

  seriesKey(ref: any, field: string): string {
    const kind=String(ref?.kind ?? ref?.__coreSpiritDataRef ?? '');
    const alignment=String(ref?.alignment ?? 'last-confirmed');
    if (kind === 'market') return `market:${String(ref.symbol)}:${String(ref.timeframe ?? this.context().timeframe)}:${field}:${alignment}`;
    if (kind === 'timeframe' || kind === 'series') return `timeframe:${this.context().symbol}:${String(ref.timeframe)}:${field}:${alignment}`;
    return `data:${field}`;
  }

  getRuntimeRefFromCallArg(refRegister: string, locals: Record<string, unknown>, lastRuntimeCallRefs: Map<string, any>): any {
    const local = locals[refRegister];
    if ((local as any)?.__coreSpiritDataRef || ['market','timeframe','series'].includes(String((local as any)?.kind ?? ''))) return local;
    return lastRuntimeCallRefs.get(refRegister);
  }
}
