import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(file)=>fs.readFileSync(path.join(root,file),'utf8');

const identity=read('src/services/coreSpirit/artifactIdentity.ts');
const abi=read('src/services/coreSpirit/artifactAbi.ts');
const artifact=read('src/services/coreSpirit/artifact.ts');
const pipeline=read('src/services/coreSpirit/coreSpiritPipeline.ts');
const cache=read('src/services/coreSpirit/artifactCache.ts');
const runner=read('src/services/coreSpirit/chartRunner.ts');
const pool=read('src/services/coreSpirit/coreSpiritWorkerPool.ts');
const worker=read('src/services/coreSpirit/coreSpirit.worker.ts');

if(!/sha256HexSync/.test(identity)) throw new Error('CoreSpirit artifacts need a strong synchronous content hash for cache identity');
if(!/sourceHash/.test(identity)||!/normalizedHash/.test(identity)||!/semanticHash/.test(identity)||!/programHash/.test(identity)||!/irHash/.test(identity)||!/artifactHash/.test(identity)) {
  throw new Error('Hierarchical CoreSpirit artifact identity hashes are incomplete');
}
if(!/CORE_SPIRIT_ARTIFACT_MAGIC\s*=\s*['"]CSPIRIT['"]/.test(abi)) throw new Error('CoreSpirit ABI magic header missing');
if(!/runtimeABI/.test(abi)||!/optimizerABI/.test(abi)||!/programHash/.test(abi)||!/requiredKernels/.test(abi)||!/requiredData/.test(abi)||!/executionCapabilities/.test(abi)||!/debugMap/.test(abi)) {
  throw new Error('Formal CoreSpirit artifact ABI is incomplete');
}
if(!/abi:\s*CoreSpiritArtifactAbi/.test(artifact)||!/buildCoreSpiritArtifactAbi/.test(artifact)) throw new Error('Executable artifacts must carry the formal ABI');
if(!/const artifactCache = new Map/.test(pipeline)||!/CoreSpiritExecutableArtifact/.test(pipeline)) throw new Error('Compile cache must store executable artifacts directly');
if(!/sourceHash/.test(pipeline)||!/normalizedHash/.test(pipeline)||!/semanticHash/.test(pipeline)) throw new Error('Compile cache key must use hierarchical source/normalized/semantic identity');
if(!/indexedDB\.open/.test(cache)||!/ARTIFACT_STORE/.test(cache)||!/ALIAS_STORE/.test(cache)) throw new Error('Persistent CoreSpirit artifact cache must use IndexedDB');
if(!/worker-vm/.test(cache)||!/browser-vm/.test(abi)) throw new Error('Artifact cache must distinguish execution backends');
if(!/loadOrCompileCoreSpiritArtifact/.test(runner)||!/backend:'worker-vm'/.test(runner)) throw new Error('Chart execution must resolve artifacts from the persistent worker backend cache');
if(!/loadOrCompileCoreSpiritArtifact/.test(read('src/CoreSpiritVelaEngine.ts'))) throw new Error('Vela prepare must use the persistent executable artifact cache');
if(!/artifactIdFor/.test(pool)||!/artifactId,/.test(pool)) throw new Error('Persistent worker envelope must use the formal artifact hash');
if(!/artifactIdFor/.test(worker)||!/message\.artifactId/.test(worker)) throw new Error('Worker context validation must use the formal artifact hash');

console.log('TRADINGCORE_CORESPIRIT_ARTIFACT_CACHE_ABI_CONTRACT_OK');
