import assert from 'node:assert/strict';
import {CORE_SPIRIT_BUILTIN_MANIFEST,validateCoreSpiritBuiltinManifest} from './coreSpiritBuiltinManifest.ts';
assert.deepEqual(validateCoreSpiritBuiltinManifest(),[]);
const names=CORE_SPIRIT_BUILTIN_MANIFEST.map(x=>x.name);
assert.equal(new Set(names).size,names.length,'canonical manifest names must be unique');
for(const item of CORE_SPIRIT_BUILTIN_MANIFEST.filter(x=>x.status==='executable')){
 assert.equal(item.runtimeRegistered,true,item.name+' must have runtime registration');
 assert.ok(item.maxArgs>=item.minArgs,item.name+' must have valid arity');
}
assert.ok(CORE_SPIRIT_BUILTIN_MANIFEST.some(x=>x.name==='ta.sma'));
assert.ok(CORE_SPIRIT_BUILTIN_MANIFEST.some(x=>x.name==='pine.v6.request.security'));
assert.ok(CORE_SPIRIT_BUILTIN_MANIFEST.some(x=>x.name==='math.abs'));
console.log('CORESPIRIT_BUILTIN_MANIFEST_OK');
