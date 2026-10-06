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

## Strict three-rate realtime model

Realtime is split into three independent clocks:

```text
market rate       50–500+ updates/sec when the broker provides them
    ↓
coalesce into latest market state
    ↓
compute rate      indicator/CoreSpirit cadence; default chart cadence is 20 Hz
    ↓
dirty state / retained patch
    ↓
render rate       requestAnimationFrame (display refresh ceiling)
    ↓
Vela renderer
```

A market tick must never directly trigger a React render or a full chart render. The market plane may ingest every tick; compute consumes the newest pending state; the renderer consumes at most one latest patch per animation frame. `ChartStore` therefore keeps mutable tick-hot state and creates an immutable UI snapshot only at the UI frame boundary.

## Market tick ring buffer

The broker/socket ingress uses a fixed typed ring buffer per broker+instrument stream. The hot representation stores timestamp, price, quantity, bid, ask and flags in typed arrays, with a monotonic sequence number. Compatibility object materialization is reserved for diagnostics/API boundaries.

```text
socket
  ↓
typed TickRingBuffer
  ↓
market state
  ↓
CoreSpirit / compute scheduler
  ↓
canonical columnar bars
  ↓
Vela render patch
```

The ring is bounded (8,192 samples by default), so bursty feeds do not create an unbounded tick-object queue. Compute batches/coalesces pending sequences instead of evaluating the same forming bar once per transport packet.

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

## Persistent worker + SharedArrayBuffer execution

CoreSpirit worker execution now follows an artifact/session protocol rather than a source-per-run protocol:

```text
Chart A
  ↓
worker context A
  ├─ compiled artifactId
  ├─ execution state
  ├─ indicator kernels
  └─ shared market buffer

market update
  ↓
datasetVersion + dirtyFrom/dirtyTo
  ↓
worker executes only the current incremental bar when the dirty span is a forming-bar tail
```

The SAB dataset contains a compact metadata header plus typed `time/open/high/low/close/volume` columns. The final metadata write is published through an atomic sequence counter so the worker has an explicit visibility point for the completed update. Under cross-origin isolation, the buffer is shared with the worker and the worker retains the corresponding CoreSpirit bar objects as a compatibility execution cache. The objects are created once for the persistent dataset and only dirty rows are synchronized afterward; source text and the 50k-bar history are no longer resent on every run.

SAB is bounded to 250k bars for this chart-oriented path. Larger research/backtest datasets should use bounded/chunked dataset ownership rather than reserving hundreds of megabytes of shared memory per worker context.

The browser must expose `crossOriginIsolated` plus `SharedArrayBuffer`; the `/live` deployment sends COOP `same-origin` and COEP `require-corp`. Non-isolated environments retain a compatibility path, but the browser performance gate treats shared-memory availability as required by default.

Large numeric CoreSpirit series results now use a shared typed output buffer; semantic/non-numeric visual objects remain ordinary message payloads. One-shot analytics/history indicator snapshots continue to use transferable typed `ArrayBuffer`s. That is deliberate: transferables already avoid structured-clone copies, and using a shared buffer for a single consumer would introduce lifetime/race management without a comparable benefit. Persistent/shared ownership is reserved for hot reusable datasets and stateful worker contexts.

## WASM acceptance gate

The CoreSpirit backend benchmark compares **JS VM**, **fused JS**, **WASM scalar** and **WASM SIMD** at **50k, 500k and 5m bars** by default. A missing WASM artifact reports as not-configured; the benchmark infrastructure alone is not evidence that WASM is faster. Production promotion requires measured scalar/SIMD results on the same CoreSpirit workload at all three sizes.

**WebGPU compute is intentionally deferred.** CPU/fused-JS/WASM scalar/SIMD measurements come first; no GPU backend is added merely for architectural completeness.

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


## v137 — CoreSpirit time-series query optimizer

The compiler now emits a cost model instead of treating optimization as constant folding only.

### Costed pipeline

```text
CoreSpirit source
      ↓
semantic dependency graph
      ↓
typed IR
      ↓
safe local rewrites
      ↓
cost model
      ↓
chronological execution plan
```

The optimizer currently performs three high-value operations:

1. **Constant folding** for compile-time scalar expressions.
2. **Pure CSE and input-read reuse** for repeated `loadSeries`, unary/binary/index work and proven pure deterministic calls.
3. **Cost estimation** for per-bar pure work, effect work, stateful work, history reads, duplicate work removed, and peak temporary register pressure.

The optimizer deliberately does **not** alias generic stateful indicator call sites. EMA/RMA/RSI/ATR/VWAP and similar kernels remain ordered stream state. Their reuse comes from the chronological execution model and series-fusion planner, not an unsafe assumption that two stateful calls are interchangeable.

### Example

For:

```
let a = ema(close, 20)
let b = ema(close, 50)
let c = atr(14)
let d = sma(a, 10)
let e = sma(b, 10)
```

the compiler can now plan:

```text
one chronological traversal
close ──┬─ EMA20 ── SMA10(a) ──┐
        ├─ EMA50 ── SMA10(b) ──┤
        └─ ATR14 ───────────────┘
```

Repeated source reads are reused where it is provably safe, while stateful kernels keep their chronological identities. The execution plan exposes the resulting read reuse and estimated saved work to the host planner.

This is the beginning of a true time-series query optimizer. It is not yet a global algebraic optimizer: no speculative loop reordering, cross-bar reassociation, or generic stateful-call merging is performed.

### Performance acceptance

- [x] Optimizer metadata is attached to the executable IR.
- [x] Execution planner consumes optimized pure-work cost.
- [x] Runtime consumes compiler-produced series-fusion plan.
- [x] Regression contract proves repeated series reads are reused.
- [ ] Add global DAG scheduling based on critical-path and fan-out cost.
- [ ] Add state-identity analysis so explicitly shareable stateful kernels can be reused without changing language semantics.
- [ ] Benchmark optimized plans against the pre-optimizer VM on representative 5k/50k/500k-bar workloads.

## v138 — CoreSpirit artifact cache + formal ABI

CoreSpirit executable artifacts are now the unit of compilation caching.

### Hierarchical identity

source hash -> normalized hash -> semantic hash -> IR hash -> optimized artifact hash -> execution backend

The cache keeps the executable artifact itself in memory. Editor diagnostics remain separate metadata; they are not part of the execution payload.

The semantic identity includes the compiler semantic fingerprint, component contracts, language normalization and explicit runtime/optimizer ABI versions. Formatting-only edits can converge on the same semantic artifact while compiler, component, or ABI changes invalidate it deterministically.

### Persistent browser cache

When IndexedDB is available, artifacts are persisted in tradingcoreos-corespirit-artifacts with separate artifact and alias records. The cache uses a bounded 128-artifact persistent budget plus a bounded in-memory hot cache. Failed IndexedDB access degrades to the in-memory cache without changing execution semantics.

The chart worker path is now: source -> hierarchical artifact lookup -> IndexedDB/memory hit -> artifact -> persistent worker context -> execute.

Previously unseen indicators still compile normally; previously seen indicators can reopen directly from the persisted executable artifact.

### CoreSpirit Artifact ABI

New executable artifacts carry magic CSPIRIT, version 2, runtimeABI 5, optimizerABI 3, programHash, sourceHash, normalizedHash, semanticHash, irHash, artifactHash, requiredKernels, requiredData, maxLookback, executionCapabilities, and debugMap.

The artifact hash is a canonical SHA-256 content address over program/IR identity and ABI versions. The legacy short checksum remains only as a compatibility field for older callers.

The ABI is backend-neutral. The same artifact can be selected by browser VM, persistent worker VM, server VM, backtest VM, or replay VM caches. Backend choice belongs to the cache/execution boundary rather than changing the program representation.

Persistent chart workers now use the formal artifact hash as their context identity. Old schema-2 artifacts without the formal ABI remain executable for compatibility but are not admitted to the persistent artifact cache.

### Acceptance

- Executable artifact is the in-memory cache primitive.
- Source, normalized, semantic, IR, and artifact identities are explicit.
- IndexedDB persistence is bounded and best-effort.
- Formal CSPIRIT artifact ABI is validated before persistent use.
- Worker context addressing uses the formal artifact hash.
- Execution backend is represented at cache selection time.