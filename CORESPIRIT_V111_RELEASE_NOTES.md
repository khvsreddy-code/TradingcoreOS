# CoreSpirit v111 release notes

Date: 2026-09-30

## Production build repair

### Root cause
`src/components/workspace/ShowcaseChart.tsx` imports `LineStyle` from the TCO Vela facade and uses `LineStyle.Dashed`, `LineStyle.Solid` and `LineStyle.Dotted` as runtime values. The facade previously exported only `type LineStyle = 0 | 1 | 2`, which is erased by TypeScript and therefore absent from the Rollup runtime export table.

### Fix
The facade now exports a runtime-safe enum-like `LineStyle` object plus a separate `LineStyleValue` type. The chart facade remains the compatibility boundary; `ShowcaseChart` does not import the Vela vendor directly.

## First-class programmable indicators

v111 deepens the CoreSpirit indicator architecture without adding a second indicator runtime or expanding the language keyword set.

A programmable indicator is now modeled as one immutable object containing:

```text
CoreSpiritIndicatorComponent
├── component contract
├── executable CoreSpirit artifact
├── source identity/checksum
├── typed inputs
├── typed outputs
├── calculation metadata
├── state lifecycle
├── events
├── plots
├── renderer-neutral visuals
├── alerts
├── settings schema
└── author/publishing metadata
```

The implementation lives in `src/services/coreSpirit/coreSpiritIndicatorComponent.ts` and is exported from the CoreSpirit public barrel.

The important invariant remains:

```text
CoreSpirit source
    ↓
compiler → stable IR → executable artifact
    ↓
indicator component contract
    ↓
calculation / state / events / plots / visuals / alerts / metadata
```

The component is not a new evaluator. It reuses the existing compiler, IR, VM artifact and semantic component registry.

## Composition model

Indicator outputs are typed component ports, including multi-output values. Existing component member access and invocation validation remain the composition mechanism.

A future `indicator "Name"` declaration is documented as optional sugar over this artifact/component contract; it is not introduced as a separate runtime or grammar in v111.

## Safety

Registering an indicator does not grant broker, filesystem, arbitrary network or host authority. Public publication remains source-visible and sandboxed; publication does not automatically admit arbitrary code into executable component registration.

## Verification

- `CORESPIRIT_V111_INDICATOR_COMPONENT_CONTRACT_OK`
- v110 appearance/computation isolation contracts remain in the contract suite.
- Vela boundary contract remains in the contract suite.
- Production Vite build must be re-run in the dependency-complete CI environment; the LineStyle runtime export defect is now fixed at the source boundary.

## v111.1 depth pass (finalized)

The first-class indicator model was extended from a metadata wrapper into a reusable executable component boundary without creating a new evaluator.

- Explicit public inputs may describe canonical data, parameters and component dependencies.
- Public outputs can be selected by name; unknown selections are rejected at construction time.
- `CoreSpiritIndicatorDeclaration` is the serializable declaration envelope and is validated against the canonical component object.
- Historical execution uses `CoreSpiritHistoricalExecutionHost`; realtime execution uses `CoreSpiritRealtimeExecutionHost`.
- `CoreSpiritIndicatorRegistry.unregister()` now removes the corresponding semantic component registration and callable aliases.
- Calculation metadata now includes cacheability, parallelism and eligible backends while remaining derived from the same compiled artifact.
- Settings remain a separate presentation/configuration ABI; appearance-only edits remain outside mathematical computation identity.

