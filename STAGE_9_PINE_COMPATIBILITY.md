# Stage 9 — Pine Compatibility Adapter

## Scope

Stage 9 adds a **source compatibility adapter**, not a Pine runtime clone. Pine source is translated into the native CoreSpirit AST/IR boundary. CoreSpirit remains the only native executable language.

### Supported subset
- `//@version=N` metadata
- `indicator()` / legacy `study()` declaration stripping
- scalar `input.*()` defaults
- `ta.sma`, `ta.ema`, `ta.rsi`, `ta.atr`, `ta.vwap`, `ta.highest`, `ta.lowest`, `ta.change`
- `ta.crossover` / `ta.crossunder`
- `math.*` numeric helpers and `nz`
- OHLCV/time history indexing such as `close[1]`
- `plot()` and `plotshape()` as CoreSpirit visual/event outputs
- `alertcondition()` as conditional CoreSpirit signals
- simple Pine assignments translated to `let`

## Explicitly unsupported

The adapter fails closed for strategy order APIs, `request.*`/`security()`, user-defined Pine functions, loops, arrays, tables and ternary expressions. These constructs need explicit CoreSpirit equivalents rather than silent semantic substitution.

## Architecture

```text
Pine source
   ↓
Pine compatibility validator / normalizer
   ↓
CoreSpirit source subset
   ↓
CoreSpirit parser
   ↓
CoreSpirit AST → IR → executable artifact
   ↓
CoreSpirit runtime / Chart output dispatcher
```

No TradingView proprietary runtime, code, or unofficial execution service is embedded.

## Validation

Source-level validation covers translation diagnostics and compilation. Full Vite/browser validation remains gated by the dependency-complete application build environment.

## Test contract

The source-level test verifies successful translation/compilation of an indicator subset and explicit rejection of strategy code. Crossovers are stateful in the CoreSpirit runtime and are keyed per compiled call site.


## Cumulative merge note — 2026-09-19

Stage 9 is preserved in the cumulative Stage 2–8 tree. The Stage 9 source ZIP was a smaller tree/delta rather than a complete replacement of the Stage 2–8 archive; its four new compatibility files and six common-file updates were merged into the larger cumulative tree before Stage 10 work began.

Stage 10 does not alter the CoreSpirit/Pine compatibility boundary.
