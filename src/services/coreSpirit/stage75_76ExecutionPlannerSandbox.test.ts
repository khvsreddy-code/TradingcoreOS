import { CoreSpiritCompiler } from './compiler';
import { parseCoreSpirit } from './coreSpiritPipeline';
import { planCoreSpiritExecution } from './executionPlanner';
import { createCoreSpiritSandbox, CoreSpiritCapabilityDeniedError, CoreSpiritSandboxQuotaError, validateCoreSpiritSandboxArchitecture } from './capabilitySandbox';
import { validateCoreSpiritRoadmap } from './coreSpiritRoadmap';

const source = `
let fast = ema(close, 20)
let slow = ema(close, 50)
let spread = fast - slow
plot(fast)
signal(crossover(fast, slow))
`;
const compiled = new CoreSpiritCompiler().compile(parseCoreSpirit(source), 'stage75-76', { layer: 'script' });
if (!compiled.ir) throw new Error('stage75-76 compile failed');

const cpuPlan = planCoreSpiritExecution(compiled.ir, {
  symbolCount: 500,
  timeframeCount: 3,
  barCount: 10_000,
  requireDeterministic: true,
  backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: false, maxBatchSize: 1_000_000, sharedMemoryBytes: 0 },
    { backend: 'gpu', available: true, deterministic: false, vectorized: true, maxBatchSize: 262_144, sharedMemoryBytes: 512 * 1024 * 1024 },
  ],
  minGpuWorkUnits: 1,
});
if (cpuPlan.strategy !== 'cpu-fallback') throw new Error('deterministic plan must not select non-deterministic GPU');
if (!cpuPlan.deterministic || !cpuPlan.assignments.every(a => a.deterministic)) throw new Error('deterministic planner contract violated');

const researchSandbox = createCoreSpiritSandbox({
  layer: 'model',
  target: 'research',
  granted: ['series','models','market-data','compute-cpu','compute-gpu'],
});
const gpuPlan = planCoreSpiritExecution(compiled.ir, {
  symbolCount: 500,
  timeframeCount: 3,
  barCount: 10_000,
  requireDeterministic: false,
  backends: [
    { backend: 'cpu', available: true, deterministic: true, vectorized: false, maxBatchSize: 1_000_000, sharedMemoryBytes: 0 },
    { backend: 'gpu', available: true, deterministic: false, vectorized: true, maxBatchSize: 262_144, sharedMemoryBytes: 512 * 1024 * 1024 },
  ],
  minGpuWorkUnits: 1,
  sandbox: researchSandbox,
});
if (gpuPlan.strategy !== 'hybrid-pure-offload') throw new Error('GPU plan should preserve effectful outputs on CPU');
if (!gpuPlan.assignments.some(a => a.backend === 'gpu' && a.nodeIds.length > 0)) throw new Error('GPU pure-work assignment missing');
if (gpuPlan.deterministic) throw new Error('GPU plan should disclose non-deterministic backend when deterministic=false');

const scriptSandbox = createCoreSpiritSandbox({ layer: 'script', target: 'chart' });
if (!scriptSandbox.can('compute-cpu') || scriptSandbox.can('compute-gpu')) throw new Error('sandbox defaults must keep acceleration opt-in');
scriptSandbox.require('compute-cpu');
let denied = false;
try { scriptSandbox.require('compute-gpu'); } catch (error) { denied = error instanceof CoreSpiritCapabilityDeniedError; }
if (!denied) throw new Error('ungranted GPU capability must be denied');

let quota = false;
try {
  const limited = createCoreSpiritSandbox({ layer: 'script', target: 'chart', limits: { maxComputeUnitsPerRevision: 10 } });
  limited.consume('maxComputeUnitsPerRevision', 9);
  limited.consume('maxComputeUnitsPerRevision', 2);
} catch (error) { quota = error instanceof CoreSpiritSandboxQuotaError; }
if (!quota) throw new Error('sandbox quota should be enforced');

if (validateCoreSpiritSandboxArchitecture().length) throw new Error('forbidden capability leaked');
if (validateCoreSpiritRoadmap().length) throw new Error('roadmap invalid after #23/#24');

console.log('STAGE75_76_EXECUTION_PLANNER_SANDBOX_OK');
