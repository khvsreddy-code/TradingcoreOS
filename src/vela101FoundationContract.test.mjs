import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const exists = (path) => fs.existsSync(new URL(path, import.meta.url));

const provenance = read('../vendor/vela/UPSTREAM.md');
const releaseNotes = read('../vendor/vela/CHANGELOG.md');
const notice = read('../vendor/vela/NOTICE');
const nativeRenderer = read('../vendor/vela/src/renderers/native/NativeRenderer.ts');
const symbols = read('../vendor/vela/src/widget/symbol-picker.ts');
const hyperliquid = read('../vendor/vela/src/data/providers/hyperliquid/HyperliquidProvider.ts');
const provider = read('./TcoVelaDataProvider.ts');
const vela = read('../vendor/vela/src/Vela.ts');
const options = read('../vendor/vela/src/core/options.ts');
const nativeIndicator = read('../vendor/vela/src/core/native-indicators/NativeIndicator.ts');
const paneControl = read('../vendor/vela/src/core/PanesControl.ts');
const chartRenderer = read('../vendor/vela/src/core/ports/IChartRenderer.ts');
const rendererControl = read('../vendor/vela/src/core/RendererControl.ts');
const indicatorHandle = read('../vendor/vela/src/core/IndicatorHandle.ts');
const indicatorRegistry = read('../vendor/vela/src/core/engine/IndicatorRegistry.ts');
const engine = read('../vendor/vela/src/core/engine/EngineOrchestrator.ts');
const sceneGraph = read('../vendor/vela/src/renderers/native/core/SceneGraph.ts');
const overlayStack = read¶»§q«^