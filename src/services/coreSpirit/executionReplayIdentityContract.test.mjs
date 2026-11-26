import assert from 'node:assert/strict';
import { compileCoreSpirit } from './coreSpiritPipeline.ts';
import { assertDeterministicReplay, replayCoreSpirit } from './replay.ts';
const source=['indicator("Replay identity") {','  overlay: true','}','plot close'].join('\n');
const compiled=compileCoreSpirit(source,'replay-identity-contract',{layer:'script'});
assert.ok(compiled.ir,'fixture must compile to canonical IR');
const bars=[
 {timestamp:'2026-11-25T09:15:00+05:30',open:100,high:102,low:99,close:101,volume:10},
 {timestamp:'2026-11-25T09:20:00+05:30',open:101,high:103,low:100,close:102,volume:12},
];
const dataset={id:'nifty-5m-fixture-v1',symbol:'NSE:NIFTY50-INDEX',timeframe:'5m',source,normalizedSource:source,
 dataVersion:'fixture-bars-v1',eventSequence:['bar:0:confirmed','bar:1:confirmed'],inputConfiguration:{source:'close'},
 runtimeConfiguration:{timezone:'Asia/Kolkata',executionTier:'reference'},modelArtifactVersion:'none',bars};
const {first,second}=assertDeterministicReplay(compiled.ir,dataset);
assert.equal(first.executionIdentityChecksum,second.executionIdentityChecksum);
assert.ok(first.executionIdentity.sourceHash,'replay identity must carry a source hash');
assert.equal(first.executionIdentity.dataVersion,'fixture-bars-v1');
assert.equal(first.executionIdentity.modelArtifactVersion,'none');
assert.equal(first.executionIdentity.symbol,'NSE:NIFTY50-INDEX');
const changed=replayCoreSpirit(compiled.ir,{...dataset,dataVersion:'fixture-bars-v2'});
assert.notEqual(first.executionIdentityChecksum,changed.executionIdentityChecksum,'dataset version must participate in replay identity');
console.log('CORESPIRIT_EXECUTION_REPLAY_IDENTITY_OK');