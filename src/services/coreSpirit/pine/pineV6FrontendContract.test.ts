import assert from 'node:assert/strict';
import { PineV6Frontend } from './pineV6Frontend.ts';
import { CoreSpiritCompiler } from '../compiler.ts';

const frontend=new PineV6Frontend();
for(const kind of ['indicator','strategy','library'] as const){
  const result=frontend.parse(`//@version=6\n${kind}("Pine ${kind} fixture", overlay=true)\nplot(close)`);
  assert.ok(result.ast,result.diagnostics.map(item=>item.message).join('; '));
  assert.equal(result.ast.programKind,kind);
  assert.equal(result.ast.pineDeclaration?.kind,kind);
  assert.equal(result.ast.pineDeclaration?.title,`Pine ${kind} fixture`);
  assert.equal(result.ast.pineDeclaration?.version,6);
  assert.equal(result.ast.pineDeclaration?.arguments[0]?.value,'"Pine '+kind+' fixture"');
}
const compiled=new CoreSpiritCompiler().compileSource('//@version=6\nindicator("Pine compile fixture")\nplot(close)','pine-v6-compile-fixture',{frontend:'pine-v6'});
assert.ok(compiled.ir,compiled.diagnostics.map(item=>item.code+': '+item.message).join('\n'));
assert.equal(compiled.ir?.programKind,'indicator');
assert.equal(compiled.ir?.pineDeclaration?.title,'Pine compile fixture');
assert.equal(frontend.parse('//@version=5\nindicator("old")\nplot(close)').diagnostics[0]?.code,'PINE_VERSION_UNSUPPORTED');
assert.equal(frontend.parse('//@version=6\nplot(close)').diagnostics[0]?.code,'PINE_MISSING_DECLARATION');
assert.equal(frontend.parse('//@version=6\nindicator("one")\nstrategy("two")').diagnostics[0]?.code,'PINE_DUPLICATE_OR_SCOPED_DECLARATION');

const varSource = [
  '//@version=6',
  'indicator("Pine var modes")',
  'var int barCount = 0',
  'varip int tickCount = 0',
  'barCount := barCount + 1',
  'tickCount := tickCount + 1',
  'plot(barCount)',
  'plot(tickCount)',
].join('\\n');
const varCompiled = new CoreSpiritCompiler().compileSource(varSource, 'pine-var-modes', { frontend:'pine-v6' });
assert.ok(varCompiled.ir, varCompiled.diagnostics.map(item => item.code + ': ' + item.message).join('\\n'));
const stateInstructions = varCompiled.ir!.entry.instructions.filter(item => item.op === 'setState');
assert.ok(stateInstructions.some(item => item.op === 'setState' && item.name === 'barCount' && item.storage === 'persistent'));
assert.ok(stateInstructions.some(item => item.op === 'setState' && item.name === 'tickCount' && item.storage === 'intrabar'));
console.log('CORESPIRIT_PINE_V6_FRONTEND_OK');
