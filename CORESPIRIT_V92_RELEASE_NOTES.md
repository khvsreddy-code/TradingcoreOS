# CoreSpirit v92 — Complexity Absorption, Namespaced Library, and Deep Composition

## Goal

Push CoreSpirit deeper without increasing the public language vocabulary. v92 treats complexity absorption and library scaling as compiler/runtime concerns rather than syntax expansion.

## Frozen source surface

```text
DATA
LET
WHEN
SHOW
MODEL
AUTOMATE
```

## Deepened architecture

### Reusable semantic components

Components now sit at the boundary between simple source values and arbitrarily complex execution graphs. Contracts retain typed ports, lineage, state lifecycle, determinism, cost, latency, cacheability, parallelism and backend eligibility.

### Complexity absorber

Internal complexity is organized as:

```text
source → semantic graph → component graph → model ABI → dependency graph → execution plan → reactive plan → backend/host
```

The source language does not need a keyword for each layer.

### Namespaced standard library

Qualified paths are discovery/lowering aliases into existing canonical builtins or registered components:

```text
market.*
series.*
math.*
stats.*
time.*
structure.*
volatility.*
liquidity.*
probability.*
model.*
visual.*
automation.*
data.*
state.*
```

Catalog-only members are explicitly distinguishable from executable members.

### MODEL as semantic component

Validated MODEL ABI manifests can be projected into typed component contracts. Backend, capability and rollback metadata stay inside the host/runtime contract.

### Progressive authoring

Simple, Advanced and Professional remain one language. Advanced adds composition/library discovery; Professional exposes engineering inspection such as component contracts, IR, runtime and backend planning.

## Not introduced

- no public `fn` or `component` keyword
- no second evaluator/runtime
- no namespace-specific execution engine
- no authority escalation through component registration
- no claim that catalog-only future capabilities already execute

## Verification

The focused v92 TypeScript contract and source-governance contract pass. Full Vite production build remains dependent on a complete installed dependency environment.
