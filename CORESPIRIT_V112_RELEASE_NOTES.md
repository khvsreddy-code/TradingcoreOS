# CoreSpirit v112 — Universal parameter system + conditional settings

Date: 2026-09-30

## Scope

Deepen the first-class programmable indicator architecture from v111 into a universal parameter/dependency system while preserving the CoreSpirit six-concept language and v110 appearance/computation isolation.

## Implemented

- `IndicatorSettingsSchema` advanced to v3.
- Added explicit `parameters` ABI derived from the Inputs section.
- Supported universal kinds: number, integer, decimal, boolean, enum, color, source, timeframe, symbol, session, price, duration, string.
- Preserved legacy select/text/range/multi-select compatibility.
- Added min/max/step/group/tooltip/placeholder/unit/readonly/advanced metadata.
- Added serializable validation metadata for required, pattern and string lengths.
- Added dependency conditions with equals/notEquals, numeric comparisons, membership, truthiness and bounded all/any/not composition.
- Added safe-path, self-dependency and maximum-nesting validation.
- Added canonical `evaluateIndicatorSettingCondition()` and `isIndicatorSettingFieldVisible()`.
- Added canonical `resolveIndicatorParameterState()` returning values, visibility, validation errors and validity.
- Resolved parameter visibility is evaluated against a fully default-hydrated parameter state, so dependency chains behave correctly on first load even when controlling values are not persisted yet.
- Universal editor now renders the full parameter kind set without indicator-kind branches and displays grouped fields, tooltips and declarative validation errors.
- CoreSpirit first-class indicator component/declaration now carries the canonical `parameters` projection.
- Calculation snapshots now consume declared parameters, keeping presentation fields outside mathematical identity.
- Workspace indicator settings storage advanced to `indicator-settings-v9`.
- v1/v2 custom schemas remain readable through in-memory parameter projection into v3.
- Added v112 static contracts plus a TypeScript runtime behavior test for dependency/state resolution.
- Extended CoreSpirit roadmap from 154 to 159 stages.

## Non-interference

No Pine/PineTS/Pine compatibility layer is introduced. No new indicator VM is introduced. Appearance changes remain renderer-only and cannot invalidate indicator computation identity.

## Validation

Passing dependency-free contracts:

- `TCO_V112_UNIVERSAL_PARAMETER_SYSTEM_CONTRACT_OK`
- `TCO_V112_CONDITIONAL_SETTINGS_CONTRACT_OK`
- `TCO_V112_INDICATOR_SCHEMA_CONTRACT_OK`
- `TCO_V112_CORESPIRIT_INDICATOR_COMPONENT_CONTRACT_OK`
- `TCO_V112_INDICATOR_DECLARATIVE_EXECUTION_CONTRACT_OK`
- `TCO_V110_INDICATOR_APPEARANCE_CONTRACT_OK`
- `TCO_V110_INCREMENTAL_APPEARANCE_ISOLATION_OK`

The full Vite build is not claimed from this extracted environment because the dependency tree is unavailable; a hosted build/browser validation remains the authoritative next integration check.
