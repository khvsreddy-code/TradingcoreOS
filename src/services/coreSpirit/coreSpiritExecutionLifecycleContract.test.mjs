import assert from 'node:assert/strict';
import {
  CORE_SPIRIT_LIFECYCLE_STEPS, coreSpiritLifecycleDiagnostic, coreSpiritLifecycleLabel,
  coreSpiritLifecycleStageForError, publishCoreSpiritLifecycle, validateCoreSpiritChartCapabilities,
} from './coreSpiritExecutionLifecycle.ts';
import { compileCoreSpirit } from './coreSpiritPipeline.ts';

assert.deepEqual(CORE_SPIRIT_LIFECYCLE_STEPS, [
  'editing', 'compiling', 'compiled', 'validating-capabilities', 'executing-historical',
  'validating-outputs', 'applying-chart-output', 'rendered',
], 'the editor lifecycle must expose each compiler-to-chart stage in execution order');
assert.equal(coreSpiritLifecycleLabel('rendered'), 'Rendered');
assert.equal(coreSpiritLifecycleLabel('output-rejected'), 'Output rejected');

const compiled = compileCoreSpirit('indicator("Lifecycle contract") { overlay: true }\nlet fast = ema(close, 9)\nplot fast', 'lifecycle-contract', { layer: 'script' });
assert.ok(compiled.ir, 'the test fixture must produce compiler IR');
const policy = validateCoreSpiritChartCapabilities(compiled.ir);
assert.deepEqual(policy.filter(item => item.severity === 'error'), [], 'a basic chart indicator passes the shared chart capability gate');

const denied = validateCoreSpiritChartCapabilities({ requiredCapabilities: ['automation'] } as any);
assert.ok(denied.some(item => item.code === 'CHART_CAPABILITY_DENIED' && item.severity === 'error'),
  'the shared chart gate must reject automation capabilities outside the chart target');

const alignmentError = { code: 'CORESPIRIT_VELA_TIME_ALIGNMENT', message: 'Series output 4 does not match a canonical chart bar.' };
assert.equal(coreSpiritLifecycleStageForError(alignmentError, 'applying-chart-output'), 'output-rejected');
const alignmentDiagnostic = coreSpiritLifecycleDiagnostic(alignmentError, 'output-rejected', { previousOutputPreserved: true, outputId: 'EMA:series:fast' });
assert.equal(alignmentDiagnostic.code, 'CORESPIRIT_VELA_TIME_ALIGNMENT');
assert.equal(alignmentDiagnostic.outputId, 'EMA:series:fast');
assert.equal(alignmentDiagnostic.previousOutputPreserved, true);
assert.ok(alignmentDiagnostic.suggestedCorrection?.includes('canonical chart bar'), 'timestamp failures include a concrete correction');

const deniedError = { name: 'CoreSpiritCapabilityDeniedError', message: 'Capability denied' };
assert.equal(coreSpiritLifecycleStageForError(deniedError), 'capability-denied');
const renderError = { code: 'CORESPIRIT_RENDER_COMMIT_FAILED', message: 'Vela refused the output patch.' };
assert.equal(coreSpiritLifecycleStageForError(renderError, 'applying-chart-output'), 'rendering-failed');

const event = publishCoreSpiritLifecycle({ stage: 'rendered', scriptId: 'lifecycle-contract', sourceHash: 'src-hash', artifactHash: 'artifact-hash', previousOutputPreserved: false });
assert.equal(event.stage, 'rendered');
assert.equal(event.scriptId, 'lifecycle-contract');
assert.ok(Number.isFinite(event.at), 'lifecycle events carry a monotonic-wall-clock timestamp for diagnostics');

console.log('CORESPIRIT_EXECUTION_LIFECYCLE_CONTRACT_OK');
