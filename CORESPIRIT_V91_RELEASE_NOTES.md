# CoreSpirit v91 — Semantic Components and Progressive Authoring Depth

## Goal

Make reusable CoreSpirit capability substantially deeper without turning CoreSpirit into a large general-purpose programming language.

## Frozen surface

```text
DATA
LET
WHEN
SHOW
MODEL
AUTOMATE
```

No new `FN`, `FUNCTION`, `COMPONENT`, `PIPELINE`, `GPU` or `WORKER` source keywords are required by this stage.

## Semantic component system

Reusable composition is defined first through typed semantic contracts. Components carry:

- stable identity and aliases
- typed input/output ports
- dependencies and lineage
- determinism/statefulness
- state lifecycle
- execution class
- latency and cost metadata
- cacheability/parallelism
- backend eligibility
- optional documentation metadata

A validated composition graph can be materialized and explicitly registered as a reusable typed component. It continues to execute through the canonical CoreSpirit compiler/IR/VM path.

## Progressive authoring

### Level 1 — Simple

Readable DATA/LET/SHOW/WHEN workflows with minimal runtime detail.

### Level 2 — Advanced

Composition, models, multi-symbol/timeframe data, richer visuals and automation remain available without requiring IR/backend knowledge.

### Level 3 — Professional

Component contracts, execution targets, research, backtesting, optimization, performance controls, IR inspection and runtime inspection become visible through the same language and runtime.

The levels are presentation/inspection profiles, not grammar forks or authority escalation.

## Explicit non-goals

- Public user-defined function/declaration syntax
- Arbitrary higher-order function system
- Second evaluator/runtime
- Automatic untrusted component discovery
- Automatic GPU execution guarantees

## Design invariant

> Make reusable capability more powerful before making the grammar larger.
