import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CoreSpiritCompiler } from './compiler.ts';
import { CORE_SPIRIT_COMPILER_STAGE_ORDER, validateCoreSpiritCompilerPipelineTrace, createCoreSpiritCompilationUnit } from './compilerPipeline.ts';
import { validateCoreSpiritIr } from './irContract.ts';
import { executeCoreSpirit } from './coreSpiritPipeline.ts';
import { CoreSpiritParser } from './parser.ts';
import { normalizeCoreSpiritSource } from './syntax.ts';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts.ts';
import { validateCoreScriptCapabilityRequirementsFromAst } from './coreScriptLanguagePolicy.ts';

const compilerSource = readFileSync('src/services/coreSpirit/compiler.ts', 'utf8');
const artifactIdentitySource = readFileSync('src/services/coreSpirit/artifactLookupIdentity.ts', 'utf8');
const capabilityPolicySource = readFileSync('src/services/coreSpirit/coreScriptLanguagePolicy.ts', 'utf8');
const coreSpiritPipelineSource = readFileSync('src/services/coreSpirit/coreSpiritPipeline.ts', 'utf8');
assert.doesNotMatch(compilerSource, /createCoreSpiritCompilationUnit/, 'the executable path must not analyze a unit and then analyze it again');
assert.match(compilerSource, /resolveCoreSpiritNames\(ast/);
assert.match(coreSpiritPipelineSource, /const compiled = compileCoreSpirit\(source, sourceId\)/,
  'convenience execution must use the canonical executable compiler');
assert.doesNotMatch(coreSpiritPipelineSource, /runtime\.executeIr\(runtime\.loadProgram\(program\),bars\)/,
  'the convenience execution path may not bypass canonical artifact validation');
assert.match(compilerSource, /validateCoreScriptCapabilityRequirementsFromAst\(ast, surface, semanticDependencyGraph\.nodes\)/, 'host capability requirements must be derived from canonical AST and semantic metadata');
assert.doesNotMatch(capabilityPolicySource, /\.split\('\\n'\)/, 'capability usage must not be found by splitting and regex-scanning source lines');
assert.doesNotMatch(compilerSource, /validateCoreScriptCapabilityRequirements\(options\.researchSource/, 'the compiler may not infer privileged capability requirements from source regex');
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

// Editor recovery/partial parsing is explicitly non-executable, even when it
// returns an AST useful for diagnostics. Only the compiler's validated artifact
// can cross the VM boundary.
const partial = createCoreSpiritCompilationUnit('let x = (', {});
assert.equal(partial.kind, 'partial-diagnostics');
assert.equal(partial.executable, false);
assert.ok(partial.diagnostics.some(item => item.severity === 'error'));
assert.equal('artifact' in partial, false);
assert.throws(() => executeCoreSpirit('let x = (', []),
  'a recovered/partial parse must never reach the executable runtime');

// Comments and string literals are data, not capability use. The old source-regex
// capability check incorrectly treated both as requests for host privileges.
const noFalsePositive = new CoreSpiritCompiler().compileSource(
  '// webhook("comment-only")\nlet note = "risk.evaluate() and automation.notify()"\nlet average = ema(close, 9)',
  'canonical-capability-source-fixture',
);
assert.ok(noFalsePositive.ir, noFalsePositive.diagnostics.map(item => item.message).join('\n'));
assert.deepEqual(noFalsePositive.ir.requiredCapabilities, []);

const eventAst = new CoreSpiritParser(normalizeCoreSpiritSource('on market.tick { webhook("endpoint") }')).parse();
const capabilityResult = validateCoreScriptCapabilityRequirementsFromAst(
  eventAst,
  extractCoreSpiritSurfaceMetadata('on market.tick { webhook("endpoint") }'),
);
assert.deepEqual(
  capabilityResult.requirements.map(item => item.capability).sort(),
  ['market.tick', 'webhooks'],
  'actual event and webhook AST nodes must produce required capabilities',
);
assert.equal(capabilityResult.errors.length, 2, 'undeclared event and webhook capabilities must fail closed');

console.log('CORESPIRIT_CANONICAL_COMPILER_PIPELINE_OK');
