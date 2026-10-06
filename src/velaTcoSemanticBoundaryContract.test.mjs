import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };

const facade = read('src/services/core/chart/velaChartFacade.ts');
const engine = read('src/CoreSpiritVelaEngine.ts');
const provider = read('src/TcoVelaDataProvider.ts');

assert(/Compatibility boundary for the legacy chart-api surface/.test(facade), 'Vela facade must be explicitly compatibility-only');
assert(!engine.includes("from './services/core/chart/velaChartFacade'"), 'CoreSpiritVelaEngine must use Vela native ports');
assert(!provider.includes("from './services/core/chart/velaChartFacade'"), 'TcoVelaDataProvider must use Vela native ports');

console.log('TCO_VELA_SEMANTIC_BOUNDARY_CONTRACT_OK');
