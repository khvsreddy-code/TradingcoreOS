import type { CoreSpiritIrInstruction, CoreSpiritIrProgram } from './ir';
import { getCoreSpiritBuiltin } from './standardLibrary';
import { deriveCoreSpiritNodeExecutionDescriptor, type CoreSpiritExecutionLane, type CoreSpiritNodeClass } from './coreSpiritExecutionModel';
import { coreSpiritComponentRegistry, resolveCoreSpiritComponent } from './coreSpiritComponents';
import type { CoreSpiritComponentRegistryLike } from './coreSpiritComponents';

export type CoreSpiritGraphNodeKind =
  | 'input'
  | 'compute'
  | 'control'
  | 'visual'
  | 'ui'
  | 'signal'
  | 'automation'
  | 'effect';

export type CoreSpiritGraphNode = {
  id: string;
  instruction: number;
  kind: CoreSpiritGraphNodeKind;
  op: CoreSpiritIrInstruction['op'];
  name?: string;
  dest?: string;
  componentId?: string;
  dependencies: string[];
  sourceInputs: string[];
  pure: boolean;
  effectful: boolean;
  source?: { start: number; end: number; line: number; column: number };
  estimatedCost: 'constant'|'low'|'medium'|'high'|'external';
  latencyClass: 'instant'|'fast'|'normal'|'slow'|'external';
  stateful: boolean;
  deterministic: boolean;
  parallelizable: boolean;
  executionLane?: CoreSpiritExecutionLane;
  executionClass?: CoreSpiritNodeClass;
  cacheable?: boolean;
  lookback: number;
  incremental: boolean;
  viewportDependent: boolean;
  realtimeSafe: boolean;
};

export type CoreSpiritSemanticGraph = {
  version: 1;
  sourceId: string;
  nodes: CoreSpiritGraphNode[];
  roots: string[];
  outputs: string[];
  checksum: string;
};

export type CoreSpiritExecutionGraph = {
  version: 1;
  order: string[];
  instructionByNode: Record<string, number>;
  barriers: string[];
};

export type CoreSpiritVisualGraph = {
  version: 1;
  nodes: string[];
  dependencies: Record<string, string[]>;
  layers: Record<'visual'|'ui'|'signal'|'automation', string[]>;
};

export type CoreSpiritReactivePlan = {
  version: 1;
  nodeByInstruction: Record<string, number>;
  sourceInputs: Record<string, string[]>;
  sourceDependents: Record<string, string[]>;
  dependencies: Record<string, string[]>;
  dependents: Record<string, string[]>;
  alwaysRecompute: string[];
  effectNodes: string[];
};

export type CoreSpiritGraphBundle = {
  semantic: CoreSpiritSemanticGraph;
  execution: CoreSpiritExecutionGraph;
  visual: CoreSpiritVisualGraph;
  reactive: CoreSpiritReactivePlan;
};

const VISUAL_EMITS = new Set([
  'plot','marker','label','labelAt','line','zone','box','band','fill','gradient','arrow','shape','heatmap','polyline','hline','bg','barcolor','table','text','polygon','customVisual',
]);
const AUTOMATION_EMITS = new Set(['entry','exit','buy','sell']);

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableStringify(object[key])}`).join(',')}}`;
}

function stableChecksum(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function asSource(program: CoreSpiritIrProgram, instruction: number) {
  const current = program.entry.instructions[instruction];
  if (current?.origin) return { start:current.origin.start, end:current.origin.end, line:current.origin.line, column:current.origin.column };
  const entry = program.sourceMap.entries.find(item => item.instruction === instruction);
  return entry ? { start: entry.start, end: entry.end, line: entry.line, column: entry.column } : undefined;
}

function builtinPurity(name: string, component?: import('./coreSpiritExecutionModel').CoreSpiritComponentContract): boolean {
  if (component) return component.deterministic && !component.stateful;
  if (name.startsWith('ui.') || name.startsWith('visual.') || name.startsWith('app.') || name.startsWith('scan.')) return false;
  return getCoreSpiritBuiltin(name)?.pure ?? false;
}

function builtinDeterminism(name: string, component?: import('./coreSpiritExecutionModel').CoreSpiritComponentContract): boolean {
  if (component) return component.deterministic;
  if (name.startsWith('ui.') || name.startsWith('visual.') || name.startsWith('app.') || name.startsWith('scan.')) return false;
  const builtin = getCoreSpiritBuiltin(name);
  if (!builtin) return false;
  return builtin.capability !== 'market' && builtin.capability !== 'webhook' && builtin.capability !== 'ai';
}

function instructionDest(ins: CoreSpiritIrInstruction): string | undefined {
  return 'dest' in ins ? ins.dest : undefined;
}

function constantValueForInstruction(instructions: readonly CoreSpiritIrInstruction[], register?: string): number | undefined {
  if (!register) return undefined;
  const found = instructions.find((instruction) => instruction.op === 'const' && instruction.dest === register);
  return found?.op === 'const' && typeof found.value === 'number' && Number.isFinite(found.value) ? found.value : undefined;
}

function inferNodeLookback(ins: CoreSpiritIrInstruction, instructions: readonly CoreSpiritIrInstruction[], stateful: boolean): number {
  if (ins.op === 'loadSeries') return Math.max(0, ins.offset);
  if (ins.op === 'index') return Math.max(0, Math.floor(constantValueForInstruction(instructions, ins.index) ?? 0));
  if (ins.op === 'call') {
    if (/^(ema|rma|rsi|atr|vwap|cross|crossover|crossunder)$/.test(ins.name)) return -1;
    if (/^(change|pctchange)$/.test(ins.name)) return 1;
    const length = Math.max(0, Math.floor(constantValueForInstruction(instructions, ins.args[1]) ?? 0));
    if (/^(sma|mean|sum|highest|lowest|stdev|wma|median|variance|zscore|normalize|persistence|rising|falling)$/.test(ins.name)) return Math.max(0, length - 1);
  }
  return stateful ? Number.POSITIVE_INFINITY : 0;
}

function instructionName(ins: CoreSpiritIrInstruction): string | undefined {
  if (ins.op === 'call') return ins.name;
  if (ins.op === 'emit') return ins.kind;
  return ins.op;
}

function registerDeps(ins: CoreSpiritIrInstruction): string[] {
  switch (ins.op) {
    case 'move': return [ins.source];
    case 'unary': return [ins.operand];
    case 'binary': return [ins.left, ins.right];
    case 'call': return [...ins.args];
    case 'index': return [ins.target, ins.index];
    case 'setLocal': return [ins.source];
    case 'jumpIfFalse': return [ins.condition];
    case 'emit': return ins.args.slice(1);
    default: return [];
  }
}

function sourceInputs(ins: CoreSpiritIrInstruction): string[] {
  if (ins.op === 'loadSeries') return [ins.name];
  if (ins.op === 'call') {
    const names = [...(ins.seriesArgs || [])];
    if (ins.name === 'bar_index') names.push('bar_index');
    if (ins.name === 'time') names.push('time');
    if (ins.name === 'request' || ins.name === 'requestBatch' || ins.name === '__member_get') names.push('external-data');
    if (ins.name === 'vwap') names.push('high','low','close','volume','time');
    if (ins.name === 'atr') names.push('high','low','close');
    return Array.from(new Set(names));
  }
  return [];
}

function classify(ins: CoreSpiritIrInstruction): CoreSpiritGraphNodeKind {
  if (ins.op === 'emit') {
    if (VISUAL_EMITS.has(ins.kind)) return 'visual';
    if (ins.kind === 'signal') return 'signal';
    if (AUTOMATION_EMITS.has(ins.kind)) return 'automation';
    return 'effect';
  }
  if (ins.op === 'jump' || ins.op === 'jumpIfFalse') return 'control';
  if (ins.op === 'call') {
    if (ins.name.startsWith('ui.')) return 'ui';
    if (ins.name.startsWith('visual.') || ins.name.startsWith('app.')) return 'visual';
    if (ins.name.startsWith('scan.')) return 'effect';
  }
  if (ins.op === 'loadSeries') return 'input';
  return 'compute';
}

export function buildCoreSpiritGraphBundle(program: CoreSpiritIrProgram, options: { components?: CoreSpiritComponentRegistryLike } = {}): CoreSpiritGraphBundle {
  const producer = new Map<string, string>();
  const nodes: CoreSpiritGraphNode[] = [];
  const instructionByNode: Record<string, number> = {};

  for (let instruction = 0; instruction < program.entry.instructions.length; instruction++) {
    const ins = program.entry.instructions[instruction];
    const id = `i:${instruction}`;
    const dependencies = registerDeps(ins).map(reg => producer.get(reg)).filter((value): value is string => Boolean(value));
    const inputs = sourceInputs(ins);
    const component = ins.op === 'call' && ins.componentId
      ? resolveCoreSpiritComponent(options.components ?? coreSpiritComponentRegistry, ins.componentId)
      : undefined;
    const pure = ins.op === 'const' || ins.op === 'loadSeries' || ins.op === 'move' || ins.op === 'unary' || ins.op === 'binary' || ins.op === 'index' ||
      (ins.op === 'call' && builtinPurity(ins.name, component));
    const kind = classify(ins);
    const name = instructionName(ins);
    const stateful = ins.op === 'setLocal' || Boolean(component?.stateful) || (ins.op === 'call' && /^(ema|rma|rsi|atr|vwap|highest|lowest|sma|valuewhen|bar_index)$/.test(ins.name));
    const deterministic = ins.op === 'call' ? builtinDeterminism(ins.name, component) : ins.op !== 'emit';
    const effectful = ins.op === 'emit' || ins.op === 'setLocal' || ins.op === 'jump' || (ins.op === 'call' && !deterministic);
    const external = ins.op === 'emit' || (ins.op === 'call' && !deterministic);
    const estimatedCost: CoreSpiritGraphNode['estimatedCost'] = external ? 'external' : ins.op === 'const' || ins.op === 'move' ? 'constant' : ins.op === 'call' ? (/^(model\\.|model$|predict|inference)/.test(ins.name) ? 'high' : 'medium') : 'low';
    const latencyClass: CoreSpiritGraphNode['latencyClass'] = estimatedCost === 'external' ? 'external' : estimatedCost === 'high' ? 'slow' : estimatedCost === 'medium' ? 'normal' : estimatedCost === 'constant' ? 'instant' : 'fast';
    const parallelizable = deterministic && !stateful && !effectful;
    const node: CoreSpiritGraphNode = {
      id,
      instruction,
      kind,
      op: ins.op,
      name,
      dest: instructionDest(ins),
      ...(component ? { componentId: component.id } : {}),
      dependencies: Array.from(new Set(dependencies)),
      sourceInputs: inputs,
      pure,
      effectful,
      source: asSource(program, instruction),
      estimatedCost,
      latencyClass,
      stateful,
      deterministic,
      parallelizable,
      ...(() => { const descriptor = deriveCoreSpiritNodeExecutionDescriptor({ nodeId: id, effectful, stateful, latencyClass, kind, parallelizable, deterministic }); return { executionLane: descriptor.lane, executionClass: descriptor.class, cacheable: descriptor.cacheable }; })(),
      lookback: inferNodeLookback(ins, program.entry.instructions, stateful),
      incremental: deterministic && (pure || stateful),
      viewportDependent: ins.op === 'call' && /visible_(bar|range|time)|chart\.left|chart\.right/.test(ins.name),
      realtimeSafe: deterministic && !external && !(ins.op === 'call' && /visible_(bar|range|time)|chart\.left|chart\.right/.test(ins.name)),
    };
    nodes.push(node);
    instructionByNode[id] = instruction;
    if (node.dest) producer.set(node.dest, id);
    if (ins.op === 'setLocal') producer.set(ins.name, id);
  }

  const dependents: Record<string, string[]> = {};
  for (const node of nodes) {
    for (const dependency of node.dependencies) (dependents[dependency] ||= []).push(node.id);
  }
  const outputNodes = nodes.filter(node => ['visual','ui','signal','automation','effect'].includes(node.kind)).map(node => node.id);
  const roots = nodes.filter(node => node.dependencies.length === 0).map(node => node.id);
  const barriers = nodes.filter(node => node.effectful).map(node => node.id);
  const alwaysRecompute = nodes.filter(node => node.effectful || (node.op === 'call' && !node.pure)).map(node => node.id);

  const semantic: CoreSpiritSemanticGraph = {
    version: 1,
    sourceId: program.sourceId,
    nodes,
    roots,
    outputs: outputNodes,
    checksum: stableChecksum(nodes.map(({source, ...node}) => node)),
  };
  const execution: CoreSpiritExecutionGraph = {
    version: 1,
    order: nodes.map(node => node.id),
    instructionByNode,
    barriers,
  };
  const layers = {
    visual: nodes.filter(node => node.kind === 'visual').map(node => node.id),
    ui: nodes.filter(node => node.kind === 'ui').map(node => node.id),
    signal: nodes.filter(node => node.kind === 'signal').map(node => node.id),
    automation: nodes.filter(node => node.kind === 'automation').map(node => node.id),
  } as const;
  const visual: CoreSpiritVisualGraph = {
    version: 1,
    nodes: [...layers.visual, ...layers.ui, ...layers.signal, ...layers.automation],
    dependencies: Object.fromEntries(nodes.filter(node => visualNode(node.kind)).map(node => [node.id, [...node.dependencies]])),
    layers,
  };
  const sourceInputsByNode: Record<string, string[]> = Object.fromEntries(nodes.map(node => [node.id, [...node.sourceInputs]]));
  const dependencies: Record<string, string[]> = Object.fromEntries(nodes.map(node => [node.id, [...node.dependencies]]));
  const dependentsByNode = Object.fromEntries(nodes.map(node => [node.id, [...(dependents[node.id] || [])]]));
  const sourceDependentsMutable: Record<string, string[]> = {};
  for (const node of nodes) for (const input of node.sourceInputs) (sourceDependentsMutable[input] ||= []).push(node.id);
  const sourceDependents = Object.fromEntries(Object.entries(sourceDependentsMutable).map(([key, ids]) => [key, [...new Set(ids)]]));
  const reactive: CoreSpiritReactivePlan = {
    version: 1,
    nodeByInstruction: instructionByNode,
    sourceInputs: sourceInputsByNode,
    sourceDependents,
    dependencies,
    dependents: dependentsByNode,
    alwaysRecompute,
    effectNodes: barriers,
  };
  return { semantic, execution, visual, reactive };
}

function visualNode(kind: CoreSpiritGraphNodeKind): boolean {
  return kind === 'visual' || kind === 'ui' || kind === 'signal' || kind === 'automation';
}
