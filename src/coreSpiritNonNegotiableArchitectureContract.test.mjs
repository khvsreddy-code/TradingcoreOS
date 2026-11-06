import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  CORE_SPIRIT_ARCHITECTURE_NODES,
  CORE_SPIRIT_EXECUTION_GRAPH,
  CORE_SPIRIT_FORBIDDEN_DEPENDENCIES,
  CORE_SPIRIT_PLATFORM_PHILOSOPHY,
  validateCoreSpiritArchitectureEdges,
} from './services/coreSpirit/architectureContract.ts';

const root = process.cwd();
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const owners = new Map(CORE_SPIRIT_ARCHITECTURE_NODES.map((node) => [node.id, node.owner]));
for (const [plane, owner] of [
  ['language', 'corespirit'],
  ['ir', 'corespirit'],
  ['vm', 'corespirit'],
  ['external-compute', 'isolated-host'],
  ['visual', 'corespirit'],
  ['vela-output-adapter', 'adapter'],
  ['chart-rendering', 'vela'],
]) {
  assert.equal(owners.get(plane), owner, `Architecture ownership changed for ${plane}`);
}

const requiredOrder = ['language', 'ir', 'vm', 'external-compute', 'visual', 'vela-output-adapter', 'chart-rendering'];
const positions = requiredOrder.map((plane) => CORE_SPIRIT_EXECUTION_GRAPH.indexOf(plane));
assert.ok(positions.every((position) => position >= 0), 'The canonical execution graph is missing an ownership plane.');
assert.ok(positions.every((position, index) => index === 0 || position > positions[index - 1]),
  'CoreScript → IR → VM → bounded compute → semantic output → Vela adapter → Vela rendering order was changed.');

for (const edge of [
  ['language', 'external-compute'],
  ['language', 'vm'],
  ['external-compute', 'language'],
  ['external-compute', 'ir'],
  ['external-compute', 'vm'],
  ['external-compute', 'data-host'],
  ['external-compute', 'automation'],
  ['external-compute', 'risk'],
  ['external-compute', 'execution-authority'],
  ['external-compute', 'execution'],
  ['external-compute', 'broker'],
  ['vm', 'execution-authority'],
  ['vm', 'execution'],
  ['visual', 'chart-rendering'],
  ['chart-rendering', 'language'],
  ['chart-rendering', 'vm'],
  ['chart-rendering', 'visual'],
]) {
  assert.ok(CORE_SPIRIT_FORBIDDEN_DEPENDENCIES.some(([from, to]) => from === edge[0] && to === edge[1]),
    `Missing forbidden architecture edge ${edge[0]} -> ${edge[1]}`);
  assert.deepEqual(validateCoreSpiritArchitectureEdges([edge]), [
    `forbidden direct dependency: ${edge[0]} -> ${edge[1]}`,
  ]);
}

assert.match(CORE_SPIRIT_PLATFORM_PHILOSOPHY.languageRule, /CoreScript owns parsing.*typing.*lowering/);
assert.match(CORE_SPIRIT_PLATFORM_PHILOSOPHY.executionRule, /canonical CoreSpirit IR is the only executable representation/);
assert.match(CORE_SPIRIT_PLATFORM_PHILOSOPHY.polyglotRule, /isolated compute hosts.*typed, bounded request\/response ABI/);
assert.match(CORE_SPIRIT_PLATFORM_PHILOSOPHY.velaRule, /Vela owns chart scene lifecycle/);

const pipeline = read('src/services/coreSpirit/coreSpiritPipeline.ts');
const ir = read('src/services/coreSpirit/ir.ts');
const vm = read('src/services/coreSpirit/executionVM.ts');
const runtime = read('src/services/coreSpirit/runtime.ts');
const worker = read('src/services/coreSpirit/coreSpirit.worker.ts');
const chartRunner = read('src/services/coreSpirit/chartRunner.ts');
const velaEngine = read('src/CoreSpiritVelaEngine.ts');
const polyglot = read('src/services/coreSpirit/polyglotModules.ts');
const nativeHost = read('src/services/coreSpirit/polyglotServiceHost.ts');
const pythonHost = read('src/services/coreSpirit/pythonModuleServiceHost.ts');
const velaOutput = read('src/services/coreSpirit/velaOutputAdapter.ts');
const velaSemanticAdapter = read('src/services/core/chart/tcoVelaSemanticAdapter.ts');
const velaNativeRenderer = read('vendor/vela/src/renderers/native/NativeRenderer.ts');

// CoreScript is the only language front-end: parse, analyze, type-check/compile and lower.
assert.match(pipeline, /new CoreSpiritParser/);
assert.match(pipeline, /analyzeCoreSpirit/);
assert.match(pipeline, /new CoreSpiritCompiler\(\)/);
assert.doesNotMatch(pipeline, /from ['"][^'"]*(?:polyglot|pythonModuleServiceHost|velaOutputAdapter|tcoVelaSemanticAdapter)/i,
  'The language/compiler pipeline must not depend on foreign runtimes or chart rendering adapters.');

// The IR is a first-class, typed executable ABI; both VM implementations consume that same instruction model.
assert.match(ir, /export type CoreSpiritIrInstruction/);
assert.match(ir, /export type CoreSpiritIrProgram/);
assert.doesNotMatch(ir, /CoreSpiritPolyglotHost|CoreSpiritRuntime|NativeRenderer/);
assert.match(vm, /instructions:\s*CoreSpiritIrInstruction\[\]/);
assert.match(vm, /switch\s*\(ins\.op\)/);
assert.doesNotMatch(vm, /CoreSpiritPolyglotHost|NativeRenderer|requestAnimationFrame/);

assert.match(runtime, /this\.assertCanonicalExecutableIr\(ir\)/,
  'Runtime execution must validate canonical IR rather than treating source or AST as executable.');
assert.match(runtime, /this\.executionVm\.run\(instructions/);
assert.match(runtime, /this\.optimizedExecutionVm\.run\(instructions/);
assert.doesNotMatch(runtime, /CoreSpiritPolyglotHost|CoreSpiritPythonModuleServiceHost|CoreSpiritIsolatedPolyglotServiceHost/);

assert.match(worker, /runtime\.loadIr\(message\.artifact\.ir\)/);
assert.match(worker, /context\.runtime\.executeIr\(context\.artifact\.ir/);
assert.match(chartRunner, /runCoreSpiritArtifactInWorker\(/);
assert.match(chartRunner, /coreSpiritWorkerPool\.runArtifact\(artifact/);
assert.match(velaEngine, /runCoreSpiritArtifactInWorker\(token\.artifact/);
assert.match(velaEngine, /adaptCoreSpiritOutputsForVela\(result\.outputs,\s*currentBars\)/);
assert.match(velaEngine, /buildCoreSpiritVelaIndicatorModel\(/);
assert.match(velaEngine, /handlers\.onModel\(/);
assert.match(velaEngine, /handlers\.onScenePatches\?\./);
assert.doesNotMatch(velaEngine, /new CoreSpiritRuntime|new CoreSpiritExecutionVM|NativeRenderer/);

// External languages are typed, quota-limited compute requests; their service adapters are server-only.
assert.match(polyglot, /CoreSpiritPolyglotRequest/);
assert.match(polyglot, /CoreSpiritPolyglotResponse/);
assert.match(polyglot, /CoreSpiritPolyglotTensor/);
assert.match(polyglot, /validateTensor\(/);
assert.match(polyglot, /coreSpiritPolyglotResponseChecksum/);
assert.match(polyglot, /Promise\.race\(\[host\.invoke\(/);
assert.doesNotMatch(polyglot, /CoreSpiritIrProgram|CoreSpiritIrInstruction|CoreSpiritExecutionVM|CoreSpiritRuntime|NativeRenderer|brokerAdapter/i);
for (const [source, label] of [[nativeHost, 'native'], [pythonHost, 'Python']]) {
  assert.match(source, /typeof window\s*!==?\s*['"]undefined['"]/);
  assert.match(source, /url\.protocol\s*!==\s*['"]https:['"]/);
  assert.match(source, /CoreSpiritPolyglotRequest/);
  assert.match(source, /CoreSpiritPolyglotResponse/);
  assert.doesNotMatch(source, /CoreSpiritIrProgram|CoreSpiritExecutionVM|CoreSpiritRuntime|NativeRenderer/);
  assert.ok(source.includes('authorization'), `${label} host must authenticate its isolated service calls.`);
}

// CoreSpirit translates semantic output; it never paints. Vela's vendored renderer owns pixels and frame scheduling.
assert.match(velaOutput, /adaptCoreSpiritOutputsForVela/);
assert.match(velaOutput, /CoreSpiritObject/);
assert.doesNotMatch(velaOutput, /NativeRenderer|requestAnimationFrame|WebGLRenderingContext/);
assert.match(velaSemanticAdapter, /IndicatorModel/);
assert.match(velaSemanticAdapter, /CoreSpiritObject/);
assert.doesNotMatch(velaSemanticAdapter, /NativeRenderer|requestAnimationFrame|WebGLRenderingContext|\.getContext\(/);
assert.match(velaNativeRenderer, /class NativeRenderer/);
assert.match(velaNativeRenderer, /requestAnimationFrame/);
assert.match(velaNativeRenderer, /canvas/i);

console.log('CORESPIRIT_NON_NEGOTIABLE_ARCHITECTURE_OK');
