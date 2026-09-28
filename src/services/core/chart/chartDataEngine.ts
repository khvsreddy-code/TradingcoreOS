import type { MarketDataPoint } from '../data/marketDataStore';
import { getCanonicalDataPlane, type CanonicalDataPlane } from '../data/canonicalDataPlane';
import { bindIndicatorInput } from '../data/indicatorDataPlane';
import { bindModelFeature } from '../data/modelDataPlane';

export class ChartDataEngine {
  readonly plane: CanonicalDataPlane;

  constructor(timelineKey: string, plane = getCanonicalDataPlane(timelineKey)) {
    this.plane = plane;
    this.plane.attachConsumer(`chart:${timelineKey}`, 'chart');
  }

  replace(rows: readonly MarketDataPoint[]): void { this.plane.replace(rows); }
  append(row: MarketDataPoint): void { this.plane.append(row); }
  updateLast(row: MarketDataPoint): void { this.plane.updateLast(row); }
  read(from = 0, to = this.plane.length) { return this.plane.read(from, to); }
  bindIndicator(field: Parameters<typeof bindIndicatorInput>[1] = 'close') { return bindIndicatorInput(this.plane, field); }
  bindModelFeature(name: string, field: Parameters<typeof bindModelFeature>[2]) { return bindModelFeature(this.plane, name, field); }
  consumers() { return this.plane.listConsumers(); }
}
