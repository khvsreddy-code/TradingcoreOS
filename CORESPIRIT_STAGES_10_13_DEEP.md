# CoreSpirit Stages 10–13 — Deep Runtime Contract

## Stage 10 — One runtime

Script, Model, Strategy, and Automation share the same program identity, execution modes, budgets, series/indicator state, IR artifact family and event boundary. The layer selects capabilities; it does not create a different VM.

## Stage 11 — External model execution

A `MODEL_CALL` resolves through a model registry. The runtime validates typed tensors, input/output names, byte quotas and call quotas. The model host can be WASM, native RPC, or host-provided.

The production CoreSpirit VM never gains network/filesystem/process/broker capabilities from a model.

## Stage 12 — Python research

Python is a first-class research client. It loads a versioned CoreSpirit artifact, retrieves market datasets, requests replay and training, and consumes structured results.

Python is deliberately outside the production VM and outside direct order execution.

## Stage 13 — Indicator-to-automation

One artifact can produce:
calculation -> visual scene -> signal -> strategy event -> risk decision -> order intent -> policy -> execution.

The signal/event is immutable. Risk, policy and execution are host-owned. Live execution can be disabled while preserving the full signal-to-intent path for replay and paper trading.
