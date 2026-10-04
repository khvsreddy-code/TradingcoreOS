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

## Stateful indicator mathematics

The canonical CoreSpirit kernel layer provides bounded state for rolling and recursive calculations:

```
RollingSum / RollingMean
RollingVariance
RollingMinMax
RollingMedian / RollingPercentile
RollingAbsoluteDeviation
EMA / Wilder / ATR / WMA / VWAP
```

The standard indicator engine uses these primitives for Bollinger, Donchian, Stochastic, CCI and MFI. This makes their bounded rolling portion linear over N for fixed-period sum/mean/variance operations, with logarithmic expected/update work for ordered-statistic operations.

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
| EMA / Wilder / ATR / WMA / VWAP | O(1) |

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
