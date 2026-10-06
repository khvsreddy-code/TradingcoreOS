import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const assert = (value, message) => { if (!value) throw new Error(message); };

const facade = read('src/services/core/chart/velaNativeChartKernel.ts');
const showcase = read('src/components/workspace/ShowcaseChart.tsx');
assert(/export const LineStyle\s*=/.test(facade), 'LineStyle must be a runtime export, not a type-only export');
assert(/LineStyle\.(Solid|Dashed|Dotted)/.test(showcase), 'ShowcaseChart runtime LineStyle use missing');
assert(!/^export type LineStyle\s*=.*$/m.test(facade), 'type-only LineStyle export must not be the runtime boundary');
console.log('TCO_V111_VELA_RUNTIME_EXPORT_CONTRACT_OK');
