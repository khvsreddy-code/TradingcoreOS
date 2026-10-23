import assert from 'node:assert/strict';
import { CoreSpiritExecutionVM } from './executionVM.ts';
import { CoreSpiritOptimizedExecutionVM } from './optimizedExecutionVM.ts';
import { CoreSpiritOutputCollector } from './outputCollector.ts';

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
