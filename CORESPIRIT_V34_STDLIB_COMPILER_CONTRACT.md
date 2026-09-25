# CoreSpirit v34 — Standard Library + Compiler Pipeline Contract

## Goal

CoreSpirit now has a deliberately small v1 standard library and explicit, independently testable compiler stages.

## Core standard library

Exactly 30 primitives form the language core:

- Series: `sma`, `ema`, `hma`, `highest`, `lowest`, `sum`, `mean`, `stdev`, `wma`, `rma`, `median`
- Math: `abs`, `min`, `max`, `sqrt`, `pow`, `round`, `sign`
- Conditions: `cross`, `crossover`, `crossunder`, `rising`, `falling`
- Market: `vwap`
- State: `nz`, `na`, `bar_index`, `time`
- Outputs: `plot`, `signal`

TradingCoreOS-specific capabilities such as AI, market requests, footprint access, and advanced drawings remain extension-library primitives rather than part of the tiny language core.

## Compiler pipeline

```text
Source
  ↓
Lexer
  ↓
Parser
  ↓
Name resolution
  ↓
Type checking
  ↓
Semantic validation
  ↓
IR lowering
  ↓
Conservative optimization
  ↓
Executable artifact
```

Public stage helpers live in `pipelineStages.ts`.

### Golden contracts

- Source → AST serialization removes source spans so snapshots are stable.
- AST → IR serialization is deterministic.
- IR constant-folding only changes operations whose operands are compile-time constants.
- IR retains source maps and executable output intents.

## Runtime rule

Every core primitive must execute through the canonical CoreSpirit runtime/indicator engine. Chart, replay, and backtest layers must not reimplement primitive math.

## Stage 35 deepening

Step 5 now has a conformance target: historical, replay, and committed realtime executions must produce the same series values for the same bar sequence. Developing realtime revisions are provisional and must be rollback-safe.

Step 6 now has an explicit native-indicator registry. Indicator math remains centralized in `indicatorEngine.ts`; the registry documents statefulness and rollback support instead of creating parallel implementations.

Step 7 now includes runtime coverage for the core primitive `sign` and an explicit 30-primitive contract.

Step 8 now includes a cross-mode compiler/runtime conformance test that treats the historical execution as the semantic reference and verifies replay/realtime equivalence after commit.
