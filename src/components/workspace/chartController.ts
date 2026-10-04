import type { IChartApi, ISeriesApi, Time } from '../../services/core/chart/velaChartFacade';
import type { HistoricalCandle } from '../../services/brokers/BrokerAdapter';
import { candleSeriesOptions, type CandleAppearance, volumeColor } from '../../services/core/chart/candleAppearance';
import { type ChartDataPoint } from '../../services/core/chart/chartDataModel';
import { getCanonicalDataPlane, type CanonicalDataPlane, type CanonicalMarketView } from '../../services/core/data/canonicalDataPlane';
import { PRODUCTION_CHART_BACKEND } from '../../services/core/chart/chartBackendPolicy';

export type ChartRendererControllerBindings = {
  chart: IChartApi;
  candle: ISeriesApi<'Candlestick'>;
  closeLine: ISeriesApi<'Line'>;
  volume: ISeriesApi<'Histogram'>;
};

/**
 * Production chart adapter.
 *
 * Vela is the production renderer behind the TCO facade. Core data, compute, and
 * broker systems stay outside the renderer and continue to use the canonical data plane.
 */
export class ChartController {
  readonly backend = PRODUCTION_CHART_BACKEND;
  private bindings: ChartRendererControllerBindings | null = null;
  private dataPlane: CanonicalDataPlane | null = null;
  private lastHistory: HistoricalCandle[] | null = null;
  private lastHistoryFingerprint = '';

  private consumerId = '';

  attach(bindings: ChartRendererControllerBindings, timelineKey = 'workspace-chart', consumerId = `chart-controller:${timelineKey}`): void {
    const previousPlane = this.dataPlane;
    const previousConsumerId = this.consumerId;
    this.bindings = bindings;
    this.dataPlane = getCanonicalDataPlane(timelineKey);
    if (previousPlane && previousConsumerId && (previousPlane !== this.dataPlane || previousConsumerId !== consumerId)) {
      previousPlane.detachConsumer(previousConsumerId);
    }
    this.consumerId = consumerId;
    this.dataPlane.attachConsumer(consumerId, 'chart');
  }
  detach(): void { this.bindings = null; }

  applyRealtimeBar(bar: HistoricalCandle, appearance: CandleAppearance, syncCanonical = true): void {
    const b = this.bindings;
    if (!b) return;
    const time = Math.floor(Date.parse(String(bar.timestamp)) / 1000) as Time;
    if (!Number.isFinite(Number(time))) return;
    this.lastHistory = null;
    this.lastHistoryFingerprint = '';
    const p: ChartDataPoint = { time: Number(time), open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close), volume: Number(bar.volume) || 0 };
    const store = this.dataPlane?.market;
    const last = store?.length ? store.get(store.length - 1) : undefined;
    if (syncCanonical) {
      if (store && (!last || p.time > last.time)) store.append(p);
      else if (store && p.time === last?.time) store.updateLast(p);
    }
    b.candle.update({ time, open: Number(bar.open), high: Number(bar.high), low: Number(bar.low), close: Number(bar.close) });
    if (Number.isFinite(Number(bar.volume)) && Number(bar.volume) > 0) {
      b.volume.update({ time, value: Number(bar.volume), color: volumeColor(appearance, Number(bar.open), Number(bar.close)) } as any);
    }
  }

  /**
   * Canonical-first history projection. The TCO data plane stays columnar; only the
   * explicit Vela renderer boundary materializes its OHLCV records.
   */
  setHistoryFromCanonical(market: CanonicalMarketView, appearance: CandleAppearance): void {
    const b = this.bindings;
    if (!b || !market.length) return;
    const firstIndex = 0;
    const lastIndex = market.length - 1;
    const fingerprint = `${market.revision}|${market.length}|${market.time[firstIndex] ?? ''}|${market.time[lastIndex] ?? ''}|${market.open[lastIndex] ?? ''}|${market.high[lastIndex] ?? ''}|${market.low[lastIndex] ?? ''}|${market.close[lastIndex] ?? ''}|${market.volume[lastIndex] ?? ''}`;
    if (this.lastHistoryFingerprint === fingerprint) return;
    this.lastHistory = null;
    this.lastHistoryFingerprint = fingerprint;
    const candleRows = new Array<{ time: Time; open: number; high: number; low: number; close: number }>(market.length);
    const closeRows = new Array<{ time: Time; value: number }>(market.length);
    const volumeRows = new Array<{ time: Time; value: number; color: string }>(market.length);
    for (let i = 0; i < market.length; i += 1) {
      const time = (market.time[i]! * 1000) as Time;
      const open = market.open[i]!;
      const high = market.high[i]!;
      const low = market.low[i]!;
      const close = market.close[i]!;
      const volume = market.volume[i] || 0;
      candleRows[i] = { time, open, high, low, close };
      closeRows[i] = { time, value: close };
      volumeRows[i] = { time, value: volume, color: volumeColor(appearance, open, close) };
    }
    b.candle.setData(candleRows);
    b.closeLine.setData(closeRows as any);
    b.volume.setData(volumeRows as any);
  }

  /** Canonical forming-bar projection; only the final Vela update object is allocated. */
  applyRealtimeCanonical(market: CanonicalMarketView, appearance: CandleAppearance): void {
    const b = this.bindings;
    if (!b || !market.length) return;
    const i = market.length - 1;
    const time = (market.time[i]! * 1000) as Time;
    const open = market.open[i]!;
    const high = market.high[i]!;
    const low = market.low[i]!;
    const close = market.close[i]!;
    const volume = market.volume[i] || 0;
    this.lastHistory = null;
    this.lastHistoryFingerprint = '';
    b.candle.update({ time, open, high, low, close });
    if (Number.isFinite(volume) && volume > 0) b.volume.update({ time, value: volume, color: volumeColor(appearance, open, close) } as any);
  }

  setHistory(data: HistoricalCandle[], appearance: CandleAppearance, syncCanonical = true): void {
    const b = this.bindings;
    if (!b) return;
    const last = data[data.length - 1];
    const first = data[0];
    const fingerprint = `${data.length}|${first?.timestamp ?? ''}|${last?.timestamp ?? ''}|${last?.open ?? ''}|${last?.high ?? ''}|${last?.low ?? ''}|${last?.close ?? ''}|${last?.volume ?? ''}`;
    if (this.lastHistory === data && this.lastHistoryFingerprint === fingerprint) return;
    this.lastHistory = data;
    this.lastHistoryFingerprint = fingerprint;
    // Keep a renderer-neutral columnar copy so future GPU renderers can consume
    // the exact same data without another object graph conversion.
    const points: ChartDataPoint[] = data.map(x => ({
      time: Math.floor(Date.parse(x.timestamp) / 1000),
      open: Number(x.open),
      high: Number(x.high),
      low: Number(x.low),
      close: Number(x.close),
      volume: Number(x.volume) || 0,
    }));
    if (syncCanonical) this.dataPlane?.replace(points);
    const times = points;
    b.candle.setData(times.map(x => ({ time: x.time as Time, open: x.open, high: x.high, low: x.low, close: x.close })));
    b.closeLine.setData(times.map(x => ({ time: x.time as Time, value: x.close })) as any);
    b.volume.setData(times.map(x => ({ time: x.time as Time, value: x.volume, color: volumeColor(appearance, x.open, x.close) })) as any);
  }


  // Renderer-agnostic navigation facade. The production backend currently maps
  // these methods to Vela NativeRenderer; consumers should not import its API.
  timeSpacing(): number { return Number((this.bindings?.chart.timeScale() as any)?.barSpacing?.() ?? 0); }
  setTimeSpacing(pixels: number): void { try { (this.bindings?.chart.timeScale() as any)?.applyOptions?.({ barSpacing: Math.max(0.1, Number(pixels) || 0.1) }); } catch {} }
  horizontalOffset(): number { return Number((this.bindings?.chart.timeScale() as any)?.rightOffset?.() ?? 0); }
  setHorizontalOffset(offsetBars: number): void { try { (this.bindings?.chart.timeScale() as any)?.applyOptions?.({ rightOffset: Number(offsetBars) || 0 }); } catch {} }
  setVisibleTimeRange(range: { from: number; to: number }): void { try { (this.bindings?.chart.timeScale() as any)?.setVisibleRange?.(range); } catch {} }
  getVisibleTimeRange(): { from: number; to: number } | null { try { const range = (this.bindings?.chart.timeScale() as any)?.getVisibleRange?.(); return range ? { from: Number(range.from), to: Number(range.to) } : null; } catch { return null; } }
  timeToX(time: number): number | null { try { const value = (this.bindings?.chart.timeScale() as any)?.timeToCoordinate?.(time as any); return value == null ? null : Number(value); } catch { return null; } }
  xToTime(x: number): number | null { try { const value = (this.bindings?.chart.timeScale() as any)?.coordinateToTime?.(Number(x)); return value == null ? null : Number(value); } catch { return null; } }
  priceToY(price: number): number | null { try { const value = (this.bindings?.candle as any)?.priceToCoordinate?.(Number(price)); return value == null ? null : Number(value); } catch { return null; } }
  yToPrice(y: number): number | null { try { const value = (this.bindings?.candle as any)?.coordinateToPrice?.(Number(y)); return value == null ? null : Number(value); } catch { return null; } }
  setZoomEnabled(enabled: boolean): void { try { (this.bindings?.chart as any)?.applyOptions?.({ handleScroll: { mouseWheel: enabled, pressedMouseMove: true }, handleScale: { mouseWheel: enabled, pinch: enabled } }); } catch {} }
  setPanEnabled(enabled: boolean): void { try { (this.bindings?.chart as any)?.applyOptions?.({ handleScroll: { mouseWheel: true, pressedMouseMove: enabled }, handleScale: { mouseWheel: true, pinch: true } }); } catch {} }

  setChartType(type: 'candlestick' | 'line'): void {
    const b = this.bindings;
    if (!b) return;
    try { b.closeLine.applyOptions({ visible: type === 'line' }); } catch {}
  }

  setCandleAppearance(appearance: CandleAppearance): void {
    const b = this.bindings;
    if (!b) return;
    try { b.candle.applyOptions(candleSeriesOptions(appearance) as any); } catch {}
  }

  setVolumeVisible(visible: boolean): void {
    try { this.bindings?.volume.applyOptions({ visible }); } catch {}
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    try { this.bindings?.chart.resize(Math.floor(width), Math.floor(height)); } catch {}
  }

  chart(): IChartApi | undefined { return this.bindings?.chart; }
  canonicalDataPlane(): CanonicalDataPlane | undefined { return this.dataPlane ?? undefined; }

  dispose(): void {
    this.lastHistory = null;
    this.lastHistoryFingerprint = '';
    if (this.consumerId) this.dataPlane?.detachConsumer(this.consumerId);
    this.dataPlane = null;
    this.consumerId = '';
    const chart = this.bindings?.chart;
    this.bindings = null;
    try { chart?.remove(); } catch {}
  }
}
