import type { IndicatorMeta, InputSchema, InputType, InputValue } from '../services/core/chart/velaNativeChartKernel';
import type { CoreSpiritIrProgram } from './ir';
import type { CoreSpiritSurfaceMetadata, CoreSpiritSurfaceInput, CoreSpiritSurfaceProp } from './languageConcepts';

const VIEWPORT_CALLS = new Set([
  'vpvr',
  'volumeProfile',
  'fixedRangeVolumeProfile',
  'visible_bars',
  'visible_range',
  'visible_time',
  'chart.left',
  'chart.right',
]);

const DISPLAY_PROPS = new Set(['title', 'shorttitle', 'overlay', 'precision', 'format']);

function declarations(surface: CoreSpiritSurfaceMetadata) {
  return surface.declarations.filter((item): item is Extract<CoreSpiritSurfaceMetadata['declarations'][number], { kind: 'indicator' }> => item.kind === 'indicator');
}

function surfaceTitle(surface: CoreSpiritSurfaceMetadata, source: string): string {
  const declaration = declarations(surface)[0];
  if (declaration?.name) return declaration.name;
  const match = source.match(/\b(?:indicator|strategy|study|component)\s+(?:"([^"]+)"|'([^']+)')/i);
  return match?.[1] ?? match?.[2] ?? 'CoreSpirit';
}

function uniqueByKey<T extends { key: string }>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    out.push(item);
  }
  return out;
}

export type CoreSpiritVelaResolvedMetadata = {
  title: string;
  meta: IndicatorMeta;
  inputs: InputSchema[];
  inputValues: Record<string, InputValue>;
  props: InputSchema[];
  propValues: Record<string, InputValue>;
  reactsToViewport: boolean;
};

function valueFor<T extends { key: string; defval: InputValue }>(schema: readonly T[], overrides: Readonly<Record<string, InputValue>> | undefined): Record<string, InputValue> {
  const result: Record<string, InputValue> = {};
  for (const item of schema) result[item.key] = overrides?.[item.key] ?? item.defval;
  return result;
}

function toInputSchema(item: CoreSpiritSurfaceInput): InputSchema {
  return {
    key: item.key,
    title: item.title,
    type: item.type as InputType,
    defval: item.defval,
    ...(item.min !== undefined ? { min: item.min } : {}),
    ...(item.max !== undefined ? { max: item.max } : {}),
    ...(item.step !== undefined ? { step: item.step } : {}),
    ...(item.options?.length ? { options: item.options } : {}),
    ...(item.group ? { group: item.group } : {}),
    ...(item.inline ? { inline: item.inline } : {}),
    ...(item.tab ? { tab: item.tab } : {}),
    ...(item.tooltip ? { tooltip: item.tooltip } : {}),
  };
}

function toPropSchema(item: CoreSpiritSurfaceProp): InputSchema {
  return toInputSchema(item);
}

export function resolveCoreSpiritVelaMetadata(
  source: string,
  ir: CoreSpiritIrProgram,
  overrides: {
    inputs?: Readonly<Record<string, InputValue>>;
    props?: Readonly<Record<string, InputValue>>;
  } = {},
): CoreSpiritVelaResolvedMetadata {
  const surface = ir.surface;
  const inputs = uniqueByKey((surface?.inputs ?? []).map(toInputSchema));
  const props = uniqueByKey((surface?.props ?? []).map(toPropSchema));
  const inputValues = valueFor(inputs, overrides.inputs);
  const propValues = valueFor(props, overrides.props);
  const title = surface ? surfaceTitle(surface, source) : surfaceTitle({
    version: 1,
    primaryConcept: 'LET',
    concepts: [],
    declarations: [],
  }, source);

  const precision = typeof propValues.precision === 'number' ? Math.max(0, Math.min(16, Math.floor(propValues.precision))) : undefined;
  const overlay = typeof propValues.overlay === 'boolean' ? propValues.overlay : true;
  const shorttitle = typeof propValues.shorttitle === 'string' && propValues.shorttitle.trim()
    ? propValues.shorttitle.trim()
    : undefined;
  const format = typeof propValues.format === 'string' && propValues.format.trim()
    ? propValues.format.trim()
    : undefined;

  return {
    title,
    meta: {
      title,
      overlay,
      ...(precision !== undefined ? { precision } : {}),
      ...(shorttitle ? { shorttitle } : {}),
      ...(format ? { format } : {}),
    },
    inputs,
    inputValues,
    props,
    propValues,
    reactsToViewport: coreSpiritProgramReactsToViewport(ir),
  };
}

export function coreSpiritProgramReactsToViewport(ir: CoreSpiritIrProgram): boolean {
  const semanticViewport = ir.graphs?.semantic.nodes.some(node => node.viewportDependent === true) ?? false;
  if (semanticViewport) return true;

  return ir.entry.instructions.some(instruction => {
    if (instruction.op !== 'call') return false;
    const name = instruction.name.trim();
    if (VIEWPORT_CALLS.has(name)) return true;
    if (/^(?:visible_(?:bar|range|time)|chart\.(?:left|right)(?:Bound|Visible|Time)?)/i.test(name)) return true;
    return false;
  });
}

export function isDisplayOnlyCoreSpiritProp(key: string): boolean {
  return DISPLAY_PROPS.has(key);
}
