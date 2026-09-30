import type { CoreSpiritCompositionGraph } from './composability';
import { CORE_SPIRIT_COMPONENT_BACKENDS, type CoreSpiritComponentBackend, type CoreSpiritComponentContract, type CoreSpiritComponentPort, type CoreSpiritComponentExecutionProfile, type CoreSpiritComponentStateProfile, type CoreSpiritValueType, type CoreSpiritNodeClass } from './coreSpiritExecutionModel';
import type { CoreSpiritType } from './typeSystem';
import { isSeriesType } from './typeSystem';

export type CoreSpiritComponentDefinition = CoreSpiritComponentContract & Readonly<{
  sourceId: string;
  sourceRange?: { start: number; end: number };
}>;

export type CoreSpiritComponentRuntimeContext = Readonly<{
  component: CoreSpiritComponentContract;
  args: readonly unknown[];
  symbol: string;
  timeframe: string;
  barIndex: number;
  timestamp: number;
}>;

export type CoreSpiritComponentExecutor = (
  context: CoreSpiritComponentRuntimeContext,
) => unknown;

export type CoreSpiritComponentRegistration = Readonly<{
  contract: CoreSpiritComponentContract;
  execute?: CoreSpiritComponentExecutor;
}>;

export type CoreSpiritComponentAuthoringOptions = Readonly<{
  kind?: CoreSpiritComponentDefinition['kind'];
  sourceId?: string;
  aliases?: readonly string[];
  execution?: CoreSpiritComponentExecutionProfile;
  state?: CoreSpiritComponentStateProfile;
  documentation?: CoreSpiritComponentContract['documentation'];
}>;

const VALID_EXECUTION_CLASSES = new Set<CoreSpiritNodeClass>(['pure', 'stateful', 'io', 'event', 'visual', 'authority']);

export function deriveCoreSpiritComponentExecutionProfile(component: CoreSpiritComponentContract): CoreSpiritComponentExecutionProfile {
  if (component.execution) return component.execution;
  const pure = component.deterministic && !component.stateful;
  const eligibleBackends: readonly CoreSpiritComponentBackend[] = pure ? ['cpu', 'wasm', 'gpu'] : ['cpu'];
  return Object.freeze({
    executionClass: pure ? 'pure' : 'stateful',
    latencyClass: component.capabilities.some(value => /remote|network|broker|external/i.test(value)) ? 'external' : component.stateful ? 'normal' : 'fast',
    estimatedCost: component.capabilities.some(value => /model|optimization|research/i.test(value)) ? 'high' : component.stateful ? 'medium' : 'low',
    cacheable: pure,
    parallelizable: pure,
    eligibleBackends: Object.freeze(eligibleBackends),
  });
}

export function validateCoreSpiritComponentExecutionProfile(profile: CoreSpiritComponentExecutionProfile): string[] {
  const errors: string[] = [];
  if (!VALID_EXECUTION_CLASSES.has(profile.executionClass)) errors.push(`unsupported component execution class '${profile.executionClass}'`);
  if (!profile.eligibleBackends.length) errors.push('component execution profile requires at least one eligible backend');
  for (const backend of profile.eligibleBackends) {
    if (!(CORE_SPIRIT_COMPONENT_BACKENDS as readonly string[]).includes(backend)) errors.push(`unsupported component backend '${String(backend)}'`);
  }
  if (profile.cacheable && (profile.executionClass !== 'pure')) errors.push('only pure components can be cacheable');
  if (profile.cacheable && profile.latencyClass === 'external') errors.push('external-latency components cannot be cacheable');
  if (profile.parallelizable && profile.executionClass !== 'pure') errors.push('only pure components can be parallelizable');
  if ((profile.executionClass === 'authority' || profile.executionClass === 'io') && profile.eligibleBackends.some(backend => backend === 'gpu' || backend === 'wasm')) {
    errors.push(`execution class '${profile.executionClass}' cannot be GPU/WASM scheduled`);
  }
  return errors;
}

export function validateCoreSpiritComponentStateProfile(component: CoreSpiritComponentContract): string[] {
  const state = component.state;
  if (!state) return [];
  const errors: string[] = [];
  if (component.stateful === false && state.persistence !== 'stateless') errors.push(`component '${component.name}' declares state '${state.persistence}' but is marked stateless`);
  if (state.persistence === 'stateless' && (!state.snapshotable || !state.rollbackable) && component.stateful) {
    errors.push(`stateful component '${component.name}' requires non-stateless state metadata`);
  }
  if (state.persistence !== 'stateless' && !state.key) errors.push(`stateful component '${component.name}' requires a state key`);
  if (!state.rollbackable && component.stateful && state.persistence === 'bar') errors.push(`bar-state component '${component.name}' must be rollbackable for realtime revisions`);
  return errors;
}

export type CoreSpiritReusableComponent = Readonly<{
  contract: CoreSpiritComponentContract;
  compositionNodeIds: readonly string[];
  publicInputPorts: readonly CoreSpiritComponentPort[];
  publicOutputPorts: readonly CoreSpiritComponentPort[];
}>;

export function describeCoreSpiritReusableComponent(component: CoreSpiritComponentContract): CoreSpiritReusableComponent {
  return Object.freeze({
    contract: component,
    compositionNodeIds: Object.freeze([...component.nodeIds]),
    publicInputPorts: Object.freeze([...component.inputs]),
    publicOutputPorts: Object.freeze([...component.outputs]),
  });
}

export type CoreSpiritComponentRegistryLike =
  | CoreSpiritComponentRegistry
  | readonly CoreSpiritComponentContract[];

function componentEntries(source?: CoreSpiritComponentRegistryLike): readonly CoreSpiritComponentContract[] {
  if (!source) return [];
  return source instanceof CoreSpiritComponentRegistry ? source.listContracts() : source;
}

export function coreSpiritValueTypeToLanguageType(type: CoreSpiritValueType): CoreSpiritType {
  switch (type.kind) {
    case 'series': {
      const element = typeof type.element === 'object' ? type.element.kind : type.element;
      if (element === 'boolean') return 'series<boolean>';
      if (element === 'scalar' || element === 'feature' || element === 'distribution' || element == null) return 'series<number>';
      return 'series<number>';
    }
    case 'boolean':
    case 'condition':
      return 'boolean';
    case 'event':
    case 'signal':
      return 'event';
    case 'model':
      return 'model:ref';
    case 'visual':
      return 'visual:object';
    case 'automation':
      return 'unknown';
    case 'order-intent':
      return 'order-intent';
    case 'dataset':
      return 'array<number>';
    case 'state':
      return 'unknown';
    case 'feature':
    case 'scalar':
    case 'distribution':
      return 'number';
    default:
      return 'unknown';
  }
}

export function componentResultLanguageType(component: CoreSpiritComponentContract): CoreSpiritType {
  if (component.outputs.length === 0) return 'null';
  if (component.outputs.length === 1) return coreSpiritValueTypeToLanguageType(component.outputs[0].type);
  return `udt:component:${component.id}`;
}

export function resolveCoreSpiritComponent(
  source: CoreSpiritComponentRegistryLike | undefined,
  nameOrId: string,
): CoreSpiritComponentContract | undefined {
  const entries = componentEntries(source);
  return entries.find(component =>
    component.id === nameOrId || component.name === nameOrId || component.aliases?.includes(nameOrId),
  );
}

export function componentForLanguageType(
  source: CoreSpiritComponentRegistryLike | undefined,
  type: CoreSpiritType,
): CoreSpiritComponentContract | undefined {
  if (!type.startsWith('udt:component:')) return undefined;
  return resolveCoreSpiritComponent(source, type.slice('udt:component:'.length));
}

export function validateCoreSpiritComponentInvocation(
  component: CoreSpiritComponentContract,
  argTypes: readonly CoreSpiritType[],
): string[] {
  const errors: string[] = [];
  const required = component.inputs.filter(input => input.required).length;
  if (argTypes.length < required || argTypes.length > component.inputs.length) {
    errors.push(`component '${component.name}' expects ${required === component.inputs.length ? required : `${required}-${component.inputs.length}`} arguments; got ${argTypes.length}`);
  }
  for (let index = 0; index < Math.min(argTypes.length, component.inputs.length); index += 1) {
    const input = component.inputs[index];
    const actual = argTypes[index];
    if (input.type.kind === 'series' && !isSeriesType(actual) && actual !== 'unknown') {
      errors.push(`component '${component.name}' input '${input.name}' expects a series value`);
      continue;
    }
    const expected = coreSpiritValueTypeToLanguageType(input.type);
    if (expected !== 'unknown' && actual !== 'unknown') {
      const compatible = expected === actual ||
        (expected === 'series<number>' && ['series<int>', 'series<float>', 'series<number>'].includes(actual)) ||
        (expected === 'number' && ['int', 'float', 'number'].includes(actual));
      if (!compatible) errors.push(`component '${component.name}' input '${input.name}' expects ${expected}; got ${actual}`);
    }
  }
  return errors;
}

export class CoreSpiritComponentRegistry {
  private readonly registrations = new Map<string, CoreSpiritComponentRegistration>();
  private readonly names = new Map<string, string>();

  register(contract: CoreSpiritComponentContract, execute?: CoreSpiritComponentExecutor): void {
    const errors = validateCoreSpiritComponent(contract);
    if (errors.length) throw new Error(errors.join('; '));
    if (this.registrations.has(contract.id)) throw new Error(`component '${contract.id}' is already registered`);
    const callableNames = [contract.name, ...(contract.aliases ?? [])];
    for (const name of callableNames) {
      const existing = this.names.get(name);
      if (existing && existing !== contract.id) throw new Error(`component callable name '${name}' is already registered`);
    }
    const registration = Object.freeze({ contract, ...(execute ? { execute } : {}) });
    this.registrations.set(contract.id, registration);
    for (const name of callableNames) this.names.set(name, contract.id);
  }

  resolve(nameOrId: string): CoreSpiritComponentContract | undefined {
    const id = this.registrations.has(nameOrId) ? nameOrId : this.names.get(nameOrId);
    return id ? this.registrations.get(id)?.contract : undefined;
  }

  executor(nameOrId: string): CoreSpiritComponentExecutor | undefined {
    const id = this.registrations.has(nameOrId) ? nameOrId : this.names.get(nameOrId);
    return id ? this.registrations.get(id)?.execute : undefined;
  }

  listContracts(): readonly CoreSpiritComponentContract[] {
    return Object.freeze([...this.registrations.values()].map(registration => registration.contract));
  }

  unregister(id: string): boolean {
    const registration = this.registrations.get(id);
    if (!registration) return false;
    this.registrations.delete(id);
    for (const name of [registration.contract.name, ...(registration.contract.aliases ?? [])]) {
      if (this.names.get(name) === id) this.names.delete(name);
    }
    return true;
  }

  clear(): void {
    this.registrations.clear();
    this.names.clear();
  }
}

const defaultComponentRegistry = new CoreSpiritComponentRegistry();
export const coreSpiritComponentRegistry = defaultComponentRegistry;

const samePort = (a: CoreSpiritComponentPort, b: CoreSpiritComponentPort): boolean => JSON.stringify(a.type) === JSON.stringify(b.type);

function compatibleValueType(a: CoreSpiritValueType, b: CoreSpiritValueType): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind !== 'series') return true;
  if (a.element == null || b.element == null) return true;
  const aElement = typeof a.element === 'object' ? a.element.kind : a.element;
  const bElement = typeof b.element === 'object' ? b.element.kind : b.element;
  return aElement === bElement || (['scalar', 'feature', 'distribution'].includes(aElement) && ['scalar', 'feature', 'distribution'].includes(bElement));
}

function canChainPort(candidate: CoreSpiritComponentPort, input: CoreSpiritComponentPort): boolean {
  return samePort(candidate, input) || compatibleValueType(candidate.type, input.type);
}

export function validateCoreSpiritComponent(component: CoreSpiritComponentContract): string[] {
  const errors: string[] = [];
  const validatePorts = (ports: readonly CoreSpiritComponentPort[], side: 'in' | 'out'): void => {
    const names = new Set<string>();
    for (const port of ports) {
      if (!port.name) errors.push(`${side} component ports require names`);
      if (names.has(port.name)) errors.push(`duplicate ${side} component port '${port.name}'`);
      names.add(port.name);
    }
  };
  if (!component.id || !component.name) errors.push('component id and name are required');
  if (component.version !== 1) errors.push('unsupported component contract version');
  validatePorts(component.inputs, 'in');
  validatePorts(component.outputs, 'out');
  if (!component.outputs.length) errors.push('component requires at least one output');
  if (new Set(component.nodeIds).size !== component.nodeIds.length) errors.push('component nodeIds must be unique');
  if (component.aliases && new Set(component.aliases).size !== component.aliases.length) errors.push('component aliases must be unique');
  if (component.execution) errors.push(...validateCoreSpiritComponentExecutionProfile(component.execution));
  errors.push(...validateCoreSpiritComponentStateProfile(component));
  if (component.documentation?.inputDescriptions) for (const key of Object.keys(component.documentation.inputDescriptions)) if (!component.inputs.some(port => port.name === key)) errors.push(`component documentation references unknown input '${key}'`);
  if (component.documentation?.outputDescriptions) for (const key of Object.keys(component.documentation.outputDescriptions)) if (!component.outputs.some(port => port.name === key)) errors.push(`component documentation references unknown output '${key}'`);
  return errors;
}

export function buildCoreSpiritComponentFromComposition(
  graph: CoreSpiritCompositionGraph,
  id: string,
  name: string,
  options: CoreSpiritComponentAuthoringOptions = {},
): CoreSpiritComponentDefinition {
  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const edge of graph.edges) {
    (outgoing.get(edge.from) ?? outgoing.set(edge.from, []).get(edge.from)!).push(edge.to);
    (incoming.get(edge.to) ?? incoming.set(edge.to, []).get(edge.to)!).push(edge.from);
  }
  const nodes = [...graph.nodes];
  const inputNodes = nodes.filter(node => !incoming.has(node.id));
  const outputNodes = nodes.filter(node => !outgoing.has(node.id) || ['event', 'automation', 'show'].includes(node.kind));
  const typeFor = (node: typeof nodes[number]): CoreSpiritValueType => ({
    kind: node.contract === 'series' ? 'series' :
      node.kind === 'condition' ? 'condition' :
      node.contract === 'boolean' ? 'condition' :
      node.kind === 'event' ? 'event' :
      node.kind === 'model' ? 'model' :
      node.kind === 'show' ? 'visual' :
      'scalar',
  });
  const inputs = inputNodes.map(node => ({ name: node.name, type: typeFor(node), required: true }));
  const outputs = outputNodes.map(node => ({ name: node.name, type: typeFor(node), required: true }));
  return Object.freeze({
    version: 1,
    id,
    name,
    ...(options.aliases?.length ? { aliases: Object.freeze([...options.aliases]) } : {}),
    kind: options.kind ?? 'component',
    inputs,
    outputs,
    nodeIds: Object.freeze(nodes.map(node => node.id)),
    dependencies: Object.freeze([...new Set(graph.edges.map(edge => edge.from))]),
    deterministic: !nodes.some(node => node.kind === 'automation' || node.kind === 'order-intent'),
    stateful: nodes.some(node => node.contract === 'series'),
    capabilities: Object.freeze(nodes.map(node => node.kind)),
    ...(options.execution ? { execution: Object.freeze({ ...options.execution, eligibleBackends: Object.freeze([...options.execution.eligibleBackends]) }) } : {}),
    ...(options.state ? { state: Object.freeze({ ...options.state }) } : {}),
    ...(options.documentation ? { documentation: Object.freeze({ ...options.documentation, ...(options.documentation.inputDescriptions ? { inputDescriptions: Object.freeze({ ...options.documentation.inputDescriptions }) } : {}), ...(options.documentation.outputDescriptions ? { outputDescriptions: Object.freeze({ ...options.documentation.outputDescriptions }) } : {}), ...(options.documentation.examples ? { examples: Object.freeze([...options.documentation.examples]) } : {}) }) } : {}),
    sourceId: options.sourceId ?? 'composition',
  });
}

export function registerCoreSpiritComponentFromComposition(
  registry: CoreSpiritComponentRegistry,
  graph: CoreSpiritCompositionGraph,
  id: string,
  name: string,
  options: CoreSpiritComponentAuthoringOptions = {},
  execute?: CoreSpiritComponentExecutor,
): CoreSpiritReusableComponent {
  const contract = buildCoreSpiritComponentFromComposition(graph, id, name, options);
  registry.register(contract, execute);
  return describeCoreSpiritReusableComponent(contract);
}

export type CoreSpiritPipelineDescriptor = Readonly<{
  version: 1;
  id: string;
  stages: readonly CoreSpiritComponentContract[];
  nodeIds: readonly string[];
  inputs: readonly CoreSpiritComponentPort[];
  outputs: readonly CoreSpiritComponentPort[];
}>;

export function buildCoreSpiritPipelineDescriptor(id: string, stages: readonly CoreSpiritComponentContract[]): CoreSpiritPipelineDescriptor {
  const inputs = stages.length ? stages[0].inputs : [];
  const outputs = stages.length ? stages[stages.length - 1].outputs : [];
  const nodeIds = [...new Set(stages.flatMap(stage => stage.nodeIds))];
  for (let i = 1; i < stages.length; i += 1) {
    const previous = stages[i - 1].outputs;
    const current = stages[i].inputs;
    const used = new Set<number>();
    for (const port of current) {
      if (!port.required) continue;
      let match = previous.findIndex((candidate, index) => !used.has(index) && candidate.name === port.name && samePort(candidate, port));
      if (match < 0) match = previous.findIndex((candidate, index) => !used.has(index) && canChainPort(candidate, port));
      if (match < 0) throw new Error(`pipeline '${id}' missing compatible stage input '${port.name}'`);
      used.add(match);
    }
  }
  return Object.freeze({ version: 1, id, stages: Object.freeze([...stages]), nodeIds: Object.freeze(nodeIds), inputs: Object.freeze([...inputs]), outputs: Object.freeze([...outputs]) });
}
