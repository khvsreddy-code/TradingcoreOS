import type { CoreSpiritAlignedPoint, CoreSpiritDataSnapshot, CoreSpiritIntrabar, CoreSpiritIntrabarSeries, CoreSpiritDataState } from './types';

export function classifyDataState(input: { historical?: boolean; confirmed?: boolean; realtime?: boolean }): CoreSpiritDataState {
  if (input.realtime) return 'realtime';
  if (input.confirmed) return 'confirmed';
  return input.historical ? 'historical' : 'developing';
}

/** Last-value carry-forward alignment for higher-timeframe snapshots. It never invents a value before the first sample. */
export function alignSnapshots(targetTimes: number[], snapshots: CoreSpiritDataSnapshot[]): CoreSpiritAlignedPoint[] {
  const ordered = [...snapshots].filter(x => x.timestamp != null).sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  let cursor = 0;
  let current: CoreSpiritDataSnapshot | undefined;
  return targetTimes.map(timestamp => {
    while (cursor < ordered.length && Number(ordered[cursor].timestamp) <= timestamp) current = ordered[cursor++];
    return { timestamp, value: current?.value ?? null, state: current?.state ?? 'historical', source: current?.source };
  });
}

/** Groups lower-timeframe observations into their containing parent bars. */
export function groupIntrabars(parentBars: Array<{ timestamp: number; endTimestamp?: number }>, intrabars: CoreSpiritIntrabar[], parentDurationMs: number): CoreSpiritIntrabarSeries[] {
  const ordered = [...intrabars].sort((a, b) => a.timestamp - b.timestamp);
  return parentBars.map(parent => {
    const end = parent.endTimestamp ?? parent.timestamp + parentDurationMs;
    const points = ordered.filter(x => x.timestamp >= parent.timestamp && x.timestamp < end);
    return { parentTimestamp: parent.timestamp, timeframe: `${parentDurationMs}ms`, points, complete: points.length > 0 && points.at(-1)!.timestamp < end, source: 'aligned-ltf' };
  });
}


export function alignTimeframeSnapshots(targetTimes: number[], snapshots: CoreSpiritDataSnapshot[], options: { confirmedOnly?: boolean } = {}): CoreSpiritAlignedPoint[] {
  const filtered = options.confirmedOnly ? snapshots.filter(snapshot => snapshot.state === 'confirmed' || snapshot.state === 'historical') : snapshots;
  return alignSnapshots(targetTimes, filtered);
}
