/**
 * Small runtime-only mapping from CoreSpirit program declarations to the
 * execution lane enforced by the compiler, IR validator and runtime loader.
 * Keep this module free of grammar/editor metadata so hot paths stay lean.
 */
import type { CoreSpiritProgramKind } from './ast';
import type { CoreSpiritProgramLayer } from './layeredPlatformContract';

export const CORE_SPIRIT_PROGRAM_EXECUTION_LAYERS: Readonly<Record<CoreSpiritProgramKind,CoreSpiritProgramLayer>> = Object.freeze({
  indicator:'script',
  strategy:'strategy',
  automation:'automation',
  prediction:'model',
  library:'script',
  script:'script',
});
