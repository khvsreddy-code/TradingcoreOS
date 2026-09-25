import { CoreSpiritRuntimeKernel, CoreSpiritCapabilityError } from './runtimeKernel';
import {
  CORE_SPIRIT_MODEL_ABI_VERSION,
  CoreSpiritModelRegistry,
  type CoreSpiritModelExecutionRequest,
  type CoreSpiritModelExecutionResult,
  type CoreSpiritModelManifest,
  type CoreSpiritModelHost,
} from './modelAbi';

const services = {
  data: { id: 'series' },
  compute: { id: 'vm' },
  visual: { id: 'scene' },
  event: { id: 'events' },
  risk: { id: 'risk' },
  execution: { id: 'execution' },
};

const script = new CoreSpiritRuntimeKernel({
  identity: { runId: 'run-1', programId: 'script-1', programChecksum: 'abc', layer: 'script', mode: 'replay' },
  budget: { maxInstructionsPerBar: 1000, maxOutputsPerBar: 100, maxVisualNodes: 1000, maxModelCallsPerBar: 10 },
  services,
});

if (!script.can('series') || !script.can('visuals') || !script.can('signals')) throw new Error('script capability contract failed');
if (script.can('order-intents') as boolean) throw new Error('script must not receive order intents');
let denied = false;
try { script.require('order-intents'); } catch (error) { denied = error instanceof CoreSpiritCapabilityError; }
if (!denied) throw new Error('forbidden script capability was not denied');

const manifest: CoreSpiritModelManifest = {
  abiVersion: CORE_SPIRIT_MODEL_ABI_VERSION,
  modelId: 'momentum',
  version: '1.0.0',
  backend: 'wasm',
  state: 'stateless',
  deterministic: true,
  inputNames: ['returns20'],
  outputNames: ['probability_up'],
  maxMemoryBytes: 64 * 1024,
  maxSteps: 5000,
  capabilities: ['read-features', 'write-output'],
};

const host: CoreSpiritModelHost = {
  backend: 'wasm',
  async execute(_manifest, request: CoreSpiritModelExecutionRequest): Promise<CoreSpiritModelExecutionResult> {
    const value = request.inputs.returns20?.data[0] ?? 0;
    const probability = Math.max(0, Math.min(1, 0.5 + value));
    return {
      outputs: { probability_up: { dtype: 'f64', shape: [1], data: [probability] } },
      outputChecksum: `out:${probability.toFixed(8)}`,
      stateChecksum: 'state:stateless',
    };
  },
};

const registry = new CoreSpiritModelRegistry();
registry.register({ manifest, host });
const resolved = registry.get('momentum', '1.0.0');
if (resolved.manifest.abiVersion !== 1 || resolved.manifest.backend !== 'wasm') throw new Error('model registry contract failed');

const strategy = new CoreSpiritRuntimeKernel({
  identity: { runId: 'run-2', programId: 'strategy-1', programChecksum: 'def', layer: 'strategy', mode: 'historical' },
  budget: { maxInstructionsPerBar: 1000, maxOutputsPerBar: 100, maxVisualNodes: 1000, maxModelCallsPerBar: 10 },
  services,
  modelRegistry: registry,
});
if (!strategy.can('model-output') || !strategy.can('strategy-events')) throw new Error('strategy/model bridge missing');
if (strategy.can('order-intents')) throw new Error('strategy must not directly create broker order intents');

async function main(): Promise<void> {
const request: CoreSpiritModelExecutionRequest = {
  context: {
    runId: 'run-2', programChecksum: 'def', modelVersion: '1.0.0', barIndex: 10,
    timestamp: 1000, symbol: 'NSE:NIFTY50', timeframe: '5m', mode: 'historical', revision: 0,
    confirmed: true, deterministicSeed: 'seed:run-2:10',
  },
  inputs: { returns20: { dtype: 'f64', shape: [1], data: [0.12] } },
};
const result = await resolved.host.execute(resolved.manifest, request);
if (result.outputs.probability_up?.data[0] !== 0.62) throw new Error('model output contract failed');

console.log('STAGE48_49_RUNTIME_MODEL_OK');
}

void main().catch((error) => {
  console.error(error);
  throw error;
});
