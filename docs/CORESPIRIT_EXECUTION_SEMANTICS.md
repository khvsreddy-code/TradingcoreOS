# CoreSpirit deterministic execution contract

The lifecycle is explicit: validate canonical IR, load history, execute historical bars chronologically, commit each historical bar, commit the historical baseline, accept realtime revisions, execute the canonical VM, update outputs, and commit only after confirmation. The state-machine guard makes illegal orchestration order visible; it does not replace VM semantics or transactional stores.

| State category | Owner | Revision behavior |
| --- | --- | --- |
| Bar-local values | CoreSpiritRuntime.state.locals | Recreated for each evaluation |
| Persistent language state | CoreSpiritStateStore | Journaled and rolled back before the next unconfirmed revision |
| Series history | CoreSpiritSeriesRegistry | Ring-buffer writes are journaled; offsets address the current execution frame |
| Function-call history | Stateful kernel maps keyed by stable call identity | Restored from identity-checked confirmed-bar checkpoints |
| Drawing state | Visual runtime and output collector | Stable identity and output upsert/patch lifecycle |
| External model artifacts/state | Model artifact resolver and model runtime | Explicitly versioned; chart execution does not silently train models |

Intrabar-persistent (varip-equivalent) storage must not be aliased to the persistent-state journal. It requires a dedicated IR/storage qualifier and conformance tests before the language exposes it.

executeIr is a full deterministic reconstruction: it resets runtime-owned execution state, executes the supplied history once, commits the historical baseline, and returns the output set. Live updates then use realtime bar ingress. Vela consumes output patches and must not execute VM or strategy logic.

Historical corrections use full replay unless a checkpoint is proven compatible by program, kernel, parameters, dependencies, and data-generation identity. Replay identity must include compiler/runtime/IR versions, source and artifact hashes, instrument/timeframe, data version, event sequence, input/runtime configuration, and optional model artifact version.