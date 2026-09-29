import {
  CORE_SPIRIT_LAYER_PROFILES,
  canUseCapability,
  validateLayerProfile,
  type CoreSpiritProgramLayer,
} from './layeredPlatformContract';

const layers: CoreSpiritProgramLayer[] = ['script', 'model', 'strategy', 'automation'];
for (const layer of layers) {
  const profile = CORE_SPIRIT_LAYER_PROFILES[layer];
  if (validateLayerProfile(profile).length) throw new Error(`${layer} profile invalid`);
}

if (!canUseCapability('script', 'visuals')) throw new Error('script must have visuals');
if (!canUseCapability('model', 'model-output')) throw new Error('model must have model output');
if (!canUseCapability('strategy', 'strategy-events')) throw new Error('strategy must have strategy events');
if (!canUseCapability('automation', 'order-intents')) throw new Error('automation must have order intents');
if (canUseCapability('script', 'order-intents')) throw new Error('script must not create order intents');

for (const layer of layers) {
  if (!CORE_SPIRIT_LAYER_PROFILES[layer].forbidden.includes('direct-broker-api')) {
    throw new Error(`${layer} must forbid direct broker APIs`);
  }
}

console.log('STAGE40_LAYERED_PLATFORM_OK');
