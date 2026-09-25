# CoreSpirit Stages 48–49 — Shared Runtime + External Model ABI

## 48. Shared trading runtime

CoreSpirit has one orchestration kernel for Script, Model, Strategy and Automation. Layers select capabilities; they do not create separate runtimes.

Runtime planes:
- data/series
- deterministic compute/IR/VM
- visual/scene
- events
- risk policy
- execution host

The language is never handed broker credentials or direct venue APIs. The automation layer may create order intents, but execution remains outside the CoreSpirit VM and is policy-controlled by TradingCoreOS.

The runtime identity is stable across historical, replay, realtime and backtest and carries runId, programId, program checksum, layer and mode.

## 49. C/C++ capability without making CoreSpirit a systems language

A CoreSpirit Model is a versioned deterministic artifact consumed through a strict ABI. It can be backed by:

- WASM for portable, sandboxed execution
- native RPC for high-performance C/C++/Rust services; gRPC is a valid transport implementation
- host adapters for trusted platform-native models

The model ABI declares:
- model identity/version
- input/output schema
- deterministic=true
- statefulness
- resource limits
- explicit capabilities

Model inputs are typed tensors; model outputs are typed tensors. The request includes the CoreSpirit execution frame and a deterministic seed.

The WASM/native host owns memory, process, and transport lifecycle. CoreSpirit receives results; it never gets arbitrary network/filesystem/process capabilities.

For Python research, export/import should target the same model artifact contract rather than embedding Python inside the VM. A Python research pipeline can train/validate a model and emit a versioned artifact consumable by CoreSpirit.

## End-to-end direction

`Script/Model/Strategy/Automation -> one compiler -> one IR -> one VM -> capability hosts -> risk -> execution`

A model is therefore a compute plug-in, not another language runtime.
