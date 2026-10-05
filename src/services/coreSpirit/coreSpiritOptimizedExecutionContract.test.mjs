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