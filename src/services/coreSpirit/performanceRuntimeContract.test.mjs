import assert from 'node:assert/strict';
import {CoreSpiritIncrementalGraph,CoreSpiritBoundedCache,CoreSpiritRuntimeProfiler} from './performanceRuntime.ts';
const graph=new CoreSpiritIncrementalGraph();graph.replace([{id:'price',dependencies:[]},{id:'ema',dependencies:['price']},{id:'rsi',dependencies:['price']},{id:'signal',dependencies:['ema','rsi']},{id:'unrelated',dependencies:[]}]);
const plan=graph.plan(['price'],new Set(['unrelated']));assert.deepEqual(new Set(plan.order),new Set(['price','ema','rsi','signal']));assert.deepEqual(plan.reused,['unrelated']);
assert.throws(()=>graph.replace([{id:'a',dependencies:['b']},{id:'b',dependencies:['a']}]),/cycle/);
const cache=new CoreSpiritBoundedCache(10);cache.set('a',1,6);cache.set('b',2,4);assert.equal(cache.get('a'),1);cache.set('c',3,5);assert.equal(cache.get('b'),undefined);assert.ok(cache.sizeBytes<=10);
const profiler=new CoreSpiritRuntimeProfiler(2);profiler.record('compile','compute',2,100);profiler.record('worker','worker',4,200);profiler.record('render','render',1,50);assert.equal(profiler.snapshot().samples.length,2);assert.equal(profiler.snapshot().p95Ms,4);
console.log('CORESPIRIT_INCREMENTAL_PERFORMANCE_CONTRACT_OK');