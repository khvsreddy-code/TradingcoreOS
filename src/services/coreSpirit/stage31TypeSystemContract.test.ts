import { compileCoreSpirit } from './coreSpiritPipeline';
import {
  compatible,
  elementType,
  isNumericType,
  joinTypes,
  normalizeDeclaredType,
} from './typeSystem';
import { CORE_SPIRIT_V1_SURFACE } from './languageSpec';

/** CoreSpirit v1 contract: language boundary + scalar/series type semantics. */
export function runCoreSpiritStage31TypeSystemContractTest(): void {
  if (!CORE_SPIRIT_V1_SURFACE.statements.includes('let')) throw new Error('v1 let surface missing');
  if (!CORE_SPIRIT_V1_SURFACE.builtInSeries.includes('close')) throw new Error('v1 close series missing');

  if (!isNumericType('int') || !isNumericType('float') || !isNumericType('series<float>'))
    throw new Error('numeric type lattice incomplete');

  if (normalizeDeclaredType('bool') !== 'boolean') throw new Error('bool alias not normalized');
  if (normalizeDeclaredType('series<float>') !== 'series<float>') throw new Error('series type normalization failed');
  if (elementType('series<float>') !== 'float') throw new Error('series element type failed');

  if (!compatible('float', 'int')) throw new Error('int -> float promotion failed');
  if (!compatible('series<float>', 'series<int>')) throw new Error('series numeric promotion failed');
  if (!compatible('number', 'series<float>')) throw new Error('series -> current-bar numeric coercion failed');
  if (compatible('boolean', 'string')) throw new Error('invalid boolean/string assignment accepted');
  if (joinTypes('int', 'float') !== 'float') throw new Error('int + float join failed');
  if (joinTypes('series<number>', 'int') !== 'series<number>') throw new Error('series/scalar join failed');

  const good = compileCoreSpirit(`
    input length = int(20, min: 1)
    fast = ema(close, length)
    slow = ema(close, 50)
    plot(fast)
    plot(slow)
    signal(crossover(fast, slow))
  `, 'stage31-good');
  if (good.diagnostics.some(d => d.severity === 'error'))
    throw new Error(good.diagnostics.map(d => d.message).join('; '));

  const badFuture = compileCoreSpirit('let x = close[-1]; plot(x);', 'stage31-future');
  if (!badFuture.diagnostics.some(d => d.code === 'FUTURE_INDEX'))
    throw new Error('future indexing was not rejected');

  const badType = compileCoreSpirit('let x: boolean = close;', 'stage31-type');
  if (!badType.diagnostics.some(d => d.code === 'TYPE_DECLARATION'))
    throw new Error('declared type mismatch was not rejected');

  const badIndex = compileCoreSpirit('let x = 10; plot(x[1]);', 'stage31-index');
  if (!badIndex.diagnostics.some(d => d.code === 'TYPE_INDEX_TARGET'))
    throw new Error('scalar historical indexing was not rejected');
}
