import { CoreSpiritParser } from './parser';
import { CoreSpiritCompiler } from './compiler';
import { describeCoreSpiritSurface } from './surfaceForms';
import { planCoreSpiritSeriesFusion, validateCoreSpiritSeriesFusionPlan, executeCoreSpiritSeriesFusionGroup } from './seriesFusion';
import { executeCoreSpiritFusedSeriesPipeline } from './seriesVector';
import { planCoreSpiritExecution } from './executionPlanner';
import { CORE_SPIRIT_BUILTINS } from './standardLibrary';

const source = `
let x = sma(close, 3)
let y = stdev(x, 2)
let z = zscore(y, 2)
plot(z)
`;

const parser = new CoreSpiritParser(source).parseDetailed();
if (parser.diagnostics.length) throw new Error(parser.diagnostics.map(item => item.message).join('; '));
const compiler = new CoreSpiritCompiler();
const compiled = compiler.compile(parser.ast, 'stage93', { surface: describeCoreSpiritSurface(source) });
if (!compiled.ir) throw new Error(compiled.diagnostics.map(item => item.message).join('; '));

const fusion = planCoreSpiritSeriesFusion(compiled.ir);
const fusionErrors = validateCoreSpiritSeriesFusionPlan(fusion);
if (fusionErrors.length) throw new Error(fusionErrors.join('; '));
if (fusion.groups.length !== 1) throw new Error(`expected one fusion group, got ${fusion.groups.length}`);
if (fusion.groups[0].operations.map(operation => operation.name).join('>') !== 'sma>stdev>zscore') throw new Error('series chain was not maximally fused');
if (fusion.groups[0].intermediateSeriesAllocations !== 0) throw new Error('fusion plan allocates intermediate full series');

const input = new Float64Array([100, 102, 101, 105, 106, 104, 108, 110]);
const fused = executeCoreSpiritSeriesFusionGroup(fusion.groups[0], { register:fusion.groups[0].inputRegister, values:input });
if (fused.output.length !== input.length) throw new Error('fused output length mismatch');
if (fused.stats.fusedPasses !== 1) throw new Error('fused executor did not use one chronological pass');
if (fused.stats.intermediateAllocations !== 3) throw new Error('unexpected stage workspace allocation accounting');

const empty = executeCoreSpiritFusedSeriesPipeline(input, []);
if (empty.output !== input && empty.output.length !== input.length) throw new Error('empty series pipeline did not preserve shape');

const executionPlan = planCoreSpiritExecution(compiled.ir, { barCount: input.length });
if (executionPlan.seriesFusion.groups.length !== 1) throw new Error('execution planner did not absorb series fusion plan');
if (!executionPlan.explanation.some(value => value.includes('series fusion'))) throw new Error('execution plan explanation omitted fusion');

const nonFusableSource = `let a = sma(close, 3); let b = ema(a, 3); plot(b)`;
const nonParsed = new CoreSpiritParser(nonFusableSource).parseDetailed();
if (nonParsed.diagnostics.length) throw new Error(nonParsed.diagnostics.map(item => item.message).join('; '));
const nonCompiled = compiler.compile(nonParsed.ast, 'stage93-nonfusable', { surface: describeCoreSpiritSurface(nonFusableSource) });
if (!nonCompiled.ir) throw new Error(nonCompiled.diagnostics.map(item => item.message).join('; '));
const nonFusion = planCoreSpiritSeriesFusion(nonCompiled.ir);
if (nonFusion.groups.length !== 0) throw new Error('stateful EMA chain was incorrectly fused');

if (CORE_SPIRIT_BUILTINS.get('pctchange')?.seriesExecution?.fusible !== true) throw new Error('pctchange lacks vector/fusion contract');
if (CORE_SPIRIT_BUILTINS.get('ema')?.seriesExecution?.fusible !== false) throw new Error('EMA fusion contract is not stateful-safe');

console.log('STAGE93_FIRST_CLASS_SERIES_OK');
console.log('STAGE93_OPERATION_FUSION_OK');
console.log('STAGE93_SERIES_BACKEND_METADATA_OK');
