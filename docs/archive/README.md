# Documentation archive

The active documentation surface is intentionally small:

- `docs/README.md` — documentation map and authoring rule.
- `docs/01_CORESPIRIT.md` — CoreSpirit language/compiler/runtime.
- `docs/02_DATA_AND_PERFORMANCE.md` — data plane, stateful math and performance.
- `docs/03_VELA_AND_CHARTING.md` — Vela integration, rendering and chart interaction.
- `docs/04_INDICATORS_AND_PLATFORM.md` — indicator platform, settings and public scripts.
- `docs/CORESPIRIT_BUILD_TRACKER.md` — living implementation truth.

Everything else under this directory is historical or compatibility material:

- `history/` contains immutable milestone records moved out of the active docs surface.
- `legacy/` contains merged architecture, repair and UI notes.
- `release-notes/` contains consolidated version notes.
- `fyers-legacy/` contains historical FYERS checklists and implementation notes.
- `compatibility/` contains archived copies of root compatibility documents that are still required by machine contracts.
- The old `docs/archive/source/` convention is retired; no new source-note subtree should be created.

Do not create a new one-off architecture Markdown file for a subsystem already covered by the canonical four. Update the canonical document and the tracker instead.
