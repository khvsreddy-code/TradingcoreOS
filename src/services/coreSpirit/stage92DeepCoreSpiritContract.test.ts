import { CoreSpiritParser } from './parser';
import { normalizeCoreSpiritSource } from './syntax';
import { describeCoreSpiritSurface } from './surfaceForms';
import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritComponentRegistry } from './coreSpiritComponents';
import type { CoreSpiritComponentContract } from './coreSpiritExecutionModel';
import { getCoreSpiritLibraryEntry, resolveCoreSpiritLibraryCall, CORE_SPIRIT_LIBRARY_ROOT_NAMESPACES } from './standardLibraryNamespaces';
import { buildCoreSpiritComplexityProfile, validateCoreSpiritComplexityProfile } from './coreSpiritComplexityAbsorber';
import { coreSpiritModelManifestToComponentContract } from './semanticComponentAdapters';
import { getCoreSpiritCompletions } from './languageService';

const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};

const registry = new CoreSpiritComponentRegistry();
for (const [id, name] of [['motion:v1','motion'],['volatility:v1','volatility']] as const) {
  registry.register({
    version:1, id, name, kind:'component',
    inputs:[{name:'source',type:{kind:'series',element:'scalar'},required:true}],
    outputs:[{name:'value',type:{kind:'series',element:'scalar'},required:true}],
    nodeIds:[id], dependencies:[], deterministic:true, stateful:false, capabilities:['numerical'],
  }, ({args}) => Number(args[0] ?? 0));
}
const regime: CoreSpiritComponentContract = {
  version:1,id:'regime:v2',name:'regime',kind:'component',
  inputs:[
    {name:'motion',type:{kind:'series',element:'scalar'},required:true},
    {name:'volatility',type:{kind:'series',element:'scalar'},required:true},
  ],
  outputs:[
    {name:'trendProbability',type:{kind:'scalar'},required:true},
    {name:'rangeProbability',type:{kind:'scalar'},required:true},
    {name:'noiseProbability',type:{kind:'scalar'},required:true},
  ],
  nodeIds:['regime:motion','regime:volatility','regime:probability'],
  dependencies:['motion:v1','volatility:v1'],deterministic:true,stateful:false,capabilities:['numerical','distribution'],
};
registry.register(regime, ({args}) => ({
  trendProbability: Number(args[0] ?? 0) > 0 ? 0.8 : 0.2,
  rangeProbability: 0.1,
  noiseProbability: 0.1,
}));

const source = [
  'let motionValue = motion(close)',
  'let volatilityValue = volatility(motionValue)',
  'let reg = regime(motionValue, volatilityValue)',
  'show reg.trendProbability',
  'when reg.noiseProbability < 0.2:',
  '  emit "CLEAN"',
].join('
');

const parsed = new CoreSpiritParser(normalizeCoreSpiritSource(source)).parseDetailed();
assert(parsed.diagnostics.length===0,parsed.diagnostics.map(d=>d.message).join('; '));
const surface = describeCoreSpiritSurface(source,{components:registry});
const compiler = new CoreSpiritCompiler();
const compiled = compiler.compile(parsed.ast,'stage92',{surface,components:registry});
assert(compiled.ir !== undefined,compiled.diagnostics.map(d=>d.message).join('; '));
assert(!compiled.diagnostics.some(d=>d.severity==='error'),compiled.diagnostics.map(d=>d.message).join('; '));
assert(compiled.ir!.entry.instructions.some((ins:any)=>ins.componentId==='regime:v2'),'component identity was not retained in canonical IR');
assert(compiled.ir!.graphs?.semantic.nodes.some((node:any)=>node.componentId==='regime:v2'),'component identity was not retained in semantic graph');

assert(CORE_SPIRIT_LIBRARY_ROOT_NAMESPACES.length===14,'standard library namespace count changed unexpectedly');
assert(getCoreSpiritLibraryEntry('stats','median')?.canonicalBuiltin==='median','stats.median did not map to canonical median');
assert(getCoreSpiritLibraryEntry('volatility','expansion')?.status==='component','volatility.expansion should be component-backed');
assert(resolveCoreSpiritLibraryCall('math','abs')?.builtin?.name==='abs','math.abs did not resolve to abs');
const namespaceCompletions = getCoreSpiritCompletions('exp',{mode:'member',prefix:'exp',cursor:source.length},'volatility.exp');
assert(namespaceCompletions.some(item=>item.label==='expansion'),'namespace member completion did not expose volatility.expansion');

const namespaceSource = [
  'let fast = series.ema(close, 20)',
  'let spread = math.abs(fast)',
  'let dispersion = stats.stdev(close, 20)',
  'let anchor = market.vwap()',
  'let p = probability.sigmoid(spread)',
  'show visual.show(p)',
].join('
');
const namespaceParsed = new CoreSpiritParser(normalizeCoreSpiritSource(namespaceSource)).parseDetailed();
assert(namespaceParsed.diagnostics.length===0,namespaceParsed.diagnostics.map(d=>d.message).join('; '));
const namespaceSurface = describeCoreSpiritSurface(namespaceSource,{components:registry});
const namespaceCompiled = compiler.compile(namespaceParsed.ast,'stage92-namespaces',{surface:namespaceSurface,components:registry});
assert(namespaceCompiled.ir !== undefined,namespaceCompiled.diagnostics.map(d=>d.message).join('; '));
const calls = namespaceCompiled.ir!.entry.instructions.filter((ins:any)=>ins.op==='call').map((ins:any)=>ins.name);
for (const expected of ['ema','abs','stdev','vwap','sigmoid','show']) assert(calls.includes(expected),`namespaced call did not lower to canonical builtin '${expected}'`);

const modelContract = coreSpiritModelManifestToComponentContract({
  abiVersion:1,modelId:'Regime',version:'3.0.0',backend:'wasm',state:'stateless',deterministic:true,
  inputNames:['price','volatility','structure'],
  outputNames:['trendProbability','rangeProbability','noiseProbability'],
  maxMemoryBytes:1024*1024,maxSteps:100000,capabilities:['read-series','read-features','write-output'],
});
assert(modelContract.kind==='model','model adapter should create a model component');
assert(modelContract.inputs.length===3&&modelContract.outputs.length===3,'model ABI ports were not projected');
assert(modelContract.execution?.eligibleBackends.includes('wasm')===true,'model backend eligibility did not survive semantic projection');
registry.register(modelContract, ({args}) => ({trendProbability:Number(args[0] ?? 0),rangeProbability:0.1,noiseProbability:0.1}));

const profile = buildCoreSpiritComplexityProfile(source,compiled.ir,{components:registry});
assert(profile.surfaceConceptCount===6,'complexity absorber changed the source concept count');
assert(profile.componentNodeCount>0,'complexity absorber did not observe component nodes');
assert(profile.layers.includes('model-abi')&&profile.layers.includes('backend'),'complexity absorber lost hidden model/backend layers');
assert(validateCoreSpiritComplexityProfile(profile).length===0,'complexity absorber profile validation failed');

console.log('STAGE92_CORESPIRIT_DEEP_COMPOSITION_OK');
console.log('STAGE92_CORESPIRIT_NAMESPACE_LIBRARY_OK');
console.log('STAGE92_CORESPIRIT_COMPLEXITY_ABSORBER_OK');
