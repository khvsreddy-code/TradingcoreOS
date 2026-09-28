/**
 * Native scanner host for CoreSpirit artifacts.
 *
 * Scanning is a host concern: the VM evaluates one immutable artifact per
 * instrument, while the scanner owns universe discovery, scheduling, ranking,
 * dedupe and candidate aggregation. A production worker scheduler can replace
 * the default local scheduler without changing the language or artifact ABI.
 */
import type { CoreSpiritExecutableArtifact } from './artifact';
import { CoreSpiritHistoricalExecutionHost, type CoreSpiritHostRunResult } from './executionHost';
import type { CoreSpiritMarketDataset } from './marketData';
import type { CoreSpiritObject } from './types';

export const CORE_SPIRIT_SCANNER_VERSION = 1 as const;

export interface CoreSpiritScanUniverseItem {
  readonly symbol: string;
  readonly dataset: CoreSpiritMarketDataset;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface CoreSpiritScanUniverse {
  readonly id: string;
  readonly items: readonly CoreSpiritScanUniverseItem[];
}

export type CoreSpiritScanCandidate = Readonly<{
  id: string;
  symbol: string;
  score: number;
  label?: string;
  time?: number;
  metadata: Readonly<Record<string, unknown>>;
  sourceId: string;
  programChecksum: string;
}>;

export type CoreSpiritScanInstrumentResult = Readonly<{
  symbol: string;
  run: CoreSpiritHostRunResult;
  candidates: readonly CoreSpiritScanCandidate[];
}>;

export type CoreSpiritScanRun = Readonly<{
  version: typeof CORE_SPIRIT_SCANNER_VERSION;
  universeId: string;
  sourceId: string;
  artifactChecksum: string;
  scanned: number;
  candidates: readonly CoreSpiritScanCandidate[];
  instruments: readonly CoreSpiritScanInstrumentResult[];
  startedAt: number;
  finishedAt: number;
}>;

export interface CoreSpiritScanScheduler {
  map<T, R>(items: readonly T[], worker: (item: T, index: number) => R, concurrency: number): Promise<readonly R[]>;
}

/**
 * Default scheduler keeps deterministic ordering. It is intentionally a host
 * abstraction: browser/Node deployments can replace it with Worker Threads or
 * Web Workers for true CPU parallelism without changing the CoreSpirit ABI.
 */
export class CoreSpiritDeterministicScanScheduler implements CoreSpiritScanScheduler {
  async map<T, R>(items: readonly T[], worker: (item: T, index: number) => R, concurrency: number): Promise<readonly R[]> {
    const safeConcurrency = Math.max(1, Math.floor(concurrency));
    const result = new Array<R>(items.length);
    let cursor = 0;
    while (cursor < items.length) {
      const batch = items.slice(cursor, cursor + safeConcurrency);
      const batchStart = cursor;
      const outputs = await Promise.all(batch.map((item, offset) => Promise.resolve(worker(item, batchStart + offset))));
      outputs.forEach((value, offset) => { result[batchStart + offset] = value; });
      cursor += batch.length;
    }
    return result;
  }
}

export interface CoreSpiritScannerOptions {
  readonly concurrency?: number;
  readonly topN?: number;
  readonly minScore?: number;
  readonly descending?: boolean;
  readonly runIdPrefix?: string;
}

export class CoreSpiritScanner {
  constructor(private readonly scheduler: CoreSpiritScanScheduler = new CoreSpiritDeterministicScanScheduler()) {}

  async runArtifact(
    artifact: CoreSpiritExecutableArtifact,
    universe: CoreSpiritScanUniverse,
    options: CoreSpiritScannerOptions = {},
  ): Promise<CoreSpiritScanRun> {
    const startedAt = Date.now();
    const host = new CoreSpiritHistoricalExecutionHost();
    const results = await this.scheduler.map(
      universe.items,
      (item, index) => {
        const runId = `${options.runIdPrefix || artifact.sourceId}:scan:${universe.id}:${index}`;
        const run = host.run(artifact, item.dataset, runId, 'scanner');
        return { symbol: item.symbol, run, candidates: this.candidatesFromOutputs(artifact, run, item.metadata) } satisfies CoreSpiritScanInstrumentResult;
      },
      options.concurrency ?? 8,
    );

    const descending = options.descending !== false;
    const minScore = Number.isFinite(options.minScore) ? Number(options.minScore) : Number.NEGATIVE_INFINITY;
    const all = results.flatMap(result => result.candidates).filter(candidate => candidate.score >= minScore);
    all.sort((a, b) => (descending ? b.score - a.score : a.score - b.score) || a.symbol.localeCompare(b.symbol) || a.id.localeCompare(b.id));
    const topN = options.topN == null ? all.length : Math.max(0, Math.floor(options.topN));

    return Object.freeze({
      version: CORE_SPIRIT_SCANNER_VERSION,
      universeId: universe.id,
      sourceId: artifact.sourceId,
      artifactChecksum: artifact.checksum,
      scanned: universe.items.length,
      candidates: Object.freeze(all.slice(0, topN)),
      instruments: Object.freeze(results),
      startedAt,
      finishedAt: Date.now(),
    });
  }

  private candidatesFromOutputs(
    artifact: CoreSpiritExecutableArtifact,
    run: CoreSpiritHostRunResult,
    universeMetadata?: Readonly<Record<string, unknown>>,
  ): readonly CoreSpiritScanCandidate[] {
    const outputs = run.outputs.filter((output): output is Extract<CoreSpiritObject, { kind: 'scanCandidate' }> => output.kind === 'scanCandidate');
    return Object.freeze(outputs.map(output => Object.freeze({
      id: output.id,
      symbol: run.identity.symbol,
      score: output.score,
      label: output.label,
      time: output.time,
      metadata: Object.freeze({ ...(universeMetadata || {}), ...(output.metadata || {}) }),
      sourceId: artifact.sourceId,
      programChecksum: artifact.checksum,
    })));
  }
}
