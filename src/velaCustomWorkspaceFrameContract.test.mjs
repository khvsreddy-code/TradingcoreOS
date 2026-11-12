import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const terminal = read('src/services/core/chart/tcoVelaTerminal.ts');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');
const workspace = read('vendor/vela/src/workspace/VelaWorkspace.ts');
const live = read('src/LiveTradingWorkspace.tsx');
const journal = read('src/components/workspace/TerminalJournalPanel.tsx');
const workspaceLoader = read('src/services/core/chart/velaWorkspaceLoader.ts');
const drawingRegistry = read('vendor/vela/src/core/drawings/registry.ts');
const drawingToolbar = read('vendor/vela/src/core/drawings/toolbar.ts');
const sidebarComposition = read('vendor/vela/src/widget/sidebar-composition.ts');
const storage = read('src/services/core/chart/tcoVelaSupabaseStorage.ts');
const cell = read('vendor/vela/src/workspace/ChartCell.ts');
const stateDocument = read('vendor/vela/src/state/document.ts');
const nativeRenderer = read('vendor/vela/src/renderers/native/NativeRenderer.ts');
const rendererPort = read('vendor/vela/src/core/ports/IChartRenderer.ts');
const upstream = read('vendor/vela/UPSTREAM.md');

assert.match(upstream, /Upstream source version:\s*\*\*0\.10\.6\*\*/i, 'TCO must use the exact official Vela 0.10.6 foundation pinned by the vendor manifest');
assert.match(upstream, /Direct source upgrade base: Vela 0\.10\.5/, 'the Vela 0.10.6 integration must identify the exact 0.10.5 source base');
const topbarCompositionSt¶»§q«^