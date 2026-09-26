import {
  CoreSpiritModelRegistry,
  type CoreSpiritModelManifest,
  type CoreSpiritModelHost,
} from "./modelAbi";
import { CoreSpiritModelRuntime } from "./modelRuntime";
import { CoreSpiritAutomationOrchestrator } from "./automationPipeline";
import { createAutomationLifecycle, transitionAutomationLifecycle } from "./automationLifecycle";
import type { CoreSpiritStrategyEvent } from "./strategyContract";

(async () => {

const manifest: CoreSpiritModelManifest = {
  abiVersion: 1,
  modelId: "NiftyMomentum",
  version: "1.0.0",
  backend: "host",
  state: "stateless",
  deterministic: true,
  inputNames: ["returns20", "volatility20", "volumeZ"],
  outputNames: ["probability_up"],
  maxMemoryBytes: 1024 * 1024,
  maxSteps: 1000,
  capabilities: ["read-features", "write-output"],
};

const host: CoreSpiritModelHost = {
  backend: "host",
  async execute(_manifest, request) {
    const probability = request.inputs.returns20.data[0] > 0 ? 0.84 : 0.16;
    return {
      outputs: {
        probability_up: {
          dtype: "f64",
          shape: [1],
          data: [probability],
        },
      },
      outputChecksum: `out:${probability}`,
      stateChecksum: "state:stateless",
    };
  },
};

const registry = new CoreSpiritModelRegistry();
registry.register({ manifest, host });

const runtime = new CoreSpiritModelRuntime(registry, {
  maxCallsPerBar: 4,
  maxInputBytes: 64 * 1024,
  maxOutputBytes: 64 * 1024,
});

const context = {
  runId: "run:50",
  programChecksum: "artifact:ema-rsi",
  modelVersion: "1.0.0",
  barIndex: 10,
  timestamp: 1758800000000,
  symbol: "NSE:NIFTY50",
  timeframe: "5m",
  mode: "replay" as const,
  revision: 0,
  confirmed: true,
  deterministicSeed: "seed:50",
};

const inputs = {
  returns20: { dtype: "f64" as const, shape: [1], data: [0.02] },
  volatility20: { dtype: "f64" as const, shape: [1], data: [0.01] },
  volumeZ: { dtype: "f64" as const, shape: [1], data: [1.1] },
};

const first = await runtime.execute({
  modelId: "NiftyMomentum",
  version: "1.0.0",
  context,
  inputs,
});

const second = await runtime.execute({
  modelId: "NiftyMomentum",
  version: "1.0.0",
  context: { ...context, revision: 0 },
  inputs,
});

if (first.outputChecksum !== second.outputChecksum) throw new Error("model result not deterministic");
if (first.outputs.probability_up.data[0] !== 0.84) throw new Error("model output mismatch");

const orderLog: string[] = [];
let lifecycle = createAutomationLifecycle('ema-rsi-live', context.timestamp);
lifecycle = transitionAutomationLifecycle(lifecycle, 'VALIDATE', 'user', 'contract validation', context.timestamp + 1);
lifecycle = transitionAutomationLifecycle(lifecycle, 'ARM', 'user', 'paper checks complete', context.timestamp + 2);
lifecycle = transitionAutomationLifecycle(lifecycle, 'ACTIVATE_LIVE', 'user', 'explicit live activation', context.timestamp + 3);

const automation = new CoreSpiritAutomationOrchestrator(
  {
    evaluate: async intent => ({
      orderIntentId: intent.id,
      allowed: true,
      reason: "risk budget available",
      approvedQuantity: 2,
    }),
  },
  {
    authorize: async (_intent, _risk) => ({
      allowed: true,
      policyId: "paper-default",
      reason: "policy allowed",
    }),
  },
  {
    submit: async request => {
      orderLog.push(`${request.side}:${request.quantity}`);
      return { accepted: true, executionId: `exec:${request.orderIntentId}` };
    },
  },
  {
    allowLiveExecution: true,
    maxQuantityPerIntent: 10,
    automationId: 'ema-rsi-live',
    lifecycle,
  },
);

const event: CoreSpiritStrategyEvent = {
  id: "event:long",
  strategyId: "ema-rsi",
  kind: "entry",
  direction: "long",
  positionId: "ema-rsi:long",
  barIndex: 10,
  timestamp: context.timestamp,
  symbol: context.symbol,
  timeframe: context.timeframe,
  reason: "probability_up > 0.72",
  metadata: { probability_up: 0.84 },
};

const result = await automation.handleStrategyEvent(event, 2, context.timestamp + 1);

if (!result.execution?.accepted) throw new Error("automation execution boundary failed");
if (orderLog.join("|") !== "buy:2") throw new Error("automation order intent mismatch");

const paperLifecycle = transitionAutomationLifecycle(createAutomationLifecycle('ema-rsi-paper', context.timestamp), 'VALIDATE', 'user', 'validated', context.timestamp + 1);
const paperLifecycle2 = transitionAutomationLifecycle(paperLifecycle, 'ENTER_PAPER', 'user', 'paper test', context.timestamp + 2);

const dryRun = new CoreSpiritAutomationOrchestrator(
  {
    evaluate: async intent => ({
      orderIntentId: intent.id,
      allowed: true,
      reason: "risk budget available",
      approvedQuantity: 2,
    }),
  },
  {
    authorize: async () => ({
      allowed: true,
      policyId: "paper",
      reason: "paper policy",
    }),
  },
  {
    submit: async () => ({ accepted: true, executionId: "should-not-run" }),
  },
  {
    allowLiveExecution: false,
    maxQuantityPerIntent: 10,
    automationId: 'ema-rsi-paper',
    lifecycle: paperLifecycle2,
  },
);

const dryResult = await dryRun.handleStrategyEvent(event, 2, context.timestamp + 1);
if (dryResult.execution) throw new Error("dry-run automation unexpectedly executed");

console.log("STAGE50_52_MODEL_RESEARCH_AUTOMATION_OK");

})().catch((error) => { console.error(error); });
