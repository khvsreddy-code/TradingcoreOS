import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const vela = fs.readFileSync(path.join(root, 'vendor/vela/src/Vela.ts'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'vendor/vela/src/core/native-indicators/lazyCatalog.ts'), 'utf8');

const assert=(condition,message)=>{if(!condition)throw new Error(message);};

assert(!vela.includes('registerClassicIndicators'), 'Vela still eagerly registers the classic indicator catalog');
assert(vela.includes('addNativeIndicatorAsync'), 'Vela has no lazy native-indicator API');
assert(catalog.includes("import('./classics/averages')"), 'averages are not dynamically imported');
assert(catalog.includes("import('./classics/oscillators')"), 'oscillators are not dynamically imported');
assert(catalog.includes('lazyNativeIndicatorCatalog'), 'metadata-only native catalog is missing');
assert(catalog.includes('loadNativeIndicatorType'), 'type-level lazy loading entry point is missing');
assert(catalog.includes("['ichimoku-cloud', 'Ichimoku Cloud']"), 'Ichimoku must be discoverable from the lazy catalog');
const overlays = fs.readFileSync(path.join(root, 'vendor/vela/src/core/native-indicators/classics/overlays.ts'), 'utf8');
const classic = fs.readFileSync(path.join(root, 'vendor/vela/src/core/native-indicators/classics/define.ts'), 'utf8');
assert(overlays.includes('export const ichimokuCloud'), 'Ichimoku cloud computation is missing');
assert(overlays.includes('ichimokuMidpoint(bars, conversionPeriod)'), 'Ichimoku conversion line must use high/low range midpoint');
assert(overlays.includes('offset: displacement') && overlays.includes('offset: -displacement'), 'Ichimoku leading and lagging spans must be displaced');
assert(classic.includes('plot.offset ?? 0'), 'classic native plots must support chart-slot displacement');

console.log('VELA_NATIVE_INDICATOR_LAZY_CATALOG_CONTRACT_OK');