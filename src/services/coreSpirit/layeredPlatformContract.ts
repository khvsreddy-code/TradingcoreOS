/**
 * CoreSpirit layered trading-native platform contract.
 * Post-CS16 architecture: one compiler/IR/VM, four abstraction layers.
 *
 * Layer 1: Script      - indicators/visuals/signals
 * Layer 2: Model       - feature/model definitions and typed outputs
 * Layer 3: Strategy    - entry/exit/position intent
 * Layer 4: Automation  - policy-driven orchestration of intents/signals
 *
 * All layers compile to the same executable-artifact family. None of the
 * language layers receive raw broker credentials or direct venue APIs.
 */

export const CORE_SPIRIT_LAYERED_PLATFORM_VERSION = 1 as const;

export type CoreSpiritProgramLayer =
  | 'script'
  | 'model'
  | 'strategy'
  | 'automation';

export type CoreSpiritCapability =
  | 'series'
  | 'indicators'
  | 'visuals'
  | 'interactive-ui'
  | 'signals'
  | 'features'
  | 'model-output'
  | 'strategy-events'
  | 'order-intents'
  | 'risk-queries'
  | 'policy-evaluation'
  | 'webhooks';

export type CoreSpiritForbiddenCapability =
  | 'broker-credentials'
  | 'direct-broker-api'
  | 'direct-account-mutation'
  | 'raw-network'
  | 'filesystem'
  | 'arbitrary-process';

export interface CoreSpiritLayerProfile {
  layer: CoreSpiritProgramLayer;
  capabilities: readonly CoreSpiritCapability[];
  forbidden: readonly CoreSpiritForbiddenCapability[];
}

export interface CoreSpiritLayeredArtifact {
  artifactVersion: typeof CORE_SPIRIT_LAYERED_PLATFORM_VERSION;
  layer: CoreSpiritProgramLayer;
  programId: string;
  sourceChecksum: string;
  irChecksum: string;
  runtimeAbiVersion: string;
  capabilities: readonly CoreSpiritCapability[];
}

export interface CoreSpiritModelFeature {
  name: string;
  expression: string;
}

export interface CoreSpiritModelDescriptor {
  modelId: string;
  name: string;
  features: readonly CoreSpiritModelFeature[];
  outputs: readonly string[];
}

export interface CoreSpiritAutomationRule {
  trigger: string;
  action: string;
  policyId: string;
}

export const CORE_SPIRIT_LAYER_PROFILES: Readonly<Record<CoreSpiritProgramLayer, CoreSpiritLayerProfile>> = {
  script: {
    layer: 'script',
    capabilities: ['series', 'indicators', 'visuals', 'interactive-ui', 'signals'],
    forbidden: ['broker-credentials', 'direct-broker-api', 'direct-account-mutation', 'raw-network', 'filesystem', 'arbitrary-process'],
  },
  model: {
    layer: 'model',
    capabilities: ['series', 'indicators', 'features', 'model-output'],
    forbidden: ['broker-credentials', 'direct-broker-api', 'direct-account-mutation', 'raw-network', 'filesystem', 'arbitrary-process'],
  },
  strategy: {
    layer: 'strategy',
    capabilities: ['series', 'indicators', 'visuals', 'interactive-ui', 'signals', 'features', 'model-output', 'strategy-events'],
    forbidden: ['broker-credentials', 'direct-broker-api', 'direct-account-mutation', 'raw-network', 'filesystem', 'arbitrary-process'],
  },
  automation: {
    layer: 'automation',
    capabilities: ['signals', 'strategy-events', 'order-intents', 'risk-queries', 'policy-evaluation', 'webhooks'],
    forbidden: ['broker-credentials', 'direct-broker-api', 'direct-account-mutation', 'raw-network', 'filesystem', 'arbitrary-process'],
  },
};

export function validateLayerProfile(profile: CoreSpiritLayerProfile): string[] {
  const errors: string[] = [];
  const allowed = new Set(CORE_SPIRIT_LAYER_PROFILES[profile.layer].capabilities);
  for (const capability of profile.capabilities) {
    if (!allowed.has(capability)) errors.push(`capability ${capability} is not allowed for ${profile.layer}`);
  }
  for (const forbidden of profile.forbidden) {
    if (!CORE_SPIRIT_LAYER_PROFILES[profile.layer].forbidden.includes(forbidden)) {
      errors.push(`forbidden capability ${forbidden} is not part of ${profile.layer} sandbox contract`);
    }
  }
  return errors;
}

export function canUseCapability(
  layer: CoreSpiritProgramLayer,
  capability: CoreSpiritCapability,
): boolean {
  return CORE_SPIRIT_LAYER_PROFILES[layer].capabilities.includes(capability);
}
