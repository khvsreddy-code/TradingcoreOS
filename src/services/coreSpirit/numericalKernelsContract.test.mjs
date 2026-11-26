import assert from 'node:assert/strict';
import {
  rollingMean, rollingSum, rollingVariance, rollingStd, rollingMin, rollingMax,
  ema, rma, wma, atr, rsi, linearRegression, correlation, covariance,
  zScore, dotProduct, matrixMultiply, matrixDecomposition, softmax, logSumExp,
  executeCoreSpiritNumericalKernel,
} from './numericalKernels.ts';
import { RollingMean, RollingSum, RollingVariance, RollingMinMax, EMAState, WilderState, WMAState, ATRState, VWMAState } from './statefulIndicatorKernel.ts';
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
const vwmaClone=vwmaState.clone();
assert.equal(vwmaClone.value,36);
assert.equal(vwmaClone.update(60,1),44);
assert.equal(vwmaState.value,36,'VWMA snapshots/clones must not alias mutable buffers');
assert.equal(vwmaState.update(Number.NaN,1),null,'VWMA must reset on missing source data');
assert.equal(vwmaState.value,null);
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


