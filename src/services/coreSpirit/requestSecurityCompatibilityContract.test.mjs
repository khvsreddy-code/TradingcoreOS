import assert from 'node:assert/strict';
import {CoreSpiritRuntime} from './runtime.ts';
import {makeCoreSpiritProgram} from './coreSpiritPipeline.ts';
const source=[
  'indicator("Pine request surface") {',
  '  overlay: false',
  '}',
  'let htfClose = request.security("NSE:NIFTY50-INDEX", "15m", "close")',
  'let ltfCloses = request.security_lower_tf("NSE:NIFTY50-INDEX", "1m", "close")',
  'plot(htfClose, "#ffffff", 1, 0, "HTF close")',
  'plot(len(ltfCloses), "#22c55e", 1, 0, "LTF count")',
].join('\n');
const runtime=new CoreSpiritRuntime({
  sourceId:'request-security-contract',symbol:'NSE:NIFTY50-INDEX',timeframe:'5m',executionMode:'historical',
  dataResolver:{
    requestAt:(request,context)=>({value:123.45,source:'contract-fixture',symbol:request.symbol,timeframe:request.timeframe,
      timestamp:context.asOfTimestamp-900000,closeTimestamp:context.asOfTimestamp-1,state:'confirmed',confirmationPhase:'confirmed'}),
    lowerTimeframe:(timeframe,field,symbol)=>[100,101,102],
  },
});
const outputs=runtime.execute(makeCoreSpiritProgram(source,'request-security-contract'),[
  {timestamp:'2026-01-01T09:15:00Z',open:100,high:102,low:99,close:101,volume:1000},
  {timestamp:'2026-01-01T09:20:00Z',open:101,high:103,low:100,close:102,volume:1200},
]);
const htf=outputs.filter(x=>x.kind==='series'&&x.style?.title==='HTF close');
const ltf=outputs.filter(x=>x.kind==='series'&&x.style?.title==='LTF count');
assert.equal(htf.length,2);assert.ok(htf.every(x=>x.value===123.45));
assert.equal(ltf.length,2);assert.ok(ltf.every(x=>x.value===3));
console.log('CORESPIRIT_REQUEST_SECURITY_LOWER_TF_ARRAY_CONTRACT_OK');