# CoreSpirit v110 Release Notes

Date: 2026-09-29

## Theme

**Schema-driven indicator appearance without mathematical recomputation.**

v110 extends the CoreSpirit-first + Vela architecture from generic settings metadata to a complete renderer-neutral presentation contract.

## Key changes

### Indicator Settings Schema v2

The canonical settings ABI now includes rich Line, Fill, Marker, Levels and Pane/Scale presentation declarations. The universal settings editor remains generic: indicator-specific React branches are not reintroduced.

### Calculation versus appearance identity

`buildIndicatorComputationSignature()` contains only mathematical/definition identity. `buildIndicatorAppearanceSnapshot()` contains presentation state. LiveChart reacts to these with separate invalidation effects.

Changing color, opacity, width, dash style, gradient, glow, marker shape, level styling or pane presentation therefore does not trigger indicator calculation, incremental state reset or worker reseeding.

### Worker isolation

The shared chart compute coordinator strips appearance-only fields before dispatching indicator jobs. This reduces worker payload size and makes the separation an architectural constraint rather than a convention.

### Vela renderer bridge

The TCO-owned Vela facade now exposes renderer-only pane configuration and fill primitives backed by existing calculated series. Fill anchors are hidden renderer-owned series; changing their colors/gradients updates only native renderer state.

### Backward compatibility

Existing custom schema v1 publications are upgraded to the v2 schema envelope in memory before validation. No source rewrite is required for published indicators.

## Verification

- `TCO_V110_INDICATOR_SCHEMA_CONTRACT_OK`
- `TCO_V110_INDICATOR_APPEARANCE_CONTRACT_OK`
- `TCO_V110_INCREMENTAL_APPEARANCE_ISOLATION_OK`
- Existing v107 incremental and Stage98 publication contracts remain applicable.
- Full dependency-backed build: **NOT CLAIMED** in the extracted archive environment.
- Browser WebGL2/Canvas2D smoke: **NOT RUN**.
