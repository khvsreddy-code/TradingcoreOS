/**
 * Public visual projection boundary.
 *
 * The renderer-neutral Scene Graph remains a private runtime/compiler concern.
 * Application-facing runtime results expose only this summary/transaction view.
 */
import type { CoreSpiritScene, CoreSpiritSceneDiff } from './visualScene';
import type { CoreSpiritVisualPatch } from './visualRealtimeEngine';

export const CORE_SPIRIT_VISUAL_PROJECTION_VERSION = 1 as const;

export type CoreSpiritVisualSummary = Readonly<{
  version: typeof CORE_SPIRIT_VISUAL_PROJECTION_VERSION;
  revision: number;
  checksum: string;
  objectCount: number;
  kinds: Readonly<Record<string, number>>;
}>;

export type CoreSpiritVisualUpdate = Readonly<{
  version: typeof CORE_SPIRIT_VISUAL_PROJECTION_VERSION;
  revision: number;
  previousRevision: number;
  added: number;
  updated: number;
  removed: number;
  structuralReset: boolean;
  checksum: string;
}>;

function kindCounts(scene: CoreSpiritScene): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const node of scene.nodes) counts[node.kind] = (counts[node.kind] || 0) + 1;
  return counts;
}

/**
 * Convert internal scene state to a compact, renderer-agnostic public summary.
 * No pane/layer/z-index/node identity/parent/scene topology crosses this API.
 */
export function summarizeCoreSpiritScene(scene: CoreSpiritScene): CoreSpiritVisualSummary {
  return Object.freeze({
    version: CORE_SPIRIT_VISUAL_PROJECTION_VERSION,
    revision: scene.revision,
    checksum: scene.checksum,
    objectCount: scene.nodes.length,
    kinds: Object.freeze(kindCounts(scene)),
  });
}

export function summarizeCoreSpiritVisualUpdate(
  diff: CoreSpiritSceneDiff,
  patch?: CoreSpiritVisualPatch,
): CoreSpiritVisualUpdate {
  return Object.freeze({
    version: CORE_SPIRIT_VISUAL_PROJECTION_VERSION,
    revision: diff.toRevision,
    previousRevision: diff.fromRevision,
    added: diff.added.length,
    updated: diff.updated.length,
    removed: diff.removed.length,
    structuralReset: Boolean(patch?.structuralReset),
    checksum: patch?.sceneChecksum || '',
  });
}

export function summarizeCoreSpiritVisualPatch(
  patch: CoreSpiritVisualPatch,
): CoreSpiritVisualUpdate {
  return Object.freeze({
    version: CORE_SPIRIT_VISUAL_PROJECTION_VERSION,
    revision: patch.revision,
    previousRevision: patch.previousRevision,
    added: patch.added.length,
    updated: patch.updated.length,
    removed: patch.removed.length,
    structuralReset: patch.structuralReset,
    checksum: patch.sceneChecksum,
  });
}
