# Vela and charting

Vela is TradingCoreOS's sole charting/rendering engine. Application code crosses into it through TCO-owned facades/adapters.

## Vendor boundary

The vendored upstream source snapshot is Vela **0.10.6** (f6769868c5c0e78ba7977a5c89640df896a8f2f3), pinned to the public v0.10.6 release tag and reconciled against the exact 0.10.5 source base. The active UI component kit is @luxalgo/vela-ui **0.4.1**, the version still required by Vela 0.10.6; its styling is scoped to Vela hosts so chart controls do not restyle the surrounding React application.


## Vela capability architecture â€” v0.10.6

The Vela 0.10.6 upstream source tree contains **393 files**. TradingCoreOS vendors 472 source files in total: 334 byte-identical upstream files, 59 locally adapted upstream files, and 79 TCO-only extensions. TradingCoreOS retains a separate local overlay for its columnar market-data, CoreSpirit, drawing, pane-persistence, India-market and compatibility patches; see `vendor/vela/UPSTREAM-DIFF.json` for exact file-level provenance. The bundle risk is not just file count; the renderer composition root can make optional chart capabilities part of the same JavaScript graph.

The audited hotspots include:

| Capability | Largest module | Approx. source size |
| --- | --- | ---: |
| Native renderer | `renderers/native/NativeRenderer.ts` | 258 KB |
| Engine orchestration | `core/engine/EngineOrchestrator.ts` | 181 KB |
| Multi-chart workspace | `workspace/VelaWorkspace.ts` | 135 K¶»§q«^