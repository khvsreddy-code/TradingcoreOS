import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from '../compiler.ts';
import { CoreSpiritRuntime } from '../runtime.ts';

const source=[
  '//@version=6',
  'indicator("Ternary expression conformance")',
  'float selected = close > open ? close : open',
  'plot(selected)',
].join('\n');
const compiled=new CoreSpiritCompiler().compileSource(source,'pine-ternary-conformance',{frontend:'pine-v6'});
assert.ok(compiled.ir,compiled.diagnostics.map(item=>item.code+': '+item.message).join('\n'));
assert.ok(compiled.ir!.entry.instructions.some(item=>item.op==='jumpIfFalse'),'ternary must lower to explicit conditional control flow');
assert.ok(compiled.ir!.entry.instructions.some(item=>item.op==='jump'),'ternary must skip the inactive branch');

const bars=[
 {timestamp:'2026-11-25T09:15:00.000Z',open:100,high:102,low:99,close:101,volume:100},
 {timestamp:'2026-11-25T09:20:00.000Z',open:102,high:103,low:98,close:99,volume:120},
 {timestamp:'2026-11-25T09:25:00.000Z',open:103,high:106,low:102,close:105,volume:140},
];
const referenceRuntime=new CoreSpiritRuntime({sourceId:'pine-ternary-conformance',executionTier:'reference'});
const optimizedRuntime=new CoreSpiritRuntime({sourceId:'pine-ternary-conformance',executionTier:'optimized'});
const reference=referenceRuntime.executeIr(compiled.ir,bars);
const optimized=optimizedRuntime.executeIr(compiled.ir,bars);
assert.deepEqual(optimized.outputs,reference.outputs,'optimized and reference VM ternary outputs must be identical');
assert.equal(reference.state.locals.selected,105,'ternary true branch must return close when close > open on the final bar');
console.log('CORESPIRIT_PINE_EXPRESSIONS_OK');
