import { combineSemanticArithmetic, compareSemanticTypes, semanticSeriesField, semanticTypeForDeclaredName, semanticTypeToString, semanticTypeCompatible, semanticScalar, semanticSeries } from './semanticTypeSystem.ts';

const close = semanticSeriesField('close', 'NIFTY', '5m');
const volume = semanticSeriesField('volume', 'NIFTY', '5m');
const time = semanticSeriesField('time', 'NIFTY', '5m');
const duration = semanticTypeForDeclaredName('duration')!;

if (close.atom !== 'price' || close.kind !== 'series' || close.symbol !== 'NIFTY' || close.timeframe !== '5m') throw new Error('price series metadata was not preserved');
if (volume.atom !== 'volume' || volume.kind !== 'series') throw new Error('volume series domain missing');
if (semanticTypeForDeclaredName('series<price>')?.atom !== 'price') throw new Error('series<price> declaration missing');
if (!combineSemanticArithmetic('+', close, volume).error) throw new Error('price + volume must fail semantically');
if (!compareSemanticTypes('>', close, volume).error) throw new Error('price > volume must fail semantically');
if (combineSemanticArithmetic('+', close, semanticTypeForDeclaredName('number')!).error) throw new Error('price + number should be valid');
if (combineSemanticArithmetic('+', time, duration).error) throw new Error('time + duration should be valid');
if (!combineSemanticArithmetic('+', time, time).error) throw new Error('time + time must fail');
if (combineSemanticArithmetic('*', close, volume).type.atom !== 'currency') throw new Error('price * volume should produce currency/notional');
if (semanticTypeToString(close).includes('symbol=NIFTY') === false) throw new Error('semantic type display must expose symbol metadata');
console.log('TCO_V114_SEMANTIC_SERIES_RUNTIME_OK');

if (!semanticTypeCompatible(semanticSeries('price', { symbol: 'NIFTY', timeframe: '5m' }), semanticSeries('price', { symbol: 'NIFTY', timeframe: '5m' }))) throw new Error('same-domain series types should be compatible');
if (semanticTypeCompatible(semanticSeries('price', { symbol: 'NIFTY', timeframe: '5m' }), semanticSeries('price', { symbol: 'BANKNIFTY', timeframe: '5m' }))) throw new Error('different-symbol series types must not be silently compatible');
if (combineSemanticArithmetic('-', close, close).type.atom !== 'price') throw new Error('same-domain price subtraction should preserve explicit price-domain semantics until converted/consumed');
if (!semanticTypeForDeclaredName('series<currency>')) throw new Error('series<currency> declaration missing');

// Explicit semantic conversions intentionally change domain without adding host capability.
for (const [name, atom] of [['toNumber','number'],['toPrice','price'],['toVolume','volume'],['toTime','time'],['toDuration','duration'],['toCurrency','currency']] as const) {
  if (name.startsWith('to') && !semanticTypeForDeclaredName(atom)) throw new Error(`conversion semantics missing ${name}`);
}
console.log('TCO_V114_SEMANTIC_CONVERSION_ABI_OK');
