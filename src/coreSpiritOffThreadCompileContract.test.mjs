import fs from 'node:fs';
import path from 'node:path';
const root=process.cwd();
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const engine=read('src/CoreSpiritVelaEngine.ts');
const cache=read('src/services/coreSpirit/artifactCache.ts');
const worker=read('src/services/coreSpirit/coreSpiritCompiler.worker.ts');
const client=read('src/services/coreSpirit/coreSpiritCompilerClient.ts');
const identity=read('src/services/coreSpirit/artifactLookupIdentity.ts');
const pipeline=read('src/services/coreSpirit/coreSpiritPipeline.ts');
if(!/loadOrCompileCoreSpiritArtifact\(/.test(engine)||!/backend:'worker-vm'/.test(engine)||!/compileCoreSpiritArtifactOffThread/.test(engine)) {
  throw new Error('Vela prepare must resolve the worker-vm executable artifact through the persistent cache and worker compiler');
}
if(/compileCoreSpirit\(source,\s*instanceId\)/.test(engine)) throw new Error('Vela prepare must not compile directly on the UI thread');
if(!/compileInWorker/.test(cache)||!/await compileWorker\(source,sourceId/.test(cache)||!/compileCoreSpiritArtifactOffThread/.test(cache)||!/await import\('\.\/coreSpiritPipeline'\)/.test(cache)) {
  throw new Error('Artifact cache misses must support an async worker compiler and lazy compatibility fallback');
}
if(/import\s*\{[^}]*compileCoreSpirit[^}]*\}\s*from\s*['"]\.\/coreSpiritPipeline['"]/.test(cache)) {
  throw new Error('Artifact cache must not eagerly import the complete compiler into the UI bundle');
}
if(!/new Worker\(new URL\('\.\/coreSpiritCompiler\.worker\.ts'/.test(client)||!/worker\.postMessage\(\{type:'compile'/.test(client)) {
  throw new Error('CoreSpirit compiler client must issue compile requests through a dedicated module worker');
}
if(!/compileCoreSpirit\(/.test(worker)||!/validateExecutableArtifact/.test(worker)||!/type:'compiled'/.test(worker)) {
  throw new Error('Compiler worker must compile and validate an executable artifact before returning it');
}
if(!/export function buildCoreSpiritArtifactLookupIdentity/.test(identity)||/import\s*\{[^}]*buildCoreSpiritArtifactLookupIdentity[^}]*\}\s*from\s*['"]\.\/coreSpiritPipeline['"]/.test(cache)) {
  throw new Error('Artifact cache identity lookup must use the lightweight canonical identity module');
}
if(!/artifactLookupIdentity/.test(pipeline)) throw new Error('Compiler and artifact cache must share a single canonical identity function');
if(!/validateExecutableArtifact\(compiled\.artifact\)/.test(client)||!/validateExecutableArtifact\(artifact\)/.test(client)) throw new Error('No-Worker compatibility fallbacks must validate compiled/persisted artifacts before acceptance');
console.log('CORESPIRIT_OFF_THREAD_COMPILER_CACHE_OK');
