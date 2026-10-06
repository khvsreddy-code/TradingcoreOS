import type { CoreSpiritObject, CoreSpiritPlotStyle } from './types';

export const CORE_SPIRIT_SHARED_OUTPUT_VERSION = 1 as const;
const HEADER_BYTES = 32;

export type CoreSpiritSharedSeriesGroup = Readonly<{
  name?: string;
  seriesId?: string;
  style?: CoreSpiritPlotStyle;
  offset: number;
  count: number;
}>;

export type CoreSpiritSharedSeriesDescriptor = Readonly<{
  version: typeof CORE_SPIRIT_SHARED_OUTPUT_VERSION;
  buffer: SharedArrayBuffer;
  groups: readonly CoreSpiritSharedSeriesGroup[];
  pointCount: number;
}>;

export function createSharedSeriesOutput(outputs: readonly CoreSpiritObject[]): {
  descriptor: CoreSpiritSharedSeriesDescriptor | undefined;
  passthrough: CoreSpiritObject[];
} {
  const series = outputs.filter((output): output is Extract<CoreSpiritObject,{kind:'series'}> => output.kind === 'series');
  if (!series.length || typeof SharedArrayBuffer === 'undefined') {
    return { descriptor: undefined, passthrough: [...outputs] };
  }

  const grouped = new Map<string, Extract<CoreSpiritObject,{kind:'series'}>[]>();
  for (const output of series) {
    const key = String(output.seriesId || output.name || 'series');
    const bucket = grouped.get(key);
    if (bucket) bucket.push(output);
    else grouped.set(key,[output]);
  }

  const totalPoints = series.length;
  const bytes = HEADER_BYTES + totalPoints * 2 * Float64Array.BYTES_PER_ELEMENT;
  const buffer = new SharedArrayBuffer(bytes);
  const times = new Float64Array(buffer, HEADER_BYTES, totalPoints);
  const values = new Float64Array(buffer, HEADER_BYTES + totalPoints * Float64Array.BYTES_PER_ELEMENT, totalPoints);
  const groups: CoreSpiritSharedSeriesGroup[] = [];
  let offset = 0;

  for (const bucket of grouped.values()) {
    const first = bucket[0]!;
    for (let i = 0; i < bucket.length; i += 1) {
      const output = bucket[i]!;
      times[offset + i] = Number(output.time);
      values[offset + i] = output.value == null ? Number.NaN : Number(output.value);
    }
    groups.push({
      name: first.name,
      seriesId: first.seriesId,
      style: first.style,
      offset,
      count: bucket.length,
    });
    offset += bucket.length;
  }

  return {
    descriptor: Object.freeze({
      version: CORE_SPIRIT_SHARED_OUTPUT_VERSION,
      buffer,
      groups: Object.freeze(groups),
      pointCount: totalPoints,
    }),
    passthrough: outputs.filter((output) => output.kind !== 'series'),
  };
}

export function materializeSharedSeriesOutput(
  descriptor: CoreSpiritSharedSeriesDescriptor,
): CoreSpiritObject[] {
  if (descriptor.version !== CORE_SPIRIT_SHARED_OUTPUT_VERSION) throw new Error('Unsupported CoreSpirit shared output version');

  const times = new Float64Array(descriptor.buffer, HEADER_BYTES, descriptor.pointCount);
  const values = new Float64Array(
    descriptor.buffer,
    HEADER_BYTES + descriptor.pointCount * Float64Array.BYTES_PER_ELEMENT,
    descriptor.pointCount,
  );
  const outputs: CoreSpiritObject[] = [];

  for (const group of descriptor.groups) {
    for (let i = 0; i < group.count; i += 1) {
      const index = group.offset + i;
      outputs.push({
        kind: 'series',
        time: times[index]!,
        value: Number.isNaN(values[index]!) ? null : values[index]!,
        ...(group.name ? { name: group.name } : {}),
        ...(group.seriesId ? { seriesId: group.seriesId } : {}),
        ...(group.style ? { style: group.style } : {}),
      });
    }
  }
  return outputs;
}
