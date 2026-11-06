# CoreSpirit Pine-Class and Polyglot Runtime Milestone

This milestone is split into independently verifiable execution contracts. A language feature is not complete until it parses, type-checks, lowers to canonical IR, executes under the VM, emits a stable output/event, and passes historical/realtime/replay equivalence tests.

## Pine-class parity work

The repository already contains host-owned multi-symbol/timeframe data resolution, alignment and confirmation metadata; a typed visual object model and retained scene ABI; strategy execution targets and broker-neutral order intents; and event/automation primitives. These are foundations, not proof of full Pine parity.

Remaining implementation and acceptance areas:

1. Data requests: source-compatible request syntax, dynamic request budgets, deduplication, stable symbol/timeframe identity, confirmed/developing alignment, gaps/lookahead policies, lower-timeframe arrays, sessions/timezones, deterministic historical/realtime behavior. No implicit lookahead.
2. Visual outputs: plot families (line/stepline/area/columns/circles/crosses), hline/fill/plotshape/plotchar/barcolor/bgcolor, boxes/lines/labels/polylines/tables, pane/scale/display controls, object limits, stable IDs and retained Vela updates/removals. No DOM or pixel rendering inside the VM.
3. Strategies: declaration/configuration, entries/exits/close/cancel, pyramiding, sizing, commission/slippage, margin, order types, OCA, partial fills, stop/limit sequencing, intrabar simulation, currency conversion and broker-neutral fill ledger. Simulation never routes live broker orders.
4. Alerts: alertcondition and runtime alert events, frequency policy, confirmed/realtime semantics, deduplication, replay suppression, delivery retries and host-owned webhook/notification routing. Delivery is never a VM side effect.
5. Backtesting: walk-forward-safe windows, deterministic fills, equity/position/trade ledgers, fees/slippage, drawdown/exposure/return metrics, benchmark comparison, trade list, reproducible seeds and no future-data leakage.

## Polyglot execution

The new polyglotModules.ts file introduces a versioned module ABI and registry. Python is the first host-service adapter. Rust/C++/Julia/R use native-RPC adapters; ONNX and WASM have dedicated transport contracts. All are host-owned and expose no process, filesystem, socket, credential or broker capability to the VM.

ABI v1 supports deterministic, stateless, confirmed-bar calls with typed bounded tensors and declared exports. Persistent state, training jobs, arbitrary callbacks, streaming side effects and untrusted package installation are outside this first ABI.

The existing pythonMlModelAdapter.ts remains the specialized Python model-inference integration; the module ABI complements it and does not replace it.

## Release gates

- Compile, type-check, IR validation, VM execution, output/event validation.
- Historical/realtime/replay parity with explicit confirmed/developing inputs.
- No-lookahead tests for every data-request policy.
- Deterministic strategy fill ledger and fees/slippage tests.
- Alert dedupe/retry/replay suppression tests.
- Worker/server resource budgets and cancellation tests for each polyglot host.
- Vela retained-scene update/removal and chart performance tests.
- Production build and browser proof after contracts and typecheck pass.
