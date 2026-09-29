# TradingCoreOS v94 — zero-copy canonical chart data plane

## Scope

v94 deepens chart/data performance while preserving the current Lightweight Charts production renderer.

## Implemented

- `MarketDataStore` is the canonical columnar market-data plane.
- `ColumnarCandleStore` remains a compatibility class over `MarketDataStore`.
- Added OI, bid/ask, bid/ask volume, trade count, session and metadata storage.
- Added timeline-aligned `IndicatorStore`, `ModelStore`, `StructureStore`, `LiquidityStore` and `OrderFlowStore`.
- Added zero-object `ChartLodIndex` with geometric capacity growth.
- Added incremental LOD dirty-bucket updates for realtime changes.
- Added retained `ChartGpuCandleBuffer`.
- Added native WebGL2 instanced candle rendering and partial GPU buffer uploads.
- Removed object-row/legacy LOD materialization from `ChartCore`'s native path.
- Kept Lightweight Charts object conversion isolated to its compatibility adapter.
- Added zero-copy canonical data-plane and renderer-migration documentation.

## Explicit non-goals

- Lightweight Charts is still the production backend.
- Native WebGL2 is still experimental.
- `SharedArrayBuffer` adoption is not forced in v94.
- This release does not claim TradingView-level renderer parity.

## Verification

Focused chart TypeScript compilation and dependency-free runtime/source contracts pass.

The full repository typecheck/build still depends on the installed project dependency tree; Lightweight Charts types are unavailable in the supplied dependency-free environment.
