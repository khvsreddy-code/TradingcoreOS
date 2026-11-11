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
const velaEngine=read('src/CoreSpiritVelaEngine.ts');

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
if(!/if\(typeof window!=='undefined'\)\s*\{\s*return Promise\.reject\(new Error\('CoreSpirit chart execution requires Web Worker support/.test(pool))throw new Error('Browser chart execution must fail closed rather than interpret history on the UI thread when Worker is unavailable');
if(!/!job\.readOnly/.test(pool)||/const mode:WorkerRunEnvelope\['mode'\][\s\S]{0,100}job\.datasetVersion/.test(pool)&&!/!job\.readOnly/.test(pool))throw new Error('Read-only historical requests must never be downgraded to incremental execution');
if(!/!readOnly&&datasetVersion>context\.datasetVersion/.test(pool))throw new Error('Node/SSR compatibility runtime must honour the read-only replay boundary');
if(!/message\.readOnly\s*\|\|/.test(worker))throw new Error('Execution worker must enforce read-only requests as full replays even if an envelope requests incremental mode');
if(!/warmReadOnly=message\.readOnly\|\|\(message\.mode==='incremental'&&!context\.initialized\)/.test(worker))throw new Error('Incremental requests that need to rebuild worker context history must warm read-only');
if(!/warmReadOnly=readOnly\|\|\(tailSnapshot&&!context\.initialized\)/.test(pool))throw new Error('SSR fallback must suppress effects while warming a context for an incremental request');
if(!/runCoreSpiritArtifactInWorker/.test(velaEngine)||/runtime\.executeIr|runtime\.executeBar|createRuntime\(/.test(velaEngine))throw new Error('Vela scripting sessions must evaluate prepared CoreSpirit artifacts through persistent workers, not the terminal thread');
if(!/cloneGraphSnapshot/.test(pool)||!/graphSnapshotForTransfer/.test(pool))throw new Error('Worker graph transfer must clone transferables so cached secondary-market arrays are not detached');
if(!/queued\.contextKey!==contextKey/.test(pool)
  || !/this\.queue\.splice\(index,1\);this\.settleJob\(queued,abortError\('Superseded by a newer snapshot for this context\.'\)\)/.test(pool)) {
  throw new Error('The worker pool must coalesce queued snapshots only within the same context and reject superseded work through the shared settlement path');
}
if(!/priority:options\?\.runtimeOptions\?\.executionTarget==='chart'\?\(options\.runtimeOptions\.executionMode==='realtime'\?0:1\):sourceId\.includes\('chart'\)\?2:4/.test(pool))throw new Error('Realtime chart jobs must receive the highest worker priority, historical chart jobs the next priority, and non-chart work must use fallback priorities');
if(pool.includes('queueCursor'))throw new Error('Worker scheduling must not retain a fragile cursor into a queue that is resorted');
if(!/if\(slot\?\.busy\)continue/.test(pool))throw new Error('A busy chart must not head-of-line block runnable jobs for other contexts');

if(!/readCoreSpiritSharedMarketDescriptor/.test(worker)||!/sharedSeries/.test(worker))throw new Error('Worker must read shared market input and emit shared numeric series output');
if(!/marketFrame:CoreSpiritMarketFrame/.test(worker)||!/coreSpiritMarketFrameFromColumns/.test(worker)||!/coreSpiritMarketFrameArrayFacade/.test(worker))throw new Error('Worker market inputs must stay columnar with an on-demand compatibility facade');
if(/function ensureBarArray/.test(worker)||/bar\.timestamp=new Date/.test(worker))throw new Error('Worker must not maintain/rewrite one object for every shared row');
if(!/getMarketFrame\(\): CoreSpiritMarketFrame/.test(read('src/services/coreSpirit/runtime.ts')))throw new Error('Runtime must expose the zero-copy typed-column boundary for quant/ML feature builders');
const runtimeSource=read('src/services/coreSpirit/runtime.ts');
if(!/const frame = this\.marketFrameResolver\?\.\(\)/.test(runtimeSource)
  || !/const column = name === 'open' \? frame\.open/.test(runtimeSource)
  || !/name === 'high' \? frame\.high/.test(runtimeSource)
  || !/name === 'low' \? frame\.low/.test(runtimeSource)
  || !/name === 'close' \? frame\.close/.test(runtimeSource)
  || !/name === 'volume' \? frame\.volume/.test(runtimeSource)
  || !/if \(name === 'time'\)[\s\S]{0,180}source\.timestamp/.test(runtimeSource)
  || !/this\.columnarHistory\.valueAt\(name, sourceIndex\)/.test(runtimeSource)) {
  throw new Error('Runtime must read OHLCV from MarketFrame typed columns, derive time from the exact replay bar, and retain canonical columnar fallback');
}
if(!/Cross-Origin-Opener-Policy/.test(vite)||!/Cross-Origin-Embedder-Policy/.test(vite))throw new Error('Vite must expose SAB isolation headers');
if(!Array.isArray(vercel.headers)||!vercel.headers.some(h=>h.source==='/(.*)'&&h.headers?.some(x=>x.key==='Cross-Origin-Embedder-Policy'&&x.value==='require-corp')))throw new Error('Vercel live route must expose COEP require-corp');
if(!/sharedMemory/.test(live)||!/crossOriginIsolated/.test(live))throw new Error('Live telemetry must expose shared-memory capability');

console.log('TRADINGCORE_PERSISTENT_CORESPIRIT_SAB_CONTRACT_OK');
