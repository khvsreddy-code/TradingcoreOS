import assert from 'node:assert/strict';
import { buildCoreSpiritResearchFeatures } from './researchFeatures.ts';

const rows=64;
const timestampsMs=Float64Array.from({length:rows},(_,i)=>1_700_000_000_000+i*300_000);
const close=Float64Array.from({length:rows},(_,i)=>100+i*0.25+Math.sin(i/4));
const open=Float64Array.from({length:rows},(_,i)=>close[i]!-0.1);
const high=Float64Array.from({length:rows},(_,i)=>Math.max(open[i]!,close[i]!)+0.5);
const low=Float64Array.from({length:rows},(_,i)=>Math.min(open[i]!,close[i]!)-0.5);
const volume=Float64Array.from({length:rows},(_,i)=>1_000+i*5+(i%3)*20);
const confirmed=new Uint8Array(rows);confirmed.fill(1);
const availableAtMs=Object.fromEntries(['open','high','low','close','volume'].map(field=>[
 field,Float64Array.from({length:rows},(_,i)=>timestampsMs[i]!-1_000),
]));
const input={symbol:'NSE:NIFTY50-INDEX',timeframe:'5m',timestampsMs,confirmed,open,high,low,close,volume,availableAtMs,
 periods:{realizedVolatility:5,atr:5,relativeVolume:5}};
const features=buildCoreSpiritResearchFeatures(input);
assert.equal(features.quality.confirmedOnly,true);
assert.equal(features.quality.featureAvailabilityVerified,true);
assert.equal(features.featureNames.length,6);
assert.ok(features.features.returns_1[0]!==features.features.returns_1[0],'first return is warm-up NaN, never a fabricated zero');
assert.ok(Number.isFinite(features.features.returns_1[1]));
assert.ok(Number.isFinite(features.features.realized_volatility_5[5]));
assert.ok(Number.isFinite(features.features.normalized_atr_5[5]));
assert.ok(Number.isFinite(features.features.relative_volume_5[5]));
assert.ok(features.quality.usableRows>0);
assert.equal(features.pointInTimeSchema.availabilityRule,'availableAt<=timestamp');
for(const name of features.featureNames){
 const column=features.features[name],availability=features.availabilityMsByFeature[name];
 for(let i=0;i<rows;i++){
  if(Number.isFinite(column[i]!)){
   assert.ok(Number.isSafeInteger(availability[i]!));
   assert.ok(availability[i]!<=timestampsMs[i]!,'feature availability must not exceed the decision timestamp');
  }
 }
}
assert.deepEqual([...close],Array.from(input.close),'feature engineering must not mutate market data');

const leakedAvailability={...availableAtMs,close:Float64Array.from(availableAtMs.close,(value,index)=>index===20?timestampsMs[index]!+1:value)};
assert.throws(()=>buildCoreSpiritResearchFeatures({...input,availableAtMs:leakedAvailability}),/unavailable at its decision timestamp/);
const developing=Uint8Array.from(confirmed);developing[30]=0;
assert.throws(()=>buildCoreSpiritResearchFeatures({...input,confirmed:developing}),/confirmed bars only/);
const malformedHigh=Float64Array.from(high);malformedHigh[10]=low[10]!-1;
assert.throws(()=>buildCoreSpiritResearchFeatures({...input,high:malformedHigh}),/market candle invariants/);
assert.throws(()=>buildCoreSpiritResearchFeatures({...input,periods:{realizedVolatility:1}}),/between 2 and 500/);

console.log('CORESPIRIT_POINT_IN_TIME_RESEARCH_FEATURES_OK');
