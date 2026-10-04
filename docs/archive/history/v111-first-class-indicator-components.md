# v111 — First-class programmable CoreSpirit indicators

Date: 2026-09-30

## Decision

CoreSpirit indicators are first-class programmable components, not a second scripting system.

The language remains centered on:

```text
DATA · LET · WHEN · SHOW · MODEL · AUTOMATE
```

An indicator is an executable CoreSpirit artifact wrapped by a typed semantic component contract. This lets indicators participate in ordinary CoreSpirit composition while preserving the existing compiler → IR → VM pipeline.

## Domain projection

```text
Indicator artifact
├── source identity
├── compiled calculation
├── typed inputs
├── typed outputs
├── state lifecycle
├── events
├── plots
├── visuals
├── alerts
├── settings schema
└── metadata
```

All of these are projections of the same compiled graph. They are not independent runtimes.

## Composition

Single-output indicators can be used as ordinary values. Multi-output indicators expose named ports and use the existing component member access semantics.

The component registry remains the authoritative resolution boundary. Indicator component contracts carry execution eligibility, determinism and state metadata so the planner can reason about caching, parallelism and realtime rollback.

## Declarative authoring

The architecture deliberately separates metadata declaration from execution syntax. A future declaration such as:

```text
indicator "Adaptive Trend"
```

is expected to be sugar over the existing artifact/component contract. The underlying calculation remains ordinary CoreSpirit DATA/LET/WHEN/SHOW composition.

## Security

A public source snapshot is not executable authority. Local/native/trusted registration and public-source runtime admission remain separate gates.

## v111.1 depth extension

The component is now a complete declaration/execution boundary rather than a metadata wrapper:

```text
CoreSpiritIndicatorComponent
├── declaration (serializable ABI)
├── artifact (one executable program)
├── typed public inputs
├── typed public outputs
├── calculation planning metadata
├── state lifecycle metadata
├── plots / visuals / events / alerts
└── settings schema + publication metadata
```

Historical execution is provided by the existing `CoreSpiritHistoricalExecutionHost`; realtime execution is provided by the existing `CoreSpiritRealtimeExecutionHost`. Both execute the component's compiled artifact. There is no indicator-specific evaluator.

Explicit parameter/component inputs are allowed in addition to compiler-discovered canonical market inputs. Explicit public output lists are validated so a typo cannot create a silently incomplete component API.

The declaration object references the canonical calculation object rather than cloning it. The validator checks declaration identity, port alignment and canonical calculation reference, reducing the chance that publication metadata drifts from executable semantics.

Registry removal is deterministic: `CoreSpiritIndicatorRegistry.unregister()` also removes the semantic component registration and all callable aliases. This is required for workspace/plugin lifecycle correctness.
