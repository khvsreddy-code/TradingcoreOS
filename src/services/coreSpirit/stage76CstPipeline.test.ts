import { normalizeReadableOperatorsWithTokens, withProtectedCoreSpiritSurfaceText } from './surfaceCst';
import { normalizeCoreSpiritSource } from './surfaceForms';
import { createCoreSpiritCompilationUnit } from './compilerPipeline';

const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};

const structural=`
let text = "fast crossesAbove slow"
 // crossesBelow should stay a comment
let signal = ema(close, 20) crossesAbove ema(close, 50)
let nested = (ema(close, 20) + atr(14)) crossesBelow (ema(close, 50) - atr(14))
let functional = crossesAbove(ema(close, 20), ema(close, 50))
`;

const readable=normalizeReadableOperatorsWithTokens(structural);
assert(readable.includes('let text = "fast crossesAbove slow"'),'string literal was modified');
assert(readable.includes('// crossesBelow should stay a comment'),'comment was modified');
assert(readable.includes('crossover(ema(close, 20), ema(close, 50))'),'nested call crossing was not normalized');
assert(readable.includes('crossunder((ema(close, 20) + atr(14)), (ema(close, 50) - atr(14)))') || readable.includes('crossunder(ema(close, 20) + atr(14), ema(close, 50) - atr(14))'),'parenthesized crossing was not normalized');
assert(readable.includes('crossover(ema(close, 20), ema(close, 50))'),'function crossing was not normalized');

const legacy=withProtectedCoreSpiritSurfaceText(
  'message = "plot(close, name=ignored)" // plot(close, name=ignored)',
  code=>code.replace(/plot\\(([^,()]+),\\s*name\\s*=\\s*[^)]+\\)/g,'plot($1)'),
);
assert(legacy.includes('"plot(close, name=ignored)"'),'protected string changed');
assert(legacy.includes('// plot(close, name=ignored)'),'protected comment changed');

const unit=createCoreSpiritCompilationUnit('fast = ema(close, 20)\\nwhen fast crossesAbove ema(close, 50):\\n  emit "LONG"');
assert(unit.normalizedSource.includes('crossover(fast, ema(close, 50))'),'canonical source unit did not receive structural normalization');
assert(unit.ast.type==='program','canonical source unit did not produce AST');

const legacySafe=normalizeCoreSpiritSource('let text = "fast crossesAbove slow"\\nfast = ema(close,20) crossesAbove ema(close,50)');
assert(legacySafe.includes('"fast crossesAbove slow"'),'full surface normalization modified a protected literal');
assert(legacySafe.includes('crossover(ema(close,20), ema(close,50))'),'full surface normalization missed token-aware crossing');

export const STAGE76_CST_PIPELINE_OK = true;
