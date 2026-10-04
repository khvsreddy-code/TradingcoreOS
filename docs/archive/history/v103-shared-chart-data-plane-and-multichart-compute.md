# v103 — Shared Chart Data Plane and Multi-Chart Compute

Date: 2026-09-29

v103 is a TradingCoreOS chart-platform performance release. CoreSpirit remains v98 at the language/compiler/IR/VM level.

## Problem

Earlier chart composition allowed a `LiveChart` instance to own history loading, realtime subscription, analytics worker, indicator worker, prediction work and renderer lifecycle directly. A 16-cell layout could therefore multiply expensive resources approximately with chart count.

## Resolution

v103 changes the ownership hierarchy rather than removing multi-chart rendering:

```text
chart cell
   ↓
rendering consumer
   ↓
shared broker:symbol feed
   ↓
shared broker:symbol:timeframe data plane
   ↓
shared compute coordinator
```

## Implemented

- Added `ChartDataPlane` registry keyed by broker/symbol/timeframe.
- Added shared single-flight history loading and older-history pagination.
- Added shared symbol feed fan-out through `PersistentMarketSubscriptionManager`.
- Kept the existing `BrokerMarketDataClient` as the transport owner.
- Added bounded analytics and indicator worker pools (2 + 2 maximum).
- Added computation cache/deduplication by dataset revision.
- Excluded indicator presentation metadata from computational cache identity.
- Added dataset-scoped prediction compute/network deduplication.
- Added in-place forming-candle reconciliation for the data-plane path.
- Added O(1) `HistoryStore.upsertLatest()` for current/next candle cache updates.
- Preserved one Lightweight Charts instance per visible chart cell.
- Preserved per-chart drawing and CoreSpirit registry ownership.
- Prevented chart-controller disposal from clearing shared canonical data.
- Added a multi-chart contract test and package contract-test entry.

## Scaling model

```text
                     v103
                      │
          ┌───────────┴───────────┐
          │                       │
    chart instances           shared resources
          │                       │
          N                D datasets / S feeds
                                  │
                         ≤2 analytics workers
                         ≤2 indicator workers
```

The architecture now scales expensive market-data and compute lifecycles by **unique dataset/symbol**, not by visible chart count.

## Validation

- `TRADINGCORE_V103_MULTI_CHART_SHARED_DATA_PLANE_CONTRACT_OK`
- Selected modified TypeScript sources were parser/transpile checked; dependency-backed typecheck/build remains an environment-dependent verification step.

## Non-interference

No changes were made to CoreSpirit grammar, compiler, IR, VM authority, broker execution or risk authorization. The release changes only chart-host data/compute ownership and lifecycle.
