# TradingCoreOS v107 Release Notes — Incremental Indicator Execution

Date: 2026-09-29

> CoreSpirit language/compiler/IR/VM remains **v98**. v107 continues the host/data-plane/indicator performance track after v106.

## Incremental calculation

- Added reusable rolling state for mean, variance, min/max, sum, exact MAD, EMA, Wilder, ATR, WMA and session VWAP.
- Standard indicators now have a stateful forming-bar lane covering EMA, SMA, HMA, VWAP, Bollinger, Keltner, Donchian, RSI, MACD, ATR, ADX, Stochastic, CCI, OBV, MFI, Supertrend and Ichimoku.
- Six advanced indicators now have stateful tail updates: Adaptive Ehlers, Fractional EMA Kalman Filter, Trend Pressure, Trend Target Ribbon, Trinity and Neural Weight Oscillator.
- Batch fallbacks for the named rolling-window indicators no longer perform repeated full period scans.
- Advanced normalized/standard-deviation helpers now use rolling mean/variance state.

## Live correctness

- Same-bar snapshot identity includes the forming candle's OHLCV tuple.
- Incremental `replace` and `append` operations are explicit.
- Lost or incompatible worker state triggers one controlled full resync.
- Snapshot priming and incremental ticks share a stable worker affinity key.

## Rendering

- Incremental line, channel, MACD, Stochastic, Supertrend, Ichimoku and Ribbon outputs update only the affected tail points.
- Legacy studies can coexist without clearing primed worker series on every tick.

## Indicator dialogue

- Per-indicator settings gear is available from the live indicator dialogue.
- `Code` opens a read-only CoreSpirit source viewer with copy support.
- The shared settings panel exposes the same source action.
- Indicator Studio remains the editable source workflow.

## Validation

Completed: standard numerical parity and same-bar replacement checks, state-reset/WMA correctness checks, static v107 contract checks, full Markdown inventory and tracker/doc alignment.

Pending in this archive environment: dependency-backed full TypeScript check, complete Vite build, and connected FYERS/browser performance stress testing.

## Preserved boundaries

No CoreSpirit language semantics, compiler/IR/VM authority, broker execution/risk authority, shared realtime feed ownership, terminal dock ownership, or chart-local drawing ownership was changed by this release.
