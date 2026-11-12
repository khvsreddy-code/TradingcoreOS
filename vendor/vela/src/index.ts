// Public composition root + default backends
export { Vela } from './Vela';
export type { VelaDeps, RunIndicatorResult } from './Vela';
export { RendererControl } from './core/RendererControl';
// The second pulse behind time displays â€” share one between a host clock and
// `chart.renderer.setWallClock` so the countdown chip never reads a different second.
export { SecondClock, type WallClock } from './core/util/wall-clock';
export { NativeRenderer } from './renderers/native/NativeRenderer';
// The drawing-toolbar VIEW as a standalone component â€” a workspace shell mounts ONE
// shared bar (dock:'static') and routes it to the active chart's `chart.drawings`.
export { DrawingToolbar, type DrawingToolbarOptions } from './renderers/native/drawings/DrawingToolbar';
export type { ChartConfig, ChartStyle } from './renderers/native/core/chartConfig';
export { MultiProviderFeed } from './data/MultiProviderFeed';
export { CachingDataFeed } from './data/CachingDataFeed';
export { BarStore, sharedBarStore } from './data/BarStore';
export { timeframeToMs } from './data/timeframe';
export { DataControl } from './core/DataControl';
export { DrawingsControl } from './core/DrawingsControl';
export { MarksControl } from './core/MarksControl';
export {
    ReplayControl,
    type ReplayState,
    type ReplayStartOptions,
    type ReplayEndReason,
    type ReplayBounds,
    type ReplayTick,
    type ReplayTickSource,
} from './core/ReplayControl';
export { lowerTimeframeTicks, barsToTicks }¶»§q«^