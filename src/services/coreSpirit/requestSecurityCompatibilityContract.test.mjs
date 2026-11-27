import assert from 'node:assert/strict';
import {CoreSpiritRuntime} from './runtime.ts';
import {makeCoreSpiritProgram} from './coreSpiritPipeline.ts';
import {coreSpiritIntrabarsForParent,coreSpiritTimeframeDurationMs,classifyRequestRepaint,classifyMarketDataFreshness} from './requestExecutionEngine.ts';
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
assert.equal(coreSpiritTimeframeDurationMs('5m'),300000);
assert.equal(coreSpiritTimeframeDurationMs('1'),60000);
assert.deepEqual(coreSpiritIntrabarsForParent([{timestamp:1000,close:1},{timestamp:2000,close:2},{timestamp:301000,close:3}],1000,'5m').map(x=>x.close),[1,2]);
assert.equal(classifyRequestRepaint({lookahead:'off',confirmed:true,realtime:false,available:true,gaps:'off'}),'non-repainting-confirmed');
assert.equal(classifyRequestRepaint({lookahead:'on',confirmed:false,realtime:false,available:true,gaps:'off'}),'historical-lookahead-risk');
assert.equal(classifyRequestRepaint({lookahead:'off',confirmed:false,realtime:true,available:true,gaps:'on'}),'realtime-developing');
assert.equal(classifyRequestRepaint({lookahead:'off',confirmed:false,realtime:false,available:false,gaps:'on'}),'host-data-limited');
assert.equal(classifyMarketDataFreshness({provider:'FYERS',receivedAt:1000,sourceTimestamp:900,now:1000,liveMaxAgeMs:500}).status,'live');
assert.equal(classifyMarketDataFreshness({provider:'Investiny',receivedAt:5000,sourceTimestamp:1000,now:5000,liveMaxAgeMs:500,delayedAfterMs:10000}).status,'delayed');
assert.equal(classifyMarketDataFreshness({provider:'FYERS',receivedAt:50000,sourceTimestamp:1000,now:50000,liveMaxAgeMs:500,delayedAfterMs:10000}).status,'stale');
