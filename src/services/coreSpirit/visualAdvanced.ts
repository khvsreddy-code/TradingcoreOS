/**
 * CoreSpirit advanced visual data contracts — #5.
 *
 * These are renderer-neutral geometry/data descriptions. A CoreSpirit program
 * declares analytical data; the host renderer decides whether that becomes
 * Canvas, SVG, WebGL, WebGPU, a native surface, an image, or a replay view.
 */

export const CORE_SPIRIT_ADVANCED_VISUAL_VERSION = 1 as const;

export type CoreSpiritVisualDataKind =
  | 'heatmap'
  | 'liquidityMap'
  | 'depthMap'
  | 'volumeProfile'
  | 'footprint'
  | 'structureGraph'
  | 'probabilitySurface'
  | 'regimeBand'
  | 'tradePath'
  | 'modelField'
  | 'replayTrace';

export type CoreSpiritVisualValueRange = Readonly<{
  min: number;
  max: number;
}>;

export type CoreSpiritVisualGrid = Readonly<{
  columns: number;
  rows: number;
  values: readonly number[];
  x?: readonly number[];
  y?: readonly number[];
  valueRange?: CoreSpiritVisualValueRange;
  normalized?: boolean;
}>;

export type CoreSpiritVisualDepthLevel = Readonly<{
  price: number;
  bidVolume?: number;
  askVolume?: number;
  totalVolume?: number;
  imbalance?: number;
}>;

export type CoreSpiritVisualVolumeBin = Readonly<{
  priceLow: number;
  priceHigh: number;
  volume: number;
  buyVolume?: number;
  sellVolume?: number;
  delta?: number;
  valueArea?: boolean;
}>;

export type CoreSpiritVisualGraphNode = Readonly<{
  id: string;
  time?: number;
  price?: number;
  label?: string;
  weight?: number;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type CoreSpiritVisualGraphEdge = Readonly<{
  id: string;
  from: string;
  to: string;
  weight?: number;
  type?: string;
}>;

export type CoreSpiritVisualTradePathPoint = Readonly<{
  time: number;
  price: number;
  side?: 'buy' | 'sell' | 'flat';
  quantity?: number;
  pnl?: number;
}>;

export type CoreSpiritVisualTradePath = Readonly<{
  points: readonly CoreSpiritVisualTradePathPoint[];
  realizedPnl?: number;
  maxAdverseExcursion?: number;
  maxFavorableExcursion?: number;
}>;

export type CoreSpiritVisualAnimation = Readonly<{
  clock: 'realtime' | 'replay' | 'event';
  durationMs?: number;
  startAt?: number;
  loop?: boolean;
  easing?: 'linear' | 'step' | 'easeIn' | 'easeOut' | 'easeInOut';
  phase?: number;
}>;

export type CoreSpiritAdvancedVisualPayload =
  | Readonly<{ kind: 'heatmap' | 'liquidityMap' | 'probabilitySurface' | 'modelField'; grid: CoreSpiritVisualGrid; colorDomain?: CoreSpiritVisualValueRange; animation?: CoreSpiritVisualAnimation }>
  | Readonly<{ kind: 'depthMap'; levels: readonly CoreSpiritVisualDepthLevel[]; priceRange?: CoreSpiritVisualValueRange; animation?: CoreSpiritVisualAnimation }>
  | Readonly<{ kind: 'volumeProfile'; bins: readonly CoreSpiritVisualVolumeBin[]; poc?: number; vah?: number; val?: number }>
  | Readonly<{ kind: 'footprint'; rows: readonly CoreSpiritVisualDepthLevel[]; maxAbsDelta?: number }>
  | Readonly<{ kind: 'structureGraph'; nodes: readonly CoreSpiritVisualGraphNode[]; edges: readonly CoreSpiritVisualGraphEdge[] }>
  | Readonly<{ kind: 'regimeBand'; start: number; end: number; regime: string; confidence?: number; metadata?: Readonly<Record<string, string | number | boolean | null>> }>
  | Readonly<{ kind: 'tradePath'; path: CoreSpiritVisualTradePath; animation?: CoreSpiritVisualAnimation }>
  | Readonly<{ kind: 'replayTrace'; points: readonly CoreSpiritVisualTradePathPoint[]; animation: CoreSpiritVisualAnimation }>;

export type CoreSpiritAdvancedVisualObject = Readonly<{
  id: string;
  sourceId: string;
  kind: CoreSpiritVisualDataKind;
  timeRange?: Readonly<{ start: number; end: number }>;
  zIndex?: number;
  semanticRole?: string;
  payload: CoreSpiritAdvancedVisualPayload;
  metadata?: Readonly<Record<string, string | number | boolean | null>>;
}>;

export type CoreSpiritAdvancedVisualQuota = Readonly<{
  maxCells: number;
  maxDepthLevels: number;
  maxVolumeBins: number;
  maxGraphNodes: number;
  maxGraphEdges: number;
  maxTradePathPoints: number;
}>;

export const CORE_SPIRIT_ADVANCED_VISUAL_DEFAULT_QUOTA: CoreSpiritAdvancedVisualQuota = Object.freeze({
  maxCells: 250_000,
  maxDepthLevels: 20_000,
  maxVolumeBins: 10_000,
  maxGraphNodes: 20_000,
  maxGraphEdges: 40_000,
  maxTradePathPoints: 50_000,
});

export function validateCoreSpiritAdvancedVisual(
  visual: CoreSpiritAdvancedVisualObject,
  quota: CoreSpiritAdvancedVisualQuota = CORE_SPIRIT_ADVANCED_VISUAL_DEFAULT_QUOTA,
): string[] {
  const errors: string[] = [];
  const payload = visual.payload;
  if (payload.kind === 'heatmap' || payload.kind === 'liquidityMap' || payload.kind === 'probabilitySurface' || payload.kind === 'modelField') {
    if (!Number.isInteger(payload.grid.columns) || !Number.isInteger(payload.grid.rows)) errors.push(`${visual.id}: grid dimensions must be integers`);
    if (payload.grid.columns < 1 || payload.grid.rows < 1) errors.push(`${visual.id}: grid dimensions must be positive`);
    if (payload.grid.values.length !== payload.grid.columns * payload.grid.rows) errors.push(`${visual.id}: grid values must equal rows*columns`);
    if (payload.grid.values.length > quota.maxCells) errors.push(`${visual.id}: grid exceeds maxCells`);
    if (payload.grid.values.some(value => !Number.isFinite(value))) errors.push(`${visual.id}: grid contains non-finite values`);
  }
  if (payload.kind === 'depthMap' || payload.kind === 'footprint') {
    const levels = payload.kind === 'depthMap' ? payload.levels : payload.rows;
    if (levels.length > quota.maxDepthLevels) errors.push(`${visual.id}: depth/footprint levels exceed quota`);
    if (levels.some(level => !Number.isFinite(level.price))) errors.push(`${visual.id}: depth/footprint contains non-finite prices`);
  }
  if (payload.kind === 'volumeProfile') {
    if (payload.bins.length > quota.maxVolumeBins) errors.push(`${visual.id}: volume bins exceed quota`);
    if (payload.bins.some(bin => bin.priceLow > bin.priceHigh)) errors.push(`${visual.id}: volume bin range is inverted`);
  }
  if (payload.kind === 'structureGraph') {
    if (payload.nodes.length > quota.maxGraphNodes) errors.push(`${visual.id}: graph node quota exceeded`);
    if (payload.edges.length > quota.maxGraphEdges) errors.push(`${visual.id}: graph edge quota exceeded`);
    const ids = new Set(payload.nodes.map(node => node.id));
    for (const edge of payload.edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) errors.push(`${visual.id}: graph edge '${edge.id}' references a missing node`);
    }
  }
  if (payload.kind === 'tradePath' && payload.path.points.length > quota.maxTradePathPoints) errors.push(`${visual.id}: trade path quota exceeded`);
  if (payload.kind === 'replayTrace' && payload.points.length > quota.maxTradePathPoints) errors.push(`${visual.id}: replay trace quota exceeded`);
  return errors;
}
