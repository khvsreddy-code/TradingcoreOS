import type { CoreSpiritDataRequest } from './types';
import type { CoreSpiritObject } from './types';
import type { CoreSpiritBarPhase } from './types';

export type CoreSpiritResourceBudget = Readonly<{
  maxInstructionsPerRevision: number;
  maxLookbackBars: number;
  maxMemoryBytesPerRevision: number;
  maxVisualObjectsPerRevision: number;
  maxDependenciesPerRevision: number;
  maxDataRequestsPerRevision: number;
  maxModelCallsPerRevision: number;
  maxMultiSymbolRequestsPerRevision: number;
  maxMultiTimeframeRequestsPerRevision: number;
  maxExecutionTimeMs: number;
  maxInstructionsPerRun: number;
  maxVisualObjectsPerRun: number;
  maxMemoryBytesPerRun: number;
  maxDataRequestsPerRun: number;
  maxModelCallsPerRun: number;
  maxExecutionTimeMsPerRun: number;
}>;

export const CORE_SPIRIT_DEFAULT_RESOURCE_BUDGET: CoreSpiritResourceBudget = Object.freeze({
  maxInstructionsPerRevision: 10_000,
  maxLookbackBars: 50_000,
  maxMemoryBytesPerRevision: 24 * 1024 * 1024,
  maxVisualObjectsPerRevision: 1_500,
  maxDependenciesPerRevision: 1_024,
  maxDataRequestsPerRevision: 128,
  maxModelCallsPerRevision: 32,
  maxMultiSymbolRequestsPerRevision: 16,
  maxMultiTimeframeRequestsPerRevision: 16,
  maxExecutionTimeMs: 50,
  maxInstructionsPerRun: 20_000_000,
  maxVisualObjectsPerRun: 100_000,
  maxMemoryBytesPerRun: 128 * 1024 * 1024,
  maxDataRequestsPerRun: 10_000,
  maxModelCallsPerRun: 500,
  maxExecutionTimeMsPerRun: 30_000,
});

export type CoreSpiritResourceUsage = Readonly<{
  barIndex: number;
  barPhase: CoreSpiritBarPhase;
  instructions: number;
  visualObjects: number;
  dataRequests: number;
  modelCalls: number;
  allocatedBytes: number;
  activeDependencies: number;
  symbols: number;
  timeframes: number;
  elapsedMs: number;
}>;

export class CoreSpiritResourceLimitError extends Error {
  readonly code = 'CORESPIRIT_RESOURCE_LIMIT_EXCEEDED';
  constructor(
    readonly resource: keyof CoreSpiritResourceBudget,
    readonly limit: number,
    readonly observed: number,
  ) {
    super(`CoreSpirit resource budget exceeded: ${resource} (${observed} > ${limit})`);
    this.name = 'CoreSpiritResourceLimitError';
  }
}

function positiveInteger(value: number, name: keyof CoreSpiritResourceBudget): number {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`CoreSpirit resource budget ${name} must be a positive safe integer.`);
  return value;
}

function estimateBytes(value: unknown, seen = new WeakSet<object>(), depth = 0): number {
  if (value == null) return 8;
  if (typeof value === 'number' || typeof value === 'boolean') return 8;
  if (typeof value === 'string') return value.length * 2 + 8;
  if (typeof value !== 'object' || depth > 5) return 16;
  const object = value as object;
  if (seen.has(object)) return 0;
  seen.add(object);
  if (ArrayBuffer.isView(value)) return Number((value as ArrayBufferView).byteLength) + 32;
  if (value instanceof ArrayBuffer) return value.byteLength + 32;
  if (Array.isArray(value)) {
    let bytes = 24;
    const length = Math.min(value.length, 10_000);
    for (let index = 0; index < length; index += 1) bytes += estimateBytes(value[index], seen, depth + 1);
    return bytes;
  }
  let bytes = 64;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 256)) {
    bytes += key.length * 2 + estimateBytes(entry, seen, depth + 1);
  }
  return bytes;
}

const VISUAL_KINDS = new Set([
  'marker', 'label', 'line', 'zone', 'box', 'band', 'arrow', 'shape',
  'polyline', 'polygon', 'hline', 'background', 'barcolor', 'table',
  'footprint', 'customVisual',
]);

/**
 * Per-revision governor used by the runtime, data host and output collector.
 * It is a guardrail, not an OS memory profiler: allocations are conservative
 * estimates of retained payload size and are intentionally charged before
 * the output or resolver result is retained.
 */
export class CoreSpiritResourceGovernor {
  readonly budget: CoreSpiritResourceBudget;
  private startedAt = 0;
  private executionStartedAt = 0;
  private barIndex = -1;
  private barPhase: CoreSpiritBarPhase = 'historical';
  private instructions = 0;
  private runInstructions = 0;
  private visualObjects = 0;
  private runVisualObjects = 0;
  private dataRequests = 0;
  private runDataRequests = 0;
  private modelCalls = 0;
  private runModelCalls = 0;
  private allocatedBytes = 0;
  private runAllocatedBytes = 0;
  private activeDependencies = 0;
  private readonly symbols = new Set<string>();
  private readonly timeframes = new Set<string>();
  private readonly dependencies = new Set<string>();
  private readonly runDependencies = new Set<string>();

  constructor(overrides: Partial<CoreSpiritResourceBudget> = {}, private readonly clock: () => number = () => {
    return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
  }) {
    const merged = { ...CORE_SPIRIT_DEFAULT_RESOURCE_BUDGET, ...overrides };
    for (const [key, value] of Object.entries(merged)) positiveInteger(Number(value), key as keyof CoreSpiritResourceBudget);
    this.budget = Object.freeze(merged);
  }

  /** Start one whole script evaluation/replay; run-level caps survive per-bar resets. */
  beginExecution(): void {
    this.executionStartedAt = this.clock();
    this.runInstructions = 0;
    this.runVisualObjects = 0;
    this.runDataRequests = 0;
    this.runModelCalls = 0;
    this.runAllocatedBytes = 0;
    this.runDependencies.clear();
  }

  beginRevision(barIndex: number, phase: CoreSpiritBarPhase): void {
    this.startedAt = this.clock();
    this.barIndex = Math.max(-1, Math.floor(Number(barIndex) || 0));
    this.barPhase = phase;
    this.instructions = 0;
    this.visualObjects = 0;
    this.dataRequests = 0;
    this.modelCalls = 0;
    this.allocatedBytes = 0;
    this.activeDependencies = 0;
    this.symbols.clear();
    this.timeframes.clear();
    this.dependencies.clear();
  }

  private consume(resource: keyof CoreSpiritResourceBudget, current: number, amount: number): number {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`Invalid CoreSpirit resource charge for ${resource}.`);
    const next = current + amount;
    const limit = this.budget[resource];
    if (next > limit) throw new CoreSpiritResourceLimitError(resource, limit, next);
    return next;
  }

  consumeInstructions(amount = 1): void {
    this.instructions = this.consume('maxInstructionsPerRevision', this.instructions, amount);
    this.runInstructions = this.consume('maxInstructionsPerRun', this.runInstructions, amount);
  }

  assertLookback(requiredBars: number): void {
    const required = Math.max(0, Math.ceil(Number(requiredBars) || 0));
    if (required > this.budget.maxLookbackBars) {
      throw new CoreSpiritResourceLimitError('maxLookbackBars', this.budget.maxLookbackBars, required);
    }
  }

  assertDependencies(dependencyIds: readonly string[] | number): void {
    const ids = typeof dependencyIds === 'number'
      ? Array.from({ length: Math.max(0, Math.floor(dependencyIds)) }, (_, index) => String(index))
      : dependencyIds;
    const unique = new Set(ids.map(value => String(value).trim()).filter(Boolean));
    this.activeDependencies = this.consume('maxDependenciesPerRevision', 0, unique.size);
    if (this.activeDependencies > this.budget.maxDependenciesPerRevision) {
      throw new CoreSpiritResourceLimitError('maxDependenciesPerRevision', this.budget.maxDependenciesPerRevision, this.activeDependencies);
    }
  }

  recordDataRequest(request: Pick<CoreSpiritDataRequest, 'symbol' | 'timeframe' | 'field'>): void {
    this.dataRequests = this.consume('maxDataRequestsPerRevision', this.dataRequests, 1);
    this.runDataRequests = this.consume('maxDataRequestsPerRun', this.runDataRequests, 1);
    const symbol = String(request.symbol || '').trim().toUpperCase();
    const timeframe = String(request.timeframe || '').trim().toLowerCase();
    if (symbol) this.symbols.add(symbol);
    if (timeframe) this.timeframes.add(timeframe);
    this.consume('maxMultiSymbolRequestsPerRevision', 0, Math.max(0, this.symbols.size - 1));
    this.consume('maxMultiTimeframeRequestsPerRevision', 0, Math.max(0, this.timeframes.size - 1));
    const dependency = [symbol, timeframe, request.field].join(':');
    this.dependencies.add(dependency);
    this.runDependencies.add(dependency);
    if (this.runDependencies.size > this.budget.maxDependenciesPerRevision) {
      throw new CoreSpiritResourceLimitError('maxDependenciesPerRevision', this.budget.maxDependenciesPerRevision, this.runDependencies.size);
    }
    if (this.dependencies.size > this.budget.maxDependenciesPerRevision) {
      throw new CoreSpiritResourceLimitError('maxDependenciesPerRevision', this.budget.maxDependenciesPerRevision, this.dependencies.size);
    }
    this.activeDependencies = Math.max(this.activeDependencies, this.dependencies.size);
  }

  recordModelCall(): void {
    this.modelCalls = this.consume('maxModelCallsPerRevision', this.modelCalls, 1);
    this.runModelCalls = this.consume('maxModelCallsPerRun', this.runModelCalls, 1);
  }

  recordOutput(value: CoreSpiritObject, createsVisualObject = true): void {
    if (createsVisualObject && VISUAL_KINDS.has(value.kind)) {
      this.visualObjects = this.consume('maxVisualObjectsPerRevision', this.visualObjects, 1);
      this.runVisualObjects = this.consume('maxVisualObjectsPerRun', this.runVisualObjects, 1);
    }
    this.recordAllocation(estimateBytes(value));
  }

  recordResolvedData(value: unknown): void {
    this.recordAllocation(estimateBytes(value));
  }

  recordAllocation(bytes: number): void {
    const amount = Math.max(0, Math.ceil(Number(bytes) || 0));
    this.allocatedBytes = this.consume('maxMemoryBytesPerRevision', this.allocatedBytes, amount);
    this.runAllocatedBytes = this.consume('maxMemoryBytesPerRun', this.runAllocatedBytes, amount);
  }

  assertExecutionTime(): void {
    const elapsed = Math.max(0, this.clock() - this.startedAt);
    if (this.startedAt > 0 && elapsed > this.budget.maxExecutionTimeMs) {
      throw new CoreSpiritResourceLimitError('maxExecutionTimeMs', this.budget.maxExecutionTimeMs, elapsed);
    }
    const runElapsed = Math.max(0, this.clock() - this.executionStartedAt);
    if (this.executionStartedAt > 0 && runElapsed > this.budget.maxExecutionTimeMsPerRun) {
      throw new CoreSpiritResourceLimitError('maxExecutionTimeMsPerRun', this.budget.maxExecutionTimeMsPerRun, runElapsed);
    }
  }

  snapshot(): CoreSpiritResourceUsage {
    return Object.freeze({
      barIndex: this.barIndex,
      barPhase: this.barPhase,
      instructions: this.instructions,
      visualObjects: this.visualObjects,
      dataRequests: this.dataRequests,
      modelCalls: this.modelCalls,
      allocatedBytes: this.allocatedBytes,
      activeDependencies: this.activeDependencies,
      symbols: this.symbols.size,
      timeframes: this.timeframes.size,
      elapsedMs: this.startedAt > 0 ? Math.max(0, this.clock() - this.startedAt) : 0,
    });
  }
}
