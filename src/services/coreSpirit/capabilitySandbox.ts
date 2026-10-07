/**
 * CoreSpirit capability sandbox — principle #24.
 *
 * This allow-list is deliberately narrower than the host OS. There is no
 * capability here for raw networking, filesystem access, arbitrary processes,
 * native calls, broker credentials or direct account mutation. Those powers are
 * not expressible through this API.
 */
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';
import type { CoreSpiritExecutionTarget } from './executionTarget';
import type { CoreSpiritComputeBackend } from './executionPlanner';
import type { CoreSpiritEnvironmentCapability, CoreSpiritEnvironmentName } from './executionEnvironment';
import { CORE_SPIRIT_EXECUTION_ENVIRONMENTS } from './executionEnvironment';

export type CoreSpiritSandboxCapability =
  | 'market-data'
  | 'series'
  | 'visuals'
  | 'interactive-ui'
  | 'signals'
  | 'models'
  | 'research-data'
  | 'scanner'
  | 'webhooks'
  | 'strategy-events'
  | 'order-intents'
  | 'risk-queries'
  | 'policy-evaluation'
  | 'compute-cpu'
  | 'compute-wasm'
  | 'compute-gpu';

export type CoreSpiritForbiddenCapability =
  | 'raw-network'
  | 'filesystem'
  | 'arbitrary-process'
  | 'native-call'
  | 'broker-credentials'
  | 'direct-broker-api'
  | 'direct-account-mutation';

export interface CoreSpiritSandboxLimits {
  maxInstructionsPerRevision: number;
  maxDataRequestsPerRevision: number;
  maxModelCallsPerRevision: number;
  maxVisualNodesPerRevision: number;
  maxComputeUnitsPerRevision: number;
  maxGpuMemoryBytes: number;
}

export interface CoreSpiritCapabilitySandboxOptions {
  layer: CoreSpiritProgramLayer;
  target: CoreSpiritExecutionTarget;
  granted?: readonly CoreSpiritSandboxCapability[];
  limits?: Partial<CoreSpiritSandboxLimits>;
  environment?: CoreSpiritEnvironmentName;
}

export const CORE_SPIRIT_SANDBOX_LIMITS: Readonly<CoreSpiritSandboxLimits> = Object.freeze({
  maxInstructionsPerRevision: 10_000,
  maxDataRequestsPerRevision: 10_000,
  maxModelCallsPerRevision: 100,
  maxVisualNodesPerRevision: 10_000,
  maxComputeUnitsPerRevision: 10_000_000,
  maxGpuMemoryBytes: 512 * 1024 * 1024,
});

const TARGET_CAPABILITY_MAP: Readonly<Record<CoreSpiritExecutionTarget, readonly CoreSpiritSandboxCapability[]>> = {
  chart: ['series','visuals','interactive-ui','signals','models','market-data','compute-cpu','compute-wasm','compute-gpu'],
  replay: ['series','visuals','interactive-ui','signals','models','market-data','compute-cpu','compute-wasm','compute-gpu'],
  backtest: ['series','signals','models','strategy-events','order-intents','risk-queries','market-data','compute-cpu','compute-wasm','compute-gpu'],
  scanner: ['series','signals','models','scanner','market-data','compute-cpu','compute-wasm','compute-gpu'],
  alert: ['series','signals','models','webhooks','market-data','compute-cpu'],
  server: ['series','signals','models','webhooks','market-data','compute-cpu','compute-wasm','compute-gpu'],
  automation: ['series','models','market-data','signals','strategy-events','order-intents','risk-queries','policy-evaluation','webhooks','compute-cpu'],
  research: ['series','signals','models','research-data','market-data','compute-cpu','compute-wasm','compute-gpu'],
};

const LAYER_CAPABILITY_MAP: Readonly<Record<CoreSpiritProgramLayer, readonly CoreSpiritSandboxCapability[]>> = {
  script: ['series','visuals','interactive-ui','signals','market-data','compute-cpu','compute-wasm','compute-gpu'],
  model: ['series','models','research-data','market-data','compute-cpu','compute-wasm','compute-gpu'],
  strategy: ['series','visuals','interactive-ui','signals','models','strategy-events','market-data','compute-cpu','compute-wasm','compute-gpu'],
  automation: ['series','models','market-data','signals','strategy-events','order-intents','risk-queries','policy-evaluation','webhooks','compute-cpu'],
};

export class CoreSpiritCapabilityDeniedError extends Error {
  constructor(
    public readonly capability: CoreSpiritSandboxCapability | string,
    public readonly layer: CoreSpiritProgramLayer,
    public readonly target: CoreSpiritExecutionTarget,
  ) {
    super(`CoreSpirit capability '${capability}' is not granted to layer '${layer}' on target '${target}'`);
    this.name = 'CoreSpiritCapabilityDeniedError';
  }
}

export class CoreSpiritSandboxQuotaError extends Error {
  constructor(public readonly quota: keyof CoreSpiritSandboxLimits) {
    super(`CoreSpirit sandbox quota exceeded: ${quota}`);
    this.name = 'CoreSpiritSandboxQuotaError';
  }
}

export class CoreSpiritCapabilitySandbox {
  readonly limits: Readonly<CoreSpiritSandboxLimits>;
  readonly layer: CoreSpiritProgramLayer;
  readonly target: CoreSpiritExecutionTarget;
  private readonly granted: ReadonlySet<CoreSpiritSandboxCapability>;
  private readonly usage = new Map<keyof CoreSpiritSandboxLimits, number>();

  constructor(options: CoreSpiritCapabilitySandboxOptions) {
    this.layer = options.layer;
    this.target = options.target;
    this.limits = Object.freeze({ ...CORE_SPIRIT_SANDBOX_LIMITS, ...(options.limits ?? {}) });
    const layerAllowed = new Set(LAYER_CAPABILITY_MAP[options.layer]);
    const targetAllowed = new Set(TARGET_CAPABILITY_MAP[options.target]);
    const intersection = [...layerAllowed].filter(capability => targetAllowed.has(capability));
    const safeDefaults = new Set(intersection.filter(capability => capability === 'compute-cpu' || !capability.startsWith('compute-')));
    const requested = options.granted ? new Set(options.granted) : safeDefaults;
    if (options.environment) {
      const environment = CORE_SPIRIT_EXECUTION_ENVIRONMENTS[options.environment];
      for (const capability of requested) {
        const required = environmentCapabilityForSandbox(capability);
        if (required) {
          const allowed = environment.capabilities.includes(required) || (required === 'simulated-orders' && environment.capabilities.includes('real-orders'));
          if (!allowed) throw new CoreSpiritCapabilityDeniedError(capability, options.layer, options.target);
        }
      }
    }
    for (const capability of requested) {
      if (!layerAllowed.has(capability)) throw new CoreSpiritCapabilityDeniedError(capability, options.layer, options.target);
      if (!targetAllowed.has(capability)) throw new CoreSpiritCapabilityDeniedError(capability, options.layer, options.target);
    }
    this.granted = requested;
  }

  can(capability: CoreSpiritSandboxCapability): boolean { return this.granted.has(capability); }
  require(capability: CoreSpiritSandboxCapability): void {
    if (!this.can(capability)) throw new CoreSpiritCapabilityDeniedError(capability, this.layer, this.target);
  }
  requireAny(capabilities: readonly CoreSpiritSandboxCapability[]): void {
    if (!capabilities.some(capability => this.can(capability))) this.require(capabilities[0]);
  }

  requireComputeBackend(backend: CoreSpiritComputeBackend): void {
    this.require(computeCapabilityForBackend(backend));
  }

  consume(quota: keyof CoreSpiritSandboxLimits, amount = 1): void {
    if (!Number.isFinite(amount) || amount < 0) throw new Error(`invalid sandbox quota amount for ${quota}`);
    const next = (this.usage.get(quota) ?? 0) + amount;
    if (next > this.limits[quota]) throw new CoreSpiritSandboxQuotaError(quota);
    this.usage.set(quota, next);
  }

  requireEnvironmentCapability(capability: CoreSpiritEnvironmentCapability, environment: CoreSpiritEnvironmentName): void {
    if (!CORE_SPIRIT_EXECUTION_ENVIRONMENTS[environment].capabilities.includes(capability)) {
      throw new CoreSpiritCapabilityDeniedError(capability, this.layer, this.target);
    }
  }

  resetRevision(): void { this.usage.clear(); }

  usageSnapshot(): Readonly<Record<string, number>> {
    return Object.fromEntries(this.usage.entries());
  }

}


export function createCoreSpiritSandbox(options: CoreSpiritCapabilitySandboxOptions): CoreSpiritCapabilitySandbox { return new CoreSpiritCapabilitySandbox(options); }

export function validateCoreSpiritSandboxArchitecture(): string[] {
  const errors: string[] = [];
  const forbidden: CoreSpiritForbiddenCapability[] = ['raw-network','filesystem','arbitrary-process','native-call','broker-credentials','direct-broker-api','direct-account-mutation'];
  for (const name of forbidden) {
    if ((TARGET_CAPABILITY_MAP as any)[name]) errors.push(`forbidden capability '${name}' leaked into target capability map`);
    if ((LAYER_CAPABILITY_MAP as any)[name]) errors.push(`forbidden capability '${name}' leaked into layer capability map`);
  }
  return errors;
}

function environmentCapabilityForSandbox(capability: CoreSpiritSandboxCapability): CoreSpiritEnvironmentCapability | undefined {
  if (capability === 'market-data') return 'market-data';
  if (capability === 'models') return 'models';
  if (capability === 'visuals') return 'visuals';
  if (capability === 'webhooks') return 'webhooks';
  if (capability === 'risk-queries') return 'risk';
  if (capability === 'policy-evaluation') return 'policy';
  if (capability === 'order-intents') return 'simulated-orders';
  return undefined;
}

export function computeCapabilityForBackend(backend: CoreSpiritComputeBackend): CoreSpiritSandboxCapability {
  return backend === 'cpu' ? 'compute-cpu' : backend === 'wasm' ? 'compute-wasm' : 'compute-gpu';
}
