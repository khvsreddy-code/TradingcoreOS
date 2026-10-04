# Vela Chart Integration

Date: 2026-10-04

## Architecture lock

TradingCoreOS is now locked to this production chart direction:

```text
TradingCoreOS
 ├── CoreSpirit (user language)
 ├── TCO data plane / compute / broker systems
 └── TCO Chart API
       ↓
   Vela NativeRenderer
       ├── WebGL2
       └── Canvas2D fallback
```

Vela is a rendering backend, not a replacement for TradingCoreOS domain ownership. TCO continues to own canonical market data, indicator/model execution, CoreSpirit compilation/runtime, risk, automation and broker authorization.

## Dependency decision

`lightweight-charts` is removed from `package.json` and `package-lock.json`. No PineScript/PineTS compatibility package, translator, runtime helper, public-script catalog or TradingView import path is part of the application architecture.

Community indicators remain a first-class feature, but their unit of distribution is a versioned **CoreSpirit Community Indicator** containing CoreSpirit source, immutable version metadata, settings schema, author/license metadata, documentation and a compiled-artifact identity.

## Vendor boundary

Vela source is vendored under `vendor/vela` with its Apache-2.0 `LICENSE` and `NOTICE`. Application code reaches Vela through:

- `src/services/core/chart/velaChartFacade.ts` — stable chart vocabulary used by the workspace.
- `src/services/core/chart/velaNativeChartRenderer.ts` — implementation of the TCO `ChartRenderer` port.
- `src/services/core/chart/chartRendererFactory.ts` — production renderer selection.

No React component or CoreSpirit module should import Vela directly.

## Data path

```text
Broker/history/live feed
        ↓
Canonical MarketDataStore
        ↓
ChartCore / ChartController
        ↓
TCO Vela adapter
        ↓
NativeRenderer
        ↓
WebGL2 / Canvas2D
```

Realtime forming-bar updates use Vela's incremental `updateBar` seam. Complete history replacement uses `setBars`. The canonical store remains the source for indicators, models and chart rendering.

## Rendering path

CoreSpirit output remains renderer-neutral:

```text
CoreSpirit source
   ↓ compile / IR / VM
Declarative visual output
   ↓
TCO chart output controller
   ↓
Vela series / markers / price lines
```

High-cardinality visuals should remain batched or retained at the TCO layer instead of becoming thousands of DOM nodes or independent browser series.

## Attribution

Vela's bundled `NOTICE` requires visible attribution wherever a chart is displayed. TradingCoreOS therefore keeps Vela's native attribution enabled rather than hiding it. Any future host-level attribution change must provide an equivalent visible notice/link on the same screen before disabling the renderer's built-in mark.

## Deepening roadmap

### D1 — Typed-array ingestion — partial v115
The canonical-to-worker side of typed ingress is now implemented through versioned transferable packets. Direct Vela-native ingestion remains the next seam: the current `DataProvider` API still requires `OHLCV[]`, so `TcoVelaDataProvider` materializes ordinary bars only at that explicit renderer/provider boundary.

### D2 — Renderer-owned LOD
Connect the existing TCO `ChartLodIndex` to Vela viewport changes so the renderer can select the smallest safe representation for the current pixel density without copying the entire dataset.

### D3 — CoreSpirit render packets
Convert CoreSpirit output into stable render packets keyed by series/visual IDs, allowing plot style changes and point-tail updates without remounting an indicator.

### D4 — Drawings in the native scene
Move TCO drawing primitives into the Vela/TCO retained scene boundary rather than maintaining separate browser overlays for production chart visuals where Vela has an equivalent primitive.

### D5 — Multi-chart synchronization — partial v115
VelaWorkspace now exposes the production multi-chart shell, active-cell projection and independent sync controls. TCO still needs to connect its renderer-neutral visible-range contract so synchronization logic remains portable beyond Vela.

### D6 — GPU budget enforcement
Introduce a chart frame budget and allocation counters: visible bars, active series, draw calls, typed-buffer bytes, overlay nodes and long-task duration. Regression gates should be attached to the contracts rather than manual observation alone.

## v109 indicator-schema bridge

Indicator metadata reaches Vela only after passing through TCO-owned contracts:

```text
IndicatorSettingsSchema
       ↓
resolved values + output metadata
       ↓
TCO chart/render packet
       ↓
velaChartFacade / NativeRenderer
```

The schema is intentionally renderer-neutral. `pane`, `scale`, output names, colors, line widths and display flags describe intent; they do not contain Vela series instances or Vela API callbacks.

The live chart now fingerprints the complete schema-derived snapshot when deciding whether indicator rendering must refresh. This matters for nested settings such as `display.opacity` and `display.precision`; a dependency list that only watches legacy top-level fields would miss those changes.

The universal settings editor is shared by the Indicators workspace and live terminal. That removes the last production UI path where MACD/Bollinger/Ichimoku/etc. settings were manually enumerated.

## Schema-to-render deepening

The next renderer work should consume stable output IDs and style patches rather than recreating series for every edit. Calculation state, schema state and render state remain separate:

```text
calculation identity  → incremental indicator engine
settings identity     → schema + resolved values
render identity       → stable output IDs / render packets
```

A style-only change must therefore update renderer state without invalidating indicator history; an input-period change may invalidate the appropriate computation graph while still reusing the same render identities.

## Explicit non-goals

- No PineScript compatibility mode.
- No PineTS execution layer.
- No TradingView script importer/catalog dependency.
- No broker capability exposed through Vela.
- No renderer-specific language keywords in CoreSpirit.
- No second production chart vendor.


## v110 indicator presentation bridge

The Vela adapter now consumes the same renderer-neutral appearance contract used by the universal indicator editor.

```text
IndicatorAppearanceConfig
├── line → Vela series style + visibility
├── fill → Vela Fill primitive between hidden anchor series
├── marker → renderer-neutral marker projection
├── levels → level line presentation
└── pane → pane ownership + scale presentation
```

Appearance-only changes invalidate the native renderer at Light/Full presentation levels as required by the affected operation, but they never invoke the indicator worker.

### Fill ownership

Band fills are mounted as renderer-owned indicator models. Their source series are hidden anchor series containing existing computed points. A fill update can therefore swap color, opacity, gradient or conditional coloring without rebuilding the source indicator.

### Pane ownership

Separate panes are keyed by `tco-indicator-pane:<indicatorId>` and shared by all outputs belonging to one indicator. `auto` retains the indicator's current host pane; `overlay` explicitly returns to the price pane.

### Worker isolation

The chart compute coordinator strips appearance-only fields before worker dispatch. This both enforces the architectural invariant and reduces structured-clone payload size as appearance schemas become richer.

## v111 build-boundary repair — 2026-09-30

`ShowcaseChart.tsx` exposed a renderer migration defect: it used `LineStyle.Dashed`, `LineStyle.Solid` and `LineStyle.Dotted` as runtime values while `velaChartFacade.ts` exported `LineStyle` only as a type alias. TypeScript erased the type export, so Vite/Rollup correctly reported that `LineStyle` was not an exported runtime symbol.

The facade now exposes a runtime-safe `LineStyle` object and a separate `LineStyleValue` type:

```ts
export const LineStyle = Object.freeze({
  Solid: 0,
  Dashed: 1,
  Dotted: 2,
});
```

The chart contract remains TCO-owned; this is not a reintroduction of a legacy renderer API. A dedicated contract test prevents another type-only/runtime export mismatch.

## v111.1 — Vela remains a renderer projection, never indicator truth

First-class indicator components deliberately stop before the Vela boundary. Their plot/visual declarations are renderer-neutral. The TCO chart API decides how those outputs become Vela series, fills, markers, levels and pane projections.

```text
CoreSpirit indicator declaration
        ↓
renderer-neutral visual outputs
        ↓
TCO Chart API
        ↓
Vela adapter
        ↓
Vela NativeRenderer
```

This is important for portability: an indicator can run in historical, replay or realtime hosts without knowing which renderer is currently presenting it. Vela is a production rendering backend, not the source of indicator semantics.


## v115 production workspace + canonical transport — 2026-10-04

The Vela integration has moved from “renderer cutover” to “production workspace mode.”

### Workspace capabilities now exposed in TradingCoreOS

The live chart now boots the vendored `VelaWorkspace` in a four-cell layout instead of `layout: false`. Vela's shared workspace shell therefore becomes the primary multi-chart surface: layout switching, active-cell projection, indicator picker, object tree/panels, drawings, bottom bar, screenshot/action surfaces and the workspace keymap remain in one host rather than being rebuilt in React.

The workspace is seeded with four index cells and uses a new persistence key so previous one-chart saved state cannot force the new workspace back into single-chart mode.

### TCO indicator wheel

TradingCoreOS adds an application-level radial quick picker triggered by holding `Alt`. It asks the active Vela chart for its supported native-indicator catalog, selects up to eight quick entries, highlights the sector under the pointer and adds the selected native indicator on `Alt` release.

This is intentionally separate from CoreSpirit scripting. Native Vela indicators remain Vela-native; CoreSpirit scripts continue through `CoreSpiritVelaEngine`. No Pine/PineTS compatibility path is introduced.

The current public Vela platform documentation describes the standard `Alt` radial wheel as a **drawing-tool** wheel, while the indicator picker is the separate indicator UI. TradingCoreOS's Alt indicator wheel is therefore a TCO host extension, not a claim that the upstream Vela indicator picker itself is radial. citeturn954793search3turn954793search1

### Data provider boundary

`TcoVelaDataProvider` no longer reopens broker history independently. It obtains the shared `ChartDataPlane`, waits for the canonical dataset, binary-searches its typed `time` column, and materializes only the bars requested by Vela. Live subscriptions read the current canonical tail and allocate one Vela bar at the provider boundary.

### Compute boundary

The TCO compute coordinator now transfers versioned typed-array market packets to workers. Existing legacy kernels still receive a compatibility `HistoricalCandle[]` only after the message reaches the worker. That makes worker compatibility materialization an explicit migration seam rather than the cross-thread data format.

### Upstream Vela feature alignment

The vendored workspace already supports standard multi-chart layouts (including 1, 2-horizontal, 2-vertical, 4 and 8-cell modes), active-cell behavior and independent synchronization controls. TCO now exposes that capability instead of suppressing it with single-chart mode. citeturn954793search0turn954793search2

### Next Vela performance seam

The next step is direct typed-array/retained-buffer ingestion into the Vela-facing data adapter, followed by viewport-driven LOD selection and stable CoreSpirit RenderPackets. The current provider compatibility objects should be treated as an adapter boundary to be reduced, not as the canonical chart representation.


## v116 — genuine columnar Vela consumption + native shell integration

v116 closes the next representation-churn boundary instead of merely adding another adapter method. The production TCO Vela path now has three explicit numeric stages:

```text
CanonicalMarketView
    ↓ typed views
TCO Vela provider
    ↓ ColumnarBars
Vela feed/orchestrator
    ↓ ColumnarBars
NativeRenderer.setBarsColumns()
    ↓ typed channels
Canvas2D / WebGL2 candle geometry
```

### History path

`TcoVelaDataProvider.getBarsColumns()` returns subarray views over the canonical `Float64Array` channels. The Vela registry/feed and `EngineOrchestrator` prefer `loadColumns()` for bounded identity-bar loads. The renderer stores those channels in a Vela-owned mutable typed buffer with spare capacity. This is intentionally **zero-object at the render/data boundary**, but it is not described as mathematical zero-copy: the renderer establishes ownership with one numeric buffer copy so later forming-bar updates can remain O(1) and safe.

The native canvas and WebGL candle painters read `time/open/high/low/close` directly from those arrays. They do not allocate one `OHLCV` object per candle in the render loop. Vela retains a single internal `OHLCV[]` compatibility mirror because legacy scripting, data-window and some non-candle features still read that model. The mirror is created on series replacement, not used as the candle render transport.

### Live path

The same rule now continues through the forming-candle stream. `subscribeColumns()` is an optional provider/feed capability. TradingCoreOS emits a compact `ColumnarBarUpdate` from the canonical tail, and `LiveSession` selects that path when the chart is an identity series and the renderer exposes `updateBarColumns()`.

The live sequence is therefore:

```text
canonical tail
    ↓
ColumnarBarUpdate
    ↓
LiveSession
    ↓
EngineOrchestrator.onColumnarBar()
    ├── native renderer.updateBarColumns()
    └── one compatibility OHLCV for legacy bar/session consumers
```

This removes the previous provider → engine object allocation for every live packet while retaining the existing compatibility ABI for consumers that have not yet migrated.

### LOD and viewport contract

`setLodIndex()` now carries the renderer-neutral `ChartLodIndex` into Vela as typed bucket arrays. The native candle renderer uses those buckets when its density tier reaches aggregate mode; it does not rebuild reduced candle objects on every frame. `setVisibleRange()` remains the stable renderer contract for viewport changes, so TCO does not reach into Vela's coordinate or viewport internals.

The old `setReducedCandles()` path remains only as a compatibility route for renderers that have not adopted the typed LOD contract. It is no longer the preferred TCO/native path.

### Ownership and mutation rules

1. TCO canonical arrays remain owned by `CanonicalDataPlane` and are never mutated by Vela.
2. Vela takes ownership of its own mutable capacity buffers at the renderer boundary.
3. Forming-bar updates mutate only the Vela-owned numeric tail and the required legacy mirror entry.
4. LOD arrays are treated as immutable snapshots until the next explicit `setLodIndex()` call.
5. Viewport operations remain contract-level calls (`setVisibleRange`) rather than Vela-internal calls.
6. `SharedArrayBuffer` remains deferred until buffer ownership, revisioning and reclamation are explicit.

### Vendor boundary

TradingCoreOS still exposes Vela only through `velaChartFacade.ts` and the TCO adapter. TCO feature code does not import `NativeRenderer`, `SceneGraph`, renderer backends or other Vela implementation classes. The vendored fork can therefore change without leaking its internal representation across the TradingCoreOS application boundary.

### Shell chrome changes

The former React/floating watchlist and floating broker controls have been removed from the chart workspace. The Vela topbar now owns the chrome:

```text
Vela topbar
  ├── Watchlist  ← Vela side-panel toggle, renamed from TCO's old watchlist control
  ├── Journal    ← Vela side-panel toggle
  └── Broker Connection  ← contributed topbar action, inside the actual topbar flow
```

The Watchlist and Journal are registered through Vela's contribution API and therefore use the same panel docking/exclusivity/persistence mechanism as native Vela panels. Broker Connection is a contributed topbar action rather than an absolutely positioned TCO overlay, so it moves/reflows with the actual Vela topbar and stays inside its chrome.

### What remains

The columnar boundary is now real for identity OHLCV history, native candle rendering, typed LOD and forming-bar updates. The next conversion is deliberately downstream: migrate CoreSpirit and native indicator kernels from the Vela compatibility `OHLCV[]` mirror to typed `CanonicalMarketView`/series inputs, then migrate deep/backfill/transformed chart paths to columnar range operations. Only after those steps should the remaining Vela compatibility mirror be retired and SAB be reconsidered.


## v117 — true incremental Vela updates

Historical candle data uses setBarsColumns once. Forming bars use updateBarColumns/replace-last semantics. New finalized bars append. Indicator styles are patched independently of data. Markers and fill anchors are range-aware. The TCO facade remains the only production-facing integration boundary.

### v117 deep patch ABI + verification

The retained-scene contract is now explicit: `append`, `replace-last`, `prepend`, and `replace-range` mutate only affected data; `seriesStyles` handles appearance without touching values; marker updates diff their changed interval; fill updates use a separate value/style channel. The engine only selects a tail delta when the previous/current series identity and timestamp continuity prove the live operation; otherwise it falls back to a full replacement.

The full Vela source audit also confirmed that candle rendering is the correct place to keep the columnar representation: the renderer may keep an internal `OHLCV[]` compatibility mirror for legacy scripting/data-window paths, but that mirror is not the render transport. Supabase broker/session/workspace persistence remains outside this hot path; the database advisor currently reports RLS-policy evaluation and duplicate-policy/index cleanup opportunities, which are separate persistence optimizations.


## v118 — terminal visual/motion polish

The production terminal uses a near-black graphite base with a restrained indigo-violet accent. Native Vela motion constants were slowed from the previous ultra-snappy defaults so zoom, pan, autoscale, live-bar glide and first-paint reveal settle more naturally. UI DOM transitions use the existing Motion stack; the chart renderer itself remains on Vela's native scheduler.

## v120 — production Vela shell integration

Vela remains isolated behind the TCO chart facade while TCO injects the provider, CoreSpirit engine, and VelaStorage implementation. The workspace uses existing Supabase persistence surfaces for workspace state, preferences, and Journal rather than coupling the Vela vendor tree directly to Supabase.

The workspace now uses a custom near-black graphite Vela theme with restrained indigo-violet branding and deliberately slower chart motion. DOM chrome continues to use the existing Motion dependency for polished layout/menu transitions.

Viewport-driven history depth is handled by Vela's own engine with a 5,000-bar page size and a small left-edge lead. This keeps the chart interactive while older history arrives behind the current viewport.
