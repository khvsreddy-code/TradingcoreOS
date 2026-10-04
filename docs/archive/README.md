# Documentation archive

The active documentation surface is intentionally small:

- `docs/README.md` — documentation map and authoring rule.
- `docs/01_CORESPIRIT.md` — CoreSpirit language/compiler/runtime.
- `docs/02_DATA_AND_PERFORMANCE.md` — data plane, stateful math and performance.
- `docs/03_VELA_AND_CHARTING.md` — Vela integration, rendering and chart interaction.
- `docs/04_INDICATORS_AND_PLATFORM.md` — indicator platform, settings and public scripts.
- `docs/CORESPIRIT_BUILD_TRACKER.md` — living implementation truth.

Everything else under this directory is historical or consolidated source material:

- `legacy/` contains merged architecture, repair and UI notes.
- `release-notes/` contains consolidated version notes.
- `fyers-legacy/` contains historical FYERS checklists and implementation notes.
- `history/` contains immutable milestone records.
- Root compatibility documents such as `CHART_RENDERER_MIGRATION.md` remain only when machine contracts depend on their path.

Do not create a new one-off architecture Markdown file for a subsystem already covered by the canonical four. Update the canonical document and the tracker instead.
