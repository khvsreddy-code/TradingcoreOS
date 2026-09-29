import type { CoreSpiritIrProgram } from './ir';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';
import { coreSpiritComponentRegistry } from './coreSpiritComponents';
import { getCoreSpiritAuthoringProfile } from './coreSpiritAuthoring';
import type { CoreSpiritAuthoringLevel } from './coreSpiritExecutionModel';
import { CORE_SPIRIT_LIBRARY_ROOT_NAMESPACES } from './standardLibraryNamespaces';

export const CORE_SPIRIT_SURFACE_CONCEPTS = Object.freeze([
  'DATA', 'LET', 'WHEN', 'SHOW', 'MODEL', 'AUTOMATE',
] as const);

export type CoreSpiritComplexityAbsorberLayer =
  | 'syntax'
  | 'semantic'
  | 'component'
  | 'model-abi'
  | 'dependency'
  | 'execution'
  | 'reactive'
  | 'backend'
  | 'host-capability';

export type CoreSpiritComplexityProfile = Readonly<{
  version: 1;
  surfaceConceptCount: 6;
  surfaceConcepts: readonly string[];
  semanticNodeCount: number;
  componentNodeCount: number;
  effectNodeCount: number;
  namespaceCount: number;
  authoringLevel: CoreSpiritAuthoringLevel;
  layers: readonly CoreSpiritComplexityAbsorberLayer[];
  backends: readonly string[];
  surfaceExpansionRequired: false;
}>;

export function buildCoreSpiritComplexityProfile(
  source: string,
  ir?: CoreSpiritIrProgram,
  options: { components?: CoreSpiritComponentRegistryLike } = {},
): CoreSpiritComplexityProfile {
  const graph = ir?.graphs?.semantic;
  const registry = options.components ?? coreSpiritComponentRegistry;
  const componentIds = new Set((graph?.nodes ?? []).map(node => node.componentId).filter(Boolean));
  for (const contract of registry instanceof Object && 'listContracts' in registry ? registry.listContracts() : registry) {
    if (componentIds.has(contract.id)) componentIds.add(contract.id);
  }
  const effectNodeCount = graph?.nodes.filter(node => node.effectful).length ?? 0;
  const componentNodeCount = graph?.nodes.filter(node => Boolean(node.componentId)).length ?? 0;
  const backends = new Set<string>();
  for (const contract of registry instanceof Object && 'listContracts' in registry ? registry.listContracts() : registry) {
    for (const backend of contract.execution?.eligibleBackends ?? []) backends.add(backend);
  }
  if (!backends.size) {
    backends.add('cpu');
    backends.add('wasm');
    backends.add('gpu');
  }
  return Object.freeze({
    version: 1,
    surfaceConceptCount: CORE_SPIRIT_SURFACE_CONCEPTS.length,
    surfaceConcepts: CORE_SPIRIT_SURFACE_CONCEPTS,
    semanticNodeCount: graph?.nodes.length ?? 0,
    componentNodeCount,
    effectNodeCount,
    namespaceCount: CORE_SPIRIT_LIBRARY_ROOT_NAMESPACES.length,
    authoringLevel: getCoreSpiritAuthoringProfile(source).level,
    layers: Object.freeze(['syntax','semantic','component','model-abi','dependency','execution','reactive','backend','host-capability'] as const),
    backends: Object.freeze([...backends]),
    surfaceExpansionRequired: false,
  });
}

export function validateCoreSpiritComplexityProfile(profile: CoreSpiritComplexityProfile): string[] {
  const errors: string[] = [];
  if (profile.surfaceConceptCount !== 6) errors.push(`CoreSpirit surface concept count changed: ${profile.surfaceConceptCount}`);
  if (profile.surfaceExpansionRequired) errors.push('complexity absorber must not require source-surface expansion');
  if (!profile.layers.includes('semantic') || !profile.layers.includes('component') || !profile.layers.includes('execution') || !profile.layers.includes('backend')) {
    errors.push('complexity absorber is missing a required hidden architecture layer');
  }
  return errors;
}
