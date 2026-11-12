import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const historyPolicy = read('./services/marketData/chartHistoryPolicy.ts');
const chrome = read('./services/core/chart/tcoVelaChrome.ts');
const engine = read('./CoreSpiritVelaEngine.ts');
const engineLoader = read('./services/coreSpirit/coreSpiritVelaEngineLoader.ts');
const provider = read('./TcoVelaDataProvider.ts');
const semanticAdapter = read('./services/core/chart/tcoVelaSemanticAdapter.ts');
const nativeRenderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const chartKernel = read('./services/core/chart/velaNativeChartKernel.ts');
const chartRenderer = read('../vendor/vela/src/core/ports/IChartRenderer.ts');
const nativeIndicator = read('../vendor/vela/src/core/native-indicators/NativeIndicator.ts');
const velaProvenance = read('../vendor/vela/UPSTREAM.md');
const velaReleaseNotes = read('../vendor/vela/CHANGELOG.md');
const contextMenu = read('../vendor/vela/src/widget/context-menu.ts');
const rendererPorts = read('../vendor/vela/src/core/ports/IChartRenderer.ts');
const rendererImpl = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const nativeExtensions = read('./services/core/chart/tcoVelaNativeExtensions.ts');
const coreSpiritDock = read('./components/corespirit/CoreSpiritDock.tsx');
const chartController = read('./ser¶»§q«^