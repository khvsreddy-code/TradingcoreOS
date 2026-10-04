# TradingCoreOS Documentation

## Active source of truth

1. `01_CORESPIRIT.md` — CoreSpirit language, compiler, runtime and mathematical execution.
2. `02_DATA_AND_PERFORMANCE.md` — canonical data transport, history, kernels and performance budgets.
3. `03_VELA_AND_CHARTING.md` — Vela boundary, retained history, patching, rendering and chart interaction.
4. `04_INDICATORS_AND_PLATFORM.md` — indicator artifacts, settings, public scripts and computation policy.
5. `CORESPIRIT_BUILD_TRACKER.md` — living implementation tracker and explicit open architectural debt.

Historical stage-by-stage notes belong under `docs/archive/history/`. Legacy contract fixtures may remain there while CI references them, but they are not active architecture sources. Do not create a new architecture markdown file when the subject already belongs in one of the five active documents.

## Locked runtime path

```
FYERS compact columns
  → TCO canonical typed data plane
  → Vela ColumnarHistoryTape
  → CoreSpirit stateful kernels
  → causal dirty range
  → renderer/model range patch
  → Vela retained scene
  → frame/backend telemetry
```

Compatibility representations are allowed only at explicit boundaries. Source-level contracts must never describe a compatibility seam as zero-object or zero-copy without runtime evidence.

## History policy

- First chart load: **5,000 candles**.
- Left-edge demand page: **5,000 older candles**.
- Retained history ceiling: **50,000 candles**.

## Performance truth

CI proves source and contract invariants. It does not prove authenticated broker latency, browser FPS, GPU utilization or visual quality. Those measurements remain explicit validation gates.
