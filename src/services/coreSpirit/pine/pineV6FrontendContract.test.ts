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

const alertIndicator = frontend.parse(`//@version=6
indicator("Alert semantics")
alert("tick", alert.freq_all)`);
assert.ok(alertIndicator.ast,alertIndicator.diagnostics.map(item=>item.message).join('; '));
const alertCompiled = new CoreSpiritCompiler().compileSource(alertIndicator.normalizedSource,'pine-alert-semantics',{frontend:'pine-v6'});
assert.ok(alertCompiled.ir,alertCompiled.diagnostics.map(item=>item.code+': '+item.message).join('\n'));
assert.ok(alertCompiled.ir!.entry.instructions.some(item=>item.op==='const'&&item.value==='all'),
  'alert.freq_all must lower to its Pine frequency enum value');
const indicatorStrategyApi = frontend.parse([
  '//@version=6',
  'indicator("No strategy API")',
  'strategy.entry("Long", strategy.long)',
].join('\n'));
assert.equal(indicatorStrategyApi.diagnostics[0]?.code,'PINE_STRATEGY_NAMESPACE_REQUIRES_STRATEGY');

const strategySource = [
  '//@version=6',
  'strategy("Simulation only", pyramiding=1)',
  'strategy.entry("Long", strategy.long, 2)',
  'strategy.entry("Long OCA", strategy.long, 1, 100, 101, "entry-group", strategy.oca.reduce)',
  'strategy.order("Scale", strategy.short, 1, 105, 106)',
  'strategy.order("OCA", strategy.long, 1, 105, 106, "entry-group", strategy.oca.reduce)',
  'strategy.exit("Exit", "Long", 1, 50, 5, 105, 5, 98)',
  'strategy.close("Long", "manual", 1)',
  'strategy.close_all()',
  'strategy.cancel("Scale")',
  'strategy.cancel_all()',
].join('\n');
const strategyParsed = frontend.parse(strategySource);
assert.ok(strategyParsed.ast,strategyParsed.diagnostics.map(item=>item.message).join('; '));
const strategyCompiled = new CoreSpiritCompiler().compileSource(strategyParsed.normalizedSource,'pine-strategy-simulation',{frontend:'pine-v6'});
assert.ok(strategyCompiled.ir,strategyCompiled.diagnostics.map(item=>item.code+': '+item.message).join('\n'));
for(const kind of ['strategyEntry','strategyOrder','strategyExit','strategyClose','strategyCloseAll','strategyCancel','strategyCancelAll']){
  assert.ok(strategyCompiled.ir!.entry.instructions.some(item=>item.op==='emit'&&item.kind===kind),
    'Pine '+kind+' should compile to a dedicated simulation-only command');
}



const varSource = [
  '//@version=6',
  'indicator("Pine var modes")',
  'var int barCount = 0',
  'varip int tickCount = 0',
  'barCount := barCount + 1',
  'tickCount := tickCount + 1',
  'plot(barCount)',
  'plot(tickCount)',
].join('\n');
const varCompiled = new CoreSpiritCompiler().compileSource(varSource, 'pine-var-modes', { frontend:'pine-v6' });
assert.ok(varCompiled.ir, varCompiled.diagnostics.map(item => item.code + ': ' + item.message).join('\n'));
const stateInstructions = varCompiled.ir!.entry.instructions.filter(item => item.op === 'setState');
assert.ok(stateInstructions.some(item => item.op === 'setState' && item.name === 'barCount' && item.storage === 'persistent'));
assert.ok(stateInstructions.some(item => item.op === 'setState' && item.name === 'tickCount' && item.storage === 'intrabar'));

const normalDeclarations = [
  '//@version=6',
  'indicator("Pine declarations")',
  'float currentClose = close',
  'int sampleCount = 1',
  'latest = close',
  'plot(currentClose)',
  'plot(sampleCount)',
  'plot(latest)',
].join('\n');
const normalCompiled = new CoreSpiritCompiler().compileSource(normalDeclarations, 'pine-normal-declarations', { frontend:'pine-v6' });
assert.ok(normalCompiled.ir, normalCompiled.diagnostics.map(item => item.code + ': ' + item.message).join('\n'));
const normalSets = normalCompiled.ir!.entry.instructions.filter(item => item.op === 'setLocal');
assert.ok(normalSets.some(item => item.op === 'setLocal' && item.name === 'currentClose'));
assert.ok(normalSets.some(item => item.op === 'setLocal' && item.name === 'sampleCount'));
assert.ok(normalSets.some(item => item.op === 'setLocal' && item.name === 'latest'));
console.log('CORESPIRIT_PINE_V6_FRONTEND_OK');
