# CoreSpirit v108 Release Notes

Date: 2026-09-29

## Theme

**CoreSpirit-first platform + Vela production chart engine**

## Architecture lock

TradingCoreOS is now locked to:

```text
CoreSpirit
   ↓
TCO compiler / IR / VM / reactive runtime
   ↓
renderer-neutral chart output
   ↓
TCO chart contracts
   ↓
Vela NativeRenderer
   ├── WebGL2
   └── Canvas2D fallback
```

TCO remains the authority for canonical market data, compute, indicator/model execution, risk/policy, automation, persistence and broker authorization. Vela is a rendering backend, not a trading-system owner.

## Included

- Removed the retained external scripting compatibility translator/runtime/catalog from application source.
- Removed the external public-script catalog dependency from the community indicator surface.
- Removed `lightweight-charts` from application dependencies and the npm lockfile.
- Added vendored Vela source with upstream Apache-2.0 `LICENSE` and `NOTICE`.
- Added a TCO-owned Vela chart facade that preserves the existing workspace chart vocabulary without making React or CoreSpirit depend on vendor APIs.
- Added a Vela-backed `ChartRenderer` implementation and made `vela-native` the only production chart backend.
- Reused Vela's native WebGL2 renderer and Canvas2D fallback rather than maintaining a second production renderer selection in TradingCoreOS.
- Kept canonical columnar market data and incremental update semantics outside the renderer boundary.
- Reworked the Indicators community surface around versioned CoreSpirit Community Indicators.
- Documented the upstream Vela attribution requirement and retained visible attribution.
- Added D1–D6 deepening work for typed-array ingress, viewport LOD, stable render packets, native drawings, multi-chart sync and measurable GPU/frame budgets.

## Verification

- `TCO_V108_CORESPIRIT_VELA_BOUNDARY_OK` passes.
- Focused TypeScript validation reaches the Vela adapter cleanly; the validation harness supplied declarations for optional Vela UI packages that are absent from the uploaded archive's installed dependency environment.
- Full application build is **not claimed** because dependency installation in the isolated archive environment timed out.
- Browser/live-deployment smoke verification remains pending.
