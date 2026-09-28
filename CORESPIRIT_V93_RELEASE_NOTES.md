# CoreSpirit v93 Release Notes

## Theme

First-class vector/series execution and operation fusion.

## Implemented

- Dense numeric series execution through `Float64Array`.
- Typed vector execution contracts on canonical builtin metadata.
- Deterministic `pctchange`, `zscore`, `normalize`, and `persistence` series extensions.
- Alias-aware pure-series fusion planner.
- Single-pass streaming fused kernels with bounded rolling workspace.
- Fusion visibility inside the existing host-owned execution planner.
- Explicit non-fusible stateful boundary for EMA/RMA.
- Focused conformance test covering vector execution, fusion and backend metadata.
- CoreSpirit roadmap extended from 70 to 76 validated stages.

## Validation

```text
STAGE93_FIRST_CLASS_SERIES_OK
STAGE93_OPERATION_FUSION_OK
STAGE93_SERIES_BACKEND_METADATA_OK
```

## Architectural rule

CoreSpirit source syntax remains unchanged. Vectorization and fusion are compiler/runtime optimizations over the same semantic language, IR and VM contracts.
