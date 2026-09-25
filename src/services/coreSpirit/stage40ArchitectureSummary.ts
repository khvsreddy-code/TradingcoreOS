import { CORE_SPIRIT_LAYER_PROFILES, type CoreSpiritProgramLayer } from './layeredPlatformContract';

export function getLayerSummary(): readonly { layer: CoreSpiritProgramLayer; capabilities: readonly string[] }[] {
  return (Object.keys(CORE_SPIRIT_LAYER_PROFILES) as CoreSpiritProgramLayer[]).map(layer => ({
    layer,
    capabilities: CORE_SPIRIT_LAYER_PROFILES[layer].capabilities,
  }));
}
