import type { HistoricalCandle } from '../brokers/BrokerAdapter';
import type { CanonicalMarketView } from '../core/data/canonicalDataPlane';
import {
  createCanonicalMarketDataPacket,
  packetTransferables,
  sliceCanonicalMarketView,
  type CanonicalMarketDataPacket,
} from '../core/data/canonicalMarketDataTransport';
import { buildChartAnalytics, type ChartAnalytics } from './levelEngine';
import {
  IndicatorConfig,
  series,
  vwap,
  bollinger,
  keltner,
  donchian,
  rsi,
  macd,
  supertrend,
  stochastic,
  ichimoku,
} from './indicatorEngine';
import { isIncrementalIndicatorSupported } from './incrementalIndicatorEngine';
import { buildIndicatorComputationSignature } from '../coreSpirit/indicatorSettingsSchema';
import { selectIndicatorComputeBounds } from './chartComputeWindow';
import { invalidationModeForCandleChange, type CandleDatasetChange } from './chartCandleEvents';

export type IndicatorWorkerResult = { id: string; kind: string; data: any[]; incremental?: boolean; incrementalMode?: 'update'|'reset'; updateCost?: string };
type AnalyticsRequest = { requestId: number; market: CanonicalMarketDataPacket; spot: number };
type IndicatorRequest = {
  requestId: number;
  market?: CanonicalMarketDataPacket;
  bar?: CanonicalMarketDataPacket;
  configs: IndicatorConfig[];
  datasetKey: string;
  revision: number;
  mode?: 'snapshot'|'incremental';
  operation?: 'replace'|'append';
  incrementalKey?: string;
  seedOnMiss?: boolean;
  primeIncremental?: boolean;
};

type WorkerRunOptions = {
  priority?: number; signal?: AbortSignal; generationKey?: string; generation?: number;
  /** Preserve sequential incremental deltas when a new candle arrives. */
  cancelOlder?: boolean;
};
type Pending<T> = {
  requestId: number; payload: Omit<T, 'requestId'>;
  resolve: (value: any) => void; reject: (reason: unknown) => void;
  transferables?: Transferable[]; priority: number; enqueuedAt: number;
  generationKey?: string; generation?: number; signal?: AbortSignal; abortHandler?: () => void;
  timeout?: ReturnType<typeof setTimeout>; settled: boolean;
};

const MAX_ANALYTICS_WORKERS = 2;
const MAX_INDICATOR_WORKERS = 2;
const MAX_CACHE_ENTRIES = 48;
const WORKER_TIMEOUT_MS = 15_000;

function abortError(message: string): Error { const error = new Error(message); error.name = 'AbortError'; return error; }
function isAbortError(error: unknown): boolean { return !!error && typeof error === 'object' && 'name' in error && (error as {name?:unknown}).name === 'AbortError'; }

function stableConfigSignature(config: IndicatorConfig): string {
  return buildIndicatorComputationSignature(config as unknown as Record<string, unknown>);
}

function normalizeIndicatorConfigs(configs: IndicatorConfig[]): { signature: string; configs: IndicatorConfig[]; ids: string[] } {
  const active = configs.filter(config => config.enabled);
  const compute = active.map((config, index) => ({
    id: `shared-${index}`,
    kind: config.kind,
    enabled: config.enabled,
    period: config.period,
    fast: config.fast,
    slow: config.slow,
    signal: config.signal,
    multiplier: config.multiplier,
    smooth: config.smooth,
    displacement: config.displacement,
    source: config.source,
    lookback: config.lookback,
    anchor: config.anchor,
    mtf: config.mtf,
  } as IndicatorConfig));
  return {
    signature: JSON.stringify(active.map(stableConfigSignature)),
    configs: compute,
    ids: active.map(config => config.id),
  };
}

function remapIndicatorResults(results: IndicatorWorkerResult[], ids: string[], active: IndicatorConfig[]): IndicatorWorkerResult[] {
  return results.map((result, index) => {
    const computeIndex = Number(String(result.id).replace('shared-', ''));
    const targetIndex = Number.isFinite(computeIndex) ? computeIndex : index;
    return {
      ...result,
      id: ids[targetIndex] || active[targetIndex]?.id || result.id,
    };
  });
}

function runIndicatorFallback(candles: HistoricalCandle[], configs: IndicatorConfig[]): IndicatorWorkerResult[] {
  return configs.filter(c => c.enabled).map(cfg => {
    if (cfg.kind === 'VWAP') return { id: cfg.id, kind: cfg.kind, data: vwap(candles, cfg.source || 'hlc3') };
    if (cfg.kind === 'Bollinger Bands') return { id: cfg.id, kind: cfg.kind, data: bollinger(candles, cfg.period || 20, cfg.multiplier || 2, cfg.source || 'close') };
    if (cfg.kind === 'Keltner Channels') return { id: cfg.id, kind: cfg.kind, data: keltner(candles, cfg.period || 20, cfg.multiplier || 2, cfg.source || 'close') };
    if (cfg.kind === 'Donchian Channels') return { id: cfg.id, kind: cfg.kind, data: donchian(candles, cfg.period || 20) };
    if (cfg.kind === 'RSI') return { id: cfg.id, kind: cfg.kind, data: rsi(candles, cfg.period || 14, cfg.source || 'close') };
    if (cfg.kind === 'MACD') return { id: cfg.id, kind: cfg.kind, data: macd(candles, cfg.fast || 12, cfg.slow || 26, cfg.signal || 9, cfg.source || 'close') };
    if (cfg.kind === 'Supertrend') return { id: cfg.id, kind: cfg.kind, data: supertrend(candles, cfg.period || 10, cfg.multiplier || 3) };
    if (cfg.kind === 'Stochastic') return { id: cfg.id, kind: cfg.kind, data: stochastic(candles, cfg.period || 14, cfg.smooth || 3, cfg.signal || 3, cfg.source || 'close') };
    if (cfg.kind === 'Ichimoku Cloud') return { id: cfg.id, kind: cfg.kind, data: ichimoku(candles, cfg.period || 9, cfg.slow || 26, cfg.displacement || 26) };
    return { id: cfg.id, kind: cfg.kind, data: series(candles, cfg.kind, cfg) };
  });
}

class SharedWorkerQueue<Payload extends object, Result> {
  private readonly workers: Array<Worker | undefined> = [];
  private readonly busy = new Map<Worker, number>();
  private readonly pending = new Map<number, Pending<Payload>>();
  private queue: Array<Pending<Payload> & { affinityKey?: string }> = [];
  private sequence = 0;
  private readonly affinity = new Map<string, Worker>();
  private readonly latestGenerations = new Map<string, number>();
  private readonly maxQueued = 96;
  private disposed = false;

  constructor(private readonly workerUrl: URL, private readonly maxWorkers: number) {}

  private settle(item: Pending<Payload>, error?: unknown, value?: Result): void {
    if (item.settled) return;
    item.settled = true;
    if (item.timeout) clearTimeout(item.timeout);
    item.timeout = undefined;
    if (item.signal && item.abortHandler) item.signal.removeEventListener('abort', item.abortHandler);
    item.abortHandler = undefined;
    if (error !== undefined) item.reject(error);
    else item.resolve(value as Result);
  }

  private effectivePriority(item: Pending<Payload>): number {
    const ageBoost = Math.floor(Math.max(0, Date.now() - item.enqueuedAt) / 10_000);
    return Math.max(item.priority <= 0 ? 0 : 1, item.priority - ageBoost);
  }

  private sortQueue(): void {
    this.queue.sort((a, b) => this.effectivePriority(a) - this.effectivePriority(b) || a.enqueuedAt - b.enqueuedAt);
  }

  /** Advance a dataset revision fence. Append deltas stay queued to preserve recursive indicator state;
   * a correction/reset terminates older work and requires a full reseed. */
  advanceGeneration(generationKey: string, generation: number, cancelOlder: boolean): void {
    if (this.disposed || !generationKey || !Number.isSafeInteger(generation) || generation < 0) return;
    const current = this.latestGenerations.get(generationKey);
    if (current != null && generation < current) return;
    this.latestGenerations.set(generationKey, generation);
    if (!cancelOlder) return;
    for (let i = this.queue.length - 1; i >= 0; i -= 1) {
      const item = this.queue[i]!;
      if (item.generationKey !== generationKey || (item.generation ?? -1) >= generation) continue;
      this.queue.splice(i, 1);
      this.settle(item, abortError('Queued chart computation superseded by a newer dataset revision.'));
    }
    for (const [worker, requestId] of this.busy) {
      const item = this.pending.get(requestId);
      if (item?.generationKey === generationKey && (item.generation ?? -1) < generation) {
        this.onWorkerFailure(worker, abortError('Chart computation cancelled by a correction or dataset reset.'));
      }
    }
    this.dispatch();
  }

  private createWorker(): Worker {
    const worker = new Worker(this.workerUrl, { type: 'module' });
    this.workers.push(worker);
    worker.onmessage = event => this.onMessage(worker, event.data);
    worker.onerror = () => this.onWorkerFailure(worker, new Error('Shared chart worker failed'));
    return worker;
  }

  private onMessage(worker: Worker, message: any): void {
    const requestId = Number(message?.requestId);
    if (!requestId || this.busy.get(worker) !== requestId) return;
    const item = this.pending.get(requestId);
    if (!item) return;
    this.pending.delete(requestId);
    this.busy.delete(worker);
    if (item.generationKey && item.generation != null && this.latestGenerations.get(item.generationKey) !== item.generation) {
      this.settle(item, abortError('Stale chart worker result rejected by the dataset revision fence.'));
    } else if (message?.error) {
      this.settle(item, new Error(String(message.error)));
    } else {
      this.settle(item, undefined, message as Result);
    }
    this.dispatch();
  }

  private onWorkerFailure(worker: Worker, error: Error): void {
    const requestId = this.busy.get(worker);
    if (requestId) {
      const item = this.pending.get(requestId);
      if (item) { this.pending.delete(requestId); this.settle(item, error); }
    }
    this.busy.delete(worker);
    try { worker.terminate(); } catch {}
    const index = this.workers.indexOf(worker);
    if (index >= 0) this.workers.splice(index, 1);
    for (const [key, value] of this.affinity) if (value === worker) this.affinity.delete(key);
    if (!this.disposed) this.dispatch();
  }

  private cancel(item: Pending<Payload>, error: Error): void {
    if (item.settled) return;
    const queuedIndex = this.queue.indexOf(item as Pending<Payload> & { affinityKey?: string });
    if (queuedIndex >= 0) {
      this.queue.splice(queuedIndex, 1); this.settle(item, error); this.dispatch(); return;
    }
    for (const [worker, requestId] of this.busy) if (requestId === item.requestId) { this.onWorkerFailure(worker, error); return; }
    this.settle(item, error);
  }

  private dispatch(): void {
    if (this.disposed) return;
    this.sortQueue();
    while (this.queue.length) {
      const item = this.queue[0]!;
      const affinityWorker = item.affinityKey ? this.affinity.get(item.affinityKey) : undefined;
      const preferredIdle = affinityWorker && !this.busy.has(affinityWorker) ? affinityWorker : undefined;
      let idle = preferredIdle || this.workers.find(worker => worker && !this.busy.has(worker));
      if (!idle && this.workers.length < this.maxWorkers) {
        try { idle = this.createWorker(); }
        catch (error) {
          // A worker bootstrap failure rejects this request so the caller can use
          // its bounded fallback; never leave a ghost queue entry behind.
          this.queue.shift();
          this.settle(item, error instanceof Error ? error : new Error(String(error)));
          continue;
        }
      }
      if (!idle) return;
      this.queue.shift();
      if (item.affinityKey && !affinityWorker) this.affinity.set(item.affinityKey, idle);
      this.busy.set(idle, item.requestId); this.pending.set(item.requestId, item);
      item.timeout = setTimeout(() => {
        if (this.pending.has(item.requestId)) this.onWorkerFailure(idle, new Error('Shared chart worker timed out; it will restart on demand.'));
      }, WORKER_TIMEOUT_MS);
      Promise.resolve().then(() => {
        if (!this.pending.has(item.requestId)) return;
        try { (idle as any).postMessage({ requestId: item.requestId, ...(item.payload as any) }, item.transferables || []); }
        catch (error) { this.onWorkerFailure(idle, error instanceof Error ? error : new Error(String(error))); }
      });
    }
  }

  run(payload: Omit<Payload, 'requestId'>, affinityKey?: string, transferables?: Transferable[], options: WorkerRunOptions = {}): Promise<Result> {
    if (this.disposed) return Promise.reject(new Error('Shared chart worker queue disposed'));
    if (options.signal?.aborted) return Promise.reject(abortError('Chart computation cancelled before admission.'));
    if (options.generationKey && options.generation != null) {
      const current = this.latestGenerations.get(options.generationKey);
      if (current != null && options.generation < current) return Promise.reject(abortError('Chart computation belongs to an obsolete revision.'));
      if (current == null || options.generation > current) this.advanceGeneration(options.generationKey, options.generation, options.cancelOlder === true);
    }
    const requestId = ++this.sequence;
    return new Promise<Result>((resolve, reject) => {
      const item: Pending<Payload> & { affinityKey?: string } = {
        requestId, payload, resolve, reject, affinityKey, transferables,
        priority: Number.isFinite(options.priority) ? Number(options.priority) : 1,
        enqueuedAt: Date.now(), generationKey: options.generationKey, generation: options.generation,
        signal: options.signal, settled: false,
      };
      if (this.queue.length >= this.maxQueued) {
        let worstIndex = -1;
        for (let i = 0; i < this.queue.length; i += 1) {
          const candidate = this.queue[i]!, worst = worstIndex >= 0 ? this.queue[worstIndex]! : undefined;
          if (!worst || candidate.priority > worst.priority || (candidate.priority === worst.priority && candidate.enqueuedAt < worst.enqueuedAt)) worstIndex = i;
        }
        const worst = worstIndex >= 0 ? this.queue[worstIndex]! : undefined;
        if (!worst || worst.priority <= item.priority) { this.settle(item, new Error('Shared chart worker queue is saturated; request was not admitted.')); return; }
        this.queue.splice(worstIndex, 1); this.settle(worst, abortError('Background chart computation pre-empted by visible work.'));
      }
      if (options.signal) {
        item.abortHandler = () => this.cancel(item, abortError('Chart computation cancelled.'));
        options.signal.addEventListener('abort', item.abortHandler, { once: true });
      }
      if (options.signal?.aborted) { this.settle(item, abortError('Chart computation cancelled.')); return; }
      this.queue.push(item); this.sortQueue(); this.dispatch();
    });
  }

  terminate(): void {
    if (this.disposed) return;
    this.disposed = true;
    const error = new Error('Shared chart worker queue terminated');
    for (const item of this.queue.splice(0)) this.settle(item, error);
    for (const item of this.pending.values()) this.settle(item, error);
    this.pending.clear();
    for (const worker of this.workers) { try { worker?.terminate(); } catch {} }
    this.workers.length = 0; this.busy.clear(); this.affinity.clear(); this.latestGenerations.clear();
  }
}

function tailKey(market: CanonicalMarketView): string {
  if (!market.length) return '';
  const i = market.length - 1;
  return JSON.stringify([market.open[i], market.high[i], market.low[i], market.close[i], market.volume[i]]);
}

export class ChartComputeCoordinator {
  private readonly analyticsQueue = new SharedWorkerQueue<AnalyticsRequest, { requestId: number; analytics: ChartAnalytics }>(new URL('./chartAnalytics.worker.ts', import.meta.url), MAX_ANALYTICS_WORKERS);
  private readonly indicatorQueue = new SharedWorkerQueue<IndicatorRequest, { requestId: number; results: IndicatorWorkerResult[]; resetRequired?: boolean }>(new URL('./indicator.worker.ts', import.meta.url), MAX_INDICATOR_WORKERS);
  private analyticsCache = new Map<string, ChartAnalytics>();
  private indicatorCache = new Map<string, IndicatorWorkerResult[]>();
  private analyticsInflight = new Map<string, Promise<ChartAnalytics>>();
  private indicatorInflight = new Map<string, Promise<IndicatorWorkerResult[]>>();
  private incrementalPrimed = new Set<string>();
  private readonly latestCandleChanges = new Map<string, CandleDatasetChange>();
  private readonly incrementalOwners = new Map<string, string>();
  private clearEpoch = 0;

  private generationScope(datasetKey: string, generation?: number): string {
    const active = generation ?? this.latestCandleChanges.get(datasetKey)?.datasetGeneration ?? 0;
    return `${datasetKey}::generation:${active}::clear:${this.clearEpoch}`;
  }

  private assertCurrentRevision(datasetKey: string, scopeKey: string, revision: number): void {
    if (!scopeKey.endsWith(`::clear:${this.clearEpoch}`)) throw abortError('Chart computation was invalidated by coordinator reset.');
    const change = this.latestCandleChanges.get(datasetKey);
    if (!change) return;
    if (scopeKey !== this.generationScope(datasetKey, change.datasetGeneration) || revision < change.revision) {
      throw abortError('Chart computation belongs to a stale candle dataset revision.');
    }
  }

  applyCandleChange(change: CandleDatasetChange): boolean {
    const previous = this.latestCandleChanges.get(change.datasetKey);
    if (previous && (change.datasetGeneration < previous.datasetGeneration ||
      (change.datasetGeneration === previous.datasetGeneration && change.revision <= previous.revision))) return false;
    const mode = invalidationModeForCandleChange(change);
    const generationChanged = previous != null && previous.datasetGeneration !== change.datasetGeneration;
    if (previous && generationChanged) {
      const oldScope = this.generationScope(change.datasetKey, previous.datasetGeneration);
      this.analyticsQueue.advanceGeneration(oldScope, Number.MAX_SAFE_INTEGER, true);
      this.indicatorQueue.advanceGeneration(oldScope, Number.MAX_SAFE_INTEGER, true);
    } else if (!previous && change.datasetGeneration !== 0) {
      const initialScope = this.generationScope(change.datasetKey, 0);
      this.analyticsQueue.advanceGeneration(initialScope, Number.MAX_SAFE_INTEGER, true);
      this.indicatorQueue.advanceGeneration(initialScope, Number.MAX_SAFE_INTEGER, true);
    }
    const scope = this.generationScope(change.datasetKey, change.datasetGeneration);
    this.analyticsQueue.advanceGeneration(scope, change.revision, true);
    this.indicatorQueue.advanceGeneration(scope, change.revision, mode === 'full-replay' || generationChanged);
    for (const key of this.analyticsCache.keys()) if (key.startsWith(`${change.datasetKey}|`)) this.analyticsCache.delete(key);
    for (const key of this.indicatorCache.keys()) if (key.startsWith(`${change.datasetKey}|`)) this.indicatorCache.delete(key);
    if (mode === 'full-replay' || generationChanged) {
      for (const [incrementalKey, owner] of this.incrementalOwners) {
        if (owner !== change.datasetKey) continue;
        for (const primedKey of this.incrementalPrimed) if (primedKey.startsWith(`${incrementalKey}|`)) this.incrementalPrimed.delete(primedKey);
      }
    }
    this.latestCandleChanges.set(change.datasetKey, change);
    return true;
  }

  private remember<T>(cache: Map<string, T>, key: string, value: T): T {
    cache.delete(key);
    cache.set(key, value);
    while (cache.size > MAX_CACHE_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest == null) break;
      cache.delete(oldest);
    }
    return value;
  }

  runAnalytics(datasetKey: string, revision: number, market: CanonicalMarketView, spot: number, compatibilityCandles: HistoricalCandle[] = []): Promise<ChartAnalytics> {
    const scopeKey = this.generationScope(datasetKey);
    try { this.assertCurrentRevision(datasetKey, scopeKey, revision); } catch (error) { return Promise.reject(error); }
    const key = `${datasetKey}|${revision}|${market.length}|${tailKey(market)}|${Number(spot).toPrecision(12)}`;
    const cached = this.analyticsCache.get(key);
    if (cached) return Promise.resolve(cached);
    const inflight = this.analyticsInflight.get(key);
    if (inflight) return inflight;
    const packet = createCanonicalMarketDataPacket(market);
    const promise = this.analyticsQueue.run(
      { market: packet, spot }, undefined, packetTransferables(packet),
      { priority: 0, generationKey: scopeKey, generation: revision, cancelOlder: true },
    )
      .then(result => { this.assertCurrentRevision(datasetKey, scopeKey, revision); return this.remember(this.analyticsCache, key, result.analytics); })
      .catch(error => { if (isAbortError(error)) throw error; this.assertCurrentRevision(datasetKey, scopeKey, revision); return this.remember(this.analyticsCache, key, buildChartAnalytics(compatibilityCandles, spot)); })
      .finally(() => this.analyticsInflight.delete(key));
    this.analyticsInflight.set(key, promise);
    return promise;
  }

  runIndicators(
    datasetKey: string,
    revision: number,
    market: CanonicalMarketView,
    configs: IndicatorConfig[],
    options: { mode?: 'snapshot'|'incremental'; operation?: 'replace'|'append'; incrementalKey?: string; range?: { from: number; to: number } | null } = {},
    compatibilityCandles: HistoricalCandle[] = [],
  ): Promise<IndicatorWorkerResult[]> {
    const active = configs.filter(config => config.enabled);
    if (!active.length) return Promise.resolve([]);
    const normalized = normalizeIndicatorConfigs(active);
    const incrementalConfigs = active.filter(config => isIncrementalIndicatorSupported(config.kind));
    const incrementalKey = options.incrementalKey || datasetKey;
    const scopeKey = this.generationScope(datasetKey);
    try { this.assertCurrentRevision(datasetKey, scopeKey, revision); } catch (error) { return Promise.reject(error); }
    this.incrementalOwners.set(incrementalKey, datasetKey);

    if (options.mode === 'incremental') {
      if (!incrementalConfigs.length || !market.length) return Promise.resolve([]);
      const primeKey = `${incrementalKey}|${normalized.signature}`;
      const primed = this.incrementalPrimed.has(primeKey);
      const payloadBase = {
        configs: normalized.configs,
        datasetKey,
        revision,
        mode: 'incremental' as const,
        operation: options.operation || 'replace',
        incrementalKey,
        seedOnMiss: !primed,
      };
      const packet = primed
        ? createCanonicalMarketDataPacket(market, market.length - 1, market.length)
        : createCanonicalMarketDataPacket(market);
      const payload: Omit<IndicatorRequest, 'requestId'> = {
        ...payloadBase,
        ...(primed ? { bar: packet } : { market: packet }),
      };
      const transfer = packetTransferables(packet);
      return this.indicatorQueue.run(payload, incrementalKey, transfer, { priority: 0, generationKey: scopeKey, generation: revision, cancelOlder: false })
        .then(result => {
          this.assertCurrentRevision(datasetKey, scopeKey, revision);
          if (result.resetRequired) {
            this.incrementalPrimed.delete(primeKey);
            const reseed = createCanonicalMarketDataPacket(market);
            return this.indicatorQueue.run(
              { ...payloadBase, market: reseed, seedOnMiss: true }, incrementalKey, packetTransferables(reseed),
              { priority: 0, generationKey: scopeKey, generation: revision, cancelOlder: false },
            ).then(seedResult => {
              this.assertCurrentRevision(datasetKey, scopeKey, revision);
              this.incrementalPrimed.add(primeKey);
              return remapIndicatorResults(seedResult.results, normalized.ids, active);
            });
          }
          this.incrementalPrimed.add(primeKey);
          return remapIndicatorResults(result.results, normalized.ids, active);
        })
        .catch(error => {
          if (isAbortError(error)) throw error;
          this.assertCurrentRevision(datasetKey, scopeKey, revision);
          this.incrementalPrimed.delete(primeKey);
          return runIndicatorFallback(compatibilityCandles, normalized.configs);
        });
    }

    const bounds = selectIndicatorComputeBounds(market.length, options.range);
    const window = sliceCanonicalMarketView(market, bounds.startIndex, bounds.endIndex);
    const first = window.time.length ? window.time[0] : 0;
    const last = window.time.length ? window.time[window.time.length - 1] : 0;
    const windowKey = `${datasetKey}|window:${bounds.startIndex}:${bounds.endIndex}`;
    const key = `${windowKey}|${revision}|${bounds.key}:${first}:${last}|${tailKey(window)}|${normalized.signature}`;
    const cached = this.indicatorCache.get(key);
    if (cached) return Promise.resolve(remapIndicatorResults(cached, normalized.ids, active));
    const inflight = this.indicatorInflight.get(key);
    if (inflight) return inflight.then(result => remapIndicatorResults(result, normalized.ids, active));

    const packet = createCanonicalMarketDataPacket(market, bounds.startIndex, bounds.endIndex);
    const payload: Omit<IndicatorRequest, 'requestId'> = {
      market: packet,
      configs: normalized.configs,
      datasetKey: windowKey,
      revision,
      mode: 'snapshot',
      incrementalKey,
      primeIncremental: incrementalConfigs.length > 0,
    };
    const promise = this.indicatorQueue.run(
      payload, incrementalConfigs.length > 0 ? incrementalKey : datasetKey, packetTransferables(packet),
      { priority: 0, generationKey: scopeKey, generation: revision, cancelOlder: true },
    )
      .then(result => {
        this.assertCurrentRevision(datasetKey, scopeKey, revision);
        if (incrementalConfigs.length > 0) this.incrementalPrimed.add(`${incrementalKey}|${normalized.signature}`);
        return this.remember(this.indicatorCache, key, result.results);
      })
      .catch(error => {
        if (isAbortError(error)) throw error;
        this.assertCurrentRevision(datasetKey, scopeKey, revision);
        const fallback = runIndicatorFallback(compatibilityCandles, normalized.configs);
        this.incrementalPrimed.delete(`${incrementalKey}|${normalized.signature}`);
        return this.remember(this.indicatorCache, key, fallback);
      })
      .finally(() => this.indicatorInflight.delete(key));
    this.indicatorInflight.set(key, promise);
    return promise.then(result => remapIndicatorResults(result, normalized.ids, active));
  }

  clear(): void {
    this.clearEpoch += 1;
    this.latestCandleChanges.clear(); this.incrementalOwners.clear();
    this.analyticsCache.clear();
    this.indicatorCache.clear();
    this.analyticsInflight.clear();
    this.indicatorInflight.clear();
    this.incrementalPrimed.clear();
  }

  dispose(): void {
    this.clear();
    this.analyticsQueue.terminate();
    this.indicatorQueue.terminate();
  }
}

export const chartComputeCoordinator = new ChartComputeCoordinator();
