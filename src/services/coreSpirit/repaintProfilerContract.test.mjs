import assert from 'node:assert/strict';

const { CoreSpiritParser } = await import('./parser.ts');
const { CoreSpiritCompiler } = await import('./compiler.ts');
const { analyzeCoreSpiritRepaintSafety } = await import('./repaintSafety.ts');
const { CoreSpiritProfiler } = await import('./profiler.ts');
const { CoreSpiritEditorModel } = await import('./editorModel.ts');

const causalSource = [
  '@causal @realtimeSafe @lookahead(false)',
  'let fast: series<float> = ema(close, 20);',
  'if bar.confirmed {',
  '  plot(fast);',
  '}',
].join('\n');

const parser = new CoreSpiritParser(causalSource);
const parsed = parser.parseDetailed();
assert.equal(parsed.diagnostics.length, 0, parsed.diagnostics.map(d => d.message).join('\n'));

const safety = analyzeCoreSpiritRepaintSafety(parsed.ast);
assert.equal(safety.causality, 'causal');
assert.equal(safety.lookahead, 'false');
assert.equal(safety.realtimeSafe, true);
assert.equal(safety.backtestLiveEquivalent, true);
assert.equal(safety.errors.length, 0);

const compiled = new CoreSpiritCompiler().compile(parsed.ast, 'repaint-contract');
assert(compiled.ir, compiled.diagnostics.map(d => d.message).join('\n'));
assert.equal(compiled.ir?.repaintSafety?.backtestLiveEquivalent, true);
assert.equal(compiled.diagnostics.some(d => d.code === 'REPAINT_SAFETY_ASSERTION'), false);

const unsafeAst = new CoreSpiritParser([
  '@causal',
  'let suspicious = future_lookup(close);',
].join('\n')).parse();
const unsafeSafety = analyzeCoreSpiritRepaintSafety(unsafeAst);
assert(unsafeSafety.errors.some(message => message.includes('@causal assertion failed')), 'future-dependent inputs must invalidate @causal');

const profiler = new CoreSpiritProfiler({ enabled:true, mode:'full', retainSamples:128 });
profiler.beginBar('realtime', 3);
const instruction = { op:'call', dest:'t0', name:'ema', args:[], callId:'ema:test' };
profiler.beforeInstruction(0, instruction);
await new Promise(resolve => setTimeout(resolve, 0));
profiler.afterInstruction(0, instruction);
profiler.recordAllocation(0);
profiler.endBar();
const profile = profiler.snapshot();
assert.equal(profile.enabled, true);
assert(profile.instructions >= 1);
assert(profile.realtimeMs >= 0);
assert(profile.topNodes.some(node => node.label === 'ema'));
assert(profile.flameGraph.length >= 1);

const editor = new CoreSpiritEditorModel(causalSource);
const editorSnapshot = editor.getSnapshot();
assert.equal(editorSnapshot.repaintSafety.backtestLiveEquivalent, true);
editor.setProfilerSnapshot(profile);
assert.equal(editor.getSnapshot().profiler?.version, 1);

console.log('TCO_CORESPIRIT_BRANCH14_15_REPAINT_PROFILER_CONTRACT_OK');
