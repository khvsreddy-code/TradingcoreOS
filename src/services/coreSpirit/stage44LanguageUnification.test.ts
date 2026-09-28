import { CORE_SPIRIT_BUILTINS, CORE_SPIRIT_STDLIB } from './standardLibrary';
import { CORE_SPIRIT_MEMBER_REGISTRY, getCoreSpiritMemberContract } from './memberRegistry';
import { CORE_SPIRIT_SURFACE_TRANSFORMS } from './surfaceForms';
import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { normalizeCoreSpiritSource } from './syntax';
import { getCoreSpiritCompletions } from './languageService';

function hasEmit(source: string, kind: string): boolean {
  const parsed = new CoreSpiritParser(normalizeCoreSpiritSource(source)).parseDetailed();
  if (parsed.diagnostics.length) throw new Error(parsed.diagnostics.map(d => d.message).join('; '));
  const compiled = new CoreSpiritCompiler().compile(parsed.ast, `stage44:${kind}`);
  if (!compiled.ir) throw new Error(compiled.diagnostics.map(d => d.message).join('; '));
  return compiled.ir.entry.instructions.some((instruction: any) => instruction.op === 'emit' && instruction.kind === kind);
}

export function runStage44LanguageUnificationContract() {
  const requiredEmitKinds = [
    'plot','marker','label','labelAt','line','zone','box','band','fill','gradient','arrow',
    'shape','heatmap','polyline','hline','bg','barcolor','table','text','polygon','customVisual',
    'signal','entry','exit','buy','sell','alert','webhook','show','event','orderIntent',
  ];
  for (const kind of requiredEmitKinds) {
    const builtin = Array.from(CORE_SPIRIT_BUILTINS.values()).find(item => item.emitKind === kind);
    if (!builtin) throw new Error(`builtin registry has no emit descriptor for ${kind}`);
  }

  if (!getCoreSpiritMemberContract('visual', 'line') || !getCoreSpiritMemberContract('scan', 'emit'))
    throw new Error('member registry is missing required namespace contracts');

  const memberSource = `
    ui.panel("Controls").number("Size", 10, "setSize")
    visual.line("l", time, close, time, close)
    scan.universe("NIFTY500")
    scan.emit(0.9, "NIFTY", "high")
  `;
  const memberParsed = new CoreSpiritParser(memberSource).parseDetailed();
  if (memberParsed.diagnostics.length) throw new Error(memberParsed.diagnostics.map(d => d.message).join('; '));
  const memberCompiled = new CoreSpiritCompiler().compile(memberParsed.ast, 'stage44:members');
  if (!memberCompiled.ir) throw new Error(memberCompiled.diagnostics.map(d => d.message).join('; '));
  const calls = memberCompiled.ir.entry.instructions.filter((instruction: any) => instruction.op === 'call');
  if (!calls.some((instruction: any) => instruction.name === 'ui.panel.number')) throw new Error('UI member lowering did not use registry callName');
  if (!calls.some((instruction: any) => instruction.name === 'visual.line')) throw new Error('visual member lowering did not use registry callName');
  if (!calls.some((instruction: any) => instruction.name === 'scan.emit')) throw new Error('scan member lowering did not use registry callName');
  if (!hasEmit(memberSource, 'scanCandidate')) throw new Error('member registry emitKind did not lower scan.emit to scanCandidate');

  const concise = normalizeCoreSpiritSource(`
    strategy("Unified")
    input length = int(20, min: 1)
    fast = ema(close, length)
    slow = ema(close, 50)
    if fast crossesAbove slow { plot fast }
  `);
  const ast = new CoreSpiritParser(concise).parse();
  if (ast.body.length < 4) throw new Error('surface normalization lost executable statements');
  if (!concise.includes('let length: int = 20;')) throw new Error('typed input surface rule missing');
  if (!concise.includes('crossover(fast, slow)')) throw new Error('crossover surface rule missing');
  if (!concise.includes('if (crossover(fast, slow)) {')) throw new Error('if surface rule did not converge to core grammar');

  const completions = getCoreSpiritCompletions('', { mode:'member', cursor: 18 }, 'visual.');
  if (!completions.some(item => item.label === 'line') || !completions.some(item => item.label === 'heatmap'))
    throw new Error('editor member completion is not sourced from the shared registry');

  if (CORE_SPIRIT_SURFACE_TRANSFORMS.length !== 11) throw new Error('surface transform registry unexpectedly changed');
  if (CORE_SPIRIT_MEMBER_REGISTRY.length < 20) throw new Error('member contract registry is unexpectedly incomplete');
  if (CORE_SPIRIT_STDLIB.some(builtin => builtin.emitKind && !requiredEmitKinds.includes(builtin.emitKind)))
    throw new Error('stdlib contains an unrecognized emit descriptor');

  return 'STAGE44_LANGUAGE_UNIFICATION_OK';
}
