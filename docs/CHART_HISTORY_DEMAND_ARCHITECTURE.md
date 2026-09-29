# TradingCore Chart History Demand Architecture

## Purpose

History loading is a viewport/data-demand problem, not a fixed 25k-candle initialization problem. A visible chart should paint recent data immediately, obtain older data only as the viewport approaches the loaded left edge, and use a bounded warm cache for the currently active chart rather than starting a multi-page crawl for every chart cell.

## v104 staged history model — 2026-09-29

```text
recent window
    ↓
paint immediately
    ↓
visible-range demand
    ↓
bounded older page
    ↓
optional active-chart warm page
    ↓
deep history only when scrolled
```

Initial history is explicitly bounded to 300–1,500 candles depending on timeframe. The active window is intentionally independent from the 50,000-candle absolute retention ceiling. A large pre-existing cache is sliced to the recent active window so a chart does not materialize every cached candle into its renderer on mount.

## Canonical timeframe policy

```text
1m   1500 initial / 1200 page
3m   1200 initial / 1000 page
5m    900 initial /  900 page
15m   600 initial /  750 page
30m   450 initial /  600 page
1H    360 initial /  450 page
1D    300 initial /  300 page
```

The numbers are starting budgets, not promises about the broker's returned row count. The client, runtime and broker route all enforce an upper request limit.

## Visible-range demand

`LiveChart` listens to the renderer's logical range. The trigger scales with viewport density and page size rather than using the former fixed 1,000-bar threshold. This means a chart with a small recent window requests the next page only when the user actually approaches the left edge.

The data plane performs at most one older-page load for its dataset at a time. A failed or empty page does not start an autonomous retry crawl. Empty responses mark the dataset's current history boundary exhausted until a new lifecycle is established.

## Warm cache stage

Warm history is deliberately limited to the active chart. The first registered/activated chart may request one low-priority warm page after initial paint, and pointer activation of another chart can make that chart eligible. Warm work is single-page only and never expands toward a 25k target.

This preserves a useful indicator warmup region without forcing all 16 chart cells to populate deep history. When the user scrolls, the same page path is reused for visible demand.

## Global history request budget

Per-dataset single-flight is insufficient when many unique datasets mount at once. `ChartHistoryCoordinator` therefore imposes a global browser history request budget of two concurrent requests. Queue priority is:

```text
initial  >  visible  >  warm
```

A 16-chart workspace may therefore have many dataset consumers, but only two history REST operations are active at once. This protects broker rate limits and keeps the main application responsive during workspace construction.

## Cache reuse

`HistoryStore.getBefore()` uses the sorted cached timeline and binary search to serve an older page without touching the network when the data is already warm. This matters when other runtime paths have already populated history or when a warm page was fetched earlier.

The active `ChartDataPlane` window and the persistent `HistoryStore` retention are intentionally separate:

```text
HistoryStore       → reusable retention up to 50k
ChartDataPlane     → recently demanded active window
Renderer           → chart-local projection of active data
```

## Broker request contract

The initial history limit is propagated through every layer:

```text
LiveChart
  ↓
ChartDataPlane
  ↓
TradingCoreRuntime.getHistoricalData(..., limit)
  ↓
BaseBrokerAdapter / broker API route
  ↓
server broker adapter
```

The server route validates the requested limit to a bounded 100–5,000 range. This prevents an old client or a custom caller from reintroducing a 25k initial request through the normal history endpoint.

## Viewport stability

Older history is prepended while preserving the renderer's logical range. A logical range must be restored through `setVisibleLogicalRange`; it must never be passed to a time-range API. This avoids viewport jumps after loading older candles.

## Indicators and compute

Initial indicators now receive the bounded active window. This is enough to provide a meaningful warmup for common studies without processing 25k–50k bars on first paint. When older history is genuinely requested, the dataset revision changes and the shared compute coordinator can recompute the affected dataset.

The compute coordinator retains the v103 full-dataset correctness contract; demand-driven history keeps the active dataset small during normal use rather than truncating indicator/analytics inputs.

## Multi-chart scaling invariant

For `N` visible chart cells, `D` unique datasets and `S` unique broker/symbol feeds:

```text
renderer instances        ≈ N
dataset history lifecycles ≈ D
realtime symbol feeds      ≈ S
active history requests    ≤ 2
analytics workers          ≤ 2
indicator workers          ≤ 2
initial candles/chart      ≤ 1500
```

The system therefore scales expensive transport and initialization by demand instead of by a fixed per-chart history target.

## Non-interference

This history pass does not change CoreSpirit grammar, compiler normalization, IR, VM authority, risk/execution boundaries, drawing semantics, or terminal dock ownership.


## v105 deeper demand control

History demand is now two-dimensional: the chart asks for history from the user's logical viewport, and the page size is derived from the visible bar count rather than always consuming the timeframe's maximum page budget. A small viewport requests a smaller bounded page; a wider viewport is capped by the timeframe page policy.

```text
visible logical range
      ↓
visibleBars
      ↓
lead-bar trigger + bounded page size
      ↓
HistoryStore.getBefore()
      ↓
single-flight network fallback
```

The prepend event carries `olderAdded`. The chart shifts the saved logical range by exactly that count before restoring it, preserving the user's screen position while avoiding a time-range conversion.

Duplicate left-edge requests for the same oldest timestamp/page-size tuple are suppressed briefly after completion. This is a guard against scroll-event bursts rather than a replacement for the per-dataset single-flight promise.

The retained `HistoryStore` ceiling is still a storage limit, not a chart-loading target. There is no multi-page target crawl for a mounted workspace.

## v105 compute residency boundary

Demand-driven history and demand-driven compute are distinct. A dataset may retain deep history while indicator workers consume only a bounded viewport-centered compute window with warmup bars. This allows a user to scroll through cached history without sending the entire retained dataset to a worker on every viewport change.

## v106 deeper history residency and demand control — 2026-09-29

The demand-driven history model now separates **what is retained**, **what is requested**, and **what is computed** more aggressively:

```text
HistoryStore retention
      ↓
recent active window
      ↓
visible-range demand
      ↓
bounded older page
      ↓
optional active-chart warm page
      ↓
user-driven deep history
```

The `HistoryStore` is now an LRU-bounded cache with a maximum of 32 dataset buckets. Bucket recency is updated on fresh, stale, and older-range reads. This prevents a long session that cycles through many symbols/timeframes from growing the browser's history cache without a bound. Eviction affects reusable cache retention only; it does not alter the currently mounted chart dataset.

The warm stage is viewport-aware. The active chart can pass its current visible bar count to the warm request so an opportunistic page does not automatically consume the full timeframe page budget. Failed warm requests clear the warm latch and may be retried on a later active interaction.

Older-history events report the **actual net number of newly prepended candles**, not the raw response row count. This matters when the broker returns overlap or when the 50k retention ceiling trims the merge; viewport restoration therefore shifts by the number of bars that actually entered the chart dataset.

Deep-history loading remains bounded per request. There is still no mounted-chart loop that walks through dozens of pages merely because a chart exists.

## v106 history invariant

```text
max history request concurrency     ≤ 2
max retained buckets                = 32
max retained candles / bucket       = 50,000
initial request / chart             ≤ 1,500
visible older request               = viewport-demand bounded
warm request                        = active-chart + one low-priority page
unbounded background crawl          = forbidden
```

## v107 interaction with incremental indicators — 2026-09-29

Demand-driven history and incremental indicators are complementary layers:

```text
history retention → demand window → snapshot seed → incremental tail
```

Loading older history remains a structural data-plane event and causes a new snapshot/seed because the active historical prefix changed. Ordinary forming-candle ticks do not request older history and do not need a historical replay.

This distinction prevents a fast realtime stream from amplifying history requests merely because an indicator changed value on the current bar.
