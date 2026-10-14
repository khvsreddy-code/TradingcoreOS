/** TradingCoreOS 2 canonical architecture. */
export const TRADINGCOREOS_ARCHITECTURE_VERSION = 2 as const;

export type TradingCoreOSPlane = 'marketData' | 'coreSpirit' | 'compute' | 'vela' | 'trading';

export interface TradingCoreOSPlaneContract {
  readonly id: TradingCoreOSPlane;
  readonly responsibilities: readonly string[];
  readonly mayDependOn: readonly TradingCoreOSPlane[];
}

export const TRADINGCOREOS_ARCHITECTURE: readonly TradingCoreOSPlaneContract[] = Object.freeze([
  { id: 'marketData', responsibilities: ['canonical columnar data', 'realtime tick stream', 'history demand', 'multi-timeframe aggregation'], mayDependOn: [] },
  { id: 'coreSpirit', responsibilities: ['parser', 'semantic analyzer', 'optimizer', 'executable IR', 'runtime VM', 'state kernels', 'capability system'], mayDependOn: ['marketData', 'compute'] },
  { id: 'compute', responsibilities: ['CPU scalar execution', 'CPU vectorized execution', 'Worker/WASM execution', 'future GPU/WebGPU execution'], mayDependOn: ['marketData'] },
  { id: 'vela', responsibilities: ['chart model', 'renderer', 'drawings', 'panes', 'native indicators', 'workspace'], mayDependOn: ['marketData', 'compute', 'coreSpirit'] },
  { id: 'trading', responsibilities: ['strategy', 'risk', 'execution', 'portfolio', 'AI'], mayDependOn: ['marketData', 'coreSpirit', 'compute'] },
]);

/**
 * Canonical boundary rules. Adapters implement these contracts rather than
 * grow parallel stores, schedulers, renderers, or order state machines.
 */
export const TRADINGCOREOS_BOUNDARY_CONTRACTS = Object.freeze({
  marketDataSnapshot: Object.freeze({
    owner: 'marketData',
    identity: 'timelineKey+revision',
    timeUnit: 'epoch-seconds',
    canonicalBuffers: 'borrowed',
  }),
  canonicalDirtyRange: Object.freeze({
    owner: 'marketData',
    coordinate: 'bar-index',
    bounds: 'half-open',
  }),
  velaDirtyRange: Object.freeze({
    owner: 'vela',
    coordinate: 'epoch-milliseconds',
    bounds: 'inclusive',
  }),
  visibleRange: Object.freeze({
    owner: 'vela',
    coordinate: 'epoch-milliseconds',
    authoritative: true,
  }),
  indicatorOutputPatch: Object.freeze({
    owner: 'coreSpirit',
    semanticAuthority: 'coreSpirit-runtime',
    sourceRevisionRequired: true,
  }),
  chartSeriesPatch: Object.freeze({
    owner: 'vela',
    liveOperations: Object.freeze(['append', 'replace-last']),
    fullReplacementOnlyFor: Object.freeze(['bootstrap', 'symbol-timeframe-change', 'history-reconciliation']),
  }),
  orderIntent: Object.freeze({
    owner: 'trading',
    signalIsOrder: false,
    riskApprovalRequired: true,
    policyApprovalRequired: true,
  }),
  orderStateTransition: Object.freeze({
    owner: 'trading',
    deduplicateBeforePublish: true,
    reconcileSnapshotBeforePublish: true,
  }),
} as const);

const byId = new Map(TRADINGCOREOS_ARCHITECTURE.map((plane) => [plane.id, plane]));
export function validateTradingCoreOSDependency(from: TradingCoreOSPlane, to: TradingCoreOSPlane): boolean {
  return byId.get(from)?.mayDependOn.includes(to) ?? false;
}
export function assertTradingCoreOSDependency(from: TradingCoreOSPlane, to: TradingCoreOSPlane): void {
  if (!validateTradingCoreOSDependency(from, to)) throw new Error(`Non-canonical TradingCoreOS dependency: ${from} -> ${to}`);
}

export const TRADINGCOREOS_ARCHITECTURE_POLICY = Object.freeze({
  noReleaseStagesInProductionTree: true,
  noVersionedArchitectureTests: true,
  historyLivesInGit: true,
  historicalDocsLiveUnder: 'docs/archive',
  vendorIsImplementationDetail: true,
} as const);