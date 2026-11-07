# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.10.1**
- Upstream tag: `v0.10.1`
- Upstream source commit: `e77d22325e51c7a10edcc617e666ca1a5fd65e68`
- Previous source base: Vela 0.9.0 at `aecb13847dff3c1a50a2f3433e9804d26fc581ed`.
- The 0.10.1 release was verified against the exact upstream commit on 2026-11-07.
- Source lives in `vendor/vela/src`; TradingCoreOS compiles these sources directly.
- Vela's extracted UI kit is supplied by the explicit `@luxalgo/vela-ui` 0.2.0 dependency.
- `vendor/vela/CHANGELOG.md` and `README.md` are synchronized with upstream 0.10.1.
- `vendor/vela/NOTICE` remains present, including the required visible Vela attribution.

## Vela 0.10.1 integration notes

Vela 0.10.0 extracted its component system into `@luxalgo/vela-ui` 0.2.0. The vendored chart source uses the package's scoped dialogs, tabs, menus, icons, styles and controls through the compatibility facade. Construction and ownership of the Vela chart/workspace remain unchanged. The 0.10.1 patch fixes current-price coloring on custom candle styles, isolates UI-kit styling from host-page controls, and restores the timeline-mark popup card.

The exact 0.9.0-to-0.10.1 upstream source delta is recorded in `UPSTREAM-RELEASE-DIFF.json`. The resulting TradingCoreOS overlay against 0.10.1 is recorded in `UPSTREAM-DIFF.json`; the manifest generator validates its Git blob hashes and patch ownership.

## TradingCoreOS integration overlay

The upgrade uses a three-way merge from Vela 0.9.0: the old upstream source, the local TradingCoreOS version, and upstream 0.10.1. Patch ownership remains declared in `vendor/vela/patches.json`. Keep TradingCoreOS's columnar history and retained scene patches, lazy native-indicator catalog, advanced drawing registries, pane persistence, canonical shared market-data plane, FYERS provider, India-market UX, and CoreSpirit output adapter.

Vela remains the chart-rendering owner. CoreSpirit owns language semantics and its output adapter; it does not implement a parallel renderer or bypass Vela's retained scene lifecycle. Market-data subscriptions, history readiness, and provider throttling remain owned by TradingCoreOS, not independent chart widgets.

## UI package boundary

`@luxalgo/vela-ui` is a required production dependency. Do not restore the removed in-tree component implementations as runtime dependencies for new code. Older UI source files retained in `vendor/vela/src/ui` are local compatibility/test fixtures and are marked as local-only in the overlay manifest; the active `src/ui/index.ts` facade exports the 0.10.1 UI API.

## Reproducible source comparison

Use a clean Vela checkout at the pinned commit:

```sh
git clone https://github.com/LuxAlgo/Vela.git /tmp/vela-upstream
git -C /tmp/vela-upstream checkout e77d22325e51c7a10edcc617e666ca1a5fd65e68
node tools/vela-overlay-manifest.mjs --upstream-dir /tmp/vela-upstream --write
node tools/vela-overlay-manifest.mjs --upstream-dir /tmp/vela-upstream --check
```

The generator verifies the exact upstream HEAD and deterministic Git blob hashes. It fails when a TCO-only or locally modified source file does not have a declared patch owner. Do not replace the vendor directory wholesale.

## Rendering and market-data contracts

Keep retained-scene updates and columnar patches on the live path; do not rebuild every series for each tick. Maintain pane-aware click/crosshair events, sparse future plot slots, overlay order, drawing persistence, history-gated native indicators, and pane-size persistence under the existing conformance suite. Workspace charts for the same instrument must share the canonical TCO market-data plane.

Measure initialization, first usable candle, history completion, tick-to-render latency, frame duration, indicator recomputations, and memory by candle count and visible-chart count. Evaluate full rendering/data-transfer costs instead of assuming WebGL or WASM always makes a workload faster.
