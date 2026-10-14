import assert from 'node:assert/strict';
import fs from 'node:fs';

const settings = fs.readFileSync('vendor/vela/src/renderers/native/chrome/SettingsDialog.ts', 'utf8');
const workspace = fs.readFileSync('vendor/vela/src/workspace/VelaWorkspace.ts', 'utf8');

assert.ok(settings.includes("document.documentElement.dataset.tcoActiveSymbol"), 'appearance preview must read the active chart ticker');
assert.ok(settings.includes("document.documentElement.dataset.tcoActiveTimeframe"), 'appearance preview must read the active chart timeframe');
assert.ok(settings.includes('symbolText.textContent = `${previewTicker} · ${previewTimeframe}`'), 'preview header must render the current chart ticker and timeframe');
assert.ok(workspace.includes('document.documentElement.dataset.tcoActiveSymbol = cell.symbol'), 'workspace must publish the active ticker');
assert.ok(workspace.includes('private onCellMarketChanged(id: string)'), 'workspace must refresh preview context when the active chart market changes');
assert.ok(workspace.includes('this.globalTool = type;'), 'shared drawing toolbar must update its tool mirror before focus restoration');
assert.ok(workspace.includes('this.active.chart.drawings.setTool(type);'), 'shared drawing toolbar must arm the active chart drawing controller');

console.log('VELA_ACTIVE_PREVIEW_AND_DRAWING_TOOL_CONTRACT_OK');
