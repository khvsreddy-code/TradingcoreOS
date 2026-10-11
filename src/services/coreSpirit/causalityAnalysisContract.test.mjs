import assert from 'node:assert/strict';
import { CoreSpiritParser } from './parser.ts';
import { analyzeCoreSpiritCausality } from './causalityAnalysis.ts';

const analyze=source=>{
  const ast=new CoreSpiritParser(source).parse();
  return analyzeCoreSpiritCausality(ast);
};

const permissive=analyze('let daily = timeframe("15m")\nplot(daily.close)');
assert.equal(permissive.strictCausality,false);
assert(permissive.diagnostics.some(d=>d.code==='CAUSALITY_UNQUALIFIED_MTF'&&d.severity==='warning'),
  'unqualified secondary timeframes should produce an actionable warning without blocking casual workflows');

const strict=analyze('@strictCausality\nlet daily = timeframe("15m")\nplot(daily.close)');
assert.equal(strict.strictCausality,true);
assert(strict.diagnostics.some(d=>d.code==='CAUSALITY_UNQUALIFIED_MTF'&&d.severity==='error'),
  '@strictCausality should promote an unqualified timeframe dependency to an error');

const confirmed=analyze('let daily = timeframe("15m").confirmed()\nplot(daily.close)');
assert.equal(confirmed.diagnostics.some(d=>d.code==='CAUSALITY_UNQUALIFIED_MTF'),false,
  'an actual confirmed selector should satisfy the static alignment contract');

const developing=analyze('let daily = timeframe("15m").developing()\nplot(daily.close)');
assert(developing.diagnostics.some(d=>d.code==='CAUSALITY_DEVELOPING_HTF'),
  'developing timeframe dependencies must be explicit in diagnostics');

const implicitRequest=analyze('let htf = request("NIFTY","15m","close")\nplot(htf)');
assert(implicitRequest.diagnostics.some(d=>d.code==='CAUSALITY_UNQUALIFIED_REQUEST'&&d.severity==='warning'),
  'direct request calls must make their causal alignment explicit');

const confirmedRequest=analyze('let htf = request("NIFTY","15m","close",0,"confirmed")\nplot(htf)');
assert.equal(confirmedRequest.diagnostics.some(d=>d.code==='CAUSALITY_UNQUALIFIED_REQUEST'),false,
  'explicitly confirmed direct requests should satisfy the alignment contract');

const developingRequest=analyze('let htf = request("NIFTY","15m","close",0,"developing")\nplot(htf)');
assert(developingRequest.diagnostics.some(d=>d.code==='CAUSALITY_DEVELOPING_REQUEST'&&d.severity==='warning'),
  'developing direct requests must emit a temporal warning');

const strictDevelopingRequest=analyze('@strictCausality\nlet htf = request("NIFTY","15m","close",0,"developing")\nplot(htf)');
assert(strictDevelopingRequest.diagnostics.some(d=>d.code==='CAUSALITY_DEVELOPING_REQUEST'&&d.severity==='error'),
  'strict causality must reject developing direct requests');

const future=analyze('let leaked = close[-1]\nplot(leaked)');
assert(future.diagnostics.some(d=>d.code==='CAUSALITY_FUTURE_INDEX'&&d.severity==='error'),
  'future-bar indexing must be rejected independent of strict mode');

const annotationOnly=analyze('@confirmed\nlet daily = timeframe("15m")\nplot(daily.close)');
assert(annotationOnly.diagnostics.some(d=>d.code==='CAUSALITY_UNQUALIFIED_MTF'),
  'an annotation must not pretend to change runtime alignment');

const strictDeveloping=analyze('@strictCausality\nlet daily = timeframe("15m").developing()\nplot(daily.close)');
assert(strictDeveloping.diagnostics.some(d=>d.code==='CAUSALITY_DEVELOPING_HTF'&&d.severity==='error'),
  'strict causality must reject developing higher-timeframe inputs');

assert(implicitRequest.dependencies.some(d=>d.kind==='timeframe'&&d.label.includes('15m')),
  'causality reports must preserve request dependency labels');

console.log('CORESPIRIT_CAUSALITY_ANALYSIS_OK');
