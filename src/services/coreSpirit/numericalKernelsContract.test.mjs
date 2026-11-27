import assert from 'node:assert/strict';
import {
  rollingMean, rollingSum, rollingVariance, rollingStd, rollingMin, rollingMax,
  ema, rma, wma, atr, rsi, linearRegression, correlation, covariance,
  zScore, dotProduct, matrixMultiply, matrixDecomposition, softmax, logSumExp,
  executeCoreSpiritNumericalKernel,
} from './numericalKernels.ts';
import { RollingMean, RollingSum, RollingVariance, RollingMinMax, EMAState, WilderState, WMAState, ATRState, VWMAState, ChangeState } from './statefulIndicatorKernel.ts';
import { CoreSpiritFusedSeriesCursor, executeCoreSpiritFusedSeriesPipeline } from './seriesVector.ts';
import { CoreSpiritParser } from './parser.ts';
import { analyzeCoreSpirit } from './semanticAnalyzer.ts';
import {
  PINE_V6_BUILTIN_NAMESPACE_INVENTORY,
  PINE_V6_BUILTIN_REGISTRY,
  getPineV6BuiltinDefinition,
  validatePineV6BuiltinArguments,
  pineV6BuiltinIsExecutable,
} from './pineBuiltinRegistry.ts';
import { CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES, resolveCoreSpiritLibraryCall } from './standardLibraryNamespaces.ts';
import { executeCoreSpiritPineMathBuiltin } from './pineMathBuiltins.ts';
import { executeCoreSpiritPineStringBuiltin } from './pineStringBuiltins.ts';
import { executeCoreSpiritPineColorBuiltin } from './pineColorBuiltins.ts';
import { CoreSpiritCompiler } from './compiler.ts';

const close = (actual, expected, epsilonOrMessage = 1e-9, message) => {
  const epsilon = typeof epsilonOrMessage === 'number' ? epsilonOrMessage : 1e-9;
  const label = typeof epsilonOrMessage === 'string' ? epsilonOrMessage : message;
  assert.ok(Math.abs(actual - expected) <= epsilon, label ?? `expected ${expected}, received ${actual}`);
};
const values = Float64Array.from([1, 2, 3, 4]);
assert.deepEqual(Array.from(rollingMean(values, 2), Number.isNaN), [true, false, false, false]);
close(rollingMean(values, 2)[1], 1.5);
close(rollingMean(values, 2)[3], 3.5);

const incrementalMean = new RollingMean(3);
assert.equal(incrementalMean.update(1).value, null, 'rolling mean must remain NaN until a full window forms');
assert.equal(incrementalMean.update(2).value, null, 'rolling mean warm-up must require consecutive finite observations');
close(incrementalMean.update(3).value, 2);
assert.equal(incrementalMean.update(Number.NaN).value, null,
  'a missing observation must reset incremental rolling mean instead of carrying a stale window across a gap');
assert.equal(incrementalMean.update(Number.POSITIVE_INFINITY).value, null,
  'non-finite observations must keep the rolling window invalid');
assert.equal(incrementalMean.update(4).value, null, 'a fresh window must warm up after a gap');
assert.equal(incrementalMean.update(5).value, null, 'a fresh window must still require its full period');
close(incrementalMean.update(6).value, 5);
const correctedMean = new RollingMean(3);
correctedMean.update(1); correctedMean.update(2); correctedMean.update(3);
correctedMean.update(Number.NaN);
correctedMean.update(4); correctedMean.update(5);
assert.equal(correctedMean.update(6, 'replace').value, null,
  'a forming-bar replacement must preserve the fresh-window warm-up boundary');

const incrementalSum = new RollingSum(3);
incrementalSum.update(1); incrementalSum.update(2);
assert.equal(incrementalSum.update(3).value, 6);
assert.equal(incrementalSum.update(Number.NaN).value, null,
  'rolling sum must invalidate its window when a market-data gap appears');
incrementalSum.update(4); incrementalSum.update(5);
assert.equal(incrementalSum.update(6).value, 15,
  'rolling sum must recover only after a complete finite post-gap window');

const incrementalVariance = new RollingVariance(3);
incrementalVariance.update(1); incrementalVariance.update(2);
incrementalVariance.update(3);
close(incrementalVariance.variance(), 2 / 3);
assert.equal(incrementalVariance.update(Number.POSITIVE_INFINITY).value, null,
  'rolling variance and standard deviation must reset across non-finite observations');
assert.equal(incrementalVariance.update(4).value, null);
assert.equal(incrementalVariance.update(5).value, null,
  'rolling variance must remain in warm-up until its entire window is finite');
close(incrementalVariance.update(6).value, Math.sqrt(2 / 3));
incrementalVariance.update(7);
close(incrementalVariance.variance(), 2 / 3);

const incrementalExtrema = new RollingMinMax(3);
incrementalExtrema.update(1); incrementalExtrema.update(2);
assert.deepEqual(incrementalExtrema.update(3), { count: 3, min: 1, max: 3 });
assert.deepEqual(incrementalExtrema.update(Number.NaN), { count: 0, min: null, max: null },
  'rolling high/low must invalidate old extrema instead of retaining a stale price window');
incrementalExtrema.update(4); incrementalExtrema.update(5);
assert.deepEqual(incrementalExtrema.update(6), { count: 3, min: 4, max: 6 },
  'rolling high/low must rewarm over consecutive finite prices after a gap');

const incrementalEma = new EMAState(3);
incrementalEma.update(1); incrementalEma.update(2);
assert.equal(incrementalEma.update(3), 2);
assert.equal(incrementalEma.update(Number.NaN), null,
  'EMA must not carry a stale recursive output across a missing input');
incrementalEma.update(4); incrementalEma.update(5);
close(incrementalEma.update(6), 5);

const incrementalRma = new WilderState(3);
incrementalRma.update(1); incrementalRma.update(2);
close(incrementalRma.update(3), 2);
assert.equal(incrementalRma.update(Number.POSITIVE_INFINITY), null,
  'Wilder/RMA must reset its recursive state on non-finite input');
incrementalRma.update(4); incrementalRma.update(5);
close(incrementalRma.update(6), 5);

const incrementalWma = new WMAState(3);
incrementalWma.update(1); incrementalWma.update(2);
close(incrementalWma.update(3), 14 / 6);
assert.equal(incrementalWma.update(Number.NaN), null,
  'WMA must invalidate its rolling state when a missing candle arrives');
incrementalWma.update(4); incrementalWma.update(5);
close(incrementalWma.update(6), 32 / 6);

const incrementalAtr = new ATRState(3);
incrementalAtr.update(10, 8, 9);
incrementalAtr.update(12, 9, 11);
close(incrementalAtr.update(13, 11, 12), 7 / 3);
assert.equal(incrementalAtr.update(Number.NaN, 10, 11), null,
  'ATR must clear its recursive state and previous-close dependency across missing OHLC');
incrementalAtr.update(14, 12, 13);
incrementalAtr.update(15, 13, 14);
close(incrementalAtr.update(16, 14, 15), 2,
  'ATR must reinitialize from an independent post-gap true-range history');
assert.deepEqual(Array.from(rollingSum(values, 2), Number.isNaN), [true, false, false, false]);
close(rollingSum(values, 2)[3], 7);
close(rollingVariance(Float64Array.from([1, 2, 3]), 2)[1], 0.25);
const highLevelPrices = Float64Array.from([1e12 + 0.125, 1e12 + 0.25, 1e12 + 0.375, 1e12 + 0.5]);
const highLevelVariance = rollingVariance(highLevelPrices, 3);
close(highLevelVariance[2], 1 / 96, 1e-7);
close(highLevelVariance[3], 1 / 96, 1e-7,
  'rolling variance should preserve precision as a high-price-level window advances');
const highLevelSampleVariance = rollingVariance(highLevelPrices, 3, 1);
close(highLevelSampleVariance[2], 1 / 64, 1e-7);
close(highLevelSampleVariance[3], 1 / 64, 1e-7,
  'sample variance should remain stable as the window advances');
close(rollingStd(Float64Array.from([1, 2, 3]), 2)[2], 0.5);
assert.deepEqual(Array.from(rollingMin(values, 2).slice(1)), [1, 2, 3]);
assert.deepEqual(Array.from(rollingMax(values, 2).slice(1)), [2, 3, 4]);
close(ema(Float64Array.from([1, 2, 3]), 2)[1], 5 / 3);
assert.ok(Number.isNaN(rma(Float64Array.from([1, 2, 3]), 2)[0]));
close(rma(Float64Array.from([1, 2, 3]), 2)[1], 1.5);
close(rma(Float64Array.from([1, 2, 3]), 2)[2], 2.25);
close(wma(Float64Array.from([1, 2, 3]), 2)[1], 5 / 3);
close(wma(Float64Array.from([1, 2, 3]), 2)[2], 8 / 3);

const highs = Float64Array.from([10, 12, 13]);
const lows = Float64Array.from([8, 9, 11]);
const closes = Float64Array.from([9, 11, 12]);
close(atr(highs, lows, closes, 2)[1], 2.5);
close(atr(highs, lows, closes, 2)[2], 2.25);
close(rsi(Float64Array.from([1, 2, 3]), 2)[2], 100);

const regression = linearRegression(Float64Array.from([1, 2, 3, 4]), 2);
close(regression.slope[1], 1);
close(regression.fitted[1], 2);
close(regression.fitted[3], 4);
close(regression.rSquared[3], 1);
const highLevelRegression = linearRegression(highLevelPrices, 3);
close(highLevelRegression.slope[2], 0.125, 1e-7,
  'linear regression slope should remain accurate at high absolute price levels');
close(highLevelRegression.fitted[2], highLevelPrices[2], 1e-5,
  'linear regression fitted price should preserve its high-level price anchor');
close(correlation(Float64Array.from([1, 2, 3]), Float64Array.from([2, 4, 6]), 2)[2], 1);
close(covariance(Float64Array.from([1, 2, 3]), Float64Array.from([2, 4, 6]), 2)[2], 0.5);
const highLevelY = Float64Array.from([2e12 + 0.25, 2e12 + 0.5, 2e12 + 0.75, 2e12 + 1]);
const highLevelCovariance = covariance(highLevelPrices, highLevelY, 3);
close(highLevelCovariance[2], 1 / 48, 1e-7);
close(highLevelCovariance[3], 1 / 48, 1e-7,
  'rolling covariance should remain stable as large-level price windows advance');
close(correlation(highLevelPrices, highLevelY, 3)[2], 1, 1e-7);
close(correlation(highLevelPrices, highLevelY, 3)[3], 1, 1e-7,
  'rolling correlation should remain stable as large-level price windows advance');
close(zScore(Float64Array.from([1, 2, 3]), 2)[2], 1);
close(dotProduct(Float64Array.from([1, 2, 3]), Float64Array.from([4, 5, 6])), 32);

const product = matrixMultiply(
  { rows: 2, columns: 2, data: Float64Array.from([1, 2, 3, 4]) },
  { rows: 2, columns: 2, data: Float64Array.from([5, 6, 7, 8]) },
);
assert.deepEqual(Array.from(product.data), [19, 22, 43, 50]);
const decomposition = matrixDecomposition({ rows: 2, columns: 2, data: Float64Array.from([4, 3, 6, 3]) });
assert.equal(decomposition.singular, false);
assert.deepEqual(Array.from(decomposition.permutation), [1, 0]);
close(logSumExp(Float64Array.from([1000, 1000])), 1000 + Math.log(2));
const probabilities = softmax(Float64Array.from([1000, 1001]));
close(probabilities[0] + probabilities[1], 1);
close(probabilities[1], 1 / (1 + Math.exp(-1)));
assert.ok(executeCoreSpiritNumericalKernel('rollingMean', [values], [2]) instanceof Float64Array);
assert.deepEqual(Array.from(executeCoreSpiritNumericalKernel('rollingSum', [values], [2]), Number.isNaN), [true, false, false, false]);

const withSumGap = rollingSum(Float64Array.from([1, Number.NaN, 3, 4]), 2);
assert.ok(Number.isNaN(withSumGap[1]));
assert.ok(Number.isNaN(withSumGap[2]));
close(withSumGap[3], 7);
const withGap = rollingMean(Float64Array.from([1, Number.NaN, 3, 4]), 2);
assert.ok(Number.isNaN(withGap[1]));
assert.ok(Number.isNaN(withGap[2]));
close(withGap[3], 3.5);
assert.throws(() => rollingMean(values, 0), /period/);
assert.throws(() => dotProduct([1], [1, 2]), /equal input lengths/);
assert.throws(() => matrixMultiply(
  { rows: 1, columns: 2, data: Float64Array.from([1, 2]) },
  { rows: 1, columns: 1, data: Float64Array.from([3]) },
), /inner dimensions/);

assert.throws(() => executeCoreSpiritNumericalKernel('matrixMultiply', [[], []], [257, 1, 1]), /dimensions must not exceed/);
assert.throws(() => executeCoreSpiritNumericalKernel('matrixDecomposition', [[1]], [2]), /input length must match/);

console.log('CoreSpirit numerical kernel contract: OK');

// Pine v6 string and color kernels plus typed namespace compiler lowering.
const pineString = (name,args) => executeCoreSpiritPineStringBuiltin('pine.str.' + name,args).value;
assert.equal(pineString('upper',['Nifty 50']),'NIFTY 50');
assert.equal(pineString('lower',['NIFTY 50']),'nifty 50');
assert.equal(pineString('length',['A🙂B']),3,'string length counts Unicode code points');
assert.equal(pineString('substring',['A🙂BC',1,3]),'🙂B');
assert.equal(pineString('replace',['a-b-a','a','x']),'x-b-a');
assert.equal(pineString('replace_all',['a-b-a','a','x']),'x-b-x');
assert.deepEqual(pineString('split',['NIFTY,BANKNIFTY',',']),['NIFTY','BANKNIFTY']);
assert.equal(pineString('contains',['BANKNIFTY','NIFTY']),true);
assert.equal(pineString('startswith',['BANKNIFTY','BANK']),true);
assert.equal(pineString('endswith',['BANKNIFTY','NIFTY']),true);
assert.equal(pineString('pos',['NIFTY BANKNIFTY','BANK']),6);
assert.equal(pineString('pos',['NIFTY BANKNIFTY','SENSEX']),null);
assert.equal(pineString('trim',[' \tNIFTY 50\n']),'NIFTY 50');
assert.equal(pineString('trim',['\u00A0NIFTY 50\u00A0']),'NIFTY 50','trim handles Unicode whitespace');
assert.equal(pineString('repeat',['AB',3,'-']),'AB-AB-AB');
assert.equal(pineString('tonumber',['-123.50']),-123.5);
assert.equal(pineString('tonumber',['₹123.50']),null);
assert.equal(pineString('tostring',[1.234567891]),'1.23456789');
assert.equal(pineString('tostring',[1.2345,'0.00']),'1.23');
assert.equal(pineString('format',['{0} / {1}',42,true]),'42 / true');
assert.equal(pineString('format',['Value: {0,number,#.00}',12.5]),'Value: 12.50');
assert.throws(() => pineString('repeat',['A',50_000]),/string length limit/);

const pineColor = (name,args) => executeCoreSpiritPineColorBuiltin('pine.color.' + name,args).value;
assert.equal(pineColor('rgb',[255,0,16]),'#FF0010FF');
assert.equal(pineColor('rgb',[255,0,16,40]),'#FF001099');
assert.equal(pineColor('new',['#FF0010FF',40]),'#FF001099');
assert.equal(pineColor('r',['#FF0010FF']),255);
assert.equal(pineColor('g',['#FF0010FF']),0);
assert.equal(pineColor('b',['#FF0010FF']),16);
assert.equal(pineColor('t',['#FF001099']),40);
assert.equal(pineColor('new',['color.red',100]),'#F2364500');
assert.equal(pineColor('from_gradient',[0.5,0,1,'#000000','#FFFFFF']),'#808080FF');
assert.equal(pineColor('from_gradient',[2,0,1,'#000000','#FFFFFF']),'#FFFFFFFF');

for (const name of [
  'format','tostring','tonumber','length','substring','replace','replace_all','split',
  'lower','upper','contains','startswith','endswith','pos','repeat','trim',
]) {
  const entry=getPineV6BuiltinDefinition('str',name);
  assert.ok(entry && pineV6BuiltinIsExecutable(entry),'str.'+name+' must be executable');
  const resolved=resolveCoreSpiritLibraryCall('str',name);
  assert.equal(resolved?.entry.status,'builtin','str.'+name+' must resolve as executable');
  assert.equal(resolved?.builtin?.name,entry.executionBuiltin,'str.'+name+' runtime mapping must match its contract');
}
for (const name of ['rgb','new','from_gradient','r','g','b','t']) {
  const entry=getPineV6BuiltinDefinition('color',name);
  assert.ok(entry && pineV6BuiltinIsExecutable(entry),'color.'+name+' must be executable');
  const resolved=resolveCoreSpiritLibraryCall('color',name);
  assert.equal(resolved?.entry.status,'builtin','color.'+name+' must resolve as executable');
  assert.equal(resolved?.builtin?.name,entry.executionBuiltin,'color.'+name+' runtime mapping must match its contract');
}
assert.equal(getPineV6BuiltinDefinition('color','red'),undefined,
  'Pine color accessors are r/g/b/t, not red/green/blue/alpha');
assert.equal(resolveCoreSpiritLibraryCall('str','match')?.entry.status,'catalog',
  'regex matching remains blocked until Pine regex semantics are independently implemented');

const pineStringAst=new CoreSpiritParser('let upper = str.upper("market")').parse();
const pineStringAnalysis=analyzeCoreSpirit(pineStringAst,{frontend:'pine-v6'});
assert.deepEqual(pineStringAnalysis.diagnostics,[],'Pine namespace calls must type-check against the API registry');
const pineStringCompile=new CoreSpiritCompiler().compile(pineStringAst,'pine-string-call-contract',{frontend:'pine-v6'});
assert.deepEqual(pineStringCompile.diagnostics,[],'Pine namespace calls must compile');
assert.ok(pineStringCompile.ir?.entry.instructions.some(item=>item.op==='call'&&item.name==='pine.str.upper'),
  'compiler must lower str.upper to its runtime builtin');

const pineTaAst=new CoreSpiritParser('let average = ta.sma(close, 3)').parse();
const pineTaCompile=new CoreSpiritCompiler().compile(pineTaAst,'pine-ta-call-contract',{frontend:'pine-v6'});
assert.deepEqual(pineTaCompile.diagnostics,[],'TA calls must use the same Pine namespace lowering path');
assert.ok(pineTaCompile.ir?.entry.instructions.some(item=>item.op==='call'&&item.name==='sma'),
  'compiler must lower ta.sma to its canonical runtime builtin');



// Pine v6 API inventory, typed overload and deterministic scalar execution contracts.
const pineNamespaces = [
  'ta','math','array','matrix','map','str','color','input','request',
  'timeframe','time','syminfo','chart','barstate','strategy','line','box',
  'label','table','polyline','log',
];
for (const namespace of pineNamespaces) {
  assert.ok(PINE_V6_BUILTIN_NAMESPACE_INVENTORY.some(entry => entry.namespace === namespace),
    'Pine v6 namespace inventory must include ' + namespace);
}
assert.ok(PINE_V6_BUILTIN_REGISTRY.length >= 70,'Pine v6 API inventory should include executable and planned signatures');
for (const entry of PINE_V6_BUILTIN_REGISTRY) {
  for (const signature of entry.overloads) {
    assert.ok(signature.returnType,entry.qualifiedName + ' must declare return type');
    assert.ok(signature.parameters.every(arg => arg.qualifier && arg.type),entry.qualifiedName + ' parameters must declare type and qualifier');
    assert.ok(signature.historicalRequirement && signature.realtimeBehavior,entry.qualifiedName + ' must declare temporal behavior');
    assert.ok(signature.executionCost && signature.errorBehavior && signature.testFixture,entry.qualifiedName + ' must declare runtime contract and fixture');
  }
}
for (const entry of PINE_V6_BUILTIN_REGISTRY.filter(item => item.status === 'implemented' || item.status === 'partial')) {
  const resolved = resolveCoreSpiritLibraryCall(entry.namespace,entry.name);
  assert.equal(resolved?.entry.status,'builtin',entry.qualifiedName + ' must resolve as executable');
  assert.equal(resolved?.builtin?.name,entry.executionBuiltin,entry.qualifiedName + ' must lower to its declared runtime builtin');
}
const smaApi = getPineV6BuiltinDefinition('ta','sma');
assert.ok(smaApi && pineV6BuiltinIsExecutable(smaApi));
assert.equal(validatePineV6BuiltinArguments(smaApi,['series<float>','int']).valid,true);
assert.equal(validatePineV6BuiltinArguments(smaApi,['series<float>','series<int>']).valid,false,
  'simple length qualifiers must reject series-qualified arguments');
assert.equal(validatePineV6BuiltinArguments(smaApi,['series<float>','simple<int>']).valid,true,
  'simple length qualifiers accept simple integer arguments');

assert.equal(validatePineV6BuiltinArguments(smaApi,['string','int']).valid,false);
assert.equal(validatePineV6BuiltinArguments(smaApi,['series<float>']).valid,false);
const avgApi = getPineV6BuiltinDefinition('math','avg');
assert.equal(validatePineV6BuiltinArguments(avgApi,['float','float','float','int']).valid,true);
assert.equal(resolveCoreSpiritLibraryCall('ta','macd')?.entry.status,'catalog',
  'tuple-returning MACD is not executable before tuple ABI support is implemented');
assert.equal(resolveCoreSpiritLibraryCall('ta','hma')?.entry.status,'catalog',
  'HMA must not be advertised as executable without a conformant kernel');
assert.equal(resolveCoreSpiritLibraryCall('array','new')?.entry.status,'catalog',
  'array.new remains blocked until typed Pine collection semantics exist');
assert.equal(resolveCoreSpiritLibraryCall('math','avg')?.builtin?.name,'avg');
assert.equal(executeCoreSpiritPineMathBuiltin('avg',[2,4,6]).value,4);
assert.equal(executeCoreSpiritPineMathBuiltin('floor',[2.9]).value,2);
assert.equal(executeCoreSpiritPineMathBuiltin('ceil',[2.1]).value,3);
assert.equal(executeCoreSpiritPineMathBuiltin('todegrees',[Math.PI]).value,180);
assert.equal(executeCoreSpiritPineMathBuiltin('clamp',[12,0,10]).value,10);
assert.equal(executeCoreSpiritPineMathBuiltin('sigmoid',[0]).value,0.5);
assert.equal(getPineV6BuiltinDefinition('math','sum')?.executionBuiltin,'sum');
assert.equal(getPineV6BuiltinDefinition('math','clamp'),undefined,
  'CoreSpirit clamp is an extension, not a Pine v6 math namespace builtin');
assert.equal(getPineV6BuiltinDefinition('math','sigmoid'),undefined,
  'CoreSpirit sigmoid is an extension, not a Pine v6 math namespace builtin');
assert.equal(getPineV6BuiltinDefinition('math','atan2'),undefined,
  'CoreSpirit atan2 is an extension, not a Pine v6 math namespace builtin');

assert.throws(() => executeCoreSpiritPineMathBuiltin('clamp',[1,5,2]),/minimum must not exceed maximum/);

// VWMA uses an O(1) rolling two-sum kernel and replaces the forming-bar pair.
const vwmaState=new VWMAState(3);
assert.equal(vwmaState.update(10,1),null);
assert.equal(vwmaState.update(20,1),null);
assert.equal(vwmaState.update(30,2),22.5);
assert.equal(vwmaState.update(40,2),32);
assert.equal(vwmaState.update(50,2,'replace'),36);
assert.equal(vwmaState.latest,36,'VWMA latest value must track the emitted output, not the raw weighted sum');
const vwmaClone=vwmaState.clone();
assert.equal(vwmaClone.value,36);
assert.equal(vwmaClone.update(60,1),44);
assert.equal(vwmaState.value,36,'VWMA snapshots/clones must not alias mutable buffers');
assert.equal(vwmaState.update(60,Number.NaN),null,'VWMA must reset on missing volume data');
assert.equal(vwmaState.value,null,'VWMA must not retain a prior window across missing volume data');
assert.equal(vwmaState.update(Number.NaN,1),null,'VWMA must reset on missing source data');
assert.equal(vwmaState.value,null);

// Pine ta.change(source, length), ta.mom() and ta.roc() share a bounded lag
// kernel that supports realtime replacement without consuming the forming bar twice.
const lagChange=new ChangeState(false,2);
assert.equal(lagChange.update(10,0),null);
assert.equal(lagChange.update(20,1),null);
assert.equal(lagChange.update(30,2),20);
assert.equal(lagChange.update(35,2),25,'revising the current bar must reuse the same lag reference');
assert.equal(lagChange.update(40,3),20);
const lagChangeClone=lagChange.clone();
assert.equal(lagChangeClone.update(50,4),15);
assert.equal(lagChange.value,20,'lag change clones must not alias the original');
const lagRoc=new ChangeState(true,2);
assert.equal(lagRoc.update(100,0),null);
assert.equal(lagRoc.update(110,1),null);
assert.equal(lagRoc.update(125,2),0.25);
assert.ok(Math.abs(lagRoc.update(130,2)-0.3) <= Number.EPSILON,'percentage change must recalculate on same-bar replacement within floating-point precision');

const changeCursor=new CoreSpiritFusedSeriesCursor([{name:'change',length:2}]);
assert.ok(Number.isNaN(changeCursor.update(10,0)[0]));
assert.ok(Number.isNaN(changeCursor.update(20,1)[0]));
assert.equal(changeCursor.update(30,2)[0],20);
assert.equal(changeCursor.update(35,2)[0],25,'fused cursor must replace a repeated absolute bar index');
assert.equal(changeCursor.update(40,3)[0],20);
const rangeBatch=executeCoreSpiritFusedSeriesPipeline([1,3,2,5],[{name:'range',length:3}]).output;
assert.ok(Number.isNaN(rangeBatch[0]));
assert.ok(Number.isNaN(rangeBatch[1]));
assert.equal(rangeBatch[2],2);
assert.equal(rangeBatch[3],3);
const rangeCursor=new CoreSpiritFusedSeriesCursor([{name:'range',length:3}]);
rangeCursor.update(1,0);rangeCursor.update(3,1);rangeCursor.update(2,2);
assert.equal(rangeCursor.update(6,3)[0],4);
assert.equal(rangeCursor.update(4,3)[0],3,'rolling range must revise a forming bar without appending twice');

assert.equal(getPineV6BuiltinDefinition('ta','mom')?.executionBuiltin,'change');

assert.equal(getPineV6BuiltinDefinition('ta','vwma')?.status,'implemented');

assert.equal(getPineV6BuiltinDefinition('ta','tr')?.overloads[0]?.parameters[0]?.defaultValue,false,
  'ta.tr defaults handle_na to false');
assert.equal(validatePineV6BuiltinArguments(getPineV6BuiltinDefinition('ta','tr'),[]).valid,true,
  'ta.tr exposes its default handle_na argument');
for (const requestFunction of ['security','security_lower_tf','currency_rate','dividends','splits','earnings','financial','economic','seed','footprint']) {
  assert.ok(getPineV6BuiltinDefinition('request',requestFunction),
    'request API inventory must include request.' + requestFunction);
}
assert.equal(getPineV6BuiltinDefinition('request','security')?.overloads[0]?.maxArgs,8,
  'request.security reference signature includes all eight arguments');
assert.equal(getPineV6BuiltinDefinition('request','security_lower_tf')?.overloads[0]?.maxArgs,7,
  'request.security_lower_tf reference signature includes all seven arguments');
for (const technicalFunction of ['alma','dmi','macd','stoch','bb','supertrend','vwma','cci','mfi','vwap','obv','pvt','nvi','pvi','wad','wvad','iii','linreg','correlation']) {
  assert.ok(getPineV6BuiltinDefinition('ta',technicalFunction),
    'technical analysis API inventory must include ta.' + technicalFunction);
}
for (const volumeFunction of ['vwap','obv','accdist','pvt','nvi','pvi','wad','wvad','iii','mfi']) {
  assert.ok(getPineV6BuiltinDefinition('ta',volumeFunction),
    'volume and flow family inventory must include ta.' + volumeFunction);
}
for (const symbolField of ['volumetype','expiration_date','isin','industry','sector','current_contract','minmove','pricescale']) {
  assert.ok(getPineV6BuiltinDefinition('syminfo',symbolField),
    'symbol metadata inventory must include syminfo.' + symbolField);
}
assert.equal(getPineV6BuiltinDefinition('ta','adx'),undefined,
  'Pine exposes ADX through ta.dmi tuple output, not a standalone ta.adx builtin');
assert.equal(getPineV6BuiltinDefinition('math','rphi'),undefined,
  'Unverified math.rphi is not added to the Pine v6 API registry');
assert.equal(getPineV6BuiltinDefinition('ta','range')?.executionBuiltin,'ta_range');
assert.equal(resolveCoreSpiritLibraryCall('ta','range')?.builtin?.returnType,'series<float>',
  'ta.range must resolve to its TA execution alias, not the CoreSpirit visual range constructor');


// Pine-only catalog enforcement must not break CoreScript's own strategy API.
const pineStrategyAst = new CoreSpiritParser('strategy.entry("L", "long")').parse();
const pineStrategyAnalysis = analyzeCoreSpirit(pineStrategyAst,{frontend:'pine-v6'});
assert.ok(pineStrategyAnalysis.diagnostics.some(item => item.code === 'PINE_BUILTIN_UNSUPPORTED'),
  'Pine strategy simulation must not fall through to the CoreScript order-intent builtin');
const coreStrategyAst = new CoreSpiritParser('strategy.entry("L", "long")').parse();
const coreStrategyAnalysis = analyzeCoreSpirit(coreStrategyAst,{frontend:'corescript'});
assert.ok(!coreStrategyAnalysis.diagnostics.some(item => item.code === 'PINE_BUILTIN_UNSUPPORTED'),
  'CoreScript strategy intent API must remain available');
const pineUnknownMathAst = new CoreSpiritParser('math.vector([1, 2])').parse();
const pineUnknownMathAnalysis = analyzeCoreSpirit(pineUnknownMathAst,{frontend:'pine-v6'});
assert.ok(pineUnknownMathAnalysis.diagnostics.some(item => item.code === 'PINE_BUILTIN_UNKNOWN'),
  'CoreSpirit-only math extensions must not leak into Pine v6');
const pineBarStateAst = new CoreSpiritParser('barstate.isconfirmed').parse();
const pineBarStateAnalysis = analyzeCoreSpirit(pineBarStateAst,{frontend:'pine-v6'});
assert.ok(pineBarStateAnalysis.diagnostics.some(item => item.code === 'PINE_BUILTIN_VALUE_UNSUPPORTED'),
  'Pine namespace values must not fall through to unrelated member resolution before typed runtime bindings exist');
const namespaceMemberKeys = CORE_SPIRIT_LIBRARY_NAMESPACE_ENTRIES.map(entry => entry.qualifiedName);
assert.equal(new Set(namespaceMemberKeys).size,namespaceMemberKeys.length,
  'CoreSpirit namespace member registry must not contain duplicate keys');
const namespaceMemberKeySet = new Set(namespaceMemberKeys);
for (const entry of PINE_V6_BUILTIN_REGISTRY) {
  assert.ok(namespaceMemberKeySet.has(entry.qualifiedName),
    'Pine builtin registry entry must be discoverable in the namespace resolver: ' + entry.qualifiedName);
}
const pineHostRequestAst = new CoreSpiritParser('request.security("NSE:NIFTY", "15", close)').parse();
const pineHostRequestAnalysis = analyzeCoreSpirit(pineHostRequestAst,{frontend:'pine-v6'});
assert.ok(pineHostRequestAnalysis.diagnostics.some(item => item.code === 'PINE_BUILTIN_HOST_LIMITATION'),
  'request.security must surface its current host-adapter compatibility limitation');


