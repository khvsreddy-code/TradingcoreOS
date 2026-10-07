import assert from 'node:assert/strict';
import { validateCoreSpiritFeatureMatrix, CORE_SPIRIT_PINE_FEATURE_MATRIX, CORE_SPIRIT_AUTHORING_SURFACES } from './services/coreSpirit/languageParity.ts';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';

assert.deepEqual(validateCoreSpiritFeatureMatrix(), []);
assert.equal(CORE_SPIRIT_AUTHORING_SURFACES.simple.parser, CORE_SPIRIT_AUTHORING_SURFACES.advanced.parser);
assert.equal(CORE_SPIRIT_AUTHORING_SURFACES.simple.ast, CORE_SPIRIT_AUTHORING_SURFACES.advanced.ast);
assert.equal(CORE_SPIRIT_AUTHORING_SURFACES.simple.compiler, CORE_SPIRIT_AUTHORING_SURFACES.advanced.compiler);
assert.equal(CORE_SPIRIT_AUTHORING_SURFACES.simple.runtime, CORE_SPIRIT_AUTHORING_SURFACES.advanced.runtime);

const beginnerSource = `
data market = market("NSE:NIFTY50", "5m")
let fast = ema(close, 20)
let slow = ema(close, 50)
when fast > slow
    show signal("BUY")
`;
const advancedSource = `
data nifty = market("NSE:NIFTY50", "5m")
let returns = log(close / close[1])
let z = zscore(returns, 100)
model alpha {
    features:
        z
    target:
        forward_return(20)
}
let prediction: prediction<float> = alpha.predict()
show line(prediction)
`;
const beginner = compileCoreSpirit(beginnerSource, 'parity-beginner');
const advanced = compileCoreSpirit(advancedSource, 'parity-advanced');
assert.ok(!beginner.diagnostics.some(d=>d.severity==='error'), beginner.diagnostics.map(d=>d.message).join('; '));
assert.ok(!advanced.diagnostics.some(d=>d.severity==='error'), advanced.diagnostics.map(d=>d.message).join('; '));
assert.ok(beginner.artifact);
assert.ok(advanced.artifact);
assert.deepEqual(beginner.ir?.compilerPipeline, advanced.ir?.compilerPipeline);
assert.equal(beginner.artifact?.abi.kind, advanced.artifact?.abi.kind);
assert.ok(beginner.ir?.semanticDependencyGraph);
assert.ok(advanced.ir?.semanticDependencyGraph);
assert.ok(CORE_SPIRIT_PINE_FEATURE_MATRIX.some(item=>item.id==='arrays'&&item.status==='planned'));
assert.ok(CORE_SPIRIT_PINE_FEATURE_MATRIX.some(item=>item.id==='orderbook'&&item.status==='implemented'));
assert.ok(CORE_SPIRIT_PINE_FEATURE_MATRIX.some(item=>item.id==='ml-models'&&item.status==='implemented'));
console.log('CORESPIRIT_LANGUAGE_PARITY_CONTRACT_OK');
