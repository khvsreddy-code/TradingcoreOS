# Consolidated release notes — legacy

> Historical release notes preserved outside the active architecture documentation. Current implementation truth is in the four canonical docs and the build tracker.

---

# SOURCE: CORESPIRIT_V101_RELEASE_NOTES.md

# TradingCoreOS v101 — Terminal Density + First-Class Right Dock

Date: 2026-09-29

## Scope

v101 deepens the v99 terminal-shell and v100 visual-density work. It is a TradingCoreOS host/UI release. CoreSpirit remains **v98** and its language/compiler/IR/VM/model ABI/execution boundaries are unchanged.

## Deeper terminal hierarchy

`/live` now follows an explicit five-surface hierarchy:

```text
/live
  ├── terminal command chrome
  ├── chart workspace
  │     └── chart-native drawing rail / tools
  ├── right terminal dock
  │     ├── WATCHLIST
  │     ├── ORDER BOOK
  │     └── ALERTS
  └── bottom terminal dock
        ├── POSITIONS
        ├── ORDERS
        ├── TRADES
        ├── ACTIVITY
        ├── STRATEGY LOG
        └── ORDER TICKET
```

The chart area is the primary work surface. Secondary information is docked around it rather than represented as floating workspace windows.

## Deeper visual language

Terminal infrastructure uses a deliberate surface hierarchy instead of dashboard cards:

```text
chart / separators       → 0px
compact controls         → 0–2px
popovers                 → ≤4px
major dialogs            → outside the terminal density rule
shadow                   → none on terminal infrastructure
separation               → 1px rules + spacing
accent                   → blue
market semantics         → independent positive/negative colors
```

No landing-page/marketing selectors were changed by this release.

## Right dock as a first-class system

The former watchlist-oriented component is now named `RightTerminalDock` and owns three equivalent dock surfaces under one interaction contract.

### Dock state

The canonical workspace owns:

```text
rightDockOpen
rightDockTab
rightDockWidth
```

`watchlistOpen` remains only as a compatibility alias for older snapshots.

### Panel contract

```text
RIGHT_DOCK_TABS
    ├── WATCHLIST   Alt+1
    ├── ORDER BOOK  Alt+2
    └── ALERTS      Alt+3

Alt+0 → collapse / expand right dock
```

Panel state remains in the same dock shell while the active surface changes. There is no modal backdrop, popup ownership, or second workspace host.

### Width contract

The dock width is controlled by `LiveTradingWorkspace`, constrained to 260–460px on desktop, and persisted through the workspace snapshot/local/cloud workspace lifecycle. This makes sizing part of the workspace rather than transient component-local state.

### Shared context

The selected watchlist instrument is the dock's shared market context. Selecting a symbol updates the focused chart assignment using the existing workspace/chart contract. The Order Book and Alerts surfaces consume the same selected instrument rather than creating their own symbol selector state.

### Status contract

The dock exposes a compact footer containing live-state, selected-instrument context, and the collapse shortcut. This makes dock state visible without adding a decorative card.

## Non-interference

The release does not alter:

- market-data transport or quote-heartbeat behavior
- historical candle request ownership
- canonical chart data-plane ownership
- CoreSpirit compiler/semantic graph/IR/VM
- broker execution capability contracts
- renderer-neutral chart interaction semantics

## Validation

```text
TRADINGCORE_V101_RIGHT_DOCK_SYSTEM_CONTRACT_OK
TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK
TRADINGCORE_V100_TERMINAL_VISUAL_DENSITY_CONTRACT_OK
```

Dependency-backed `tsc`, Vite build, and connected-broker runtime verification remain environment/deployment checks rather than being claimed by the static contract run.

---

# SOURCE: CORESPIRIT_V102_RELEASE_NOTES.md

# TradingCoreOS v102 — First-Class Right Dock + Single React Root

Date: 2026-09-29

## Scope

v102 is a TradingCoreOS host/UI architecture release. CoreSpirit remains **v98**. No CoreSpirit language, compiler, semantic graph, IR, VM, model ABI, execution capability, or roadmap semantics were changed.

The release deepens v101 in two areas:

1. the right-side dock is now an explicit subsystem with independently renderable surfaces and a canonical dock interaction contract;
2. the live terminal is enforced as a single-React-root route, with legacy DOM entrypoint/mutation bridges removed.

## 1 — deeper first-class right dock

The canonical implementation is now:

```text
LiveTradingWorkspace
      │
      ▼
RightTerminalDock
      ├── WatchlistSurface
      ├── OrderBookSurface
      └── AlertsSurface
```

`WatchlistDock.tsx` remains only as a compatibility re-export. New workspace code imports `RightTerminalDock` directly.

### Dock state contract

Workspace state remains the authoritative location for:

```text
rightDockOpen
rightDockTab
rightDockWidth
```

The dock does not create a second persistence authority. Width is clamped to 260–460px and returned to the workspace through the existing controlled callback.

### Surface isolation

Each panel is an independently renderable React surface. Only the active surface is mounted, so inactive work does not continue rendering or fetching. The existing selected-instrument tick map remains the shared market context. No panel creates its own chart/data subscription.

```text
selected instrument
       │
       ├── WatchlistSurface  → existing tick map + instrument search
       ├── OrderBookSurface  → selected tick bid/ask depth
       └── AlertsSurface     → selected-symbol local alert state
```

News fetching is scoped to the watchlist surface and is cancelled when that surface or symbol changes. Alert persistence is scoped to the selected symbol.

### Interaction contract

```text
Alt+1 → Watchlist
Alt+2 → Order Book
Alt+3 → Alerts
Alt+0 → Collapse / Expand
Tab / Arrow keys / Home / End → navigate dock tabs
Pointer drag → resize dock
```

Tabs now use roving `tabIndex` plus explicit `aria-controls` / `aria-labelledby` relationships.

## 2 — single React root / route ownership

The production browser entrypoint is now explicitly:

```text
index.html
   │
   ▼
src/main.tsx
   │
   ▼
<App />
   │
   ▼
workspace route
   │
   ▼
<LiveTradingTerminal />
   │
   ▼
<LiveTradingWorkspace />
```

`index.html` loads only `src/main.tsx` as a module entrypoint. A repository contract now asserts that exactly one `createRoot(...)` exists and that it is owned by `src/main.tsx`.

The live route renders `LiveTradingTerminal` directly inside the existing React tree. The separate `LiveModuleBoundary` wrapper was removed because the existing `RouteErrorBoundary` already owns workspace-route failure isolation.

### Legacy DOM bridge retirement

The following browser-level injection files were removed because their behavior had no remaining canonical owner in the v99–v101 terminal:

```text
src/workspaceRuntimeBridge.ts
src/workspaceChromeStyle.ts
src/workspaceOrderBridge.ts
src/workspaceHotfix.ts
src/workspaceChromeHotfix.ts
src/quickOrderHotfix.ts
```

This removes:

- global `window.fetch` replacement from terminal bootstrap;
- document-level click listeners that re-click toolbar controls;
- MutationObserver-driven order-ticket DOM rewriting;
- injected terminal-only style elements;
- dead repair/hotfix entrypoints.

Instrument-search and option-chain caching remain owned by the canonical market-data/runtime services rather than an HTML bootstrap script.

### Resulting lifecycle

```text
old
HTML scripts → global DOM listeners → React root → terminal

new
HTML → single React root → route → terminal workspace → dock/chart surfaces
```

## Non-interference

No market-data transport, historical candle ownership, canonical chart data plane, CoreSpirit execution path, broker adapter, or broker authorization contract was intentionally changed by v102.

## Validation

```text
TRADINGCORE_V101_RIGHT_DOCK_SYSTEM_CONTRACT_OK
TRADINGCORE_V102_RIGHT_DOCK_ARCHITECTURE_CONTRACT_OK
TRADINGCORE_V102_SINGLE_REACT_ROOT_CONTRACT_OK
TRADINGCORE_V99_TERMINAL_SHELL_CONTRACT_OK
TRADINGCORE_V100_TERMINAL_VISUAL_DENSITY_CONTRACT_OK
```

All modified TS/TSX sources were syntax-transpiled with the installed TypeScript compiler. A dependency-backed `tsc`/Vite build remains a deployment/environment verification step because the archive does not contain installed npm dependencies.

## v102 dock input/performance hardening

- Pointer resizing is requestAnimationFrame-coalesced so the workspace width state does not update more than once per rendered frame during a drag.
- Alt dock shortcuts ignore focused form controls and contenteditable regions, preventing terminal navigation keys from stealing text-entry focus.
- These changes are interaction-layer optimizations; they do not change the market-data cadence or broker transport.

---

# SOURCE: CORESPIRIT_V103_RELEASE_NOTES.md

# CoreSpirit v103 Release Notes — Host/Data-Plane Integration

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v103 is a TradingCoreOS host performance release and does not introduce language syntax or runtime authority changes.

## Chart host integration

The live chart host now consumes a shared chart data plane keyed by:

```text
broker:symbol:timeframe
```

CoreSpirit chart registry entries remain per visible chart so that scripts can address chart-local lifecycle identity, but market history and compute results are not copied per chart.

## Performance boundary

The host runtime now provides:

- one shared symbol-level realtime feed per broker/symbol,
- one shared history lifecycle per dataset,
- bounded analytics/indicator worker pools,
- dataset/revision result caching,
- dataset-scoped prediction deduplication,
- canonical typed-array storage shared by chart consumers.

CoreSpirit output execution remains downstream of the existing canonical data/runtime contracts.

## Preserved CoreSpirit invariants

```text
CoreSpirit source
      ↓
compiler / normalization / IR
      ↓
VM / approved runtime capability boundary
      ↓
chart output projection
```

The chart data plane does not grant CoreSpirit broker authority and does not move execution into chart UI code.

---

# SOURCE: CORESPIRIT_V104_RELEASE_NOTES.md

# CoreSpirit v104 Release Notes — Demand-Driven Chart History

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v104 is a TradingCoreOS chart host/data-plane performance release.

## Multi-chart / history changes

- initial history is bounded to 300–1,500 candles by timeframe;
- older history is requested from the visible logical range;
- global history concurrency is limited to two active requests;
- cached older pages are served from `HistoryStore` before network access;
- one low-priority warm page is allowed for the active chart;
- initial history limits propagate through client runtime, HTTP route and server broker adapters;
- older-history viewport restoration uses logical-range APIs;
- full-dataset compute semantics are preserved while demand-driven history limits initial processing.

## Preserved architecture

```text
broker:symbol realtime feed
        ↓
chartMarketStore
        ↓
broker:symbol:timeframe ChartDataPlane
        ↓
active demanded window
        ↓
chart renderer / bounded shared compute
```

No CoreSpirit language or execution authority changes are part of v104.

---

# SOURCE: CORESPIRIT_V105_RELEASE_NOTES.md

# TradingCoreOS v105 Release Notes — Deeper History Demand + Indicator Dependency Graph

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v105 is a chart/data-plane performance and indicator presentation release.

## History / multi-chart

- viewport-sized older-history pages are now derived from visible bar demand;
- duplicate left-edge requests get a short anchor/page cooldown in addition to per-dataset single-flight;
- older-history prepend events expose `olderAdded` so the chart restores the logical range without jumping;
- retained history and worker compute residency are now explicitly separated;
- indicator worker input is centered on the visible logical range with bounded warmup and a hard 10,000-candle ceiling;
- worker cache identity now includes the compute-window identity.

## Indicator dependency graph

- explicit dependency planning added for EMA, SMA, HMA, VWAP, Bollinger Bands, Keltner Channels, RSI, MACD, ATR, Supertrend and Donchian Channels;
- true range and ATR are reusable graph nodes;
- HMA reuses WMA primitives;
- composite studies reuse upstream EMA/SMA/ATR nodes;
- worker graph caches are dataset/revision/window scoped;
- appearance changes do not participate in mathematical cache signatures.

## Indicator presentation

- primary, signal, upper and lower colors;
- line width 1–6;
- solid/dotted/dashed line styles;
- opacity;
- settings are persisted through the existing indicator settings store and exposed directly from the chart indicator menu.

## Preserved boundaries

No broker execution authority, CoreSpirit language semantics, IR/VM, realtime symbol-feed ownership, terminal dock ownership or chart renderer ownership was changed by this release.

---

# SOURCE: CORESPIRIT_V106_RELEASE_NOTES.md

# TradingCoreOS v106 Release Notes — Deeper Demand History + Indicator Graph Execution

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM version remains **v98**. v106 continues the chart host/data-plane performance track.

## History

- `HistoryStore` is now an LRU-bounded shared retention cache with a maximum of 32 dataset buckets.
- Active-chart warm history can use the current visible bar count rather than blindly requesting a full page.
- Failed warm requests release the warm latch for later retry.
- Older-history events report actual net prepend growth after normalization and retention limits.
- Deep-history loading remains demand-driven; no mounted chart performs an unbounded background crawl.

## Indicator dependency graph

- Composite graph plans now contain explicit transitive source/base dependencies.
- Graph plans return deterministic topological order and reject cycles.
- WMA, Bollinger and Donchian shared kernels avoid repeated full-window rescans.
- Shared TR/ATR/EMA/SMA/WMA dependencies remain cached by dataset/revision/compute window.

## Indicator presentation

- Primary, signal, upper and lower plot colors remain configurable.
- Line width remains configurable from 1–6.
- Line style supports solid, dotted and dashed.
- Opacity is configurable and persisted.
- Presentation changes remain outside mathematical cache identity.

## Preserved boundaries

No CoreSpirit language semantics, compiler/IR/VM authority, broker execution/risk authority, shared realtime symbol feed ownership, terminal dock ownership, or chart-local drawing ownership was changed by this release.

---

# SOURCE: CORESPIRIT_V107_RELEASE_NOTES.md

# TradingCoreOS v107 Release Notes — Incremental Indicator Execution

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM remains **v98**. v107 continues the host/data-plane/indicator performance track after v106.

## Incremental calculation

- Added reusable rolling state for mean, variance, min/max, sum, exact MAD, EMA, Wilder, ATR, WMA and session VWAP.
- Standard indicators now have a stateful forming-bar lane covering EMA, SMA, HMA, VWAP, Bollinger, Keltner, Donchian, RSI, MACD, ATR, ADX, Stochastic, CCI, OBV, MFI, Supertrend and Ichimoku.
- Six advanced indicators now have stateful tail updates: Adaptive Ehlers, Fractional EMA Kalman Filter, Trend Pressure, Trend Target Ribbon, Trinity and Neural Weight Oscillator.
- Batch fallbacks for the named rolling-window indicators no longer perform repeated full period scans.
- Advanced normalized/standard-deviation helpers now use rolling mean/variance state.

## Live correctness

- Same-bar snapshot identity includes the forming candle's OHLCV tuple.
- Incremental `replace` and `append` operations are explicit.
- Lost or incompatible worker state triggers one controlled full resync.
- Snapshot priming and incremental ticks share a stable worker affinity key.

## Rendering

- Incremental line, channel, MACD, Stochastic, Supertrend, Ichimoku and Ribbon outputs update only the affected tail points.
- Legacy studies can coexist without clearing primed worker series on every tick.

## Indicator dialogue

- Per-indicator settings gear is available from the live indicator dialogue.
- `Code` opens a read-only CoreSpirit source viewer with copy support.
- The shared settings panel exposes the same source action.
- Indicator Studio remains the editable source workflow.

## Validation

Completed: standard numerical parity and same-bar replacement checks, state-reset/WMA correctness checks, static v107 contract checks, full Markdown inventory and tracker/doc alignment.

Pending in this archive environment: dependency-backed full TypeScript check, complete Vite build, and connected FYERS/browser performance stress testing.

## Preserved boundaries

No CoreSpirit language semantics, compiler/IR/VM authority, broker execution/risk authority, shared realtime feed ownership, terminal dock ownership, or chart-local drawing ownership was changed by this release.

---

# SOURCE: CORESPIRIT_V108_RELEASE_NOTES.md

# CoreSpirit v108 Release Notes

Date: 2026-09-29

## Theme

**CoreSpirit-first platform + Vela production chart engine**

## Architecture lock

TradingCoreOS is now locked to:

```text
CoreSpirit
   ↓
TCO compiler / IR / VM / reactive runtime
   ↓
renderer-neutral chart output
   ↓
TCO chart contracts
   ↓
Vela NativeRenderer
   ├── WebGL2
   └── Canvas2D fallback
```

TCO remains the authority for canonical market data, compute, indicator/model execution, risk/policy, automation, persistence and broker authorization. Vela is a rendering backend, not a trading-system owner.

## Included

- Removed the retained external scripting compatibility translator/runtime/catalog from application source.
- Removed the external public-script catalog dependency from the community indicator surface.
- Removed `lightweight-charts` from application dependencies and the npm lockfile.
- Added vendored Vela source with upstream Apache-2.0 `LICENSE` and `NOTICE`.
- Added a TCO-owned Vela chart facade that preserves the existing workspace chart vocabulary without making React or CoreSpirit depend on vendor APIs.
- Added a Vela-backed `ChartRenderer` implementation and made `vela-native` the only production chart backend.
- Reused Vela's native WebGL2 renderer and Canvas2D fallback rather than maintaining a second production renderer selection in TradingCoreOS.
- Kept canonical columnar market data and incremental update semantics outside the renderer boundary.
- Reworked the Indicators community surface around versioned CoreSpirit Community Indicators.
- Documented the upstream Vela attribution requirement and retained visible attribution.
- Added D1–D6 deepening work for typed-array ingress, viewport LOD, stable render packets, native drawings, multi-chart sync and measurable GPU/frame budgets.

## Verification

- `TCO_V108_CORESPIRIT_VELA_BOUNDARY_OK` passes.
- Focused TypeScript validation reaches the Vela adapter cleanly; the validation harness supplied declarations for optional Vela UI packages that are absent from the uploaded archive's installed dependency environment.
- Full application build is **not claimed** because dependency installation in the isolated archive environment timed out.
- Browser/live-deployment smoke verification remains pending.

---

# SOURCE: CORESPIRIT_V109_RELEASE_NOTES.md

# CoreSpirit v109 — Indicator Schema Architecture

Date: 2026-09-29

## Architecture lock

v109 does not create a second language or renderer. It deepens the v108 CoreSpirit-first + Vela boundary by making indicator customization declarative from one versioned schema.

```text
CoreSpirit / native indicator definition
        ↓
IndicatorSettingsSchema
        ↓
Universal settings editor
        ↓
workspace normalized values
        ↓
public schema + values snapshot
        ↓
TCO render intent
        ↓
Vela adapter
```

## Completed

- Added the canonical `IndicatorSettingsSchema` ABI.
- Unified Inputs / Style / Display / Behavior / Alerts / Visualization metadata.
- Added layout and output declarations plus execution/renderer capability metadata.
- Added safe schema validation and nested immutable-style patch writes, with defense-in-depth rejection of unsafe prototype-pollution paths, bounded schema identities/layouts/outputs, and custom-schema kind matching.
- Replaced manual settings UI branches in the Indicators workspace and `/live` indicator editor.
- Added conditional field visibility and advanced controls to the universal editor.
- Normalized workspace settings from schema defaults.
- Extended public publication snapshots with schema + resolved values while retaining legacy keys.
- Made live chart refresh observe the full schema-derived settings fingerprint.
- Extended roadmap to stage 145.

## Compatibility

Existing `IndicatorConfig` fields remain supported. The schema is additive, and the existing `indicator_publications.indicator_settings` JSONB column is sufficient for the richer snapshot. Existing release manifests and historical tracker entries remain historical records.

## Security

Custom schemas are metadata, not executable code. Validation rejects unsafe path segments and malformed field declarations. Indicator settings never contain broker credentials or direct broker authority.

## Remaining

Lower-level Vela performance deepening remains on D1–D6: typed-array ingress, viewport LOD, stable render packets, retained drawings, multi-chart synchronization and frame/GPU budgets. Full browser and deployed smoke verification is still required before claiming end-to-end production validation.

---

# SOURCE: CORESPIRIT_V110_RELEASE_NOTES.md

# CoreSpirit v110 Release Notes

Date: 2026-09-29

## Theme

**Schema-driven indicator appearance without mathematical recomputation.**

v110 extends the CoreSpirit-first + Vela architecture from generic settings metadata to a complete renderer-neutral presentation contract.

## Key changes

### Indicator Settings Schema v2

The canonical settings ABI now includes rich Line, Fill, Marker, Levels and Pane/Scale presentation declarations. The universal settings editor remains generic: indicator-specific React branches are not reintroduced.

### Calculation versus appearance identity

`buildIndicatorComputationSignature()` contains only mathematical/definition identity. `buildIndicatorAppearanceSnapshot()` contains presentation state. LiveChart reacts to these with separate invalidation effects.

Changing color, opacity, width, dash style, gradient, glow, marker shape, level styling or pane presentation therefore does not trigger indicator calculation, incremental state reset or worker reseeding.

### Worker isolation

The shared chart compute coordinator strips appearance-only fields before dispatching indicator jobs. This reduces worker payload size and makes the separation an architectural constraint rather than a convention.

### Vela renderer bridge

The TCO-owned Vela facade now exposes renderer-only pane configuration and fill primitives backed by existing calculated series. Fill anchors are hidden renderer-owned series; changing their colors/gradients updates only native renderer state.

### Backward compatibility

Existing custom schema v1 publications are upgraded to the v2 schema envelope in memory before validation. No source rewrite is required for published indicators.

## Verification

- `TCO_V110_INDICATOR_SCHEMA_CONTRACT_OK`
- `TCO_V110_INDICATOR_APPEARANCE_CONTRACT_OK`
- `TCO_V110_INCREMENTAL_APPEARANCE_ISOLATION_OK`
- Existing v107 incremental and Stage98 publication contracts remain applicable.
- Full dependency-backed build: **NOT CLAIMED** in the extracted archive environment.
- Browser WebGL2/Canvas2D smoke: **NOT RUN**.

---

# SOURCE: CORESPIRIT_V111_RELEASE_NOTES.md

# CoreSpirit v111 release notes

Date: 2026-09-30

## Production build repair

### Root cause
`src/components/workspace/ShowcaseChart.tsx` imports `LineStyle` from the TCO Vela facade and uses `LineStyle.Dashed`, `LineStyle.Solid` and `LineStyle.Dotted` as runtime values. The facade previously exported only `type LineStyle = 0 | 1 | 2`, which is erased by TypeScript and therefore absent from the Rollup runtime export table.

### Fix
The facade now exports a runtime-safe enum-like `LineStyle` object plus a separate `LineStyleValue` type. The chart facade remains the compatibility boundary; `ShowcaseChart` does not import the Vela vendor directly.

## First-class programmable indicators

v111 deepens the CoreSpirit indicator architecture without adding a second indicator runtime or expanding the language keyword set.

A programmable indicator is now modeled as one immutable object containing:

```text
CoreSpiritIndicatorComponent
├── component contract
├── executable CoreSpirit artifact
├── source identity/checksum
├── typed inputs
├── typed outputs
├── calculation metadata
├── state lifecycle
├── events
├── plots
├── renderer-neutral visuals
├── alerts
├── settings schema
└── author/publishing metadata
```

The implementation lives in `src/services/coreSpirit/coreSpiritIndicatorComponent.ts` and is exported from the CoreSpirit public barrel.

The important invariant remains:

```text
CoreSpirit source
    ↓
compiler → stable IR → executable artifact
    ↓
indicator component contract
    ↓
calculation / state / events / plots / visuals / alerts / metadata
```

The component is not a new evaluator. It reuses the existing compiler, IR, VM artifact and semantic component registry.

## Composition model

Indicator outputs are typed component ports, including multi-output values. Existing component member access and invocation validation remain the composition mechanism.

A future `indicator "Name"` declaration is documented as optional sugar over this artifact/component contract; it is not introduced as a separate runtime or grammar in v111.

## Safety

Registering an indicator does not grant broker, filesystem, arbitrary network or host authority. Public publication remains source-visible and sandboxed; publication does not automatically admit arbitrary code into executable component registration.

## Verification

- `CORESPIRIT_V111_INDICATOR_COMPONENT_CONTRACT_OK`
- v110 appearance/computation isolation contracts remain in the contract suite.
- Vela boundary contract remains in the contract suite.
- Production Vite build must be re-run in the dependency-complete CI environment; the LineStyle runtime export defect is now fixed at the source boundary.

## v111.1 depth pass (finalized)

The first-class indicator model was extended from a metadata wrapper into a reusable executable component boundary without creating a new evaluator.

- Explicit public inputs may describe canonical data, parameters and component dependencies.
- Public outputs can be selected by name; unknown selections are rejected at construction time.
- `CoreSpiritIndicatorDeclaration` is the serializable declaration envelope and is validated against the canonical component object.
- Historical execution uses `CoreSpiritHistoricalExecutionHost`; realtime execution uses `CoreSpiritRealtimeExecutionHost`.
- `CoreSpiritIndicatorRegistry.unregister()` now removes the corresponding semantic component registration and callable aliases.
- Calculation metadata now includes cacheability, parallelism and eligible backends while remaining derived from the same compiled artifact.
- Settings remain a separate presentation/configuration ABI; appearance-only edits remain outside mathematical computation identity.

---

# SOURCE: CORESPIRIT_V112_RELEASE_NOTES.md

# CoreSpirit v112 — Universal parameter system + conditional settings

Date: 2026-09-30

## Scope

Deepen the first-class programmable indicator architecture from v111 into a universal parameter/dependency system while preserving the CoreSpirit six-concept language and v110 appearance/computation isolation.

## Implemented

- `IndicatorSettingsSchema` advanced to v3.
- Added explicit `parameters` ABI derived from the Inputs section.
- Supported universal kinds: number, integer, decimal, boolean, enum, color, source, timeframe, symbol, session, price, duration, string.
- Preserved legacy select/text/range/multi-select compatibility.
- Added min/max/step/group/tooltip/placeholder/unit/readonly/advanced metadata.
- Added serializable validation metadata for required, pattern and string lengths.
- Added dependency conditions with equals/notEquals, numeric comparisons, membership, truthiness and bounded all/any/not composition.
- Added safe-path, self-dependency and maximum-nesting validation.
- Added canonical `evaluateIndicatorSettingCondition()` and `isIndicatorSettingFieldVisible()`.
- Added canonical `resolveIndicatorParameterState()` returning values, visibility, validation errors and validity.
- Resolved parameter visibility is evaluated against a fully default-hydrated parameter state, so dependency chains behave correctly on first load even when controlling values are not persisted yet.
- Universal editor now renders the full parameter kind set without indicator-kind branches and displays grouped fields, tooltips and declarative validation errors.
- CoreSpirit first-class indicator component/declaration now carries the canonical `parameters` projection.
- Calculation snapshots now consume declared parameters, keeping presentation fields outside mathematical identity.
- Workspace indicator settings storage advanced to `indicator-settings-v9`.
- v1/v2 custom schemas remain readable through in-memory parameter projection into v3.
- Added v112 static contracts plus a TypeScript runtime behavior test for dependency/state resolution.
- Extended CoreSpirit roadmap from 154 to 159 stages.

## Non-interference

No Pine/PineTS/Pine compatibility layer is introduced. No new indicator VM is introduced. Appearance changes remain renderer-only and cannot invalidate indicator computation identity.

## Validation

Passing dependency-free contracts:

- `TCO_V112_UNIVERSAL_PARAMETER_SYSTEM_CONTRACT_OK`
- `TCO_V112_CONDITIONAL_SETTINGS_CONTRACT_OK`
- `TCO_V112_INDICATOR_SCHEMA_CONTRACT_OK`
- `TCO_V112_CORESPIRIT_INDICATOR_COMPONENT_CONTRACT_OK`
- `TCO_V112_INDICATOR_DECLARATIVE_EXECUTION_CONTRACT_OK`
- `TCO_V110_INDICATOR_APPEARANCE_CONTRACT_OK`
- `TCO_V110_INCREMENTAL_APPEARANCE_ISOLATION_OK`

The full Vite build is not claimed from this extracted environment because the dependency tree is unavailable; a hosted build/browser validation remains the authoritative next integration check.

---

# SOURCE: CORESPIRIT_V113_RELEASE_NOTES.md

# CoreSpirit v113 — Build repair + universal presets + semantic series typing

Date: 2026-10-01

## Scope

v113 completes the deeper pass over universal parameters and conditional settings, extends them into presets/profiles, and introduces semantic domain typing for series values.

The release also fixes the ten source/generated-build annotations reported by GitHub/Vercel for the Vela migration boundary.

## 1. Build / annotation repairs

### `LiveChart.tsx`
The indicator-series registration helper referenced the component-local `indicatorSeries` ref while living at module scope. It is now defined inside `LiveChart`, alongside the ref it owns.

### `LevelSettingsDock.tsx`
`ReactNode` is now explicitly imported as a type. No undeclared `React` namespace is required.

### `IndicatorSourceEditor.tsx`
`getIndicatorSettingsSchema` is restored from the canonical CoreSpirit schema module.

### `IndicatorSettingsPanel.tsx`
Multi-select options use DOM option values directly from the typed `selectedOptions` collection, and the panel now consumes the resolved parameter state's `visible` and `enabled` maps rather than independently evaluating dependencies.

### `App.tsx`
`RouteErrorBoundary` now declares `RouteErrorBoundaryProps` and extends `Component<RouteErrorBoundaryProps, ...>`, making `this.props` valid under React's current TypeScript types.

### Generated `dist`
Generated build output is outside the source-of-truth boundary. `dist/` is ignored and the repository hygiene contract ensures generated worker artifacts are not tracked.

### Node version alignment
The package engine, lockfile root engine and GitHub Actions runtime are aligned to Node 24.x. This removes the previous Vercel warning where `engines.node = 22.x` overrode the Project Settings Node 24 configuration.

## 2. Universal parameter depth

The parameter system remains schema-driven and indicator-kind agnostic. Parameters expose trading-aware types and constraints, and conditions can control both visibility and enabled state.

Condition validation is now target-field aware. Numeric comparisons cannot target strings/colors, `matches` cannot target numeric fields, and membership conditions require a compatible selectable/string-like target.

Dependency cycles, self-references, unsafe paths, malformed groups and excessive nesting remain rejected before the schema reaches the editor.

## 3. Presets / templates / profiles

The serializable preset ABI now supports:

```text
Factory Default
Script-embedded Defaults
Factory Templates
Personal
Workspace
Community
```

Artifacts can declare their own template definitions with explicit IDs, names, descriptions and parameter overrides. This is configuration data; it does not execute code or add indicator-specific UI branches.

Effective parameter layers are resolved deterministically:

```text
Factory → Script → Workspace → Personal
```

The resolver returns both the effective values and the preset identity applied at each layer.

Local writes are restricted to personal/workspace presets. Community presets remain read/catalog surfaces.

Profiles are isolated by user/workspace context, serialize through the same preset ABI and are bounded to 128 presets. Active profile metadata can associate a selected preset with an indicator kind without creating a second configuration format.

## 4. Semantic series types

CoreSpirit now distinguishes the semantic atoms:

```text
number
price
volume
time
duration
boolean
string
currency
```

including:

```text
series<number>
series<price>
series<volume>
series<time>
series<duration>
series<boolean>
series<string>
```

Semantic metadata may include unit, currency, symbol, timeframe, precision and scale.

This sits above the structural VM type system. The VM can still consume `series<number>` while the compiler knows the value is semantically `series<price>`.

## 5. Domain-aware operators

The semantic layer now rejects expressions such as:

```text
price + volume
price > volume
```

while preserving valid combinations such as:

```text
price + number
price - price
price / price
price * volume
series<time> + duration
```

Source-preserving functions keep the source semantic domain when meaningful. ATR/true-range/VWAP are classified as price-domain outputs, while RSI-like normalized oscillators are numeric/percent-domain outputs.

## 6. Tooling

CoreSpirit language completions and type information advertise domain-aware market series instead of collapsing all series to an anonymous numeric type.

Explicit declarations such as:

```text
let basis: series<price> = close
```

are accepted by the parser and checked against semantic inference.

## 7. Non-interference

- No Pine/PineTS/Pine compatibility layer is introduced.
- No second indicator VM/evaluator is introduced.
- Preset/profile data contains no executable callbacks.
- Semantic types do not create a second runtime graph.
- Appearance changes remain outside mathematical computation identity.
- Vela remains behind the TCO chart facade.
- Broker authorization and risk authority remain TCO-owned.

## Verification

Passing dependency-free Node contracts include:

- `TCO_V113_BUILD_ANNOTATION_REGRESSION_CONTRACT_OK`
- `TCO_V113_INDICATOR_PRESET_SYSTEM_CONTRACT_OK`
- `TCO_V113_CORESPIRIT_SEMANTIC_SERIES_TYPE_CONTRACT_OK`
- `TCO_V113_GENERATED_ARTIFACT_HYGIENE_OK`
- `TCO_V111_VELA_RUNTIME_EXPORT_CONTRACT_OK`
- `TCO_V112_UNIVERSAL_PARAMETER_SYSTEM_CONTRACT_OK`
- `TCO_V112_CONDITIONAL_SETTINGS_CONTRACT_OK`

The complete dependency-free Node contract inventory is the currently verified suite. A full dependency-backed `tsc`/Vite build and post-push GitHub Actions/Vercel run remain unclaimed because the extracted archive environment does not have a usable dependency tree.

## Universal parameter ABI v3

v113 depth work treats parameters as a typed ABI rather than input widgets. Fields validate their value domain, constraints and declared options before presets can be persisted/applied. The dependency schema compiles to a graph of dependencies/dependents with cycle detection and deterministic resolution over default-hydrated state.

## Preset/profile depth

Factory, script-embedded, template, workspace, personal and community configuration remain one serializable preset model. Profiles now persist the deliberate active preset per indicator; when no selection exists, workspace/personal resolution falls back to deterministic latest-by-`updatedAt`/ID ordering. Canonical profile fingerprints are available for reconciliation/change detection.

## Semantic series depth

CoreSpirit now exposes explicit pure semantic conversions (`toNumber`, `toPrice`, `toVolume`, `toTime`, `toDuration`, `toCurrency`) as the sanctioned escape hatch from strict domain arithmetic. They add no new host capabilities.


## v114 preparation/depth

The v114 depth pass formalizes the universal configuration and semantic-type architecture around three principles: parameters are validated values, conditional settings are a dependency graph, and semantic domain changes are explicit.

Preset profiles now participate in effective configuration resolution through `activePresetByIndicator`; workspace/personal layers retain deterministic latest fallback when no explicit selection exists. Profile fingerprints are canonical data fingerprints for reconciliation rather than security signatures.

Universal parameter validation now checks field shape in addition to generic constraints. Session, timeframe, symbol, color and duration kinds receive domain validation before a value can enter a preset or resolved state.

CoreSpirit semantic conversions are registered as pure library functions. They are the deliberate escape hatch from strict implicit domain rules and add no host authority.

---

# SOURCE: CORESPIRIT_V114_RELEASE_NOTES.md

# CoreSpirit v114 — Universal configuration + semantic series depth

Date: 2026-10-01

## Production build annotation repairs

v113/v114 preserves the source fixes for the reported hosted-build annotations:

- `LiveChart.tsx` no longer has module-scope helpers capturing `indicatorSeries`.
- `LevelSettingsDock.tsx` uses an explicit `ReactNode` import.
- `IndicatorSourceEditor.tsx` imports the canonical settings schema resolver.
- `IndicatorSettingsPanel.tsx` types DOM option values and consumes resolved parameter state.
- `App.tsx` declares `RouteErrorBoundary` props explicitly.
- generated `dist` output is excluded from source control and build inputs.
- package and CI are aligned to Node 24.x.
- the v111 `LineStyle` runtime export remains protected by a contract.

## Universal parameter ABI v3 — deeper layer

Parameters are validated by semantic field kind, not merely by generic JavaScript shape. Numeric fields enforce finite/integer/range/step semantics; duration rejects negative values; select/enum/source/timeframe/multi-select fields enforce their declared domain; color, symbol, session and timeframe receive format validation. Defaults pass the same validator used by persisted and preset values.

The parameter schema compiles to:

```text
parameter
 ├── dependencies
 └── dependents

plus a deterministic evaluation order
```

The universal editor can therefore identify the transitive affected setting paths after a parameter edit without indicator-specific UI branches. Conditions remain bounded, typed against target fields, cycle-checked and fail-closed.

## Conditional settings

`visibilityCondition` and `enabledWhen` are resolved against a fully default-hydrated parameter environment. This makes first-load behavior identical to persisted-state behavior and prevents schema defaults from producing transient hidden/locked controls.

## Presets, templates and profiles

The preset architecture now has explicit portability and profile-selection semantics:

```text
Factory
  ↓
Script
  ↓
Workspace (selected or latest)
  ↓
Personal  (selected or latest)
```

`activePresetByIndicator` is authoritative for explicit workspace/personal selection. Community presets remain read-only and cannot be activated as local personal/workspace configuration. Preset bundles and profiles are versioned JSON data and are schema validated. Canonical profile fingerprints support deterministic reconciliation/change detection.

## Semantic series type system

CoreSpirit distinguishes semantic domains across scalar and series values:

```text
number / series<number>
price  / series<price>
volume / series<volume>
time   / series<time>
duration / series<duration>
currency / series<currency>
boolean / series<boolean>
string  / series<string>
```

Metadata may include unit, currency, symbol, timeframe, precision and scale. Cross-domain arithmetic and ordered comparison remain invalid unless a defined semantic operation exists.

Examples:

```text
price + volume       → error
price > volume       → error
price * volume       → currency/notional
time - time          → duration
toNumber(price)      → number
toPrice(number)      → price
```

The six explicit conversions are pure semantic operations and add no broker/network/filesystem capability.

## Non-interference

Appearance state remains outside mathematical computation identity. Parameter edits only invalidate calculation when the changed parameter belongs to the declared computation ABI. Presets, profiles and semantic metadata do not bypass risk, broker, data or renderer authority.

## Verification

- Full Node-only architecture/contract inventory: **PASS (30 commands)**.
- Semantic-series runtime contract: **PASS** under Node's experimental TypeScript type stripping.
- Roadmap validation: **PASS — 184 stages**.
- Full dependency-backed TypeScript/Vite build: **NOT CLAIMED** because the extracted environment has no complete dependency tree.
- GitHub Actions/Vercel post-push confirmation: **PENDING UNTIL HOSTED BUILD RUNS**.
- Browser smoke: **NOT RUN**.

---

# SOURCE: CORESPIRIT_V88_RELEASE_NOTES.md

# TradingCoreOS CoreSpirit v88

## Purpose

v88 turns the existing CoreSpirit foundation into a small authoring surface with a substantially more composable and performance-aware execution system.

The source language remains six concepts:

`DATA` · `LET` · `WHEN` · `SHOW` · `MODEL` · `AUTOMATE`

Complexity is absorbed below that surface by semantic graphs, reusable components, execution planning, incremental compilation, bounded caches, workers, lineage and host execution contexts.

## Implemented

- Simple / Advanced / Professional authoring profiles without a language fork.
- Live / paper / backtest / replay / scan / research / optimization execution contexts.
- Universal CoreSpirit value kinds and pure/stateful/io/event/visual/authority execution classes.
- Reusable typed semantic components and pipeline contracts.
- Incremental AST reuse, changed semantic-node detection and bounded compiler caching.
- Canonical object serialization and SHA-256 artifact caching.
- Source-input reverse indexes for targeted reactive invalidation.
- Bounded pure-node runtime cache and queue traversal without `shift()` in the reactive hot path.
- Hot / warm / cold execution-lane planning and explicit effect barriers.
- Runtime performance budgets and public performance statistics.
- Reusable CoreSpirit worker pool instead of one worker per run.
- Chart realtime frame coalescing and persisted chart-state memoization.
- Workspace market-tick backpressure with one React state write per animation frame.
- Incremental EMA / RSI / ATR / SMA / VWAP developing-bar previews.
- Canonical timestamp normalization for realtime candle identity.
- Rare committed-candle correction rebuild for historical corrections.
- Bounded history request cache with in-flight request deduplication and stale-while-revalidate behavior retained.
- Generic semantic value lineage tracing.
- Version-aware CoreSpirit package registry.
- Existing capability sandbox / execution authority preserved.
- Existing numerical CPU/WASM/GPU planner preserved and extended with lanes/cache metadata.

## Verification

The repository contract suite passes:

```text
STAGE88_TERMINAL_ARCHITECTURE_GUARD_OK
STAGE89_SPA_ROUTE_CONTRACT_OK
STAGE_V85_HARDENING_CONTRACT_OK
V85_LEGACY_BRIDGE_CLEANUP_OK
CORESPIRIT_V88_COMPLEXITY_ABSORPTION_PERFORMANCE_CONTRACT_OK
```

Changed TypeScript/TSX source was syntax-parsed successfully with the available TypeScript compiler API.

A direct runtime behavioral check also passed for same-candle realtime updates, reversible developing-bar previews, stable bar-close commits, and committed-candle correction rebuilds.

## Environment limitation

The archive does not contain a complete installed dependency environment. In this execution environment the local `vite` binary and `vite/client` type declarations were unavailable, and dependency installation timed out. Therefore a production Vite build was not claimed as verified.

The repository remains intended to be installed normally with its declared package dependencies before `npm run build` / `npm run typecheck` are executed.

---

# SOURCE: CORESPIRIT_V90_RELEASE_NOTES.md

# CoreSpirit v90 — Small Surface, Deep Composition

## Goal

Make CoreSpirit substantially more expressive without making the language substantially larger.

## Frozen authoring model

The public mental model remains six concepts:

```text
DATA
LET
WHEN
SHOW
MODEL
AUTOMATE
```

CoreSpirit does **not** add separate `FUNCTION`, `PIPELINE`, `MOTION`, `REGIME`, `FEATURE`, or backend-specific keywords to make composition possible.

## What changed

### 1. Components are now first-class values in the compiler model

Registered component contracts can be called from normal expressions:

```corespirit
motionValue = motion(data)
vol = volatility(data)
reg = regime(motionValue, vol)
show reg.trendProbability
```

A single-output component returns the corresponding language value type. A multi-output component returns a typed component reference; member access resolves output ports without exposing internal implementation.

### 2. Composition is carried through the entire execution pipeline

```text
CoreSpirit source
    ↓
AST
    ↓
semantic typing + component binding
    ↓
semantic dependency graph
    ↓
stable IR
    ↓
execution / reactive graph
    ↓
CPU / WASM / GPU-capable host planner
```

The author does not need to select the execution backend.

### 3. Component contracts participate in incremental invalidation

Component contract identity is included in compiler/cache identity. Changing a component contract therefore invalidates affected compilation artifacts instead of silently reusing stale results.

### 4. Runtime remains capability-safe

A registered component receives only the explicit runtime context and arguments supplied by the host. Registration does not grant broker credentials, arbitrary filesystem/network access, or direct execution authority.

## Design principle

> Keep the language small. Move complexity into typed semantics, graphs, contracts, planning, and runtime infrastructure.

---
