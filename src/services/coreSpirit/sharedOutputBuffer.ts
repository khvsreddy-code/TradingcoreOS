import type { CoreSpiritObject, CoreSpiritPlotStyle } from './types';

export const CORE_SPIRIT_SHARED_OUTPUT_VERSION = 1 as const;
const HEADER_BYTES = 32;

export type CoreSpiritSharedSeriesMeta = Readonly<{
  name?: string;
  seriesId?: string;
  style?: CoreSpiritPlotStyle;
}>;

export type CoreSpiritSharedSeriesDescriptor = Readonly<{
  version: typeof CORE_SPIRIT_SHARED_OUTPUT_VERSION;
  buffer: SharedArrayBuffer;
  series: readonly CoreSpiritSharedSeriesMeta[];
  pointCapacity: number;
  pointCounts: readonly number[];
}>;

export function createSharedSeriesOutput(outputs: readonly CoreSpiritObject[]): {
  descriptor: CoreSpiritSharedSeriesDescriptor | undefined;
  passthrough: CoreSpiritObject[];
} {
  const series = outputs.filter((output): output is Extract<CoreSpiritObject,{kind:'series'}> => output.kind === 'series');
  if (!series.length || typeof SharedArrayBuffer === 'undefined') {
    return { descriptor: undefined, passthrough: [...outputs] };
  }

  const seriesCount = series.length;
  const pointCapacity = series.length ? Math.max(1, Math.max(...series.map(() => 1))) : 1;
  const actualCapacity = seriesCount;
  const pointsPerSeries = Math.max(1, Math.max(...series.map((output) => Number.isFinite(output.time) ? 1 : 0)));
  void pointCapacity;
  void actualCapacity;
  void pointsPerSeries;

  const maxPoints = series.length;
  const bytes = HEADER_BYTES + maxPoints * 2 * Float64Array.BYTES_PER_ELEMENT;
  const buffer = new SharedArrayBuffer(bytes);
  const times = new Float64Array(buffer, HEADER_BYTES, maxPoints);
  const values = new Float64Array(buffer, HEADER_BYTES + maxPoints * Float64Array.BYTES_PER_ELEMENT, maxPoints);
  const metas: CoreSpiritSharedSeriesMeta[] = [];

  for (let i = 0; i < series.length; i += 1) {
    const output = series[i]!;
    times[i] = Number(output.time);
    values[i] = output.value == null ? Number.NaN : Number(output.value);
    metas.push({
      name: output.name,
      seriesId: output.seriesId,
      style: output.style,
    });
  }

  const descriptor: CoreSpiritSharedSeriesDescriptor = Object.freeze({
    version: CORE_SPIRIT_SHARED_OUTPUT_VERSION,
    buffer,
    series: metas,
    pointCapacity: maxPoints,
    pointCounts: Object.freeze(series.map(() => 1)),
  });

  return {
    descriptor,
    passthrough: outputs.filter((output) => output.kind !== 'series'),
  };
}

export function materializeSharedSeriesOutput(
  descriptor: CoreSpiritSharedSeriesDescriptor,
): CoreSpiritObject[] {
  if (descriptor.version !== CORE_SPIRIT_SHARED_OUTPUT_VERSION) throw new Error('Unsupported CoreSpirit shared output version');
  const count = descriptor.series.length;
  const times = new Float64Array(descriptor.buffer, HEADER_BYTES, descriptor.pointCapacity);
  const values = new Float64Array(
    descriptor.buffer,
    HEADER_BYTES + descriptor.pointCapacity * Float64Array.BYTES_PER_ELEMENT,
    descriptor.pointCapacity,
  );
  const outputs: CoreSpiritObject[] = [];
  for (let i = 0; i < count; i += 1) {
    const meta = descriptor.series[i]!;
    outputs.push({
      kind: 'series',
      time: times[i]!,
      value: Number.isNaN(values[i]!) ? null : values[i]!,
      ...(meta.name ? { name: meta.name } : {}),
      ...(meta.seriesId ? { seriesId: meta.seriesId } : {}),
      ...(meta.style ? { style: meta.style } : {}),
    });
  }
  return outputs;
}
