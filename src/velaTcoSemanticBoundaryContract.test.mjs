import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };

const facade = read('src/services/core/chart/velaChartFacade.ts');
const engine = read('src/CoreSpiritVelaEngine.ts');
const provider = read('src/TcoVelaDataProvider.ts');
const adapter = read('src/services/core/chart/tcoVelaSemanticAdapter.ts');

assert(/Compatibility boundary for the legacy chart-api surface/.test(facade), 'Vela facade must be explicitly compatibility-only');
assert(!engine.includes("from './services/core/chart/velaChartFacade'"), 'CoreSpiritVelaEngine must use Vela native ports');
assert(!provider.includes("from './services/core/chart/velaChartFacade'"), 'TcoVelaDataProvider must use Vela native ports');
const facadeImports = [...facade.matchAll(/from ['"]([^'"]+)['"]/g)].map(match => match[1]);
assert(facadeImports.every(value => value === './velaNativeChartKernel' || value.includes('/vendor/vela/')), 'Vela facade must not grow TCO-owned service dependencies');
assert(Buffer.byteLength(facade, 'utf8') <= 40000, 'Vela compatibility facade exceeded the 40 KB legacy-boundary budget');
assert(adapter.includes('IndicatorModel') && adapter.includes('CoreSpiritObject'), 'TCO semantic adapter must translate trading outputs into native Vela models');
assert(!adapter.includes('velaChartFacade'), 'TCO semantic adapter must not depend on the compatibility facade');
assert(engine.includes("./services/core/chart/tcoVelaSemanticAdapter"), 'CoreSpiritVelaEngine must cross the Vela boundary through the semantic adapter');

console.log('TCO_VELA_SEMANTIC_BOUNDARY_CONTRACT_OK');
