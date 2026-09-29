/** CoreSpirit execution model: small surface, rich internal composition. */

export const CORE_SPIRIT_AUTHORING_LEVELS = Object.freeze(['simple', 'advanced', 'professional'] as const);
export type CoreSpiritAuthoringLevel = typeof CORE_SPIRIT_AUTHORING_LEVELS[number];

export const CORE_SPIRIT_EXECUTION_CONTEXTS = Object.freeze([
  'live', 'paper', 'backtest', 'replay', 'scan', 'research', 'optimization',
] as const);
export type CoreSpiritExecutionContext = typeof CORE_SPIRIT_EXECUTION_CONTEXTS[number];

export const CORE_SPIRIT_VALUE_KINDS = Object.freeze([
  'scalar', 'series', 'boolean', 'event', 'condition', 'feature', 'model',
  'distribution', 'signal', 'visual', 'automation', 'order-intent', 'dataset', 'state',
] as const);
export type CoreSpiritValueKind = typeof CORE_SPIRIT_VALUE_KINDS[number];

export const CORE_SPIRIT_NODE_CLASSES = Object.freeze([
  'pure', 'stateful', 'io', 'event', 'visual', 'authority',
] as const);
export type CoreSpiritNodeClass = typeof CORE_SPIRIT_NODE_CLASSES[number];

export type CoreSpiritValueType = Readonly<{
  kind: CoreSpiritValueKind;
  name?: string;
  element?: CoreSpiritValueKind | CoreSpiritValueType;
  nullable?: boolean;
}>;

export const CORE_SPIRIT_COMPONENT_BACKENDS = Object.freeze(['cpu', 'wasm', 'gpu', 'host', 'remote'] as const);
export type CoreSpiritComponentBackend = typeof CORE_SPIRIT_COMPONENT_BACKENDS[number];

export type CoreSpiritComponentExecutionProfile = Readonly<{
  executionClass: CoreSpiritNodeClass;
  latencyClass: 'instant' | 'fast' | 'normal' | 'slow' | 'external';
  estimatedCost: 'constant' | 'low' | 'medium' | 'high' | 'external';
  cacheable: boolean;
  parallelizable: boolean;
  eligibleBackends: readonly CoreSpiritComponentBackend[];
}>;

export type CoreSpiritComponentStateProfile = Readonly<{
  persistence: 'stateless' | 'bar' | 'window' | 'session' | 'external';
  snapshotable: boolean;
  rollbackable: boolean;
  key?: string;
}>;

export type CoreSpiritComponentDocumentation = Readonly<{
  summary?: string;
  inputDescriptions?: Readonly<Record<string, string>>;
  outputDescriptions?: Readonly<Record<string, string>>;
  examples?: readonly string[];
}>;

export type CoreSpiritComponentPort = Readonly<{
  name: string;
  type: CoreSpiritValueType;
  required: boolean;
  description?: string;
}>;

export type CoreSpiritComponentContract = Readonly<{
  version: 1;
  id: string;
  name: string;
  /** Optional callable aliases keep composition ergonomic without adding syntax. */
  aliases?: readonly string[];
  kind: 'component' | 'pipeline' | 'model' | 'indicator' | 'automation';
  inputs: readonly CoreSpiritComponentPort[];
  outputs: readonly CoreSpiritComponentPort[];
  nodeIds: readonly string[];
  dependencies: readonly string[];
  deterministic: boolean;
  stateful: boolean;
  capabilities: readonly string[];
  /** Optional execution semantics kept outside the language grammar. */
  execution?: CoreSpiritComponentExecutionProfile;
  /** Optional explicit state lifecycle for stateful reusable components. */
  state?: CoreSpiritComponentStateProfile;
  /** Optional IDE/docs metadata; never required for execution. */
  documentation?: CoreSpiritComponentDocumentation;
}>;

export type CoreSpiritExecutionLane = 'hot' | 'warm' | 'cold';

export type CoreSpiritNodeExecutionDescriptor = Readonly<{
  nodeId: string;
  lane: CoreSpiritExecutionLane;
  class: CoreSpiritNodeClass;
  cacheable: boolean;
  parallelizable: boolean;
  deterministic: boolean;
  estimatedCost: 'constant' | 'low' | 'medium' | 'high' | 'external';
}>;

export function classifyCoreSpiritValueKind(type: string): CoreSpiritValueKind {
  if (type.startsWith('series<')) return 'series';
  if (type === 'event') return 'event';
  if (type === 'visual') return 'visual';
  if (type === 'order-intent') return 'order-intent';
  if (type.includes('model')) return 'model';
  if (type === 'boolean') return 'boolean';
  if (type === 'dataset') return 'dataset';
  return 'scalar';
}

export function executionLaneForNode(input: {
  effectful: boolean;
  stateful: boolean;
  latencyClass: 'instant' | 'fast' | 'normal' | 'slow' | 'external';
  kind: string;
}): CoreSpiritExecutionLane {
  if (input.effectful || input.kind === 'automation' || input.kind === 'effect') return 'hot';
  if (input.stateful || input.kind === 'signal' || input.latencyClass === 'normal') return 'warm';
  if (input.latencyClass === 'slow' || input.latencyClass === 'external') return 'cold';
  return 'hot';
}

export function executionClassForNode(input: {
  effectful: boolean;
  stateful: boolean;
  kind: string;
}): CoreSpiritNodeClass {
  if (input.kind === 'visual') return 'visual';
  if (input.effectful && (input.kind === 'automation' || input.kind === 'effect')) return 'authority';
  if (input.kind === 'signal') return 'event';
  if (input.effectful) return 'io';
  if (input.stateful) return 'stateful';
  return 'pure';
}

export function deriveCoreSpiritNodeExecutionDescriptor(input: Parameters<typeof executionLaneForNode>[0] & { nodeId: string; parallelizable: boolean; deterministic: boolean }): CoreSpiritNodeExecutionDescriptor {
  const lane = executionLaneForNode(input);
  const cls = executionClassForNode(input);
  return Object.freeze({
    nodeId: input.nodeId,
    lane,
    class: cls,
    cacheable: cls === 'pure' && input.deterministic,
    parallelizable: input.parallelizable && cls === 'pure',
    deterministic: input.deterministic,
    estimatedCost: input.latencyClass === 'external' ? 'external' : input.latencyClass === 'slow' ? 'high' : input.latencyClass === 'normal' ? 'medium' : input.latencyClass === 'fast' ? 'low' : 'constant',
  });
}
