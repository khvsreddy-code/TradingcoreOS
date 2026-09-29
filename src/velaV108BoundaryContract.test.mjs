import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));

const pkg = JSON.parse(read('package.json'));
if (pkg.dependencies?.['lightweight-charts']) throw new Error('Lightweight Charts must not be a production dependency');
if (pkg.dependencies?.['Vela renderer']) throw new Error('Vela must be vendored behind the TCO chart boundary, not installed as a duplicate package');
if (!exists('vendor/vela/src/renderers/native/NativeRenderer.ts')) throw new Error('vendored Vela NativeRenderer missing');
if (!exists('vendor/vela/LICENSE') || !exists('vendor/vela/NOTICE')) throw new Error('Vela LICENSE/NOTICE must travel with the vendored source');
if (!/private attributionEnabled = true/.test(read('vendor/vela/src/renderers/native/NativeRenderer.ts'))) throw new Error('Vela native attribution must remain enabled by default');
for (const dep of ['@zag-js/core','@zag-js/dialog','@zag-js/dom-query','@zag-js/menu','@zag-js/tooltip','@zag-js/types','@zag-js/vanilla']) if (!pkg.dependencies?.[dep]) throw new Error(`Missing Vela runtime dependency: ${dep}`);
if (read('src/services/core/chart/chartBackendPolicy.ts').includes("'Vela renderer'")) throw new Error('legacy chart backend policy token remains');
if (!read('src/services/core/chart/chartBackendPolicy.ts').includes("'vela-native'")) throw new Error('vela-native production policy missing');

const sourceFiles = [];
const walk = (dir) => {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.name === 'node_modules' || ent.name === 'vendor') continue;
    if (ent.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js|json)$/.test(ent.name)) sourceFiles.push(p);
  }
};
walk(path.join(root, 'src'));
const directVendorImports = sourceFiles.filter((p) => /from ['"][^'"]*vendor\/vela/.test(fs.readFileSync(p, 'utf8')));
const allowed = new Set([
  path.join(root, 'src/services/core/chart/velaChartFacade.ts'),
  path.join(root, 'src/services/core/chart/velaNativeChartRenderer.ts'),
]);
for (const file of directVendorImports) if (!allowed.has(file)) throw new Error(`Vela import crossed facade boundary: ${path.relative(root, file)}`);

const forbidden = /pineCompatibility|pineRuntime|tradingViewPublicScripts|PineTS|PineScript compatibility/i;
for (const file of sourceFiles) {
  if (file === new URL(import.meta.url).pathname) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (forbidden.test(text)) throw new Error(`legacy Pine/chart dependency reference remains: ${path.relative(root, file)}`);
}

console.log('TCO_V108_CORESPIRIT_VELA_BOUNDARY_OK');
