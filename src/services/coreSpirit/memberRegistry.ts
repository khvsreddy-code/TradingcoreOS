import type { CoreSpiritMemberContract, CoreSpiritMemberNamespace } from './callContract';

/**
 * The one registry for namespaced CoreSpirit members.
 *
 * Semantic analysis and lowering both consume these descriptors. A new member
 * therefore gets one contract instead of a type-system table + compiler switch.
 */
export const CORE_SPIRIT_ROOT_NAMESPACES = Object.freeze(['ui','visual','app','scan'] as const);

export const CORE_SPIRIT_MEMBER_REGISTRY: readonly CoreSpiritMemberContract[] = [
  // UI root / panel
  { namespace:'ui', member:'panel', callName:'ui.panel', minArgs:1, maxArgs:1, returnType:'ui:panel', category:'ui' },
  { namespace:'panel', member:'number', callName:'ui.panel.number', minArgs:2, maxArgs:3, returnType:'ui:control', actionArgIndices:[2], category:'ui' },
  { namespace:'panel', member:'button', callName:'ui.panel.button', minArgs:1, maxArgs:2, returnType:'ui:control', actionArgIndices:[1], category:'ui' },
  { namespace:'panel', member:'toggle', callName:'ui.panel.toggle', minArgs:2, maxArgs:3, returnType:'ui:control', actionArgIndices:[2], category:'ui' },
  { namespace:'panel', member:'slider', callName:'ui.panel.slider', minArgs:3, maxArgs:5, returnType:'ui:control', actionArgIndices:[4], category:'ui' },

  // Visual root
  { namespace:'visual', member:'line', callName:'visual.line', minArgs:5, maxArgs:6, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'zone', callName:'visual.zone', minArgs:3, maxArgs:6, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'liquidityZone', callName:'visual.liquidityZone', minArgs:5, maxArgs:6, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'heatmap', callName:'visual.heatmap', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'liquidityMap', callName:'visual.liquidityMap', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'depth', callName:'visual.depth', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'volumeProfile', callName:'visual.volumeProfile', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'footprint', callName:'visual.footprint', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'structureGraph', callName:'visual.structureGraph', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'probabilitySurface', callName:'visual.probabilitySurface', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'regimeBand', callName:'visual.regimeBand', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'tradePath', callName:'visual.tradePath', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'modelField', callName:'visual.modelField', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },
  { namespace:'visual', member:'replayTrace', callName:'visual.replayTrace', minArgs:2, maxArgs:4, returnType:'visual:object', category:'visual' },

  // Workspace/application
  { namespace:'app', member:'create', callName:'app.create', minArgs:1, maxArgs:2, returnType:'app:root', category:'app' },
  { namespace:'app', member:'chart', callName:'app.chart', minArgs:0, maxArgs:3, returnType:'app:widget', category:'app' },
  { namespace:'app', member:'panel', callName:'app.panel', minArgs:2, maxArgs:5, returnType:'app:widget', category:'app' },
  { namespace:'app', member:'overlay', callName:'app.overlay', minArgs:1, maxArgs:3, returnType:'app:widget', category:'app' },
  { namespace:'app', member:'targets', callName:'app.targets', minArgs:1, maxArgs:8, returnType:'app:root', category:'app' },
  { namespace:'app', member:'require', callName:'app.require', minArgs:1, maxArgs:1, returnType:'null', category:'app' },
  { namespace:'app', member:'bind', callName:'app.bind', minArgs:2, maxArgs:3, returnType:'null', category:'app' },

  // Scanner
  { namespace:'scan', member:'universe', callName:'scan.universe', minArgs:1, maxArgs:1, returnType:'scan:root', category:'scan' },
  { namespace:'scan', member:'emit', callName:'scan.emit', minArgs:1, maxArgs:3, returnType:'scan:candidate', emitKind:'scanCandidate', category:'scan' },
];

export function getCoreSpiritMemberContract(namespace: CoreSpiritMemberNamespace | string, member: string): CoreSpiritMemberContract | undefined {
  return CORE_SPIRIT_MEMBER_REGISTRY.find(item => item.namespace === namespace && item.member === member);
}

export function getCoreSpiritRootMemberContract(namespace: CoreSpiritMemberNamespace, member: string) {
  return getCoreSpiritMemberContract(namespace, member);
}

export function getCoreSpiritMemberContracts(namespace: CoreSpiritMemberNamespace | string): readonly CoreSpiritMemberContract[] {
  return CORE_SPIRIT_MEMBER_REGISTRY.filter(item => item.namespace === namespace);
}
