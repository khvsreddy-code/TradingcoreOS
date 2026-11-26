import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { CoreSpiritCompiler } from '../compiler.ts';
import { CoreSpiritRuntime } from '../runtime.ts';
import { parseWithCoreSpiritFrontend } from '../frontends.ts';
import { getCoreSpiritCompletions } from '../languageService.ts';
import {
  derivePineFeatureStatus, getPineFeatureEditorCompletions, getPineFeatureProgressSummary,
  getPineFeatureRegistry, PINE_FEATURE_DEFINITIONS, PINE_FEATURE_REGISTRY, validatePineFeatureRegistry,
} from './pineFeatureRegistry.ts';
import type { PineFeatureDefinition, PineFixtureEvidence } from './pineCompatibilityTypes.ts';
import { PINE_CONFORMANCE_FIXTURES } from './pineConformanceFixtures.ts';

assert.deepEqual(validatePineFeatureRegistry(),[]);
assert.ok(PINE_FEATURE_REGISTRY.length>=20,'the registry must cover syntax, declarations, types, functions, collections, visuals and runtime');
assert.equal(new Set(PINE_FEATURE_REGISTRY.map(item=>item.id)).size,PINE_FEATURE_REGISTRY.length);
assert.ok(PINE_FEATURE_DEFINITIONS.every(item=>!('status' in item)),
  'feature definitions must not carry manually assigned status labels');

for(const feature of PINE_FEATURE_REGISTRY){
  assert.ok(feature.officialReference.startsWith('https://www.tradingview.com/pine-script-docs/'),feature.id);
  for(const implementationFile of feature.implementationFiles)
    assert.ok(existsSync(resolve(process.cwd(),implementationFile)),`${feature.id}: implementation file does not exist: ${implementationFile}`);
  for(const fixture of feature.testFixtures){
    assert.ok(fixture.includes('.test.'),`${feature.id}: fixture references must point to executable tests`);
    const fixturePath=fixture.split('#')[0]!;
    assert.ok(existsSync(resolve(process.cwd(),fixturePath)),`${feature.id}: executable fixture does not exist: ${fixturePath}`);
  }
}

const statusDefinition:PineFeatureDefinition={
  id:'status-probe',domain:'language',officialReference:'https://www.tradingview.com/pine-script-docs/language/operators/',
  implementationFiles:['src/services/coreSpirit/parser.ts'],prerequisites:[],testFixtures:['status-probe.test.ts#fixture'],
  supportedModes:['compile'],knownDifferences:[],
};
assert.equal(derivePineFeatureStatus({...statusDefinition,implementationFiles:[]},{}),'not_implemented');
assert.equal(derivePineFeatureStatus(statusDefinition,{}),'implemented_unverified');
assert.equal(derivePineFeatureStatus({...statusDefinition,knownDifferences:['known gap']},{'status-probe.test.ts#fixture':'passed'}),'partially_conformant');
assert.equal(derivePineFeatureStatus(statusDefinition,{'status-probe.test.ts#fixture':'passed'}),'conformant');
assert.equal(derivePineFeatureStatus(statusDefinition,{'status-probe.test.ts#fixture':'host_limited'}),'host_limited');
assert.equal(derivePineFeatureStatus({...statusDefinition,applicable:false},{}),'not_applicable');
assert.equal(derivePineFeatureStatus(statusDefinition,{'status-probe.test.ts#fixture':'not_applicable'}),'not_applicable');

const fixtureEvidence:Record<string,'passed'|'failed'|'host_limited'|'not_applicable'>={};
for(const fixture of PINE_CONFORMANCE_FIXTURES){
  const result=parseWithCoreSpiritFrontend(fixture.frontend,fixture.source);
  if(fixture.expectedDiagnostic){
    assert.equal(result.diagnostics[0]?.code,fixture.expectedDiagnostic,`${fixture.id}: expected diagnostic ${fixture.expectedDiagnostic}, got ${result.diagnostics.map(item=>item.code+': '+item.message).join('; ')}`);
  }else{
    assert.ok(result.ast,`${fixture.id}: ${result.diagnostics.map(item=>item.code+': '+item.message+' @'+item.line+':'+item.column).join('; ')}\nNormalized Pine body:\n${result.normalizedSource}`);
    if(fixture.featureId==='conditional-switch') assert.ok(result.normalizedSource.includes('true => close'),'switch arrow tokens must survive generic surface normalization unchanged');
    assert.equal(result.ast?.programKind,fixture.expectedProgramKind);
    if(!fixture.parseOnly){
      const compiled=new CoreSpiritCompiler().compileSource(fixture.source,fixture.featureId,{frontend:'pine-v6'});
      assert.ok(compiled.ir,`${fixture.id}: ${compiled.diagnostics.map(item=>item.code+': '+item.message).join('; ')}`);
      assert.equal(compiled.ir?.programKind,fixture.expectedProgramKind);
      if(fixture.featureId==='conditional-switch'){
        const bars=[
          {timestamp:'2026-11-25T09:15:00.000Z',open:10,high:12,low:9,close:11,volume:100},
          {timestamp:'2026-11-25T09:20:00.000Z',open:10,high:11,low:8,close:9,volume:120},
        ];
        for(const executionTier of ['reference','optimized'] as const){
          const runtime=new CoreSpiritRuntime({sourceId:`pine-switch-${executionTier}`,executionTier});
          const execution=runtime.executeIr(compiled.ir!,bars);
          assert.equal(execution.state.locals.selected,10,`${executionTier}: default switch arm must supply the selected value when no case matches`);
          assert.equal(execution.state.locals.previousSelected,11,`${executionTier}: switch result must retain series history`);
        }
        assert.ok(compiled.ir!.entry.instructions.some(instruction=>instruction.op==='jumpIfFalse'),
          'switch must lower to explicit VM control flow and evaluate branch values lazily');
      }
      if(fixture.featureId==='ternary-expression'){
        const bars=[
          {timestamp:'2026-11-25T09:15:00.000Z',open:10,high:12,low:9,close:11,volume:100},
          {timestamp:'2026-11-25T09:20:00.000Z',open:10,high:11,low:8,close:9,volume:120},
        ];
        for(const executionTier of ['reference','optimized'] as const){
          const runtime=new CoreSpiritRuntime({sourceId:`pine-ternary-${executionTier}`,executionTier});
          const execution=runtime.executeIr(compiled.ir!,bars);
          assert.equal(execution.state.locals.selected,10,`${executionTier}: the false branch must be selected on the last bar`);
          assert.equal(execution.state.locals.nested,3,`${executionTier}: outer false branch must be selected`);
          assert.equal(execution.state.locals.previousNested,1,`${executionTier}: unparenthesized nested ternary must associate to the right and retain branch history`);
          assert.equal(execution.state.locals.previousSelected,11,`${executionTier}: selected series history must be retained`);
        }
        assert.ok(compiled.ir!.entry.instructions.some(instruction=>instruction.op==='jumpIfFalse'),
          'ternary expressions must lower to explicit control flow, not eager evaluation');
      }
    }
  }
  fixtureEvidence[fixture.id]='passed';
}
const evidence=fixtureEvidence as PineFixtureEvidence;
const verified=getPineFeatureRegistry(evidence);
assert.equal(verified.find(item=>item.id==='version-annotation')?.status,'conformant');
assert.equal(verified.find(item=>item.id==='ternary-expression')?.status,'conformant',
  'ternary may be conformant only after parser/compiler/reference/optimized/history checks pass');
assert.equal(verified.find(item=>item.id==='script-declarations')?.status,'partially_conformant',
  'known declaration-argument gaps must prevent a conformant label');
assert.equal(verified.find(item=>item.id==='conditional-switch')?.status,'partially_conformant',
  'switch expression support must remain partially conformant while block arms and tuple semantics are outstanding');
assert.equal(PINE_FEATURE_REGISTRY.find(item=>item.id==='variable-declarations')?.status,'partially_conformant');
assert.ok(verified.find(item=>item.id==='intrabar-state-semantics')?.testFixtures.includes('src/services/coreSpirit/pine/pineVaripRuntimeContract.test.mjs'));
const summary=getPineFeatureProgressSummary(evidence);
assert.equal(summary.total,verified.length);
assert.ok(summary.conformant>=2);
const completions=getPineFeatureEditorCompletions(evidence);
const coreScriptCompletions=getCoreSpiritCompletions('switch',{prefix:'switch',mode:'global'},'let signal = close > open');
assert.equal(coreScriptCompletions.some(item=>item.label==='switch'),false,'Pine-only completions must not leak into CoreScript buffers');
const pineEditorCompletions=getCoreSpiritCompletions('switch',{prefix:'switch',mode:'global'},'//@version=6\\nindicator("Pine editor")');
assert.ok(pineEditorCompletions.some(item=>item.label==='switch'),'Pine autocomplete must use the canonical registry for Pine v6 buffers');
const versionDirectiveCompletions=getCoreSpiritCompletions('ver',{prefix:'ver',mode:'global'},'//@ver');
assert.ok(versionDirectiveCompletions.some(item=>item.label==='//@version=6'),'Pine version annotation must be suggested while entering its directive');
for(const label of ['indicator','strategy','library','switch','var','varip','for','while','enum','import'])
  assert.ok(completions.some(item=>item.label===label),`Pine completion missing ${label}`);
assert.ok(completions.find(item=>item.label==='indicator')?.detail.includes('partially_conformant'),
  'editor completion maturity must come from the same fixture-backed registry');
console.log('CORESPIRIT_PINE_FEATURE_REGISTRY_OK',JSON.stringify(summary));
