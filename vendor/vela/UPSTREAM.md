# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.8.5**
- Upstream source commit: `596cbbdeba15406cfb72465afd07f8c60c6b1852`
- Previous source base: Vela 0.8.4 at `850fa1f431e2065e9b0074c4b0555a48a2999eaf`.
- The 0.8.5 release commit descends from 0.8.4 and was verified from upstream on 2026-10-24.
- Source lives in `vendor/vela/src`; the app compiles against these sources directly.
- `vendor/vela/CHANGELOG.md` records 0.8.5 and earlier upstream releases.
- `vendor/vela/NOTICE` is byte-for-byte identical to the upstream 0.8.5 notice and retains Vela's chart-level attribution requirement.

## TradingCoreOS integration overlay

The 0.8.5 release delta is merged against the 0.8.4 base and the deliberate TradingCoreOS overlay rather than replacing TCO-specific code wholesale. The merge retains typed columnar history and scene patches, retained-scene culling, the lazy native-indicator catalog, advanced drawing registries, the shared TCO market-data plane, the FYERS provider, and the CoreSpirit engine adapters.

Upstream 0.8.5 behavior retained here includes programmatic pane height weights, pane-aware click/crosshair events, history-gated native indicators, sparse and future plot slots, overlay ordering, and the replacement of the removed `linear-regression` built-in with `lsma` and `linear-regression-slope`.

`src/renderers/native/chrome/SettingsDialog.ts` retains the TCO desktop presentation layer: horizontal tabs, the Appearance Preview panel, and TCO host-setting hooks. Engine-owned controls still edit the live Vela `ChartConfig`; preview data remains sample-only.

Integration adapters are maintained in `src/TcoVelaDataProvider.ts` and `src/services/core/chart/`. Their shared data plane remains the source of history readiness; Vela's per-load `historyComplete()` lifecycle gates native indicators that opt into `waitsForHistory`.

## Reproducible source comparison and patch ownership

Two exact source reports are checked in:
`vendor/vela/UPSTREAM-RELEASE-DIFF.json` records the upstream 0.8.4-to-0.8.5
source-file delta, while `vendor/vela/UPSTREAM-DIFF.json` compares the current TCO
vendor source against pinned upstream 0.8.5. Their Git blob hashes distinguish unchanged
files, modified upstream files, TCO-only source files, and upstream files not present
locally. `vendor/vela/patches.json` assigns each local modification group a purpose and
tests; the generator fails when a changed or local-only source file has no patch owner.

Recreate and verify the snapshot with an upstream checkout pinned to the exact commit:

```sh
node tools/vela-overlay-manifest.mjs --upstream-dir /path/to/Vela --write
node tools/vela-overlay-manifest.mjs --upstream-dir /path/to/Vela --check
```

Pane height weights are an additive field in the existing version-1 state document.
They are validated as finite positive values with bounded pane count and size. Existing
version-1 layouts without this field continue to restore with the renderer's normal weights.
The workspace saves pane changes through its existing debounced state pipeline; the chart
cell applies restored weights once per pane so a later manual resize is not overwritten.
