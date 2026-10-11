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

const future=analyze('let leaked = close[-1]\nplot(leaked)');
assert(future.diagnostics.some(d=>d.code==='CAUSALITY_FUTURE_INDEX'&&d.severity==='error'),
  'future-bar indexing must be rejected independent of strict mode');

const annotationOnly=analyze('@confirmed\nlet daily = timeframe("15m")\nplot(daily.close)');
assert(annotationOnly.diagnostics.some(d=>d.code==='CAUSALITY_UNQUALIFIED_MTF'),
  'an annotation must not pretend to change runtime alignment');

const strictDeveloping=analyze('@strictCausality\nlet daily = timeframe("15m").developing()\nplot(daily.close)');
assert(strictDeveloping.diagnostics.some(d=>d.code==='CAUSALITY_DEVELOPING_HTF'&&d.severity==='error'),
  'strict causality must reject developing higher-timeframe inputs');

console.log('CORESPIRIT_CAUSALITY_ANALYSIS_OK');
