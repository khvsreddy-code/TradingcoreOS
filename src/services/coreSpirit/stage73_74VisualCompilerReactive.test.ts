import { CoreSpiritCompiler } from './compiler';
import { CoreSpiritParser } from './parser';
import { CoreSpiritRuntime } from './runtime';
import { validateCoreSpiritRoadmap } from './coreSpiritRoadmap';
import { validateCoreSpiritIr } from './irContract';

function parse(source: string) {
  return new CoreSpiritParser(source).parse();
}

export function runStage73_74VisualCompilerReactiveContract() {
  const source = `let fast = ema(close, 20)\nlet slow = ema(close, 50)\nlet cross = crossover(fast, slow)\nif (cross) { signal("LONG") }\nplot(fast)`;
  const compiler = new CoreSpiritCompiler();
  const compiled = compiler.compile(parse(source), 'stage73-74');
  if (!compiled.ir || !compiled.artifact) throw new Error('stage73-74 compilation failed');
  if (!validateCoreSpiritIr(compiled.ir)) throw new Error('stage73-74 produced invalid IR');
  const graphs = compiled.ir.graphs;
  if (!graphs) throw new Error('visual compiler graph metadata missing');
  if (graphs.semantic.nodes.length !== compiled.ir.entry.instructions.length) throw new Error('semantic graph does not cover all instructions');
  if (graphs.execution.order.length !== graphs.semantic.nodes.length) throw new Error('execution graph order mismatch');
  if (!graphs.visual.layers.visual.length || !graphs.visual.layers.signal.length) throw new Error('visual graph did not capture visual and signal outputs');
  const signalNode = graphs.semantic.nodes.find(n => n.kind === 'signal');
  const visualNode = graphs.semantic.nodes.find(n => n.kind === 'visual');
  if (!signalNode?.dependencies.length || !visualNode?.dependencies.length) throw new Error('graph dependency edges missing');
  if (validateCoreSpiritRoadmap().length) throw new Error(`roadmap invalid: ${validateCoreSpiritRoadmap().join('; ')}`);

  const runtime = new CoreSpiritRuntime({ sourceId:'stage73-74', symbol:'NIFTY', timeframe:'5m', executionMode:'realtime', reactiveExecution:true });
  runtime.execute({ id:'stage73-74', ast: parse('let fast = ema(close, 20)\nlet filtered = fast + 0\nplot(filtered)') } as any, [
    {timestamp:'2026-01-01T09:15:00Z',open:100,high:101,low:99,close:100,volume:1000}
  ]);
  const first = runtime.getReactiveExecutionStats();
  runtime.executeBar({timestamp:'2026-01-01T09:15:00Z',open:100,high:101,low:99,close:100,volume:1200});
  const second = runtime.getReactiveExecutionStats();
  if (second.reused <= 0) throw new Error('reactive runtime did not reuse any unaffected computation');
  if (second.recomputed <= 0 || second.effects <= 0) throw new Error('reactive runtime did not preserve recomputation/effect accounting');
  runtime.rollbackRealtimeBar();
  const afterRollback = runtime.getReactiveExecutionStats();
  if (afterRollback.reused !== 0 || afterRollback.recomputed !== 0) throw new Error('reactive cache leaked across rollback');
  if (first.revision <= 0) throw new Error('reactive revision did not start');
  return 'STAGE73_74_VISUAL_COMPILER_REACTIVE_OK';
}

