# Vela upstream foundation

- Upstream project: https://github.com/LuxAlgo/Vela
- Upstream source version: **0.9.0**
- Upstream tag: `v0.9.0`
- Upstream source commit: `aecb13847dff3c1a50a2f3433e9804d26fc581ed`
- Previous source base: Vela 0.8.5 at `596cbbdeba15406cfb72465afd07f8c60c6b1852`.
- The 0.9.0 release was verified against the exact upstream tag and commit on 2026-10-25.
- Source lives in `vendor/vela/src`; TradingCoreOS compiles these sources directly.
- `vendor/vela/CHANGELOG.md` is synchronized with upstream 0.9.0.
- `vendor/vela/NOTICE` remains byte-for-byte identical to upstream, including the required visible Vela attribution.

## Vela 0.9.0 capabilities

The upgrade includes locale-aware price/time formatting and translated interface strings, runtime locale switching without re-running indicators, explicit locale-pack registration, right-to-left chart chrome while preserving left-to-right time flow, and 19 locale packs including Hindi. Contributed labels are typed as `MessageLike`; consumers that read them back should resolve messages through the translator rather than assume all values are plain strings.

The exact 0.8.5-to-0.9.0 source delta is recorded in `UPSTREAM-RELEASE-DIFF.json`. The integration overlay against 0.9.0 is recorded in `UPSTREAM-DIFF.json`: 389 identical source files, 63 locally modified upstream files with explicit patch ownership, 12 TradingCoreOS-only files, and 0 upstream-only files.

## TradingCoreOS integration overlay

The upgrade uses a three-way merge from Vela 0.8.5: the old upstream source, the local TradingCoreOS version, and upstream 0.9.0. Patch ownership remains declared in `vendor/vela/patches.json`. Keep TradingCoreOS's columnar history and scene patches, lazy native-indicator catalog, advanced drawing registries, pane persistence, canonical shared market-data plane, FYERS provider, and CoreSpirit output adapter.

The native renderer consumes the typed columnar data path. A history correction/backfill is a full or range replacement; an ordinary live tick uses the incremental update path. Provider subscriptions and history readiness remain owned by TradingCoreOS, not by independent chart widgets.

## Reproducible source comparison

Use a clean Vela checkout at the pinned tag:

```sh
git clone https://github.com/LuxAlgo/Vela.git /tmp/vela-upstream
git -C /tmp/vela-upstream checkout aecb13847dff3c1a50a2f3433e9804d26fc581ed
node tools/vela-overlay-manifest.mjs --upstream-dir /tmp/vela-upstream --write
node tools/vela-overlay-manifest.mjs --upstream-dir /tmp/vela-upstream --check
```

The generator verifies the exact upstream HEAD and deterministic Git blob hashes. It fails when a TCO-only or locally modified source file does not have a declared patch owner. Do not replace the vendor directory wholesale.

## Rendering performance and chart contracts

Keep retained-scene updates and columnar patches on the live path; do not rebuild every series for each tick. Maintain pane-aware click/crosshair events, sparse future plot slots, overlay order, drawing persistence, history-gated native indicators, and pane-size persistence under the existing conformance suite. Workspace charts for the same instrument must share the canonical TCO market-data plane.

Measure initialization, first usable candle, history completion, tick-to-render latency, frame duration, indicator recomputations, and memory by candle count and visible-chart count. Evaluate full rendering/data-transfer costs instead of assuming WebGL or WASM always makes a workload faster.
