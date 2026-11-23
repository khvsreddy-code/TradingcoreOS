import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8');
const contributions = read('../vendor/vela/src/widget/contributions.ts');
const panelDock = read('../vendor/vela/src/widget/panel-dock.ts');
const sidePanel = read('../vendor/vela/src/widget/side-panel.ts');
const chrome = read('./services/core/chart/tcoVelaChrome.ts');
const terminal = read('./services/core/chart/tcoVelaTerminal.ts');
const workspace = read('./LiveTradingWorkspace.tsx');
const corespritDock = read('./components/corespirit/CoreSpiritDock.tsx');

assert.ok(contributions.includes('maximizable?: boolean'));
assert.ok(panelDock.includes('maximizable: desc.maximizable'));
assert.ok(sidePanel.includes('.vela-panel-pin') && sidePanel.includes('refreshPin()'),
  'the existing native overlay pin controls docking without a second layout manager');
assert.ok(sidePanel.includes('maximizedOn') && sidePanel.includes('setMaximized(maximized: boolean)'),
  'native maximize/restore lifecycle stays inside Vela');
assert.ok(chrome.includes('const TCO_PANEL_DEFAULTS'));
assert.ok(chrome.includes('function registerTcoSidePanel'));
assert.ok(chrome.includes('registerTcoSidePanel(coreSpiritCodePanel)'));
assert.ok(chrome.includes('overlay: true') && chrome.includes('maximizable: true'),
  'CoreSpirit uses the native floating/pin/maximize model');
assert.ok(chrome.includes('onClose: () => header.close()'));
assert.ok(chrome.includes('header.setMaximized(false)'));
assert.ok(!chrome.includes("shellHeader.style.display = 'none'"));
assert.ok(!chrome.includes("panel?.removeAttribute('data-maximized')"),
  'TCO content must not mutate Vela panel state through DOM selectors');
assert.ok(chrome.includes("id: 'tco.order-ticket'"));
assert.ok(chrome.includes('registerTcoSidePanel(orderTicketPanel)'));
assert.ok(chrome.includes("id: 'tco.trading'"), 'account/positions summary remains separate from order entry');
assert.ok(chrome.includes("{ id: 'tco.order-ticket', label: 'Order Ticket'"));
assert.ok(terminal.includes("'tco.order-ticket'"));
assert.ok(workspace.includes("openTerminalPanel('tco.order-ticket')"),
  'the global Trade action opens the compact order ticket rather than the account summary');
assert.ok(corespritDock.includes('{!embedded &&'),
  'embedded CoreSpirit does not duplicate Vela shell chrome');
assert.ok(corespritDock.includes('Minimize CoreSpirit editor'));
assert.ok(corespritDock.includes('Fullscreen CoreSpirit editor'),
  'standalone CoreSpirit retains its own fullscreen flow');
assert.ok(/RightTerminalDock|WatchlistDock|AdvancedOrderTicket/.test(workspace) === false,
  'the React terminal must not mount parallel dock or ticket systems');

console.log('WORKSPACE_PANEL_SYSTEM_CONTRACT_OK');
