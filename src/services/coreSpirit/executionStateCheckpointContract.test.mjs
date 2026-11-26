import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from './compiler.ts';
import { CoreSpiritRuntime } from './runtime.ts';
const source=['let total: state<float> = 0','total := total + close','plot total'].join('\n');
const compiled=new CoreSpiritCompiler().compileSource(source,'state-checkpoint-contract');
assert.ok(compiled.ir,compiled.diagnostics.map(x=>x.message).join('; '));
const bars=[
 {timestamp:'2026-11-25T09:15:00.000Z',open:10,high:11,low:9,close:10,volume:100},
 {timestamp:'2026-11-25T09:20:00.000Z',open:20,high:21,low:19,close:20,volume:100},
 {timestamp:'2026-11-25T09:25:00.000Z',open:30,high:31,low:29,close:30,volume:100}
];
const original=new CoreSpiritRuntime({sourceId:'state-checkpoint-original'});
original.executeIr(compiled.ir,bars.slice(0,2));
const checkpoint=original.exportCheckpoint();
assert.equal(checkpoint.persistentState.total,30,'checkpoint must include persistent language state');
const resumed=new CoreSpiritRuntime({sourceId:'state-checkpoint-resumed'});
resumed.loadIr(compiled.ir);
assert.equal(resumed.restoreCheckpoint(checkpoint),true,'checkpoint must restore into a fresh runtime');
resumed.executeBar(bars[2],'confirmed');
resumed.confirmRealtimeBar();
const oracle=new CoreSpiritRuntime({sourceId:'state-checkpoint-oracle'});
oracle.executeIr(compiled.ir,bars);
assert.deepEqual(resumed.exportCheckpoint().persistentState,oracle.exportCheckpoint().persistentState,
 'restored persistent state must continue to the same value as clean chronological execution');
console.log('CORESPIRIT_STATE_CHECKPOINT_OK');