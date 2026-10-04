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

type Pending<T> = {
  requestId: number;
  payload: Omit<T, 'requestId'>;
  resolve: (value: any) => void;
  reject: (reason: unknown) => void;
  transferables?: Transferable[];
};

const MAX_ANALYTICS_WORKERS = 2;
const MAX_INDICATOR_WORKERS = 2;
const MAX_CACHE_ENTRIES = 48;
const WORKER_TIMEOUT_MS = 15_000;

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

  constructor(private readonly workerUrl: URL, private readonly maxWorkers: number) {}

  private ensureWorker(): Worker {
    const existing = this.workers.find(worker => worker && !this.busy.has(worker));
    if (existing) return existing;
    if (this.workers.length >= this.maxWorkers) return this.workers.find(Boolean)!;
    const worker = new Worker(this.workerUrl, { type: 'module' });
    this.workers.push(worker);
    worker.onmessage = event => this.onMessage(worker, event.data);
    worker.onerror = () => this.onWorkerFailure(worker, new Error('Shared chart worker failed'));
    return worker;
  }

  private onMessage(worker: Worker, message: any): void {
    const requestId = Number(message?.requestId);
    if (!requestId) return;
    const pending = this.pending.get(requestId);
    if (!pending) return;
    this.pending.delete(requestId);
    this.busy.delete(worker);
    if (message?.error) pending.reject(new Error(String(message.error)));
    else pending.resolve(message as Result);
    this.dispatch();
  }

  private onWorkerFailure(worker: Worker, error: Error): void {
    const requestId = this.busy.get(worker);
    if (requestId) {
      const pending = this.pending.get(requestId);
      if (pending) {
        this.pending.delete(requestId);
        pending.reject(error);
      }
    }
    this.busy.delete(worker);
    try { worker.terminate(); } catch {}
    const index = this.workers.indexOf(worker);
    if (index >= 0) this.workers.splice(index, 1);
    for (const [key, value] of this.affinity) if (value === worker) this.affinity.delete(key);
    this.dispatch();
  }

  private dispatch(): void {
    while (this.queue.length) {
      const pending = this.queue[0];
      const affinityWorker = pending.affinityKey ? this.affinity.get(pending.affinityKey) : undefined;
      const preferredIdle = affinityWorker && !this.busy.has(affinityWorker) ? affinityWorker : undefined;
      const idle = preferredIdle
        || this.workers.find(worker => worker && !this.busy.has(worker))
        || (this.workers.length < this.maxWorkers ? this.ensureWorker() : undefined);
      if (!idle) return;
      this.queue.shift();
      if (pending.affinityKey && !affinityWorker) this.affinity.set(pending.affinityKey, idle);
      this.busy.set(idle, pending.requestId);
      this.pending.set(pending.requestId, pending);
      const timeout = setTimeout(() => {
        if (!this.pending.has(pending.requestId)) return;
        this.onWorkerFailure(idle, new Error('Shared chart worker timed out'));
      }, WORKER_TIMEOUT_MS);
      Promise.resolve().then(() => {
        if (!this.pending.has(pending.requestId)) { clearTimeout(timeout); return; }
        try {
          (idle as any).postMessage({ requestId: pending.requestId, ...(pending.payload as any) }, pending.transferables || []);
        } catch (error) {
          clearTimeout(timeout);
          this.onWorkerFailure(idle, error instanceof Error ? error : new Error(String(error)));
        }
      });
      const originalResolve = pending.resolve;
      const originalReject = pending.reject;
      pending.resolve = value => { clearTimeout(timeout); originalResolve(value); };
      pending.reject = error => { clearTimeout(timeout); originalReject(error); };
    }
  }

  run(payload: Omit<Payload, 'requestId'>, affinityKey?: string, transferables?: Transferable[]): Promise<Result> {
    return new Promise((resolve, reject) => {
      const requestId = ++this.sequence;
      this.queue.push({ requestId, payload, resolve, reject, affinityKey, transferables });
      this.dispatch();
    });
  }

  terminate(): void {
    this.queue = [];
    this.pending.clear();
    for (const worker of this.workers) {
      try { worker?.terminate(); } catch {}
    }
    this.workers.length = 0;
    this.busy.clear();
    this.affinity.clear();
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
    const key = `${datasetKey}|${revision}|${market.length}|${tailKey(market)}|${Number(spot).toPrecision(12)}`;
    const cached = this.analyticsCache.get(key);
    if (cached) return Promise.resolve(cached);
    const inflight = this.analyticsInflight.get(key);
    if (inflight) return inflight;
    const packet = createCanonicalMarketDataPacket(market);
    const promise = this.analyticsQueue.run(
      { market: packet, spot },
      undefined,
      packetTransferables(packet),
    )
      .then(result => this.remember(this.analyticsCache, key, result.analytics))
      .catch(() => this.remember(this.analyticsCache, key, buildChartAnalytics(compatibilityCandles, spot)))
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
      return this.indicatorQueue.run(payload, incrementalKey, transfer)
        .then(result => {
          if (result.resetRequired) {
            this.incrementalPrimed.delete(primeKey);
            const reseed = createCanonicalMarketDataPacket(market);
            return this.indicatorQueue.run(
              { ...payloadBase, market: reseed, seedOnMiss: true },
              incrementalKey,
              packetTransferables(reseed),
            ).then(seedResult => {
              this.incrementalPrimed.add(primeKey);
              return remapIndicatorResults(seedResult.results, normalized.ids, active);
            });
          }
          this.incrementalPrimed.add(primeKey);
          return remapIndicatorResults(result.results, normalized.ids, active);
        })
        .catch(() => {
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
      payload,
      incrementalConfigs.length > 0 ? incrementalKey : datasetKey,
      packetTransferables(packet),
    )
      .then(result => {
        if (incrementalConfigs.length > 0) this.incrementalPrimed.add(`${incrementalKey}|${normalized.signature}`);
        return this.remember(this.indicatorCache, key, result.results);
      })
      .catch(() => {
        const fallback = runIndicatorFallback(compatibilityCandles, normalized.configs);
        this.incrementalPrimed.delete(`${incrementalKey}|${normalized.signature}`);
        return this.remember(this.indicatorCache, key, fallback);
      })
      .finally(() => this.indicatorInflight.delete(key));
    this.indicatorInflight.set(key, promise);
    return promise.then(result => remapIndicatorResults(result, normalized.ids, active));
  }

  clear(): void {
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
