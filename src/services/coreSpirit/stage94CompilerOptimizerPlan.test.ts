import { CoreSpiritCompiler } from './compiler';
import { parseCoreSpirit } from './coreSpiritPipeline';
import { validateCoreSpiritIr } from './irContract';

const source = [
  'let repeatedA = close + 1',
  'let repeatedB = close + 1',
  'let fast = ema(close, 20)',
  'let slow = ema(close, 50)',
  'let fastSmooth = sma(fast, 10)',
  'let slowSmooth = sma(slow, 10)',
  'plot(fastSmooth)',
  'plot(slowSmooth)',
].join('\n');

const compiled = new CoreSpiritCompiler().compile(parseCoreSpirit(source), 'stage94-compiler-optimizer', { layer:'script' });
if (!compiled.ir) throw new Error(compiled.diagnostics.map(d=>d.message).join('; ') || 'compiler did not emit IR');
const ir = compiled.ir;

const assert=(condition:boolean,message:string)=>{if(!condition)throw new Error(message);};

assert(validateCoreSpiritIr(ir),'final CoreSpirit IR contract failed');
assert(ir.compilerPipeline?.stages.join(' > ') === 'source > cst > ast > semantic-analysis > semantic-graph > typed-ir > dependency-graph > optimizer > execution-plan','compiler stage trace is incomplete or reordered');
assert(ir.semanticDependencyGraph?.version === 1,'semantic dependency graph was not attached to the executable artifact');
assert(ir.optimizationPlan?.version === 1,'optimization plan was not attached to the executable artifact');
assert(ir.executionPlan?.version === 1,'execution plan was not attached to the executable artifact');
assert((ir.optimizationPlan?.cost.sourceReadReuse ?? 0) >= 2,'duplicate close reads were not reused by the optimizer');
assert((ir.optimizationPlan?.cost.cseEliminated ?? 0) >= 2,'safe duplicate pure expressions were not eliminated');
assert((ir.optimizationPlan?.cost.estimatedSavedBarWork ?? 0) > 0,'optimizer did not expose positive saved work');
assert(ir.optimizationPlan?.cost.chronologicalPasses === 1,'optimizer must preserve one chronological traversal');
assert(ir.executionPlan?.chronologicalPasses === 1,'execution plan must retain one chronological pass');
assert(ir.executionPlan?.sourceReadReuse === ir.optimizationPlan?.cost.sourceReadReuse,'execution planner lost optimizer reuse metrics');
assert(ir.executionPlan?.estimatedSavedWorkUnits > 0,'execution planner did not convert optimizer savings into workload savings');
assert((ir.executionPlan?.seriesFusion.groups.length ?? 0) >= 2,'parallel indicator chains were not recognized as two streaming fusion groups');
assert((ir.optimizationPlan?.explanation.some(text=>text.includes('Stateful indicator calls remain ordered')) ?? false),'optimizer did not explicitly protect stateful chronology');

console.log('STAGE94_CORESPIRIT_COMPILER_OPTIMIZER_PLAN_OK');
