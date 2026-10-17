# CoreScript Language Specification (v1)

Status: normative baseline for new CoreScript features. This specification describes the canonical language boundary; it does not claim every feature is implemented at every runtime tier.

## Design invariant

CoreScript is one language and one semantic model for indicators, strategies, features, research models, predictions and automation. Authoring levels are ergonomic profiles, not separate languages. Every surface form must lower to the canonical AST and pass the same semantic analysis before execution.

## Compilation contract

`source → normalize → parse → name resolution → semantic analysis → semantic graph → typed IR → dependency graph → optimization → backend plan → validated executable artifact`

The compiler must not infer executable behavior from editor-only metadata or from a second source scanner. Consumers should read validated metadata from the compilation/research artifact. If a field cannot be produced from the canonical AST/semantic graph, it must be marked unavailable rather than guessed from text.

## Canonical source conventions

- New examples use explicit declarations, stable names, and explicit temporal intent.
- Types and effects are checked before an artifact can execute.
- Host capabilities (market events, webhooks, automation, risk queries and execution routing) must be declared and checked against the host policy.
- Legacy forms may remain accepted for compatibility, but must normalize to the same AST/semantic representation. Do not add a legacy-only runtime path.
- Syntax compatibility is not semantic equivalence until conformance tests demonstrate equivalent artifacts and outputs.

## Temporal semantics

Every time-dependent value must preserve its provenance and availability boundary. Historical, confirmed, developing, realtime and forecast values are distinct states. Forecasts and developing values must not silently enter confirmed historical training rows. A correction to an earlier bar invalidates dependent results according to the dependency graph and must not mutate unrelated state.

## Capability maturity

The six maturity stages are ordered and independently evidenced: parsed, semantically valid, executable, incremental, research-validated, production-ready. A later stage implies the preceding stages, but an earlier stage never implies a later one. UI catalogs and examples are not evidence of runtime support. Missing evidence yields `unknown`, not a success state.

## Research metadata

The compiler/research artifact is the source of truth for model type, target, feature declarations, data requests, temporal assumptions, backtest configuration and source/artifact identity. Editor, API route and worker must consume the same validated artifact metadata. Training/holdout split, feature availability time, label leakage checks and artifact integrity remain mandatory independent checks.

## Compatibility and deprecation

- Version grammar and semantic changes explicitly.
- Keep golden parser/AST/semantic fixtures for each supported surface.
- Deprecate syntax only with a migration message and a compatibility test.
- Never silently reinterpret an existing script across language versions.
