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
