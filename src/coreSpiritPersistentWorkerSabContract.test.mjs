import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

const pool=read('src/services/coreSpirit/coreSpiritWorkerPool.ts');
const output=read('src/services/coreSpirit/sharedOutputBuffer.ts');
const worker=read('src/services/coreSpirit/coreSpirit.worker.ts');
const runner=read('src/services/coreSpirit/chartRunner.ts');
const buffer=read('src/services/coreSpirit/sharedMarketBuffer.ts');
const vercel=JSON.parse(read('vercel.json'));
const vite=read('vite.config.ts');
const live=read('src/LiveTradingWorkspace.tsx');

if(!/loadOrCompileCoreSpiritArtifact\(/.test(runner)||!/runArtifact\(\s*artifact/.test(runner))throw new Error('Chart runner must address workers with compiled executable artifacts');
if(!/contextArtifacts/.test(pool)||!/artifactChanged/.test(pool))throw new Error('Worker pool must retain per-context artifact identity');
if(!/contextSlots/.test(pool)||!/contextKey/.test(pool))throw new Error('Worker pool must retain per-context worker affinity');
if(!/sharedBuffers/.test(pool)||!/CoreSpiritSharedMarketBuffer/.test(pool))throw new Error('Worker pool must retain per-context shared market buffers');
if(/postMessage\(.*source:/.test(pool)||/postMessage\(.*sourceId:.*bars:/.test(pool))throw new Error('Persistent worker run messages must not resend source + bars');
if(!/artifactId/.test(pool)||!/datasetVersion/.test(pool)||!/dirtyFrom/.test(pool)||!/dirtyTo/.test(pool))throw new Error('Persistent worker envelope missing artifact/version/dirty-range identity');
if(!/SharedArrayBuffer/.test(buffer)||!/Float64Array/.test(buffer)||!/header/.test(buffer)||!/Atomics/.test(buffer))throw new Error('Shared CoreSpirit market buffer must use SAB + typed columns + atomic metadata publication');
if(!/SharedArrayBuffer/.test(output)||!/materializeSharedSeriesOutput/.test(output)||!/createSharedSeriesOutput/.test(output))throw new Error('Numeric CoreSpirit series output must have a shared typed-buffer boundary');
if(!/crossOriginIsolated/.test(buffer))throw new Error('SAB capability must respect cross-origin isolation');
if(!/const\s+contexts\s*=\s*new Map/.test(worker)||!/artifactIdFor/.test(worker)||!/executeBar/.test(worker))throw new Error('Worker must retain runtime contexts/artifacts and support incremental execution');
if(!/readCoreSpiritSharedMarketDescriptor/.test(worker)||!/sharedSeries/.test(worker))throw new Error('Worker must read shared market input and emit shared numeric series output');
if(!/Cross-Origin-Opener-Policy/.test(vite)||!/Cross-Origin-Embedder-Policy/.test(vite))throw new Error('Vite must expose SAB isolation headers');
if(!Array.isArray(vercel.headers)||!vercel.headers.some(h=>h.source==='/(.*)'&&h.headers?.some(x=>x.key==='Cross-Origin-Embedder-Policy'&&x.value==='require-corp')))throw new Error('Vercel live route must expose COEP require-corp');
if(!/sharedMemory/.test(live)||!/crossOriginIsolated/.test(live))throw new Error('Live telemetry must expose shared-memory capability');

console.log('TRADINGCORE_PERSISTENT_CORESPIRIT_SAB_CONTRACT_OK');
