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
