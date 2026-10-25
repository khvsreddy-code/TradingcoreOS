import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CoreSpiritExecutionVM } from './executionVM.ts';
import { CoreSpiritOptimizedExecutionVM } from './optimizedExecutionVM.ts';
import { CoreSpiritOutputCollector } from './outputCollector.ts';
import { CoreSpiritComponentRegistry } from './coreSpiritComponents.ts';
import { coreSpiritComponentRegistry } from './coreSpiritComponents.ts';
import { CoreSpiritRuntime } from './runtime.ts';
import { CORE_SPIRIT_COMPILER_VERSION } from './VERSION.ts';
import { buildCoreSpiritSpecializedPlan } from './specializedPlan.ts';

const instructions = [
  { op:'const', dest:'t0', value:2 },
  { op:'loadSeries', dest:'t1', name:'close', offset:0 },
  { op:'binary', dest:'t2', operator:'+', left:'t1', right:'t0' },
  { op:'setLocal', name:'x', source:'t2', series:true },
  { op:'emit', kind:'plot', args:['t2'], outputId:'plot:fast' },
];

function run(executor) {
  const output = new CoreSpiritOutputCollector(32);
  const state = { locals:{} };
  executor.run(instructions, 0, {
    maxStepsPerBar:100,
    throwIfAborted(){},
    loadSeries(){ return 10; },
    moveLocal(name){ return state.locals[name]; },
    setLocal(name,value){ state.locals[name]=value; },
    unary(op,value){ return op==='-' ? -Number(value) : value; },
    binary(op,left,right){ return op==='+' ? Number(left)+Number(right) : null; },
    tryFused(){ return false; },
    call(){ return null; },
    loadIndexed(){ return null; },
    truthy(value){ return !!value; },
    emit(ins,values,out){ out.push({kind:'series',time:1,value:Number(values.get(ins.args[0])),seriesId:'contract'}); },
  }, output);
  return { output:output.values().map(x => ({...x})), locals:{...state.locals} };
}

const reference=run(new CoreSpiritExecutionVM());
const optimized=run(new CoreSpiritOptimizedExecutionVM());
assert.deepEqual(optimized, reference);
console.log('CORESPIRIT_OPTIMIZED_EXECUTION_CONTRACT_OK');

// Deterministic property-style differential coverage over reassignment, state, null,
// NaN/Infinity, arithmetic edge cases and observable output ordering.
function runGenerated(executor, instructions, seed) {
  const output = new CoreSpiritOutputCollector(128);
  const state = { locals:{}, states:{} };
  const host = {
    maxStepsPerBar:256, throwIfAborted(){},
    loadSeries(name,offset){ const xs=[null,0,1,-2,Number.NaN,Number.POSITIVE_INFINITY]; return name==='close' ? (xs[(seed+offset+6)%xs.length] ?? null) : null; },
    moveLocal(name){return state.locals[name];}, loadState(name){return state.states[name] ?? null;},
    setState(name,value){state.states[name]=value;}, setLocal(name,value){state.locals[name]=value;},
    unary(op,value){if(op==='!')return !value;if(op==='-')return -Number(value);return Number(value);},
    binary(op,left,right){if(op==='+')return Number(left)+Number(right);if(op==='-')return Number(left)-Number(right);if(op==='*')return Number(left)*Number(right);if(op==='/')return Number(right)===0?Number.NaN:Number(left)/Number(right);if(op==='==')return left===right;return null;},
    tryFused(){return false;}, call(){return null;},
    loadIndexed(ins,index){if(index>3)throw new Error('historical data unavailable');return index===0?null:index===1?Number.NaN:index===2?Number.POSITIVE_INFINITY:7;},
    truthy(value){return !!value;}, eventActive(){return true;},
    emit(ins,values,out){out.push({kind:'series',time:seed,value:values.get(ins.args[0]),seriesId:ins.outputId ?? 'generated'});},
  };
  try { executor.run(instructions,seed,host,output); return {output:output.values().map(x=>({...x})),locals:{...state.locals},states:{...state.states},error:null}; }
  catch(error) { return {output:output.values().map(x=>({...x})),locals:{...state.locals},states:{...state.states},error:String(error?.message ?? error)}; }
}
function normalize(value) {
  return JSON.stringify(value,(_key,item)=>typeof item==='number'&&Number.isNaN(item)?'__NaN__':item===Infinity?'__Infinity__':item===-Infinity?'__-Infinity__':item);
}
let random=0x5eed1234;
function rand(max){random=(Math.imul(random,1664525)+1013904223)>>>0;return random%max;}
for(let sample=0;sample<160;sample++){
  const seed=sample%6;const instructions=[];const count=3+rand(5);
  for(let i=0;i<count;i++){
    const dest='r'+i;const choice=rand(5);
    if(choice===0)instructions.push({op:'loadSeries',dest,name:'close',offset:0});
    else if(choice===1)instructions.push({op:'loadState',dest,name:'prior'});
    else instructions.push({op:'const',dest,value:[null,0,1,-3,Number.NaN,Number.POSITIVE_INFINITY][rand(6)]});
    if(rand(3)===0)instructions.push({op:'setState',name:'prior',source:dest});
    if(rand(2)===0)instructions.push({op:'setLocal',name:'x'+(i%2),source:dest,series:false});
    if(rand(3)===0)instructions.push({op:'binary',dest,operator:['+','-','*','/','=='][rand(5)],left:dest,right:'r'+rand(count)});
    if(rand(4)===0)instructions.push({op:'unary',dest,operator:['-','+','!'][rand(3)],operand:dest});
  }
  instructions.push({op:'emit',kind:'plot',args:['r'+rand(count)],outputId:'generated:'+sample});
  const reference=runGenerated(new CoreSpiritExecutionVM(),instructions,seed);
  const optimized=runGenerated(new CoreSpiritOptimizedExecutionVM(),instructions,seed);
  assert.equal(normalize(optimized),normalize(reference),'reference/optimized VM mismatch in generated sample '+sample);
}
console.log('CORESPIRIT_OPTIMIZED_VM_GENERATED_DIFFERENTIAL_OK');


// Cache revisions must rebuild a specialization even when an upstream caller retains
// the same instruction-array object.
const cacheVm = new CoreSpiritOptimizedExecutionVM();
const mutableInstructions = [
  { op:'const', dest:'cacheValue', value:1 },
  { op:'emit', kind:'plot', args:['cacheValue'], outputId:'cache-version' },
];
function runVersion(versions) {
  const output = new CoreSpiritOutputCollector(8);
  const host = {
    maxStepsPerBar:32, throwIfAborted(){}, loadSeries(){return null;}, moveLocal(){return null;},
    loadState(){return null;}, setState(){}, setLocal(){}, unary(){return null;}, binary(){return null;},
    tryFused(){return false;}, call(){return null;}, loadIndexed(){return null;}, truthy(value){return !!value;},
    eventActive(){return true;}, emit(ins,values,out){out.push({kind:'series',time:1,value:values.get(ins.args[0]),seriesId:'cache'});},
  };
  cacheVm.run(mutableInstructions,0,host,output,versions);
  return output.values().at(-1)?.value;
}
assert.equal(runVersion({compilerVersion:'compiler-a'}),1);
mutableInstructions[0].value=2;
assert.equal(runVersion({compilerVersion:'compiler-b'}),2,'compiler-version change invalidates cached slots');
mutableInstructions[0].value=3;
assert.equal(runVersion({componentDefinitionVersion:'component-b'}),3,'component-definition change invalidates cached slots');
mutableInstructions[0].value=4;
assert.equal(runVersion({executionConfigurationVersion:'config-b'}),4,'execution-configuration change invalidates cached slots');

// Re-entrant calls on the same VM/plan must never overwrite the outer register file.
const reentrantVm = new CoreSpiritOptimizedExecutionVM();
const reentrantInstructions = [
  {op:'loadSeries',dest:'price',name:'close',offset:0},
  {op:'call',dest:'sentinel',name:'reenter',args:[],componentPure:false,componentStateful:true,componentDeterministic:true},
  {op:'binary',dest:'answer',operator:'+',left:'price',right:'sentinel'},
  {op:'emit',kind:'plot',args:['answer'],outputId:'reentrant'},
];
const reentrantState = { depth:false, nested:undefined };
function makeHost(output) {
  return {
    maxStepsPerBar:64,throwIfAborted(){},loadSeries(){return reentrantState.depth?20:10;},moveLocal(){return null;},
    loadState(){return null;},setState(){},setLocal(){},unary(){return null;},
    binary(op,left,right){return op==='+'?Number(left)+Number(right):null;},
    tryFused(){return false;},
    call(){if(!reentrantState.depth){reentrantState.depth=true;try{
      const nested=new CoreSpiritOutputCollector(8);
      reentrantVm.run(reentrantInstructions,0,makeHost(nested),nested,{reuseValues:true,executionContextKey:reentrantState});
      reentrantState.nested=nested.values().at(-1)?.value;
    }finally{reentrantState.depth=false;}}return 1;},
    loadIndexed(){return null;},truthy(value){return !!value;},eventActive(){return true;},
    emit(ins,values,out){out.push({kind:'series',time:1,value:values.get(ins.args[0]),seriesId:'reentrant'});},
  };
}
const reentrantOutput=new CoreSpiritOutputCollector(8);
reentrantVm.run(reentrantInstructions,0,makeHost(reentrantOutput),reentrantOutput,{reuseValues:true,executionContextKey:reentrantState});
assert.equal(reentrantState.nested,21,'nested invocation executes in its own register file');
assert.equal(reentrantOutput.values().at(-1)?.value,11,'nested invocation preserves the outer register values');

// Incremental reusable values are isolated per execution context, not shared by symbol/model.
const isolatedVm = new CoreSpiritOptimizedExecutionVM();
const isolatedInstructions = [
  {op:'loadSeries',dest:'price',name:'close',offset:0},
  {op:'const',dest:'one',value:1},
  {op:'binary',dest:'next',operator:'+',left:'price',right:'one'},
  {op:'emit',kind:'plot',args:['next'],outputId:'context-isolation'},
];
function runContext(key, price, dirtyInstructions) {
  const output = new CoreSpiritOutputCollector(8);
  const host = {
    maxStepsPerBar:32,throwIfAborted(){},loadSeries(){return price;},moveLocal(){return null;},
    loadState(){return null;},setState(){},setLocal(){},unary(){return null;},binary(op,a,b){return op==='+'?Number(a)+Number(b):null;},
    tryFused(){return false;},call(){return null;},loadIndexed(){return null;},truthy(value){return !!value;},eventActive(){return true;},
    emit(ins,values,out){out.push({kind:'series',time:1,value:values.get(ins.args[0]),seriesId:String(key)});},
  };
  isolatedVm.run(isolatedInstructions,0,host,output,{reuseValues:true,executionContextKey:key,dirtyInstructions});
  return output.values().at(-1)?.value;
}
const contextA={}, contextB={};
assert.equal(runContext(contextA,10),11);
assert.equal(runContext(contextB,20),21);
const recomputeDerived = new Set([1,2,3]);
assert.equal(runContext(contextA,999,recomputeDerived),11,'context A retains its own source register on a derived-only update');
assert.equal(runContext(contextB,999,recomputeDerived),21,'context B retains its own source register on a derived-only update');
// A same-shape plan compiled from an earlier IR revision must be rejected and
// executed with the reference VM instead of silently reusing stale constants.
const staleSource = [
  { op:'const', dest:'safe', value:9 },
  { op:'emit', kind:'plot', args:['safe'], outputId:'stale-plan' },
];
const stalePlan = buildCoreSpiritSpecializedPlan(staleSource);
const revisedSource = [{ ...staleSource[0], value:10 }, staleSource[1]];
const staleOutput = new CoreSpiritOutputCollector(8);
const staleHost = {
  maxStepsPerBar:32,throwIfAborted(){},loadSeries(){return null;},moveLocal(){return null;},
  loadState(){return null;},setState(){},setLocal(){},unary(){return null;},binary(){return null;},
  tryFused(){return false;},call(){return null;},loadIndexed(){return null;},truthy(value){return !!value;},eventActive(){return true;},
  emit(ins,values,out){out.push({kind:'series',time:1,value:values.get(ins.args[0]),seriesId:'stale-plan'});},
};
new CoreSpiritOptimizedExecutionVM().run(revisedSource,0,staleHost,staleOutput,{specializedPlan:stalePlan,compilerVersion:'new-compiler'});
assert.equal(staleOutput.values().at(-1)?.value,10,
  'invalid/stale specialized plans must fall back to the reference VM');

// Changing a cache version invalidates a supplied plan from an earlier compiler/component revision.
const versionedPlanVm = new CoreSpiritOptimizedExecutionVM();
const versionedSource = [
  {op:'const',dest:'versionedValue',value:12},
  {op:'emit',kind:'plot',args:['versionedValue'],outputId:'versioned-plan'},
];
const suppliedPlan = buildCoreSpiritSpecializedPlan(versionedSource);
function runSuppliedPlan(versions, source) {
  const output = new CoreSpiritOutputCollector(8);
  const host = {
    maxStepsPerBar:32,throwIfAborted(){},loadSeries(){return null;},moveLocal(){return null;},
    loadState(){return null;},setState(){},setLocal(){},unary(){return null;},binary(){return null;},
    tryFused(){return false;},call(){return null;},loadIndexed(){return null;},truthy(value){return !!value;},eventActive(){return true;},
    emit(ins,values,out){out.push({kind:'series',time:1,value:values.get(ins.args[0]),seriesId:'versioned-plan'});},
  };
  versionedPlanVm.run(source,0,host,output,{specializedPlan:suppliedPlan,...versions});
  return output.values().at(-1)?.value;
}
assert.equal(runSuppliedPlan({compilerVersion:'compiler-1'},versionedSource),12);
versionedSource[0].value=15;
assert.equal(runSuppliedPlan({compilerVersion:'compiler-2'},versionedSource),15,
  'a supplied specialized plan must not survive a compiler-version change');
versionedSource[0].value=18;
assert.equal(runSuppliedPlan({componentDefinitionVersion:'component-v2'},versionedSource),18,
  'a supplied specialized plan must not survive a component-definition version change');
versionedSource[0].value=21;
assert.equal(runSuppliedPlan({executionConfigurationVersion:'research-deterministic-v2'},versionedSource),21,
  'a supplied specialized plan must not survive an execution-configuration version change');

console.log('CORESPIRIT_OPTIMIZED_VM_CACHE_AND_CONTEXT_CONTRACT_OK');


// Component registry mutations carry their own monotonic cache invalidation token.
const revisionRegistry = new CoreSpiritComponentRegistry();
const revisionBase = revisionRegistry.definitionVersion;
const componentContract = (id, name) => ({
  version: 1,
  id,
  name,
  kind: 'component',
  inputs: [],
  outputs: [{ name: 'value', type: { kind: 'scalar' }, required: true }],
  nodeIds: ['node:' + id],
  dependencies: [],
  deterministic: true,
  stateful: false,
  capabilities: [],
});
revisionRegistry.register(componentContract('cache-component-v1', 'cacheComponent'));
assert.equal(revisionRegistry.definitionVersion, revisionBase + 1,
  'registering a component must invalidate lowered VM plans');
assert.equal(revisionRegistry.unregister('cache-component-v1'), true);
assert.equal(revisionRegistry.definitionVersion, revisionBase + 2,
  'unregistering a component must invalidate lowered VM plans');
revisionRegistry.register(componentContract('cache-component-v2', 'cacheComponentV2'));
const registeredRevision = revisionRegistry.definitionVersion;
revisionRegistry.clear();
assert.equal(revisionRegistry.definitionVersion, registeredRevision + 1,
  'clearing component definitions must invalidate lowered VM plans');

console.log('CORESPIRIT_COMPONENT_REGISTRY_DEFINITION_VERSION_OK');


// Verify the production CoreSpiritRuntime passes the cache-version tuple into
// every optimized run, and reflects live component-registry revisions.
const cacheRuntime = new CoreSpiritRuntime({
  executionTarget: 'chart',
  executionTier: 'optimized',
  executionMode: 'historical',
  maxStepsPerBar: 128,
});
const cacheIr = {
  version: 1,
  sourceId: 'runtime-cache-version-integration',
  entry: { instructions: [{ op: 'const', dest: 'value', value: 7 }] },
  locals: [],
  maxLookback: 0,
  diagnostics: [],
  sourceMap: { version: 1, sourceId: 'runtime-cache-version-integration', entries: [] },
};
const runtimeVm = cacheRuntime.optimizedExecutionVm;
const executeOptimized = runtimeVm.run.bind(runtimeVm);
let capturedRuntimeCacheOptions;
runtimeVm.run = (...args) => {
  capturedRuntimeCacheOptions = args[4];
  return executeOptimized(...args);
};
cacheRuntime.executeIr(cacheIr, [{
  timestamp: 1_700_000_000_000,
  open: 1, high: 2, low: 0, close: 1, volume: 10,
}]);
assert.ok(capturedRuntimeCacheOptions.compilerVersion.includes(CORE_SPIRIT_COMPILER_VERSION));
assert.ok(capturedRuntimeCacheOptions.componentDefinitionVersion.length > 0);
assert.ok(capturedRuntimeCacheOptions.executionConfigurationVersion.length > 0);
const beforeRegistryMutation = cacheRuntime.optimizedExecutionCacheVersions();
const runtimeCacheComponent = componentContract('runtime-cache-version-test', 'runtimeCacheVersionTest');
coreSpiritComponentRegistry.register(runtimeCacheComponent);
try {
  const afterRegistryMutation = cacheRuntime.optimizedExecutionCacheVersions();
  assert.notEqual(afterRegistryMutation.componentDefinitionVersion, beforeRegistryMutation.componentDefinitionVersion,
    'the runtime cache key must change when a registered component definition changes');
} finally {
  coreSpiritComponentRegistry.unregister(runtimeCacheComponent.id);
}

console.log('CORESPIRIT_RUNTIME_CACHE_VERSION_INTEGRATION_OK');


// Instruction profiling must attribute both timestamps to the original PC,
// even when an instruction changes the control-flow PC before its finally block.
function profileCase(executor, instructions, overrides = {}, errorPattern) {
  const before = [];
  const after = [];
  const pending = [];
  const output = new CoreSpiritOutputCollector(32);
  const state = { iterations: 0 };
  const host = {
    maxStepsPerBar:5000,
    throwIfAborted(){},
    loadSeries(){return 10;},
    moveLocal(){return null;},
    loadState(){return null;},
    setState(){},
    setLocal(){},
    unary(op,value){return op==='-' ? -Number(value) : value;},
    binary(op,a,b){return op==='+' ? Number(a)+Number(b) : null;},
    tryFused(){return false;},
    call(ins){
      if (ins.name === 'loopCondition') {
        state.iterations += 1;
        return state.iterations < 3;
      }
      return null;
    },
    loadIndexed(){return null;},
    truthy(value){return !!value;},
    eventActive(){return false;},
    emit(ins,values,out){out.push({kind:'series',time:1,value:values.get(ins.args[0]),seriesId:'profile'});},
    profileInstruction: {
      beforeInstruction(pc, ins) { before.push({pc, op:ins.op}); pending.push({pc, op:ins.op}); },
      afterInstruction(pc, ins) {
        const start = pending.pop();
        assert.ok(start, 'afterInstruction must have a matching beforeInstruction');
        assert.equal(pc, start.pc, 'before/after profiling must retain the dispatched instruction PC');
        assert.equal(ins.op, start.op, 'before/after profiling must retain instruction identity');
        after.push({pc, op:ins.op});
      },
    },
    ...overrides,
  };
  let thrown;
  try { executor.run(instructions, 0, host, output); } catch (error) { thrown = error; }
  assert.equal(pending.length, 0, 'errors and aborts must close every entered instruction profile');
  assert.deepEqual(after, before, 'each instruction must be profiled at its own unchanged PC');
  if (errorPattern) assert.match(String(thrown?.message ?? thrown), errorPattern);
  else assert.equal(thrown, undefined, 'unexpected VM exception in profiling fixture');
  return { before, output:output.values() };
}
const profileExecutors = [new CoreSpiritExecutionVM(), new CoreSpiritOptimizedExecutionVM()];
for (const executor of profileExecutors) {
  profileCase(executor, [
    {op:'const',dest:'left',value:2},
    {op:'const',dest:'right',value:3},
    {op:'binary',dest:'sum',operator:'+',left:'left',right:'right'},
    {op:'emit',kind:'plot',args:['sum'],outputId:'profile-sequential'},
  ]);

  const conditional = profileCase(executor, [
    {op:'const',dest:'condition',value:false},
    {op:'jumpIfFalse',condition:'condition',target:3},
    {op:'const',dest:'unreachable',value:1},
    {op:'emit',kind:'plot',args:['condition'],outputId:'profile-conditional'},
  ]);
  assert.deepEqual(conditional.before.map(item=>item.pc), [0,1,3],
    'conditional-jump profiler should record only executed instructions at their original PCs');

  const gated = profileCase(executor, [
    {op:'eventGate',eventName:'market.tick',target:2},
    {op:'const',dest:'unreachable',value:1},
    {op:'emit',kind:'plot',args:['unreachable'],outputId:'profile-gate'},
  ]);
  assert.deepEqual(gated.before.map(item=>item.pc), [0,2],
    'event gates must be attributed to their source instruction rather than their jump target');

  const looped = profileCase(executor, [
    {op:'call',dest:'condition',name:'loopCondition',args:[],componentPure:false,componentStateful:true,componentDeterministic:false},
    {op:'jumpIfFalse',condition:'condition',target:3},
    {op:'jump',target:0},
    {op:'emit',kind:'plot',args:['condition'],outputId:'profile-loop'},
  ]);
  assert.deepEqual(looped.before.map(item=>item.pc), [0,1,2,0,1,2,0,1,3],
    'loop iterations must preserve per-instruction profile attribution');

  profileCase(executor, [
    {op:'const',dest:'left',value:2},
    {op:'binary',dest:'failure',operator:'+',left:'left',right:'left'},
    {op:'emit',kind:'plot',args:['failure'],outputId:'profile-error'},
  ], { binary(){ throw new Error('profile fixture failure'); } }, /profile fixture failure/);

  profileCase(executor, [
    {op:'const',dest:'loop',value:1},
    {op:'jump',target:0},
  ], { throwIfAborted(){ throw new Error('profile fixture aborted'); } }, /profile fixture aborted/);
}
console.log('CORESPIRIT_INSTRUCTION_PROFILE_PC_CONTRACT_OK');


// Dirty execution on a new/unprimed context must perform a full run rather
// than read empty or stale slots. Once primed, source invalidation is propagated
// through every dependent register consumer even if the caller under-specifies it.
const unprimedContext = {};
assert.equal(runContext(unprimedContext,999,new Set([1,2,3])),1000,
  'dirty execution without a valid prior register store must fall back to a full calculation');
assert.equal(runContext(contextA,999,new Set([0])),1000,
  'a dirty source register must invalidate transitive derived registers automatically');
console.log('CORESPIRIT_DIRTY_REGISTER_VALIDITY_AND_DEPENDENCY_CLOSURE_OK');

// Reusable registers from one conditional arm must never leak into the other
// arm when a forming-bar input flips the branch decision.
const branchVm = new CoreSpiritOptimizedExecutionVM();
const branchContext = {};
const branchInstructions = [
  {op:'loadSeries',dest:'condition',name:'close',offset:0},
  {op:'jumpIfFalse',condition:'condition',target:4},
  {op:'const',dest:'answer',value:5},
  {op:'jump',target:5},
  {op:'const',dest:'answer',value:9},
  {op:'emit',kind:'plot',args:['answer'],outputId:'dirty-branch'},
];
function runBranch(close, dirtyInstructions) {
  const output = new CoreSpiritOutputCollector(8);
  const host = {
    maxStepsPerBar:32,throwIfAborted(){},loadSeries(){return close;},moveLocal(){return null;},
    loadState(){return null;},setState(){},setLocal(){},unary(){return null;},binary(){return null;},
    tryFused(){return false;},call(){return null;},loadIndexed(){return null;},
    truthy(value){return !!value;},eventActive(){return false;},
    emit(ins,values,out){out.push({kind:'series',time:1,value:values.get(ins.args[0]),seriesId:'branch'});},
  };
  branchVm.run(branchInstructions,0,host,output,{
    reuseValues:true,executionContextKey:branchContext,dirtyInstructions,
  });
  return output.values().at(-1)?.value;
}
assert.equal(runBranch(1),5);
assert.equal(runBranch(0,new Set([0])),9,
  'a changed branch predicate must force a safe complete execution');
console.log('CORESPIRIT_DIRTY_CONTROL_FLOW_FALLBACK_OK');

const runtimeSource = readFileSync(new URL('./runtime.ts', import.meta.url), 'utf8');
assert.match(runtimeSource,
  /dirtyInstructions:\s*canIncremental\s*&&\s*dirtyPlan\s*&&\s*dirtyPlan\.instructions\.length > 0\s*\?/,
  'missing or empty dirty graph plans must trigger a full safe run instead of silently reusing stale series registers');
console.log('CORESPIRIT_RUNTIME_DIRTY_PLAN_FALLBACK_CONTRACT_OK');
