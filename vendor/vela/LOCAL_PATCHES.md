# TradingCoreOS overlay on Vela 0.10.1

The final upstream source baseline is Vela tag `v0.10.1`, commit
`e77d22325e51c7a10edcc617e666ca1a5fd65e68`. The three-way common ancestor for the
TradingCoreOS overlay is Vela 0.9.0 at `aecb13847dff3c1a50a2f3433e9804d26fc581ed`.
Do not identify a TCO-local edit as an upstream change just because it lives under `vendor/vela/src`.

## Patch groups

| Patch ID | Boundary | Purpose | Contract coverage |
| --- | --- | --- | --- |
| `pane-layout-persistence` | `src/state/document.ts`, `src/workspace/ChartCell.ts`, `src/workspace/VelaWorkspace.ts` | Persist validated pane weights, restore them without fighting live drags, and route pane changes through the debounced workspace save. | `src/velaPaneLayoutPersistence.test.ts`, `src/vela101FoundationContract.test.mjs`, `src/velaLiveUiCoreSpiritContract.test.mjs` |
| `columnar-history-and-scene-patches` | `src/core/model/**` and scene graph | Retain columnar OHLCV history, efficient patches and stable scene identity for high-frequency TCO updates. | Vela foundation, incremental patch, revisioned scene, and columnar-renderer contracts. |
| `engine-and-indicator-lifecycle` | `src/Vela.ts`, engine, handles, native indicator catalog | Preserve the CoreSpirit engine lifecycle and lazy TCO native-indicator catalog around Vela's native runtime. | Native-indicator lazy, CoreSpirit capability, and live UI contracts. |
| `drawing-registries-and-state` | `src/core/drawings/**` | Retain advanced channels, Fibonacci and pattern registries with TCO's drawing persistence adapter. | Drawing capability inventory, advanced-family lazy, and persistence-roundtrip contracts. |
| `native-renderer-and-chart-chrome` | `src/renderers/**`, chart tokens/icons and UI | Preserve native-renderer extensions, attribution-compatible branding, custom chart chrome, renderer layers, and pane-tagged Data Window groups used by TCO to filter study values to the pane under the crosshair. | Foundation, live UI/CoreSpirit, workspace UX, and incremental-patch contracts. |
| `provider-and-sdk-compatibility` | `src/core/ports/**`, `src/data/**`, SDK boundaries | Keep Vela's public port types connected to the canonical TCO market-data plane without replacing provider ownership or progressive history paging. | Live UI, candle fast-switch, time normalization, and foundation contracts. |
| `widget-workspace-and-local-catalog` | `src/widget/**`, `src/workspace/**`, `src/state/**` | Preserve workspace and picker integration, serialized state extensions, and the local TCO UX. | Workspace autosave, pane persistence, live UI, and foundation contracts. |

The exact 0.10.1 file-by-file source comparison is recorded in
[`UPSTREAM-DIFF.json`](./UPSTREAM-DIFF.json). The groups and their path patterns,
purposes, and test associations live in [`patches.json`](./patches.json). The
manifest generator refuses to complete if an upstream-modified or TCO-only source
file is not owned by a patch group.

## Reproducing the source diff

Use a clean checkout of the pinned release and regenerate the diff from the
repository root:

```sh
git clone https://github.com/LuxAlgo/Vela.git /tmp/vela-upstream
git -C /tmp/vela-upstream checkout e77d22325e51c7a10edcc617e666ca1a5fd65e68
node tools/vela-overlay-manifest.mjs --upstream-dir /tmp/vela-upstream --write
node tools/vela-overlay-manifest.mjs --upstream-dir /tmp/vela-upstream --check
```

The generator hashes Git blobs (SHA-1 over the canonical Git blob header plus
file bytes), compares the `src/` file trees, and emits deterministic sorted lists
for identical, modified, TCO-only, and upstream-only paths. It verifies the exact
upstream HEAD before comparing, so a diff accidentally generated from a different
release cannot be promoted. No source files are replaced by the generator.

## Compatibility boundary

- `src/TcoVelaDataProvider.ts` remains the shared source for bounded first paint,
  older-history paging, and history-readiness signaling.
- `src/services/core/chart/velaNativeChartKernel.ts` is the TCO native-chart
  integration kernel. Pane-aware events use Vela's native pane identity and the
  corresponding pane's coordinate scale.
- `src/services/core/chart/tcoVelaSemanticAdapter.ts` is the typed
  CoreSpirit-to-Vela output boundary. CoreSpirit scene conversion should not be
  duplicated in chart chrome or renderer callbacks.
- `src/services/core/chart/velaChartFacade.ts` remains only as a legacy compatibility
  surface for existing imports. New registry integrations should import the specific
  native Vela capability directly when that is the actual dependency.
- Keep `vendor/vela/NOTICE` and the visible Vela attribution behavior intact. This
  file's upstream blob matches the notice pinned by Vela 0.9.0.
