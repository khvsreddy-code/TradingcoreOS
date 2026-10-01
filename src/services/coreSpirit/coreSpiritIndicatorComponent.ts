/**
 * CoreSpirit first-class indicator component contract.
 *
 * An indicator is a programmable CoreSpirit artifact with a typed component
 * boundary. Calculation, state, events and visual projections are described by
 * the same compiled graph; no indicator-specific evaluator or scripting runtime
 * is introduced.
 */

import type { CoreSpiritExecutableArtifact } from './artifact';
import { coreSpiritChecksum } from './artifact';
import { compileCoreSpirit, normalizeCoreSpirit } from './coreSpiritPipeline';
import type {
  CoreSpiritComponentContract,
  CoreSpiritComponentPort,
  CoreSpiritComponentStateProfile,
} from './coreSpiritExecutionModel';
import { coreSpiritComponentRegistry } from './coreSpiritComponents';
import type { CoreSpiritCompileResult } from './compiler';
import { CoreSpiritHistoricalExecutionHost, CoreSpiritRealtimeExecutionHost, type CoreSpiritHostRunResult } from './executionHost';
import type { CoreSpiritExecutionTarget } from './executionTarget';
import type { CoreSpiritMarketDataset } from './marketData';
import type { IndicatorParameterDefinition, IndicatorSettingsSchema } from './indicatorSettingsSchema';
import { getIndicatorSettingsSchema } from './indicatorSettingsSchema';
import type { CoreSpiritSurfaceMetadata } from './languageConcepts';
import { extractCoreSpiritSurfaceMetadata } from './languageConcepts';
import type { CoreSpiritIrInstruction } from './ir';

export const CORE_SPIRIT_INDICATOR_COMPONENT_VERSION = 1 as const;

export type CoreSpiritIndicatorInput = Readonly<{
  name: string;
  type: CoreSpiritComponentPort['type'];
  required: boolean;
  description?: string;
  source: 'canonical-data' | 'component' | 'parameter';
}>;

export type CoreSpiritIndicatorOutput = Readonly<{
  id: string;
  name: string;
  type: CoreSpiritComponentPort['type'];
  role: 'plot' | 'value' | 'event' | 'automation' | 'visual';
  sourceInstruction?: number;
}>;

export type CoreSpiritIndicatorEvent = Readonly<{
  id: string;
  kind: string;
  instruction: number;
  pure: boolean;
}>;

export type CoreSpiritIndicatorPlot = Readonly<{
  id: string;
  kind: string;
  instruction: number;
  outputId: string;
}>;

export type CoreSpiritIndicatorVisual = Readonly<{
  id: string;
  kind: string;
  instruction: number;
  rendererNeutral: true;
}>;

export type CoreSpiritIndicatorState = Readonly<{
  profile: CoreSpiritComponentStateProfile;
  nodes: readonly string[];
}>;

export type CoreSpiritIndicatorCalculation = Readonly<{
  instructionCount: number;
  maxLookback: number;
  deterministic: boolean;
  incrementalEligible: boolean;
  cacheable: boolean;
  parallelizable: boolean;
  eligibleBackends: readonly string[];
}>;

export type CoreSpiritIndicatorDeclaration = Readonly<{
  version: 1;
  kind: 'indicator';
  id: string;
  name: string;
  inputs: readonly CoreSpiritIndicatorInput[];
  outputs: readonly CoreSpiritIndicatorOutput[];
  calculation: CoreSpiritIndicatorCalculation;
  state: CoreSpiritIndicatorState;
  events: readonly CoreSpiritIndicatorEvent[];
  plots: readonly CoreSpiritIndicatorPlot[];
  visuals: readonly CoreSpiritIndicatorVisual[];
  alerts: readonly CoreSpiritIndicatorEvent[];
  metadata: CoreSpiritIndicatorMetadata;
  parameters: readonly IndicatorParameterDefinition[];
}>;

export type CoreSpiritIndicatorMetadata = Readonly<{
  title: string;
  description?: string;
  category?: string;
  tags?: readonly string[];
  license?: string;
  author?: string;
  documentation?: readonly string[];
}>;

export type CoreSpiritIndicatorComponent = Readonly<{
  version: typeof CORE_SPIRIT_INDICATOR_COMPONENT_VERSION;
  id: string;
  component: CoreSpiritComponentContract;
  source: Readonly<{
    sourceId: string;
    checksum: string;
    normalized: string;
  }>;
  artifact: CoreSpiritExecutableArtifact;
  settingsSchema: IndicatorSettingsSchema;
  surface: CoreSpiritSurfaceMetadata;
  inputs: readonly CoreSpiritIndicatorInput[];
  outputs: readonly CoreSpiritIndicatorOutput[];
  calculation: CoreSpiritIndicatorCalculation;
  state: CoreSpiritIndicatorState;
  events: readonly CoreSpiritIndicatorEvent[];
  plots: readonly CoreSpiritIndicatorPlot[];
  visuals: readonly CoreSpiritIndicatorVisual[];
  alerts: readonly CoreSpiritIndicatorEvent[];
  metadata: CoreSpiritIndicatorMetadata;
  parameters: readonly IndicatorParameterDefinition[];
  declaration: CoreSpiritIndicatorDeclaration;
}>;

export type CoreSpiritIndicatorAuthoringOptions = Readonly<{
  id: string;
  title?: string;
  sourceId?: string;
  metadata?: Omit<CoreSpiritIndicatorMetadata, 'title'> & { title?: string };
  settingsSchema?: IndicatorSettingsSchema;
  outputs?: readonly string[];
  inputs?: readonly CoreSpiritIndicatorInput[];
}>;

const SOURCE_SERIES = new Set(['open', 'high', 'low', 'close', 'volume', 'time']);
const VISUAL_KINDS = new Set(['show', 'plot', 'marker', 'label', 'labelAt', 'line', 'zone', 'box', 'band', 'fill', 'gradient', 'arrow', 'shape', 'heatmap', 'polyline', 'hline', 'bg', 'barcolor', 'table', 'text', 'polygon', 'customVisual']);
const ALERT_KINDS = new Set(['alert', 'webhook']);
const EVENT_KINDS = new Set(['event', 'signal', 'alert', 'webhook', 'orderIntent', 'entry', 'exit', 'buy', 'sell']);


function makePort(name: string, type: CoreSpiritComponentPort['type'], required = true): CoreSpiritComponentPort {
  return Object.freeze({ name, type, required });
}

function sourceInputsFromArtifact(artifact: CoreSpiritExecutableArtifact): readonly CoreSpiritIndicatorInput[] {
  const names = new Set<string>();
  for (const inputs of Object.values(artifact.ir.graphs?.reactive.sourceInputs ?? {})) {
    for (const input of inputs) if (SOURCE_SERIES.has(input)) names.add(input);
  }
  return Object.freeze([...names].map(name => Object.freeze({
    name,
    type: { kind: 'series', element: 'scalar' },
    required: true,
    source: 'canonical-data' as const,
  })));
}

function emittedInstructions(artifact: CoreSpiritExecutableArtifact): ReadonlyArray<{ instruction: number; ins: CoreSpiritIrInstruction }> {
  return artifact.ir.entry.instructions.flatMap((ins, instruction) => ins.op === 'emit' ? [{ instruction, ins }] : []);
}

function indicatorOutputs(artifact: CoreSpiritExecutableArtifact, requestedNames: readonly string[] = []): readonly CoreSpiritIndicatorOutput[] {
  const outputs: CoreSpiritIndicatorOutput[] = [];
  const seen = new Set<string>();
  const requested = new Set(requestedNames);
  for (const [instruction, ins] of artifact.ir.entry.instructions.entries()) {
    if (ins.op !== 'setLocal') continue;
    if (requested.size && !requested.has(ins.name)) continue;
    if (seen.has(ins.name)) continue;
    seen.add(ins.name);
    outputs.push(Object.freeze({
      id: `value:${ins.name}`,
      name: ins.name,
      type: ins.series ? { kind: 'series', element: 'scalar' } : { kind: 'scalar' },
      role: 'value',
      sourceInstruction: instruction,
    }));
  }
  for (const { instruction, ins } of emittedInstructions(artifact)) {
    const outputId = String(ins.outputId ?? `${ins.kind}:${instruction}`);
    const role: CoreSpiritIndicatorOutput['role'] = ALERT_KINDS.has(ins.kind) ? 'event' : VISUAL_KINDS.has(ins.kind) ? 'plot' : EVENT_KINDS.has(ins.kind) ? 'event' : 'value';
    const name = outputId;
    if (seen.has(name)) continue;
    seen.add(name);
    outputs.push(Object.freeze({ id: outputId, name, type: { kind: role === 'event' ? 'event' : 'visual' }, role, sourceInstruction: instruction }));
  }
  return Object.freeze(outputs);
}

function deriveComponentContract(
  id: string,
  title: string,
  artifact: CoreSpiritExecutableArtifact,
  inputs: readonly CoreSpiritIndicatorInput[],
  outputs: readonly CoreSpiritIndicatorOutput[],
  surface: CoreSpiritSurfaceMetadata,
): CoreSpiritComponentContract {
  const graph = artifact.ir.graphs?.semantic;
  const componentOutputPorts = outputs.length
    ? outputs.map(output => makePort(output.name, output.type, true))
    : [makePort('value', { kind: 'series', element: 'scalar' }, true)];
  const stateful = Boolean(graph?.nodes.some(node => node.stateful && node.op !== 'setLocal'));
  const deterministic = Boolean(graph?.nodes.every(node => node.deterministic));
  const executionClass = stateful ? 'stateful' : 'pure';
  const capabilities = new Set<string>(['indicator', 'corespirit', 'chart', 'replay']);
  for (const concept of surface.concepts) capabilities.add(concept.toLowerCase());
  for (const output of outputs) capabilities.add(output.role);
  return Object.freeze({
    version: 1,
    id,
    name: title,
    kind: 'indicator',
    inputs: Object.freeze(inputs.map(input => makePort(input.name, input.type, input.required))),
    outputs: Object.freeze(componentOutputPorts),
    nodeIds: Object.freeze((graph?.nodes ?? []).map(node => node.id)),
    dependencies: Object.freeze((graph?.nodes ?? []).flatMap(node => node.dependencies)),
    deterministic,
    stateful,
    capabilities: Object.freeze([...capabilities]),
    execution: Object.freeze({
      executionClass,
      latencyClass: stateful ? 'normal' : 'fast',
      estimatedCost: artifact.ir.entry.instructions.length > 64 ? 'medium' : 'low',
      cacheable: deterministic && !stateful,
      parallelizable: deterministic && !stateful,
      eligibleBackends: Object.freeze(stateful ? ['cpu'] as const : ['cpu', 'wasm', 'gpu'] as const),
    }),
    ...(stateful ? {
      state: Object.freeze({ persistence: 'bar' as const, snapshotable: true, rollbackable: true, key: `indicator:${id}` }),
    } : {}),
    documentation: Object.freeze({ summary: `CoreSpirit programmable indicator: ${title}.` }),
  });
}

function deriveState(artifact: CoreSpiritExecutableArtifact, component: CoreSpiritComponentContract): CoreSpiritIndicatorState {
  const nodes = Object.freeze((artifact.ir.graphs?.semantic.nodes ?? []).filter(node => node.stateful).map(node => node.id));
  return Object.freeze({
    profile: component.state ?? Object.freeze({ persistence: 'stateless', snapshotable: true, rollbackable: true }),
    nodes,
  });
}

function deriveEvents(artifact: CoreSpiritExecutableArtifact): readonly CoreSpiritIndicatorEvent[] {
  return Object.freeze(emittedInstructions(artifact)
    .filter(({ ins }) => EVENT_KINDS.has(ins.kind))
    .map(({ instruction, ins }) => Object.freeze({ id: String(ins.outputId ?? `${ins.kind}:${instruction}`), kind: ins.kind, instruction, pure: false })));
}

function derivePlots(artifact: CoreSpiritExecutableArtifact): readonly CoreSpiritIndicatorPlot[] {
  return Object.freeze(emittedInstructions(artifact)
    .filter(({ ins }) => VISUAL_KINDS.has(ins.kind))
    .map(({ instruction, ins }) => Object.freeze({ id: `${ins.kind}:${instruction}`, kind: ins.kind, instruction, outputId: String(ins.outputId ?? `${ins.kind}:${instruction}`) })));
}

function deriveVisuals(artifact: CoreSpiritExecutableArtifact): readonly CoreSpiritIndicatorVisual[] {
  return Object.freeze(derivePlots(artifact).map(plot => Object.freeze({ id: plot.id, kind: plot.kind, instruction: plot.instruction, rendererNeutral: true as const })));
}

export function createCoreSpiritIndicatorComponent(
  source: string,
  options: CoreSpiritIndicatorAuthoringOptions,
): CoreSpiritIndicatorComponent {
  const sourceId = options.sourceId ?? `indicator:${options.id}`;
  const compile: CoreSpiritCompileResult = compileCoreSpirit(source, sourceId);
  const error = compile.diagnostics.find(diagnostic => diagnostic.severity === 'error');
  if (error || !compile.artifact || !compile.ir) {
    throw new Error(error?.message ?? `CoreSpirit indicator '${options.id}' did not produce an executable artifact.`);
  }

  const artifact = compile.artifact;
  const surface = extractCoreSpiritSurfaceMetadata(source);
  const title = options.title ?? options.metadata?.title ?? options.id;
  const derivedInputs = sourceInputsFromArtifact(artifact);
  const inputByName = new Map<string, CoreSpiritIndicatorInput>();
  for (const input of derivedInputs) inputByName.set(input.name, input);
  for (const input of options.inputs ?? []) {
    const existing = inputByName.get(input.name);
    inputByName.set(input.name, existing
      ? Object.freeze({ ...existing, ...(input.description ? { description: input.description } : {}) })
      : Object.freeze({ ...input }));
  }
  const inputs = Object.freeze([...inputByName.values()]);
  const requestedOutputs = options.outputs ?? [];
  const outputs = indicatorOutputs(artifact, requestedOutputs);
  if (requestedOutputs.length) {
    const available = new Set(outputs.map(output => output.name));
    const missing = requestedOutputs.filter(name => !available.has(name));
    if (missing.length) throw new Error(`CoreSpirit indicator '${options.id}' requested unknown public output(s): ${missing.join(', ')}`);
  }
  const component = deriveComponentContract(options.id, title, artifact, inputs, outputs, surface);
  const settingsSchema = options.settingsSchema ?? getIndicatorSettingsSchema(options.id, { kind: options.id });
  const parameters = Object.freeze([...settingsSchema.parameters]);
  const events = deriveEvents(artifact);
  const plots = derivePlots(artifact);
  const alerts = Object.freeze(events.filter(event => ALERT_KINDS.has(event.kind)));
  const visuals = deriveVisuals(artifact);
  const state = deriveState(artifact, component);
  const calculation: CoreSpiritIndicatorCalculation = Object.freeze({
    instructionCount: artifact.instructionCount,
    maxLookback: artifact.maxLookback,
    deterministic: component.deterministic,
    incrementalEligible: component.stateful ? Boolean(component.state?.rollbackable) : true,
    cacheable: Boolean(component.execution?.cacheable),
    parallelizable: Boolean(component.execution?.parallelizable),
    eligibleBackends: Object.freeze([...(component.execution?.eligibleBackends ?? ['cpu'])]),
  });
  const metadata: CoreSpiritIndicatorMetadata = Object.freeze({
    title,
    ...(options.metadata?.description ? { description: options.metadata.description } : {}),
    ...(options.metadata?.category ? { category: options.metadata.category } : {}),
    ...(options.metadata?.tags?.length ? { tags: Object.freeze([...options.metadata.tags]) } : {}),
    ...(options.metadata?.license ? { license: options.metadata.license } : {}),
    ...(options.metadata?.author ? { author: options.metadata.author } : {}),
    ...(options.metadata?.documentation?.length ? { documentation: Object.freeze([...options.metadata.documentation]) } : {}),
  });

  return Object.freeze({
    version: CORE_SPIRIT_INDICATOR_COMPONENT_VERSION,
    id: options.id,
    component,
    source: Object.freeze({ sourceId, checksum: coreSpiritChecksum(normalizeCoreSpirit(source)), normalized: normalizeCoreSpirit(source) }),
    artifact,
    settingsSchema,
    surface,
    inputs,
    outputs,
    calculation,
    state,
    events,
    plots,
    visuals,
    alerts,
    metadata,
    parameters,
    declaration: Object.freeze({
      version: 1,
      kind: 'indicator' as const,
      id: options.id,
      name: title,
      inputs,
      outputs,
      parameters,
      calculation,
      state,
      events,
      plots,
      visuals,
      alerts,
      metadata,
    }),
  });
}

export class CoreSpiritIndicatorRegistry {
  private readonly indicators = new Map<string, CoreSpiritIndicatorComponent>();

  register(indicator: CoreSpiritIndicatorComponent): void {
    if (this.indicators.has(indicator.id)) throw new Error(`indicator '${indicator.id}' is already registered`);
    coreSpiritComponentRegistry.register(indicator.component);
    this.indicators.set(indicator.id, indicator);
  }

  get(id: string): CoreSpiritIndicatorComponent | undefined {
    return this.indicators.get(id);
  }

  list(): readonly CoreSpiritIndicatorComponent[] {
    return Object.freeze([...this.indicators.values()]);
  }

  unregister(id: string): boolean {
    const indicator = this.indicators.get(id);
    if (!indicator) return false;
    coreSpiritComponentRegistry.unregister(id);
    this.indicators.delete(id);
    return true;
  }

  clear(): void {
    for (const id of [...this.indicators.keys()]) this.unregister(id);
  }
}

export const coreSpiritIndicatorRegistry = new CoreSpiritIndicatorRegistry();

export type CoreSpiritIndicatorRealtimeIdentity = Readonly<{
  runId: string;
  symbol: string;
  timeframe: string;
  datasetId?: string;
  target?: CoreSpiritExecutionTarget;
}>;

/** Execute a first-class indicator through the existing CoreSpirit host/runtime. */
export function runCoreSpiritIndicatorComponent(
  indicator: CoreSpiritIndicatorComponent,
  dataset: CoreSpiritMarketDataset,
  runId = `${indicator.id}:${dataset.id}`,
  target: CoreSpiritExecutionTarget = 'chart',
): CoreSpiritHostRunResult {
  const host = new CoreSpiritHistoricalExecutionHost();
  return host.run(indicator.artifact, dataset, runId, target);
}

/** Create the existing realtime host around an indicator artifact; no second indicator VM is created. */
export function createCoreSpiritIndicatorRealtimeHost(
  indicator: CoreSpiritIndicatorComponent,
  identity: CoreSpiritIndicatorRealtimeIdentity,
): CoreSpiritRealtimeExecutionHost {
  return new CoreSpiritRealtimeExecutionHost(indicator.artifact, {
    runId: identity.runId,
    artifactChecksum: indicator.artifact.checksum,
    datasetId: identity.datasetId,
    symbol: identity.symbol,
    timeframe: identity.timeframe,
    target: identity.target ?? 'chart',
  });
}

export function validateCoreSpiritIndicatorComponent(indicator: CoreSpiritIndicatorComponent): string[] {
  const errors: string[] = [];
  if (indicator.version !== CORE_SPIRIT_INDICATOR_COMPONENT_VERSION) errors.push('unsupported indicator component version');
  if (!indicator.id || !indicator.component.name) errors.push('indicator identity is incomplete');
  if (indicator.component.kind !== 'indicator') errors.push(`indicator '${indicator.id}' must use component kind 'indicator'`);
  if (indicator.settingsSchema.identity.kind !== indicator.id && indicator.settingsSchema.identity.kind !== indicator.component.name) {
    errors.push(`indicator '${indicator.id}' settings schema identity does not match the component`);
  }
  if (indicator.calculation.instructionCount !== indicator.artifact.instructionCount) errors.push('indicator instruction count diverges from executable artifact');
  if (indicator.calculation.maxLookback !== indicator.artifact.maxLookback) errors.push('indicator lookback diverges from executable artifact');
  const outputIds = new Set<string>();
  for (const output of indicator.outputs) if (outputIds.has(output.id)) errors.push(`duplicate indicator output '${output.id}'`); else outputIds.add(output.id);
  const componentIds = new Set(indicator.component.outputs.map(output => output.name));
  for (const output of indicator.outputs) if (!componentIds.has(output.name)) errors.push(`indicator output '${output.name}' is missing from its component contract`);
  if (indicator.component.inputs.length !== indicator.inputs.length) errors.push('indicator input ports diverge from its component contract');
  if (indicator.parameters.length !== indicator.settingsSchema.parameters.length) errors.push('indicator parameter ABI diverges from its settings schema');
  if (indicator.component.inputs.some((port, index) => port.name !== indicator.inputs[index]?.name)) errors.push('indicator input ordering diverges from its component contract');
  if (indicator.declaration.kind !== 'indicator' || indicator.declaration.id !== indicator.id) errors.push('indicator declaration identity diverges from the component');
  if (indicator.declaration.inputs.length !== indicator.inputs.length || indicator.declaration.outputs.length !== indicator.outputs.length) errors.push('indicator declaration ports diverge from the component');
  if (indicator.declaration.parameters !== indicator.parameters) errors.push('indicator declaration parameters must reference the canonical parameter ABI');
  if (indicator.declaration.calculation !== indicator.calculation) errors.push('indicator declaration calculation must reference the canonical calculation metadata');
  if (indicator.visuals.some(visual => visual.rendererNeutral !== true)) errors.push('indicator visuals must remain renderer-neutral');
  return errors;
}

export function registerCoreSpiritIndicator(indicator: CoreSpiritIndicatorComponent): void {
  const errors = validateCoreSpiritIndicatorComponent(indicator);
  if (errors.length) throw new Error(errors.join('; '));
  coreSpiritIndicatorRegistry.register(indicator);
}
