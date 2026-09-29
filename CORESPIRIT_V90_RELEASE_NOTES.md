# CoreSpirit v90 — Small Surface, Deep Composition

## Goal

Make CoreSpirit substantially more expressive without making the language substantially larger.

## Frozen authoring model

The public mental model remains six concepts:

```text
DATA
LET
WHEN
SHOW
MODEL
AUTOMATE
```

CoreSpirit does **not** add separate `FUNCTION`, `PIPELINE`, `MOTION`, `REGIME`, `FEATURE`, or backend-specific keywords to make composition possible.

## What changed

### 1. Components are now first-class values in the compiler model

Registered component contracts can be called from normal expressions:

```corespirit
motionValue = motion(data)
vol = volatility(data)
reg = regime(motionValue, vol)
show reg.trendProbability
```

A single-output component returns the corresponding language value type. A multi-output component returns a typed component reference; member access resolves output ports without exposing internal implementation.

### 2. Composition is carried through the entire execution pipeline

```text
CoreSpirit source
    ↓
AST
    ↓
semantic typing + component binding
    ↓
semantic dependency graph
    ↓
stable IR
    ↓
execution / reactive graph
    ↓
CPU / WASM / GPU-capable host planner
```

The author does not need to select the execution backend.

### 3. Component contracts participate in incremental invalidation

Component contract identity is included in compiler/cache identity. Changing a component contract therefore invalidates affected compilation artifacts instead of silently reusing stale results.

### 4. Runtime remains capability-safe

A registered component receives only the explicit runtime context and arguments supplied by the host. Registration does not grant broker credentials, arbitrary filesystem/network access, or direct execution authority.

## Design principle

> Keep the language small. Move complexity into typed semantics, graphs, contracts, planning, and runtime infrastructure.
