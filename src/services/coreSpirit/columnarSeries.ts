export type CoreSpiritColumnarSeries = Readonly<{
  time: Float64Array;
  open: Float64Array;
  high: Float64Array;
  low: Float64Array;
  close: Float64Array;
  volume: Float64Array;
  length: number;
}>;

export function columnarSeriesLength(series: CoreSpiritColumnarSeries): number {
  return Math.max(
    0,
    Math.min(
      series.length,
      series.time.length,
      series.open.length,
      series.high.length,
      series.low.length,
      series.close.length,
      series.volume.length,
    ),
  );
}

export function columnarSeriesValue(
  series: CoreSpiritColumnarSeries,
  field: 'open' | 'high' | 'low' | 'close' | 'volume' | 'time',
  index: number,
): number | null {
  if (index < 0 || index >= columnarSeriesLength(series)) return null;
  const value = series[field][index];
  return Number.isFinite(value) ? value : null;
}
