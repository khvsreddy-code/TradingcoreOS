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
