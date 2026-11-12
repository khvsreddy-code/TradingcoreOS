import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (p) => fs.readFileSync(p, 'utf8');
const live = read('src/LiveTradingWorkspace.tsx');
const topology = read('src/services/core/chart/tcoVelaTerminal.ts');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');
const settingsDialog = read('vendor/vela/src/renderers/native/chrome/SettingsDialog.ts');
const drawingSettingsPanel = read('vendor/vela/src/renderers/native/drawings/DrawingSettingsPanel.ts');
const drawingSettingsPopup = read('vendor/vela/src/renderers/native/drawings/DrawingSettingsPopup.ts');
const multiProviderFeed = read('vendor/vela/src/data/MultiProviderFeed.ts');
const corePatch = read('vendor/vela/src/core/model/patch.ts');
const scenePatch = read('vendor/vela/src/core/model/scenePatch.ts');
const velaEngineOrchestrator = read('vendor/vela/src/core/engine/EngineOrchestrator.ts');
const velaCanvasBackend = read('vendor/vela/src/renderers/native/backend/Canvas2dBackend.ts');
const velaWebGLBackend = read('vendor/vela/src/renderers/native/backend/WebGL2Backend.ts');
const drawingDefaults = read('vendor/vela/src/core/drawings/defaults.ts');
const drawingPriceAction = read('vendor/vela/src/core/drawings/priceAction.ts');
const drawingController = read('vendor/vela/src/core/drawings/DrawingController.ts');
const drawingRegistry = read('vendor/vela/src/core/drawings/registry.ts');
const workspaceState = read('vendor/vela/src/state/document.ts');
const upstream = read('vendor/ve¶»§q«^