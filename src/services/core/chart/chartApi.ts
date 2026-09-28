import { CoreDrawingApi } from '../drawing/drawingApi';
import type { CoreDrawingStore } from '../drawing/coreDrawingStore';
import { ChartNavigationApi } from './chartNavigationApi';
import type { ChartPriceScaleEngine } from './chartPriceScale';
import type { ChartTimeScale } from './chartTimeScale';
import type { ChartViewportController } from './chartViewportController';
import type { CoreEventBus } from '../event/eventBus';
import { coreEventBus } from '../event/eventBus';

/** Public renderer-neutral chart API. Production adapters can map this contract to Lightweight Charts. */
export class TradingCoreChartApi {
  readonly navigation: ChartNavigationApi;
  readonly drawings: CoreDrawingApi;

  constructor(options: Readonly<{
    viewport: ChartViewportController;
    time: ChartTimeScale;
    price: ChartPriceScaleEngine;
    lengthProvider: () => number;
    drawingStore?: CoreDrawingStore;
    eventBus?: CoreEventBus;
  }>) {
    this.navigation = new ChartNavigationApi(options.viewport, options.time, options.price, options.lengthProvider);
    this.drawings = new CoreDrawingApi(options.drawingStore as any, options.eventBus ?? coreEventBus);
  }

  setTimeSpacing(pixels: number, anchorRatio = 0.5): void { this.navigation.setBarSpacing(pixels, anchorRatio); }
  timeSpacing(): number { return this.navigation.timeSpacing(); }
  setBarSpacing(pixels: number, anchorRatio = 0.5): void { this.setTimeSpacing(pixels, anchorRatio); }
  barSpacing(): number { return this.navigation.barSpacing(); }
  setHorizontalOffset(offsetBars: number): void { this.navigation.setHorizontalOffset(offsetBars); }
  horizontalOffset(): number { return this.navigation.horizontalOffset(); }
  setScrollOffset(offsetBars: number): void { this.setHorizontalOffset(offsetBars); }
  scrollOffset(): number { return this.horizontalOffset(); }
  setVisibleBarRange(range: { from: number; to: number }): void { this.navigation.setVisibleRange(range); }
  getVisibleBarRange(): { from: number; to: number } { return this.navigation.visibleRange(); }
  setVisibleRange(range: { from: number; to: number }): void { this.setVisibleBarRange(range); }
  getVisibleRange(): { from: number; to: number } { return this.getVisibleBarRange(); }
  timeToX(time: number): number { return this.navigation.timeToCoordinate(time); }
  xToTime(x: number): number { return this.navigation.coordinateToTime(x); }
  priceToY(price: number): number { return this.navigation.priceToCoordinate(price); }
  yToPrice(y: number): number { return this.navigation.coordinateToPrice(y); }
  timeToCoordinate(time: number): number { return this.timeToX(time); }
  coordinateToTime(x: number): number { return this.xToTime(x); }
  priceToCoordinate(price: number): number { return this.priceToY(price); }
  coordinateToPrice(y: number): number { return this.yToPrice(y); }
  setZoomEnabled(enabled: boolean): void { this.navigation.setZoomEnabled(enabled); }
  setPanEnabled(enabled: boolean): void { this.navigation.setPanEnabled(enabled); }
  setAutoScale(enabled: boolean): void { this.navigation.setAutoScale(enabled); }
  setPriceMode(mode: Parameters<ChartNavigationApi['setPriceMode']>[0]): void { this.navigation.setPriceMode(mode); }
  setVisiblePriceRange(range: { from: number; to: number }): void { this.navigation.setVisiblePriceRange(range); }
  resetTimeView(): void { this.navigation.resetTimeView(); }
}
