# TradingCoreOS Chart Renderer Policy — Vela

Updated: 2026-09-29

## Decision

TradingCoreOS uses **Vela NativeRenderer** as its sole production chart-rendering backend. The TCO chart architecture remains renderer-neutral at its public contracts, but application code no longer carries a second production renderer.

```text
CoreSpirit / React / chart features
            ↓
      TCO Chart API
            ↓
      TCO Vela facade
            ↓
     Vela NativeRenderer
         ↙         ↘
     WebGL2       Canvas2D
```

Vela's renderer owns the low-level rendering backend choice. TradingCoreOS owns the data plane, compute graph, CoreSpirit execution, risk, automation, broker integration and chart semantics.

## Boundary invariants

**CoreSpirit does not import Vela.** It emits renderer-neutral visual intent.

**React does not own chart state at tick frequency.** It sends commands through the existing chart/controller contracts.

**Vela is not a data authority.** Canonical market history and live state stay in TCO's columnar market data plane.

**Vela is not an execution authority.** It receives no broker credentials, order permissions or risk decisions.

**There is one production chart vendor.** Do not add a second renderer as a hidden fallback; Vela already selects WebGL2 or Canvas2D internally.

## Files

| Boundary | Implementation | Responsibility |
|---|---|---|
| Public chart API | `src/services/core/chart/chartApi.ts` | Renderer-neutral commands/types |
| Chart controller | `src/components/workspace/chartController.ts` | Market/history/realtime/navigation bridge |
| TCO Vela chart facade | `src/services/core/chart/velaChartFacade.ts` | Preserves the existing TCO chart vocabulary while translating to Vela |
| ChartRenderer implementation | `src/services/core/chart/velaNativeChartRenderer.ts` | Implements the TCO renderer port with Vela |
| Backend policy | `src/services/core/chart/chartBackendPolicy.ts` | Locks `vela-native` as production |
| Vendored upstream | `vendor/vela` | Vela source + Apache-2.0 license/NOTICE |

## Data flow

```text
History / live broker transport
          ↓
Canonical MarketDataStore
          ↓
ChartCore / ChartController
          ├── viewport-aware LOD
          ├── indicator dependency graph
          └── CoreSpirit render packets
                    ↓
             Vela adapter
                    ↓
            NativeRenderer
```

Full history replacements use `setBars`. Forming bars use `updateBar`. The adapter keeps this distinction explicit so an incoming quote cannot accidentally trigger a full historical redraw.

## Series translation

The facade preserves a small compatibility vocabulary because `LiveChart` is already a large, reactive terminal surface. It translates:

- candlesticks → Vela base OHLCV bars
- line studies → Vela line-like series
- histograms → Vela histogram series
- markers → Vela marker series
- price levels → Vela indicator price lines
- visible ranges / time transforms → the TCO navigation facade backed by Vela's coordinate system

This compatibility surface is deliberately local. It is not a Pine compatibility layer.

## Attribution

`vendor/vela/NOTICE` is kept with the vendored source and requires visible attribution on screens where a Vela chart is rendered. TradingCoreOS therefore leaves Vela's built-in attribution enabled. A future host-custom attribution scheme must retain an equivalent visible notice/link before disabling the built-in mark.

## Performance deepening

### 1. Typed-array ingress
The current TCO→Vela adapter must temporarily materialize OHLCV records when a complete columnar history is handed to Vela. The next renderer-port extension should accept `MarketDataViews` directly and pack GPU buffers from typed columns without per-bar objects.

### 2. Viewport-aware ingestion
The TCO `ChartLodIndex` already computes the minimum safe candle representation for pixel density. Bind that index to Vela's visible range so zooming changes the consumed representation instead of rebuilding every visible record.

### 3. Retained CoreSpirit output
CoreSpirit plots and signals should be addressed by stable IDs. Style changes become small patches; a forming-bar update changes only the dirty tail. Do not remount an indicator for ordinary input/value updates.

### 4. Native drawings
The existing TCO drawing API remains the semantic owner. The next stage is to project its retained geometries into Vela's native scene/drawing layer so the production path does not rely on large DOM overlays.

### 5. Multi-chart synchronization
Use the existing renderer-neutral visible-range and crosshair contracts for linked charts. Vela receives the final target range/ghost cursor; React does not coordinate every pointer event itself.

### 6. Regression budgets
Track frame duration, long tasks, visible-bars count, Vela indicator count, overlay node count, temporary object allocations and GPU buffer bytes in contract tests/diagnostics. Performance claims should be tied to measurable budgets.

## Removed surface

The following are intentionally absent from the application:

- Pine compatibility translator/runtime helpers
- PineTS execution
- TradingView public-script catalog/import dependency
- direct production imports of another chart vendor
- vendor-specific chart semantics in CoreSpirit
