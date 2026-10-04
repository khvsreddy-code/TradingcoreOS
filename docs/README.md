# TradingCoreOS Documentation

There are four canonical documentation batches:

1. **01_CORESPIRIT.md** — CoreSpirit language, compiler model and scripting guide.
2. **02_DATA_AND_PERFORMANCE.md** — canonical market data, workers, history, fusion and dirty-span performance.
3. **03_VELA_AND_CHARTING.md** — Vela boundary, columnar candles, incremental patches, LOD and viewport behavior.
4. **04_INDICATORS_AND_PLATFORM.md** — indicator artifacts, settings, dependency graphs and community indicators.

Older standalone documents are preserved under `docs/archive/`. Versioned implementation notes live under `docs/archive/history/`; legacy and broker notes live under their named archive subdirectories. Only the four canonical batches plus the living tracker should be edited for active architecture.

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

The four canonical batches are the only active architecture docs. Historical/redundant source notes are preserved under `docs/archive/history/` and `docs/archive/legacy/`.

For contributors, the rule is simple: change the canonical document first. Do not create another one-off architecture note for an already-covered subsystem.

## v128 deep-performance architecture — 2026-10-04

The active documentation surface is now intentionally limited to the four architecture batches plus the compatibility tracker. Chronological stage notes moved to `docs/archive/history/`; duplicate archived copies moved to `docs/archive/compatibility/`.

Current runtime path:

```text
FYERS compact columns
  → TCO runtime / ChartDataPlane
  → Vela ColumnarHistoryTape
  → Vela native renderer
  → CoreSpirit stateful kernels
  → exact dirty-span execution
  → replace-range scene patch
  → per-cell frame/backend telemetry
```

v128 specifically closes the three deep performance boundaries that remained after v127: columnar ranged backfill, bounded dirty-span propagation, and p95/FPS/frame-budget telemetry. Browser verification is implemented as a repeatable `agent-browser` script; it is not treated as executed unless a browser environment actually runs it.
