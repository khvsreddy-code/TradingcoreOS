import type { Millis } from './time';
import type { OHLCV } from './ohlcv';
import type { SeriesPoint, SeriesSpec, MarkerPoint, LineLikeStyle } from './series';
import type { DrawingLine, DrawingBox, DrawingLabel, DrawingPolyline, DrawingLinefill, DrawingTable } from './drawings';
import type { TradeExecution } from './trades';
import type { Fill, FillGradientStop } from './scene';

export interface DirtyRange {
    from: Millis;
    to: Millis;
}

/** Exact retained-series mutation. Full replacement is explicit and remains the compatibility path. */
export type SeriesPatchOperation = 'replace' | 'append' | 'prepend' | 'replace-last' | 'replace-range';

/** A value delta carries only the values affected by the operation. */
export type SeriesValueDelta =
    | { seriesId: string; kind: 'points'; points: SeriesPoint[]; op?: SeriesPatchOperation; start?: number; remove?: number }
    | { seriesId: string; kind: 'bars'; bars: OHLCV[]; op?: SeriesPatchOperation; start?: number; remove?: number }
    | { seriesId: string; kind: 'markers'; markers: MarkerPoint[]; op?: SeriesPatchOperation; start?: number; remove?: number };

/** Style/display mutation with no data payload. */
export interface SeriesStyleDelta {
    seriesId: string;
    style?: Partial<LineLikeStyle>;
    display?: import('./series').SeriesDisplay;
    title?: string;
    visible?: boolean;
}

/** Tail/range mutation for dynamic fill values. */
export interface FillValueDelta {
    fillId: string;
    op?: SeriesPatchOperation;
    colors?: Array<string | null>;
    gradient?: Array<FillGradientStop | null>;
    start?: number;
    remove?: number;
}

/** Fill-only mutation. */
export interface FillStyleDelta {
    fillId: string;
    paneId?: string;
    color?: string;
    overlay?: boolean;
}

/** Retained-scene mutation for renderer-owned collections. */
export type CollectionPatchName =
    | 'backgrounds' | 'priceLines'
    | 'lines' | 'boxes' | 'labels' | 'polylines' | 'linefills' | 'tables' | 'trades';

export interface CollectionValueDelta {
    collection: CollectionPatchName;
    values: unknown[];
    op?: SeriesPatchOperation;
    start?: number;
    remove?: number;
}

export interface ValuePatch {
    kind: 'value';
    indicatorId: string;
    dirty: DirtyRange;
    anchorTime?: Millis | null;
    series: SeriesValueDelta[];
    seriesStyles?: SeriesStyleDelta[];
    fillDeltas?: FillValueDelta[];
    fillStyles?: FillStyleDelta[];
    fills?: Fill[];
    backgrounds?: import('./scene').Background[];
    priceLines?: import('./scene').PriceLine[];
    lines?: DrawingLine[];
    boxes?: DrawingBox[];
    labels?: DrawingLabel[];
    polylines?: DrawingPolyline[];
    linefills?: DrawingLinefill[];
    tables?: DrawingTable[];
    trades?: TradeExecution[];
    collections?: CollectionValueDelta[];
    /** Renderer-ready high-cardinality rectangles updated without rebuilding the series payload. */
    instanceBatches?: import('./instances').HighCardinalityRectDelta[];
    /** Per-bar candle recolors keyed by epoch time. */
    barColors?: Array<{ time: Millis; color: string }>;
}

export interface SchemaPatch {
    kind: 'schema';
    indicatorId: string;
    added: SeriesSpec[];
    removed: string[];
    changed: Array<{ seriesId: string; reason: 'kind' | 'pane' }>;
}

export type ScenePatch = ValuePatch | SchemaPatch;
