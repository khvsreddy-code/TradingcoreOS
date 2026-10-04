import fs from 'node:fs';
import path from 'node:path';

const root=process.cwd();
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const kernel=read('src/services/coreSpirit/statefulIndicatorKernel.ts');
const vector=read('src/services/coreSpirit/seriesVector.ts');
const scalar=read('src/services/marketData/coreIndicatorKernel.ts');
const engine=read('src/services/marketData/indicatorEngine.ts');

for(const token of ['RollingSum','RollingMean','RollingVariance','RollingMinMax','RollingMedian','RollingPercentile','RollingAbsoluteDeviation','EMAState','WilderState','ATRState','WMAState','VWAPSessionState','RSIState','ChangeState','PersistenceState']){
  if(!kernel.includes('class '+token)) throw new Error('canonical kernel missing '+token);
}
for(const token of ['RollingMean','WMAState','EMAState','WilderState','ATRState','RSIState','VWAPSessionState']){
  if(!scalar.includes(token)) throw new Error('scalar kernel does not delegate '+token);
}
for(const token of ['RollingMean','RollingVariance','RollingMinMax','RollingMedian','RollingSum','WMAState','EMAState','WilderState','ChangeState','PersistenceState']){
  if(!vector.includes(token)) throw new Error('fused executor does not use canonical '+token);
}
for(const forbidden of ['class MonotonicDeque','class RollingState','class CoreSpiritHeap','class CoreSpiritDualHeapMedian','class MedianState','class PersistenceState','class EMAState','class ChangeState']){
  if(vector.includes(forbidden)) throw new Error('duplicate private fused kernel remains: '+forbidden);
}
for(const fn of ['bollinger','donchian','stochastic','cci','mfi']){
  const start=engine.indexOf('export function '+fn);
  const next=engine.indexOf('\\nexport function ',start+10);
  const body=engine.slice(start,next<0?engine.length:next);
  if(/\.slice\(/.test(body)||/\.reduce\(/.test(body)||/Math\.(?:max|min)\(\.\.\./.test(body)) throw new Error('window rescan remains in '+fn);
}
console.log('TRADINGCORE_V131_CANONICAL_INCREMENTAL_KERNEL_CONTRACT_OK');
