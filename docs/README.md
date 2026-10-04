# TradingCoreOS Documentation

There are four canonical documentation batches:

1. **01_CORESPIRIT.md** — CoreSpirit language, compiler model and scripting guide.
2. **02_DATA_AND_PERFORMANCE.md** — canonical market data, workers, history, fusion and dirty-span performance.
3. **03_VELA_AND_CHARTING.md** — Vela boundary, columnar candles, incremental patches, LOD and viewport behavior.
4. **04_INDICATORS_AND_PLATFORM.md** — indicator artifacts, settings, dependency graphs and community indicators.

Older standalone documents are preserved under `docs/archive/` and `docs/archive/source/`. Versioned planning documents are archived; active architecture references remain temporarily available until their material is fully absorbed into these four batches.

## Beginner CoreSpirit path

```
DATA       → declare market context
LET        → calculate named values
WHEN / IF  → conditions
SHOW       → publish visuals
MODEL      → consume model artifacts
AUTOMATE   → automation intent
```

You normally do not need to know the IR, VM, renderer or broker internals to write a script.

## Example

```corespirit
data market = market("NSE:NIFTY50-INDEX", "5m")

let basis = ema(close, 20)
let strength = rsi(close, 14)

when strength > 60
  show line(basis, "Trend", "#7c5cff", 2)

show series(strength, "RSI")
```

Use named series. The compiler builds a semantic dependency graph and can fuse compatible numeric chains.

## v127 deep-performance pass — 2026-10-04

The active documentation now records the following implementation layers:

```
TCO data columns
  → Vela ColumnarHistoryTape
  → Vela columnar renderer
  → CoreSpirit stateful kernels
  → exact dirty spans
  → Vela replace-range patches
  → renderer frame/backend telemetry
```

The four canonical batches are the only active architecture docs. Historical/redundant source notes are preserved under `docs/archive/`; `docs/history/` remains an immutable release history.

For contributors, the rule is simple: change the canonical document first. Do not create another one-off architecture note for an already-covered subsystem.
