# Data and performance

## Target hot path

```
Broker / TCO feed
 → canonical typed columns
 → CoreSpirit / analytics
 → renderer-neutral model
 → retained Vela range patch
 → renderer/frame
```

Canonical market data is time/open/high/low/close/volume typed storage. `HistoricalCandle[]` is an edge compatibility representation, not the preferred hot-path transport.

## History policy

- Initial chart load: **5,000 candles**.
- Older left-edge page: **5,000 candles**.
- Fyers history request cap: **5,000 candles**.
- Maximum retained history: **50,000 candles**.
- Identical history requests are cached and single-flight deduplicated.
- Older history is fetched on demand instead of preloading 50k bars.


## Regional placement — Mumbai is the locked request-region

The repository intentionally keeps Vercel Functions in **Mumbai (`bom1`)**. This is not a generic “move to Edge” optimization: database-bound trading requests should keep compute close to the primary data source. Vercel documents that globally distributed compute can add latency when it sits far from the database, and recommends colocating function execution with the services the request depends on. citeturn208679search4turn208679search13

The connected production Supabase project is in **AWS Mumbai (`ap-south-1`)**, which aligns with `bom1`. Supabase documents `ap-south-1` as its Mumbai region and recommends choosing the region closest to users for performance. citeturn208679search0

Target topology:

```
India browser
    ↓
Vercel CDN (global static delivery)
    ↓
Vercel Functions — bom1 / Mumbai
    ├── Supabase — ap-south-1 / Mumbai
    └── FYERS request APIs

India browser
    ↓
Realtime gateway — Mumbai / measured nearest FYERS path
    ↓
Redis — Mumbai primary where the selected Upstash product supports it
    ↓
FYERS WebSocket
    ↓
normalized ticks → canonical data plane → CoreSpirit / Vela
```

The realtime gateway is intentionally not assumed to share the Vercel Function lifecycle. Deploy it in Mumbai (or the lowest-latency Indian execution region available) and measure the actual browser→gateway→FYERS and gateway→Redis paths before changing regions. Upstash currently lists Mumbai (`ap-south-1`) as an operational Redis region. citeturn684593search0

Do **not** move the trading request plane to Edge merely because the users are distributed. The decision point is the slowest dependency round trip: browser → function, function → Supabase/broker, and function → shared coordination. Static/cacheable assets remain globally served by the Vercel CDN. citeturn208679search13turn208679search4

## Frontend startup budget — route graph, not one giant chunk

The previous production build reported a roughly **2.1 MB minified main JS chunk**. The repo now treats that as an architectural issue rather than a warning to ignore.

The critical-path rules are:

```
Initial browser
  → App shell + auth bootstrap
  → Navbar + Hero
  → no TradingCoreRuntime
  → no chart engine
  → no CoreSpirit editor
  → no below-fold marketing sections
```

The protected application is loaded as a separate graph:

```
Dashboard / Live
  → route chunk
  → TradingCoreRuntime
  → broker + market-data + chart dependencies
```

The landing page defers below-fold marketing modules until the page is near them or the short startup grace period has elapsed. This keeps the initial graph focused on the first viewport rather than paying for every section of the marketing page.

The build now emits a Vite manifest, groups large third-party dependencies into explicit vendor chunks, and runs a graph-aware gzip budget across the landing, login, dashboard and live route roots. The strategic performance target remains:

- **150–250 KB gzip** for first interactive landing/startup JavaScript.
- **<300 KB gzip** for the live workspace's critical route graph once the live route has been fully measured and trimmed.
- Editor, models, prediction, indicators and other non-critical modules remain route/on-demand chunks.

CI currently uses staged safety ceilings of 320 KB (landing), 260 KB (login), 400 KB (dashboard) and 650 KB (live) so regressions are blocked before the long-term targets are tightened. These are guardrails, not claims that the targets have already been achieved.


## Vela capability graph — prevent the fork from becoming one mandatory payload

The Vela fork is **384 source files** on the current branch. The largest individual modules include:

| Module | Source size | Role |
| --- | ---: | --- |
| `vendor/vela/src/renderers/native/NativeRenderer.ts` | ~258 KB | native renderer |
| `vendor/vela/src/core/engine/EngineOrchestrator.ts` | ~181 KB | orchestration/runtime |
| `vendor/vela/src/workspace/VelaWorkspace.ts` | ~135 KB | multi-chart workspace |
| `vendor/vela/src/renderers/native/drawings/DrawingPainter.ts` | ~83 KB | drawing paint path |
| `vendor/vela/src/workspace/ChartCell.ts` | ~82 KB | workspace cell |
| `vendor/vela/src/renderers/native/chrome/SettingsDialog.ts` | ~78 KB | settings UI |
| `vendor/vela/src/widget/object-tree.ts` | ~68 KB | object-tree widget |
| `vendor/vela/src/renderers/native/backend/WebGL2Backend.ts` | ~64 KB | WebGL2 renderer backend |

The most important eager-import hotspot is the native renderer. `NativeRenderer.ts` previously imported `UserDrawingController` as a runtime dependency; that controller imports `DrawingPainter`, `DrawingInteraction`, `DrawingSettingsPopup`, `DrawingToolbar`, hit testing, color-picker UI and the drawing registry. The registry itself statically imports dozens of drawing implementations including Fibonacci, Gann, harmonic, Elliott, geometry, markup and volume-profile tools.

That created this unwanted dependency shape:

```
basic chart
  → NativeRenderer
      → UserDrawingController
          → Drawing registry
              → dozens of drawing implementations
          → drawing toolbar/settings/painter
```

The renderer now treats interactive drawings as an **optional capability**. `UserDrawingController` is type-only in the renderer core, and the concrete implementation is loaded through a dynamic import when the host first asks for `userDrawingsPort`. The proxy preserves the synchronous renderer-port contract while deferring the heavy implementation chunk.

The chart facade also no longer re-exports `VelaWorkspace` as a runtime value. Multi-chart workspace functionality is exposed through `velaWorkspaceLoader.ts`, where it can be loaded on demand instead of joining every chart import.

### Capability boundaries

```
CORE
  ├─ React/auth/routing/theme
  └─ lightweight TradingCore shell

TRADING
  ├─ chart renderer
  ├─ Vela native chart core
  ├─ broker
  └─ realtime gateway client

RESEARCH
  ├─ CoreSpirit editor
  ├─ model center
  └─ backtest/replay

ADVANCED
  ├─ drawing registry
  ├─ multi-chart workspace
  ├─ automation/scanners
  └─ ML/prediction overlays
```

### Drawing policy

A basic chart must not download the entire drawing catalog. The critical chart payload may contain the renderer's drawing *port* and serialized data types, but actual interactive drawing implementations belong to a capability chunk. The long-term split is:

```
basic chart
  └─ renderer core

open Draw / drawing UI
  └─ drawing capability chunk
       ├─ lean tools
       ├─ toolbar
       ├─ interaction
       └─ advanced drawing families on demand
```

The next refinement is to split `registry.ts` itself into lean-core and advanced families so enabling one advanced family (for example Fibonacci) does not pull Gann, harmonics, Elliott and volume-profile classes into the same chunk.

### Native-indicator policy

The Vela public composition root still registers its complete native indicator catalog eagerly for backwards-compatible SDK semantics. TradingCoreOS does not use that composition root for its production chart path; the TCO chart facade talks directly to `NativeRenderer`. The next Vela SDK cut should add an explicit `registerNativeCatalog()` capability loader if/when the SDK composition root becomes part of the browser bundle.
## Request plane vs realtime plane

TradingCoreOS now treats request/response work and realtime market delivery as separate planes.

### Request/response plane

```text
Browser
  → Vercel CDN / Functions
  → auth + broker REST + Supabase
  → bounded JSON response
```

The Vercel request function is a short-lived control/data API. P0 routes have explicit deadlines and the catch-all api/index.ts is capped at 15 seconds; long computation belongs on the queue/worker path instead of extending the HTTP invocation.

### Realtime plane

```text
Browser
  → signed realtime ticket from Vercel
  → dedicated realtime gateway
  → Redis ownership / PubSub / subscription metadata
  → one FYERS owner per user
  → normalized ticks / order events
  → gateway fanout
  → browser / canonical data plane / Vela
```

Vercel Functions must not be treated as the durable owner of a websocket session. The realtime gateway therefore owns broker sockets, while Redis coordinates ownership and cross-instance fanout. Supabase remains the durable source of record for broker sessions, jobs and product state.

### Shared-state policy

Process-local maps are now explicitly divided into two categories:

- Ephemeral local state: per-instance connection objects, in-memory cache entries, local listener sets and local admission queues. These are performance optimizations only and may disappear on instance recycle.
- Shared coordination state: broker request admission/rate budget, realtime owner election, subscription metadata, cross-instance event fanout and short-lived broker-session cache. These live in Redis when distributed coordination is enabled.

A Vercel instance must never make a safety decision based solely on an in-memory map when another instance can concurrently act for the same user.

### Rollout state

The dedicated realtime gateway and distributed coordination code are implemented behind environment configuration. Production Vercel currently has no Redis/realtime-gateway integration configured, so the existing bounded HTTP stream remains an explicit fallback until the gateway is provisioned and its environment is populated.

Required runtime configuration:

- UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for request-plane distributed admission.
- REALTIME_GATEWAY_URL + REALTIME_GATEWAY_SHARED_SECRET for browser handoff.
- REALTIME_REDIS_REST_URL + REALTIME_REDIS_REST_TOKEN + REALTIME_GATEWAY_SHARED_SECRET for the dedicated gateway.
- Set TRADINGCORE_DISTRIBUTED_COORDINATION_REQUIRED=true only after shared Redis has been verified in production.


## Stateful indicator mathematics — v131

The canonical CoreSpirit kernel layer provides bounded state for rolling and recursive calculations:

```
RollingSum / RollingMean
RollingVariance
RollingMinMax
RollingMedian / RollingPercentile
RollingAbsoluteDeviation
EMA / Wilder / ATR / WMA / VWAP
```

The standard indicator engine uses these primitives for Bollinger, Donchian, Stochastic, CCI and MFI. Production historical traversal is O(N) for fixed-period O(1) families and O(N log P) expected for ordered-statistic families; no P-sized window is constructed and rescanned for every bar.

The market-data `incrementalIndicatorKernel.ts` is only a compatibility re-export of the same canonical kernel layer. It must never become a second mathematical implementation.

### Complexity contract

| Family | Per-bar hot-path state |
|---|---:|
| SMA / sum | O(1) |
| Bollinger | O(1) |
| Donchian | O(log P) |
| Stochastic | O(log P) |
| CCI / MAD | O(log P) expected |
| MFI | O(1) |
| Median / percentile | O(log P) expected |
| EMA / Wilder / ATR / RSI / WMA / VWAP | O(1) |

## Avoiding false performance claims

Some advanced/structural indicators intentionally use semantic grouping, fixed-size pattern checks, session aggregation or centered scans. They are not automatically equivalent to a simple rolling statistic.

The hard prohibition is narrower and enforceable:

```
For each bar:
  construct the same period-sized window
  scan/sort that window
```

when bounded state can provide identical semantics.

Reference implementations in tests may still use a simple windowed algorithm because their purpose is numerical equivalence testing.

## Columnar transport

The first 5,000-bar Vela load uses compact numeric history when the broker supports it. Deep backfill can prepend typed columns directly into `ColumnarHistoryTape`.

The retained tape supports binary time lookup, append, replace-last, prepend and bounded trimming.

**Current status: partial completion.** The native tape is columnar, but selected replay/session/drawing/transformed-chart consumers still request `OHLCV[]` compatibility projections. The final removal of that mirror is an ABI migration, not a documentation-only change.

## Dirty-span compute

The primary history-backfill path carries a causal dirty interval plus lookback warmup and performs ranged indicator/model recomputation.

**Current status: partial completion.** The exact range exists through the primary CoreSpirit/Vela path, but every RenderPacket/ScenePatch collection and every renderer-owned overlay is not yet guaranteed to consume the same bounded span. A full replacement remains an explicit fallback for unproven cases.

## Telemetry

Source instrumentation exists for transport, compute, patch, renderer and frame stages. Native Vela reports frame count, worst/average frame time, p95 frame time, FPS estimate, frame-budget misses and backend.

**Current status: instrumentation complete; runtime verification open.**

Track at minimum:

- transport latency
- compute latency
- patch latency
- renderer time
- p95 frame time
- frame-budget miss rate
- dirty-span width
- full replacement count
- live forming-bar update cost

## Browser/GPU validation gate

The repository contains `tools/verify-chart-performance.mjs` for browser checks. The following measurements are deliberately **not marked complete** until captured against a running/authenticated environment:

- 1-chart layout
- 4-chart layout
- 8-chart layout
- 5,000-candle first load
- 5,000-candle backward prepend
- live forming-bar replacement
- actual browser/network latency
- GPU vendor/utilization counters

## v130

The canonical scalar compatibility layer was cleaned up to eliminate old per-window `slice/reduce/spread` patterns. `RollingMinMax` forming-bar replacement is corrected, and the existing stateful parity contract continues to validate replacement semantics.

## Performance invariants

1. A live tick updates the forming-bar state instead of rebuilding retained history.
2. A 5,000-bar prepend does not imply a 50,000-bar renderer replacement.
3. Columnar storage remains the canonical market-data representation.
4. Compatibility object creation is explicit and measurable.
5. Source contracts do not substitute for browser/GPU evidence.


## Structural analytics cost model

The v130 structure engine no longer performs a period-wide fractal comparison for every candidate bar. Fractal highs/lows use the same monotonic centered-extrema primitive as CoreSpirit, giving linear traversal for a fixed period. Zone mitigation no longer recomputes ATR from the beginning of history for every impulse and no longer scans every future candle per zone; it uses one causal ATR series plus threshold heaps, so each zone is inserted and removed at most once.

This prevents structural analytics from becoming a hidden N×period or N² cost after ordinary indicators have already been made incremental.


## v130 realtime performance
- Realtime rollback is journal-based and bounded by mutated keys, not retained-bar count.
- RSI/ATR/VWAP runtime paths use stateful incremental kernels with forming-bar replacement.
- Vela history remains columnar at the renderer boundary; OHLCV objects are a compatibility seam only.
- Non-live product surfaces use longer, smoother motion; the live terminal stays chart-native.
- FYERS history remains 5,000 candles per request with 5,000-candle backward pages and bounded 50,000 retention.
