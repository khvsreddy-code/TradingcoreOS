import type { CoreSpiritAst } from './ast';
import type { CoreSpiritMarketBar } from './marketData';
import type { CoreSpiritSurfaceMetadata, CoreSpiritEventDestination } from './languageConcepts';
import type { CoreSpiritVisualGeometry, CoreSpiritVisualPlacement, CoreSpiritVisualRelativePosition } from './visualCoordinates';

/** Neutral market-bar alias; CoreSpirit stays independent of broker adapters. */
export type HistoricalCandle = CoreSpiritMarketBar;

export type CoreSpiritValue = number | boolean | string | null;
export type CoreSpiritTrade = Readonly<{
  timestamp:number;
  price:number;
  volume:number;
  side:'buy'|'sell'|'unknown';
  symbol:string;
  sequence?:number;
}>;

export type CoreSpiritOrderBookLevel = Readonly<{ price:number; quantity:number; side:'bid'|'ask' }>;
export type CoreSpiritOrderBook = Readonly<{
  timestamp:number;
  symbol:string;
  bids:readonly CoreSpiritOrderBookLevel[];
  asks:readonly CoreSpiritOrderBookLevel[];
  sequence?:number;
}>;

export type CoreSpiritVolumeProfileRow = Readonly<{ price:number; volume:number; buyVolume?:number; sellVolume?:number; delta?:number }>;
export type CoreSpiritVolumeProfile = Readonly<{
  startTime:number;
  endTime:number;
  rows:readonly CoreSpiritVolumeProfileRow[];
  poc?:number;
  vah?:number;
  val?:number;
}>;

export type CoreSpiritMatrix = Readonly<{
  rows:number;
  columns:number;
  data:Float64Array;
}>;

export type CoreSpiritTensor = Readonly<{
  shape:readonly number[];
  data:Float64Array;
}>;

export type CoreSpiritSeries = Array<CoreSpiritValue>;

/** Runtime bar-state flags exposed to the execution engine. */
export type CoreSpiritBarState = {
  index: number;
  time: number;
  isFirst: boolean;
  isLast: boolean;
  isRealtime: boolean;
  isConfirmed: boolean;
  revision: number;
  symbol?: string;
  timeframe?: string;
  mode?: CoreSpiritExecutionMode;
};

/** Shared output contract. Rendering remains owned by Core Chart. */
export type CoreSpiritPlotStyle = { color?: string; lineWidth?: number; lineStyle?: number; title?: string; priceLineVisible?: boolean; lastValueVisible?: boolean };
export type CoreSpiritLabelPosition = 'above' | 'below' | 'inBar' | 'price';
export type CoreSpiritLabelStyle = { background?: string; color?: string; border?: string; borderRadius?: number; fontSize?: number; fontWeight?: string; fontStyle?: 'normal' | 'italic'; textAlign?: 'left' | 'center' | 'right'; padding?: string; opacity?: number; shape?: 'pill' | 'box' | 'circle' };
export type CoreSpiritTableStyle = { background?: string; color?: string; fontSize?: number; fontWeight?: string; border?: string; padding?: string; opacity?: number; align?: 'left' | 'center' | 'right' };
export type CoreSpiritPoint = { time: number; price: number };
export type CoreSpiritVisualStyle = {
  color?: string; color2?: string; fillColor?: string; fillColor2?: string; fillOpacity?: number; opacity?: number;
  lineWidth?: number; lineStyle?: number; size?: number;
  shape?: 'circle' | 'square' | 'diamond' | 'triangleUp' | 'triangleDown' | 'arrowUp' | 'arrowDown' | 'cross' | 'star';
  pattern?: 'solid' | 'hatch' | 'dots' | 'stripes'; borderColor?: string; borderWidth?: number; textColor?: string; text?: string;
};

export type CoreSpiritObject =
  | { kind: 'series'; time: number; value: number | null; name?: string; seriesId?: string; style?: CoreSpiritPlotStyle; visual?: CoreSpiritVisualPlacement; range?: { min:number; max:number }; metadata?: Record<string, unknown> }
  | { kind: 'marker'; id?: string; time: number; price: number; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement; geometry?: CoreSpiritVisualGeometry }
  | { kind: 'label'; id: string; time: number; price: number; text: string; position: CoreSpiritLabelPosition; style?: CoreSpiritLabelStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement; relativePosition?: CoreSpiritVisualRelativePosition }
  | { kind: 'line'; id?: string; start: { time: number; price: number }; end: { time: number; price: number }; style?: Record<string, unknown>; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement; geometry?: CoreSpiritVisualGeometry }
  | { kind: 'zone'; id?: string; left: number; right: number; top: number; bottom: number; state?: 'active' | 'mitigated' | 'broken'; domain?: 'time'|'viewport'; style?: CoreSpiritVisualStyle & Record<string, unknown>; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'box'; id: string; left: number; right: number; top: number; bottom: number; style?: CoreSpiritVisualStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement; geometry?: CoreSpiritVisualGeometry }
  | { kind: 'band'; id: string; time: number; top: number | null; bottom: number | null; style?: CoreSpiritVisualStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'arrow'; id: string; start: { time: number; price: number }; end: { time: number; price: number }; style?: CoreSpiritVisualStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'shape'; id: string; time: number; price: number; shape: NonNullable<CoreSpiritVisualStyle['shape']>; style?: CoreSpiritVisualStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'polyline'; id: string; points: CoreSpiritPoint[]; style?: CoreSpiritVisualStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'polygon'; id: string; points: CoreSpiritPoint[]; style?: CoreSpiritVisualStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement; geometry: CoreSpiritVisualGeometry }
  | { kind: 'hline'; id: string; price: number; style?: CoreSpiritVisualStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'background'; id: string; time: number; color: string; opacity?: number; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'barcolor'; id: string; time: number; color: string; opacity?: number; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'table'; id: string; position: 'topLeft'|'topCenter'|'topRight'|'middleLeft'|'middleCenter'|'middleRight'|'bottomLeft'|'bottomCenter'|'bottomRight'; row: number; column: number; text: string; style?: CoreSpiritTableStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'footprint'; id: string; time: number; rows: CoreSpiritFootprintSceneRow[]; tickSize: number; style?: CoreSpiritVisualStyle; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement }
  | { kind: 'customVisual'; id: string; time?: number; metadata?: Record<string, unknown>; visual?: CoreSpiritVisualPlacement; geometry: CoreSpiritVisualGeometry | Record<string, unknown> }
  | { kind: 'signal'; time: number; type: string; metadata?: Record<string, unknown> }
  | { kind: 'event'; id: string; name: string; time: number; destinations?: CoreSpiritEventDestination[]; metadata?: Record<string, unknown> }
  | { kind: 'scanCandidate'; id: string; time?: number; score?: number; label?: string; metadata?: Record<string, unknown> }
  | { kind: 'orderIntent'; id: string; time: number; side: 'long'|'short'|'flat'; confidence: number; stop?: number|null; target?: number|null; tag?: string; sizing?: { kind:'quantity'; value:number } | { kind:'riskPercent'; value:number } | { kind:'all' }; metadata?: Record<string, unknown> };

export type CoreSpiritProgram = {
  version: 1;
  id: string;
  source: string;
  ast: CoreSpiritAst;
  surface?: CoreSpiritSurfaceMetadata;
};

export type CoreSpiritBarExecutionContext = {
  bars: HistoricalCandle[];
  barIndex: number;
  outputs: CoreSpiritObject[];
};

export type CoreSpiritExecutionMode = 'historical' | 'realtime' | 'replay' | 'backtest' | 'historicalTick';

/** A host-supplied market tick. The VM may consume it, but never opens sockets itself. */
export type CoreSpiritTick = {
  timestamp: number;
  price: number;
  volume?: number;
  bid?: number;
  ask?: number;
  side?: 'buy'|'sell'|'unknown';
};

/** Normalized intrabar observation. Hosts can provide true lower-TF bars or tick-derived bars. */
export type CoreSpiritIntrabar = {
  timestamp: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  delta?: number;
};

/** Optional quote/depth snapshot. The VM never owns a socket; the host owns freshness. */
export type CoreSpiritMarketSnapshot = {
  timestamp?: number;
  bid?: number | null;
  ask?: number | null;
  last?: number | null;
  spread?: number | null;
  mid?: number | null;
  depthImbalance?: number | null;
};

/** Normalized footprint row supplied by a market-data adapter. */
export type CoreSpiritFootprintRow = {
  price: number;
  buyVolume: number;
  sellVolume: number;
  delta?: number;
  totalVolume?: number;
  imbalance?: number;
};

/** Per-bar footprint snapshot. Kept provider-neutral so Fyers/Upstox/other feeds can adapt into it. */
export type CoreSpiritFootprint = {
  timestamp: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  poc?: number;
  vah?: number;
  val?: number;
  rows?: CoreSpiritFootprintRow[];
};

export type CoreSpiritDataRequest = {
  symbol: string;
  timeframe: string;
  field: 'open'|'high'|'low'|'close'|'volume'|'time';
  offset?: number;
};

export type CoreSpiritDataState = 'historical' | 'confirmed' | 'developing' | 'realtime';

export type CoreSpiritDataSnapshot = {
  value: number | null;
  source: string;
  symbol: string;
  timeframe: string;
  timestamp?: number;
  state?: CoreSpiritDataState;
  receivedAt?: number;
  revision?: number;
};

export type CoreSpiritAlignedPoint = {
  timestamp: number;
  value: number | null;
  state: CoreSpiritDataState;
  source?: string;
};

export type CoreSpiritIntrabarSeries = {
  parentTimestamp: number;
  timeframe: string;
  points: CoreSpiritIntrabar[];
  complete: boolean;
  source?: string;
};

export type CoreSpiritFootprintSceneRow = CoreSpiritFootprintRow & {
  intensity: number;
  side: 'buy' | 'sell' | 'balanced';
};

export type CoreSpiritFootprintScene = {
  id: string;
  timestamp: number;
  rows: CoreSpiritFootprintSceneRow[];
  poc?: number;
  vah?: number;
  val?: number;
  maxVolume: number;
  maxAbsDelta: number;
};

/** Host capability boundary for cross-symbol/TF/depth/footprint data. */
export type CoreSpiritDataAlignment = 'last-confirmed' | 'nearest-confirmed' | 'exact' | 'developing';

export type CoreSpiritDataResolutionContext = {
  asOfTimestamp: number;
  baseSymbol: string;
  baseTimeframe: string;
  executionMode: CoreSpiritExecutionMode;
  revision: number;
  alignment: CoreSpiritDataAlignment;
  maxStalenessMs?: number;
};

export type CoreSpiritDataResolver = {
  request?: (request: CoreSpiritDataRequest) => CoreSpiritDataSnapshot | Promise<CoreSpiritDataSnapshot>;
  /** Optional batched resolver. Hosts should prefer this for scripts requesting several symbols/TFs. */
  requestBatch?: (requests: CoreSpiritDataRequest[]) => CoreSpiritDataSnapshot[] | Promise<CoreSpiritDataSnapshot[]>;
  requestAt?: (request: CoreSpiritDataRequest, context: CoreSpiritDataResolutionContext) => CoreSpiritDataSnapshot | Promise<CoreSpiritDataSnapshot>;
  series?: (request: CoreSpiritDataRequest, context: CoreSpiritDataResolutionContext) => number[] | Promise<number[]>;
  /** Lower-TF data is now structured instead of being reduced to only the last value. */
  lowerTimeframe?: (timeframe: string, field: CoreSpiritDataRequest['field']) => number[] | Promise<number[]>;
  intrabars?: (timeframe: string) => CoreSpiritIntrabar[] | Promise<CoreSpiritIntrabar[]>;
  market?: () => CoreSpiritMarketSnapshot | null;
  depthImbalance?: () => number | null;
  footprint?: (symbol?: string, timeframe?: string) => CoreSpiritFootprint | null;
  trade?: (symbol?: string, timeframe?: string) => CoreSpiritTrade | null;
  orderbook?: (symbol?: string, timeframe?: string) => CoreSpiritOrderBook | null;
  volumeProfile?: (symbol?: string, timeframe?: string) => CoreSpiritVolumeProfile | null;
  /** Optional host cache hook; the VM remains network-free. */
  cacheKey?: (request: CoreSpiritDataRequest) => string;
};

export type CoreSpiritExecutionPolicy = {
  onEveryTick?: boolean;
  onOrderFill?: boolean;
  onBarClose?: boolean;
  onHistoricalTicks?: boolean;
};

export type CoreSpiritExecutionFrame = {
  timestamp: number;
  barIndex: number;
  index: number;
  time: number;
  symbol: string;
  timeframe: string;
  timezone: string;
  session: CoreSpiritSessionState;
  mode: CoreSpiritExecutionMode;
  isRealtime: boolean;
  isConfirmed: boolean;
  isNewBar: boolean;
  revision: number;
  isFirst: boolean;
  isLast: boolean;
};

export type CoreSpiritSessionState = { id:string; marketDate:string; isOpen:boolean; phase:'pre'|'open'|'post'|'closed' };

export type CoreSpiritExecutionContext = {
  mode: CoreSpiritExecutionMode;
  symbol: string;
  timeframe: string;
  timezone: string;
  startedAt: number;
  runId: string;
  policy?: CoreSpiritExecutionPolicy;
  frame?: CoreSpiritExecutionFrame;
  session?: CoreSpiritSessionState;
};

export type CoreSpiritCompilationArtifact = {
  sourceId: string;
  program: CoreSpiritProgram;
  irVersion: 1;
  maxLookback: number;
};
