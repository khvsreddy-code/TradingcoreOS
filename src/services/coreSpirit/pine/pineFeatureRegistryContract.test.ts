import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from '../compiler.ts';
import { parseWithCoreSpiritFrontend } from '../frontends.ts';
import { getPineFeatureEditorCompletions, getPineFeatureProgressSummary, getPineFeatureRegistry, PINE_FEATURE_REGISTRY, validatePineFeatureRegistry } from './pineFeatureRegistry.ts';
import { PINE_CONFORMANCE_FIXTURES } from './pineConformanceFixtures.ts';

assert.deepEqual(validatePineFeatureRegistry(),[]);
assert.ok(PINE_FEATURE_REGISTRY.length>=20,'the registry must cover syntax, declarations, types, functions, collections, visuals and runtime');
assert.equal(new Set(PINE_FEATURE_REGISTRY.map(item=>item.id)).size,PINE_FEATURE_REGISTRY.length);
for(const feature of PINE_FEATURE_REGISTRY){
  assert.ok(feature.officialReference.startsWith('https://www.tradingview.com/pine-script-docs/'),feature.id);
  for(const fixture of feature.testFixtures)assert.ok(fixture.includes('.test.'),`${feature.id}: fixture references must point to executable tests`);
}
const fixtureEvidence:Record<string,'passed'|'failed'|'host_limited'|'not_applicable'>={};
for(const fixture of PINE_CONFORMANCE_FIXTURES){
  const result=parseWithCoreSpiritFrontend(fixture.frontend,fixture.source);
  if(fixture.expectedDiagnostic){
    assert.equal(result.diagnostics[0]?.code,fixture.expectedDiagnostic,`${fixture.id}: expected diagnostic ${fixture.expectedDiagnostic}, got ${result.diagnostics.map(item=>item.code+': '+item.message).join('; ')}`);
  }else{
    assert.ok(result.ast,`${fixture.id}: ${result.diagnostics.map(item=>item.message).join('; ')}`);
    assert.equal(result.ast?.programKind,fixture.expectedProgramKind);
    if(!fixture.parseOnly){
      const compiled=new CoreSpiritCompiler().compileSource(fixture.source,fixture.featureId,{frontend:'pine-v6'});
      assert.ok(compiled.ir,`${fixture.id}: ${compiled.diagnostics.map(item=>item.code+': '+item.message).join('; ')}`);
      assert.equal(compiled.ir?.programKind,fixture.expectedProgramKind);
    }
  }
  fixtureEvidence[fixture.id]='passed';
}
const verified=getPineFeatureRegistry(fixtureEvidence);
assert.equal(verified.find(item=>item.id==='version-annotation')?.status,'conformant');
assert.equal(verified.find(item=>item.id==='script-declarations')?.status,'partially_conformant',
  'known, explicitly documented declaration-argument gaps must prevent a conformant label');
assert.equal(PINE_FEATURE_REGISTRY.find(item=>item.id==='conditional-switch')?.status,'not_implemented');
assert.equal(PINE_FEATURE_REGISTRY.find(item=>item.id==='variable-declarations')?.status,'partially_conformant');
const summary=getPineFeatureProgressSummary(verified);
assert.equal(summary.total,verified.length);
assert.ok(summary.conformant>=1);
const completions=getPineFeatureEditorCompletions();
for(const label of ['indicator','strategy','library','switch','var','varip','for','while','enum','import']){
  assert.ok(completions.some(item=>item.label===label),`Pine completion missing ${label}`);
}
console.log('CORESPIRIT_PINE_FEATURE_REGISTRY_OK',JSON.stringify(summary));
