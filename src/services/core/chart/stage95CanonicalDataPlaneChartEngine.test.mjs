import fs from 'node:fs';
const root = new URL('.', import.meta.url).pathname;
const chartCore = fs.readFileSync(new URL('./chartCore.ts', import.meta.url), 'utf8');
const chartController = fs.readFileSync(new URL('../../../components/workspace/chartController.ts', import.meta.url), 'utf8');
const derived = fs.readFileSync(new URL('../data/derivedDataStores.ts', import.meta.url), 'utf8');
if (/reduceCandlesForPixels\s*\(/.test(chartCore)) throw new Error('ChartCore still references object LOD path');
if (!chartController.includes('getCanonicalDataPlane')) throw new Error('ChartController does not resolve the canonical data plane');
if (!derived.includes('constructor(readonly timeline: MarketDataStore)')) throw new Error('derived stores are not timeline-owned');
console.log('STAGE95_ZERO_COPY_SOURCE_CONTRACT_OK');
