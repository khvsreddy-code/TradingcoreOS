import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CoreSpiritCompiler } from './compiler.ts';
import { CORE_SPIRIT_COMPILER_STAGE_ORDER, validateCoreSpiritCompilerPipelineTrace } from './compilerPipeline.ts';
import { validateCoreSpiritIr } from './irContract.ts';

const compilerSource = readFileSync('src/services/coreSpirit/compiler.ts', 'utf8');
const artifactIdentitySource = readFileSync('src/services/coreSpirit/artifactLookupIdentity.ts', 'utf8');
assert.doesNotMatch(compilerSource, /createCoreSpiritCompilationUnit/, 'the executable path must not analyze a unit and then analyze it again');
assert.match(compilerSource, /resolveCoreSpiritNames\(ast/);
assert.match(compilerSource, /analyzeCoreSpirit\(ast/);
assert.match(compilerSource, /semanticContainers/, 'matrix/tensor capability flags must derive from semantic types');
assert.doesNotMatch(compilerSource, /const hasMatrix\s*=\s*\//, 'matrix capability must not use source-text regex');
assert.doesNotMatch(compilerSource, /const hasTensor\s*=\s*\//, 'tensor capability must not use source-text regex');
assert.match(artifactIdentitySource, /compilerPipeline:'semantic-v3'/, 'persisted artifacts from the previous compiler pipeline must use a different cache identity');

const result = new CoreSpiritCompiler().compileSource('let fast = ema(close, 9)', 'canonical-pipeline-contract');
assert.ok(result.ir, result.diagnostics.map(item => item.message).join('\n'));
assert.ok(result.artifact, 'successful compilation must emit a VM artifact');
assert.ok(result.symbols?.some(symbol => symbol.name === 'fast'), 'IDE symbols must come from the canonical semantic pass');
assert.equal(validateCoreSpiritIr(result.ir), true, 'VM boundary must be the validated IR contract');
assert.equal(validateCoreSpiritCompilerPipelineTrace(result.ir.compilerPipeline), true);
assert.deepEqual(result.ir.compilerPipeline.stages, CORE_SPIRIT_COMPILER_STAGE_ORDER);
assert.equal(result.ir.compilerPipeline.runtimeBoundary, 'CoreSpiritExecutionVM');
console.log('CORESPIRIT_CANONICAL_COMPILER_PIPELINE_OK');
