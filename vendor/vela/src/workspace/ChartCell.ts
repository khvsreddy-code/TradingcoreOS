// One workspace CELL â€” a stable IDENTITY (its declared name, or `c<N>` for a slot no
// entry declared) holding a full Vela chart plus its per-cell overlays and per-cell
// state: statusline, watermark, context menu, its own undo timeline, and its indicator
// ledger (shared manifest, per-cell instances). The identity never derives from content:
// symbol/timeframe/style are mutable state, switched IN PLACE via `chart.setMarket` (the
// chart instance survives every market change and only dies with the cell itself, on a
// layout change â€” its state then round-trips through the workspace pool, so shrinking
// 4 â†’ 2 â†’ 4 restores the third and fourth exactly, indicators and drawings included).
import { Vela } from '../Vela';
import { normalizeSession, type MarketSession, type NativeBackend, type VelaOptions, type VelaTheme } from '../core/options';
import type { OHLCV } from '../core/model/ohlcv';
import type { VisibleRangePreset } from '../core/visible-range';
import type { VisibleRange } from '../core/ports/IChartRenderer';
import type { DrawingsOption } from '../core/drawings';
import type { MarketDataFeed } from '../core/ports/MarketDataFeed';
import type { ScriptingEngine } from '../core/ports/ScriptingEngine';
import type { IndicatorHandle } from '../core/IndicatorHandle';
import type { VelaEventMap } from '../core/events/types';
import { Statusline, statuslineInkOf, type StatuslinePart } from '../widget/statusline';
import { MarketStatusTracker } from '../widget/¶»§q«^