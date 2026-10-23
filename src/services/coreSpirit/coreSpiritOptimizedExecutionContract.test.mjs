import assert from 'node:assert/strict';
import { CoreSpiritExecutionVM } from './executionVM.ts';
import { CoreSpiritOptimizedExecutionVM } from './optimizedExecutionVM.ts';
import { CoreSpiritOutputCollector } from './outputCollector.ts';
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
function runSuppliedPlan(version, source) {
  const output = new CoreSpiritOutputCollector(8);
  const host = {
    maxStepsPerBar:32,throwIfAborted(){},loadSeries(){return null;},moveLocal(){return null;},
    loadState(){return null;},setState(){},setLocal(){},unary(){return null;},binary(){return null;},
    tryFused(){return false;},call(){return null;},loadIndexed(){return null;},truthy(value){return !!value;},eventActive(){return true;},
    emit(ins,values,out){out.push({kind:'series',time:1,value:values.get(ins.args[0]),seriesId:'versioned-plan'});},
  };
  versionedPlanVm.run(source,0,host,output,{specializedPlan:suppliedPlan,compilerVersion:version});
  return output.values().at(-1)?.value;
}
assert.equal(runSuppliedPlan('compiler-1',versionedSource),12);
versionedSource[0].value=15;
assert.equal(runSuppliedPlan('compiler-2',versionedSource),15,
  'a supplied specialized plan must not survive a compiler-version change');

console.log('CORESPIRIT_OPTIMIZED_VM_CACHE_AND_CONTEXT_CONTRACT_OK');
