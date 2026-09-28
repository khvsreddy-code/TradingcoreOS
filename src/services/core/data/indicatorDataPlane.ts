import type { CanonicalDataPlane, CanonicalMarketView } from './canonicalDataPlane';
import type { MarketDataField } from '../chart/chartDataModel';

export type IndicatorInputBinding = Readonly<{
  timelineKey: string;
  revision: number;
  length: number;
  field: MarketDataField;
  values: Float64Array;
  time: Float64Array;
}>;

/** Indicators borrow market history; only their output series belong to IndicatorStore. */
export function bindIndicatorInput(
  plane: CanonicalDataPlane,
  field: MarketDataField = 'close',
  from = 0,
  to = plane.length,
): IndicatorInputBinding {
  const view = plane.read(from, to);
  return Object.freeze({
    timelineKey: view.timelineKey,
    revision: view.revision,
    length: view.length,
    field,
    values: view[field],
    time: view.time,
  });
}

export type IndicatorBatchContext = Readonly<{
  source: CanonicalMarketView;
  outputs: CanonicalDataPlane['indicators'];
}>;

export function createIndicatorBatchContext(plane: CanonicalDataPlane, from = 0, to = plane.length): IndicatorBatchContext {
  return Object.freeze({ source: plane.read(from, to), outputs: plane.indicators });
}
