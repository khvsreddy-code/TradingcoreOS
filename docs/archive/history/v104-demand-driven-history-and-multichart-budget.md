# v104 — Demand-Driven History + Multi-Chart Budget

Date: 2026-09-29

## Scope

v104 deepens the v103 shared chart data plane. It addresses the remaining multi-chart cost of large initial history windows, concurrent history bursts and repeated deep-history processing.

## Delivered

- staged 300–1,500 candle initial windows by timeframe;
- bounded older-history pages driven by logical visible range;
- global two-request history concurrency budget;
- cache-aware older-page reuse through `HistoryStore.getBefore()`;
- one optional low-priority warm page for the active chart;
- bounded broker history limit propagation through runtime and server route;
- logical-range restoration fix after prepending candles;
- protective 10k compute-input ceiling for pathological deep-history states;
- demand-driven regression contracts and architecture documentation.

## Resource model

```text
N charts
  ↓
D dataset planes
  ↓
S shared symbol feeds
  ↓
≤2 history requests + ≤2 analytics workers + ≤2 indicator workers
```

CoreSpirit remains v98. This is a TradingCoreOS chart host/data-plane release.
