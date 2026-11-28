import assert from 'node:assert/strict';
import { validateCoreSpiritFeatureMatrix, CORE_SPIRIT_LANGUAGE_FEATURE_MATRIX, CORE_SPIRIT_AUTHORING_SURFACES, getCoreSpiritFeatureParity } from './services/coreSpirit/languageParity.ts';
import { PINE_FEATURE_REGISTRY, validatePineFeatureRegistry } from './services/coreSpirit/pine/pineFeatureRegistry.ts';
import { compileCoreSpirit } from './services/coreSpirit/coreSpiritPipeline.ts';

assert.deepEqual(validateCoreSpiritFeatureMatrix(), []);
assert.deepEqual(validatePineFeatureRegistry(), []);
assert.ok(CORE_SPIRIT_LANGUAGE_FEATURE_MATRIX.some(item=>item.id==='tuples'&&item.status==='planned'));
assert.ok(CORE_SPIRIT_LANGUAGE_FEATURE_MATRIX.some(item=>item.id==='temporal-qualifiers'&&item.status==='partial'));
assert.equal(getCoreSpiritFeatureParity('tuples')?.status,'planned');
assert.equal(getCoreSpiritFeatureParity('version-annotation'),undefined,'Pine-only declarations must not define CoreSpirit language maturity');
assert.notEqual(CORE_SPIRIT_LANGUAGE_FEATURE_MATRIX,PINE_FEATURE_REGISTRY);
for (const level of ['beginner','trader','quant','system']) {
  assert.equal(CORE_SPIRIT_AUTHORING_SURFACES[level].parser,'CoreSpiritParser');
  assert.equal(CORE_SPIRIT_AUTHORING_SURFACES[level].compiler,'CoreSpiritCompiler');
  assert.equal(CORE_SPIRIT_AUTHORING_SURFACES[level].runtime,'CoreSpiritExecutionVM');
}
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
assert.ok(PINE_FEATURE_REGISTRY.some(item=>item.id==='collections-arrays'&&item.status==='partially_conformant'));
assert.ok(PINE_FEATURE_REGISTRY.some(item=>item.id==='conditional-switch'&&item.status==='partially_conformant'));
assert.ok(PINE_FEATURE_REGISTRY.some(item=>item.id==='version-annotation'));
assert.equal(PINE_FEATURE_REGISTRY.some(item=>item.id==='orderbook'),false,'Pine language compatibility registry must not mix in unrelated host/domain features');
console.log('CORESPIRIT_LANGUAGE_PARITY_CONTRACT_OK');
