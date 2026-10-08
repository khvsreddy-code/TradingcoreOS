import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };

const live = read('src/LiveTradingWorkspace.tsx');
const loader = read('src/services/core/chart/velaWorkspaceLoader.ts');
const chrome = read('src/services/core/chart/tcoVelaChrome.ts');

assert(loader.includes("import('../../../../vendor/vela/src/workspace')"), 'Vela workspace must remain a lazy terminal dependency');
assert(live.includes('loadVelaWorkspace'), 'live terminal does not lazy-load VelaWorkspace');
assert(live.includes('new VelaWorkspaceClass'), 'live terminal is not instantiated as VelaWorkspace');
assert(live.includes("providers:") && live.includes("tco: () => createTcoVelaDataProvider()"), 'TCO market provider is not wired into the Vela workspace');
assert(live.includes("engines:") && live.includes("corespirit: () => new LazyCoreSpiritVelaEngine()"), 'CoreSpirit engine is not a Vela workspace engine');
assert(live.includes("defaultLanguage: 'corespirit'"), 'CoreSpirit is not the terminal default scripting engine');
for (const surface of ['tco.replay','tco.data-window','tco.vpvr','tco.research','tco.automation','tco.trading']) {
  assert(live.includes(`'${surface}'`), `terminal topbar is missing ${surface}`);
}
assert(live.includes('bottombar: false'), 'terminal bottom bar must remain disabled; topbar is the primary command surface');
assert(!live.includes("from './components/workspace/LiveChart'"), 'live terminal must not mount the legacy React LiveChart');
assert(!live.includes('FullWorkspaceView'), 'live terminal must not mount the legacy React workspace renderer');
for (const surface of ['tco.research','tco.automation','tco.trading']) {
  assert(chrome.includes(`id: '${surface}'`), `missing Vela side panel ${surface}`);
  assert(chrome.includes(`id: '${surface}'`, chrome.indexOf('const ' + surface.split('.')[1] + 'Panel')), `missing panel registration content for ${surface}`);
  assert(chrome.includes(`id: '${surface}'`), `missing Vela topbar contribution ${surface}`);
}
for (const capability of ['registerSidePanel','registerWidgetAction','registerWidgetAttachment']) assert(chrome.includes(capability), `Vela contribution surface ${capability} is unavailable`);
console.log('VELA_TERMINAL_SHELL_CONTRACT_OK');
