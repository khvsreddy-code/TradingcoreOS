# CoreSpirit v42 — Visual Identity + Deep Stages 3–5

## Stage 2 extension: persistent visual identity

Every logical visual object has a stable ID. A realtime revision updates that object rather than creating another logical object.

`create -> handle(id) -> update(id, patch) -> remove(id)`

Visual state is declarative and renderer-independent. The scene store is transactional: if a mutation batch fails, it restores the prior scene state.

Dynamic properties are normal scene state:
- anchor/price/time
- style/opacity/width/fill
- visibility
- payload/metadata

This is the runtime contract behind future syntax such as `resistance.price = newLevel` and `zone.fill = ...`.

## Stage 3 — native indicators, deeper contract

The indicator engine is governed by an explicit ABI descriptor.

Every native primitive declares:
- ABI version
- pure/stateful classification
- deterministic=true
- rollbackSafe=true
- minimum lookback
- accepted input shape
- output shape

Pure indicators compute from their inputs/history without hidden mutable state. Stateful indicators may carry runtime-owned state, but that state must be included in realtime checkpoints and restored on rollback.

## Stage 4 — IR + VM, deeper contract

The IR is the only production VM input. Compiler stages may inspect AST; the production executor should not need AST dispatch.

The artifact boundary should carry:
- IR ABI version
- runtime ABI version
- program checksum
- source mapping
- required lookback
- instruction stream
- capability set

Optimization must preserve series indexing, indicator state, signal timing, and realtime transaction semantics.

## Stage 5 — historical vs realtime, deeper contract

Realtime execution is a transaction around the developing bar:

1. Begin from immutable confirmed state.
2. Evaluate revision N.
3. Record provisional outputs/state checksum.
4. Before revision N+1, rollback to the confirmed checkpoint.
5. Evaluate the new revision.
6. On bar close, commit exactly one confirmed result.

The transaction contract records revision checksums and rollback count. A commit is the only transition that advances confirmed history.

## Acceptance invariant

For a fixed confirmed dataset:

`historical(program) == replay(program) == committedRealtime(program)`

where equality includes committed series state and emitted outputs/signals, not just final chart pixels.


## Stage 3 implementation shape

The native indicator registry is the ABI catalog. The runtime owns state. Indicator math stays in the shared kernel and is called through the registry. A new indicator is not complete until it has a descriptor, lookback rule, deterministic test fixture, and rollback test if stateful.

## Stage 4 implementation shape

The artifact is the unit of caching and execution. It is immutable after validation. A source edit produces a new artifact checksum. Debugging, replay, and workers consume the artifact plus its source map; none need to reparse source.

## Stage 5 implementation shape

Realtime is MVCC-like at the bar level: confirmed state is the committed version; each tick is a provisional revision. Scene/object state follows the same lifecycle. A rollback must restore both computational state and logical visual identity so the next tick updates the same object IDs instead of creating duplicates.
