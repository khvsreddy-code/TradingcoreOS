import { IChartApi, ISeriesApi, VelaNativeSeriesKernel, LineSeries, Time, createSeriesMarkers } from '../core/chart/velaNativeChartKernel';
import { CoreSpiritOutputFrame } from './outputDispatcher';
import { CoreSpiritObject } from './types';
import { CORE_SPIRIT_VELA_OUTPUT_LAYER_ID, type CoreSpiritVelaOutputLayerData } from '../core/chart/coreSpiritVelaOutputLayer';
import { CoreSpiritVelaOutputRevisionGate, type CoreSpiritVelaOutputRevision } from './velaOutputAdapter';

/**
 * Thin CoreSpirit → Vela adapter.
 *
 * CoreSpirit owns compilation, evaluation, state and output truth. This controller
 * maps output snapshots into Vela-native series/markers and publishes rich visual
 * data through Vela's registered renderer layer. It creates no canvas, owns no
 * coordinate transforms, and never invokes compilation or evaluation from a frame.
 */
let coreSpiritOutputControllerSerial = 0;

export class CoreSpiritChartOutputController {
  private plotSeries = new Map<string, ISeriesApi<'Line'>>();
  private lineSeries = new Map<string, ISeriesApi<'Line'>>();
  private markerPlugin: any = null;
  private candle?: ISeriesApi<'Candlestick'>;
  private lastFrame?: CoreSpiritOutputFrame;
  private committedObjects: readonly CoreSpiritObject[] = [];
  private disposed = false;
  private readonly outputRevisionGate = new CoreSpiritVelaOutputRevisionGate();
  private readonly overlayChannel = `tco-corespirit-output:${++coreSpiritOutputControllerSerial}`;
  private overlayHandle: { readonly id: string };
  private renderRevision = 0;

  constructor(private readonly chart: IChartApi, candle?: ISeriesApi<'Candlestick'>, _host?: HTMLElement) {
    this.candle = candle;
    this.overlayHandle = this.chart.renderer.mountIndicator({
      id: this.overlayChannel,
      title: 'CoreSpirit outputs',
      overlay: true,
      paneHint: 'price',
      paneId: 'price',
      native: { type: CORE_SPIRIT_VELA_OUTPUT_LAYER_ID, channel: this.overlayChannel },
      legend: false,
      series: [],
      fills: [],
      backgrounds: [],
      priceLines: [],
      inputs: [],
      inputValues: {},
    });
  }

  setCandleSeries(candle: ISeriesApi<'Candlestick'>) { this.candle = candle; }
  /** Retained for call-site compatibility. Overlay ownership now belongs to Vela. */
  setHost(host: HTMLElement) { void host; }

  reset(): void {
    for (const series of this.plotSeries.values()) this.remove(series);
    for (const series of this.lineSeries.values()) this.remove(series);
    this.plotSeries.clear();
    this.lineSeries.clear();
    try { this.markerPlugin?.setMarkers?.([]); this.markerPlugin?.detach?.(); } catch {}
    this.markerPlugin = null;
    this.lastFrame = undefined;
    this.committedObjects = [];
    this.chart.renderer.setNativeData(this.overlayChannel, undefined);
  }

  applyFrame(frame: CoreSpiritOutputFrame): void {
    const previousFrame = this.lastFrame;
    this.lastFrame = frame;
    const seenPlots = new Set<string>();
    for (const [id, points] of frame.plots) {
      seenPlots.add(id);
      let series = this.plotSeries.get(id);
      const style = frame.plotStyles.get(id) || {};
      if (!series) {
        series = this.chart.addSeries(LineSeries, {
          lineWidth: Math.max(1, Math.min(5, Number(style.lineWidth || 2))) as any,
          lineStyle: Number(style.lineStyle || 0) as any,
          color: style.color || '#38bdf8',
          priceLineVisible: style.priceLineVisible ?? false,
          lastValueVisible: style.lastValueVisible ?? true,
          title: style.title || id.split(':plot:').pop() || 'CoreSpirit',
        });
        this.plotSeries.set(id, series);
      } else {
        try { (series as any).applyOptions({ color: style.color || '#38bdf8', lineWidth: Number(style.lineWidth || 2), lineStyle: Number(style.lineStyle || 0), priceLineVisible: style.priceLineVisible ?? false, lastValueVisible: style.lastValueVisible ?? true, title: style.title || undefined }); } catch {}
      }
      this.applyPlotPoints(series, points);

    }
    for (const [id, series] of this.plotSeries) if (!seenPlots.has(id)) { this.remove(series); this.plotSeries.delete(id); }

    const markers = frame.signals.filter((x: any) => Number.isFinite(x.time)).map((x: any) => ({
      time: x.time as Time,
      position: x.metadata?.position === 'below' ? 'belowBar' as const : 'aboveBar' as const,
      color: x.metadata?.color || '#f59e0b',
      shape: x.metadata?.shape === 'arrowUp' ? 'arrowUp' as const : 'arrowDown' as const,
      text: String(x.type || 'SIGNAL')
    }));
    try {
      if (!this.markerPlugin && this.candle) this.markerPlugin = createSeriesMarkers(this.candle, []);
      this.markerPlugin?.setMarkers?.(markers as any);
    } catch (error) { console.warn('[CoreSpirit] marker render skipped', error); }

    const seenLines = new Set<string>();
    for (const drawing of frame.drawings as any[]) {
      if (drawing.kind !== 'line') continue;
      const id = drawing.id || `${drawing.kind}:${JSON.stringify(drawing)}`;
      seenLines.add(id);
      let series = this.lineSeries.get(id);
      if (!series) {
        series = this.chart.addSeries(LineSeries, {
          lineWidth: Math.max(1, Math.min(6, Number(drawing.style?.lineWidth || 1))) as any,
          priceLineVisible: false,
          lastValueVisible: false,
          color: drawing.style?.color || '#f59e0b',
          lineStyle: Number(drawing.style?.lineStyle || 0) as any,
        });
        this.lineSeries.set(id, series);
      }
      const nextLine = [{ time: drawing.start.time as Time, value: drawing.start.price }, { time: drawing.end.time as Time, value: drawing.end.price }] as any[];
      const previousDrawing = (previousFrame?.drawings as any[] | undefined)?.find((candidate) => candidate.id === id);
      const previousLine = previousDrawing ? [{ time: previousDrawing.start.time as Time, value: previousDrawing.start.price }, { time: previousDrawing.end.time as Time, value: previousDrawing.end.price }] : [];
      this.patchSeriesValues(series, previousLine, nextLine);

    }
    for (const [id, series] of this.lineSeries) if (!seenLines.has(id)) { this.remove(series); this.lineSeries.delete(id); }

    this.publishVelaOutputLayer(frame);
  }

  /**
   * Keep the realtime chart path incremental. Initial history is materialized once;
   * subsequent frames append/replace only the changed tail. Full replacement remains
   * the correctness fallback for genuine historical rewrites.
   */
  private applyPlotPoints(series: ISeriesApi<'Line'>, points: readonly { time: number; value: number | null }[]): void {
    if (!points.length) return;
    const valid = (point: { time: number; value: number | null }): boolean =>
      Number.isFinite(point.time) && (point.value == null || Number.isFinite(point.value));

    const current = series instanceof VelaNativeSeriesKernel ? series.snapshotPoints() : [];
    if (!current.length) {
      const initial = points.filter(valid).map((p) =>
        p.value == null
          ? ({ time: p.time as Time } as any)
          : ({ time: p.time as Time, value: p.value } as any),
      );
      if (initial.length) series.setData(initial as any);
      return;
    }

    const last = points[points.length - 1]!;
    const currentLast = current[current.length - 1]!;
    if (!valid(last)) return;

    if (points.length === current.length && last.time === currentLast.time) {
      series.update(last.value == null ? ({ time: last.time as Time } as any) : ({ time: last.time as Time, value: last.value } as any));
      return;
    }

    if (points.length > current.length && points[current.length - 1]?.time === currentLast.time) {
      for (let i = current.length; i < points.length; i += 1) {
        const point = points[i]!;
        if (!valid(point)) continue;
        series.update(point.value == null ? ({ time: point.time as Time } as any) : ({ time: point.time as Time, value: point.value } as any));
      }
      return;
    }

    const replacement = points.filter(valid).map((p) =>
      p.value == null
        ? ({ time: p.time as Time } as any)
        : ({ time: p.time as Time, value: p.value } as any),
    );
    series.setData(replacement as any);
  }

  private publishVelaOutputLayer(frame: CoreSpiritOutputFrame): void {
    const drawings = (frame.drawings || []).filter(item => item.kind !== 'line');
    const data: CoreSpiritVelaOutputLayerData = Object.freeze({
      revision: ++this.renderRevision,
      drawings: Object.freeze([...drawings]),
      visuals: Object.freeze([...(frame.visuals || [])]),
      labels: Object.freeze([...(frame.labels || [])]),
      tables: Object.freeze([...(frame.tables || [])]),
    });
    // Vela stores this immutable output snapshot and repaints it from its own
    // frame scheduler, using Vela's shared coordinate system and layer canvas.
    this.chart.renderer.setNativeData(this.overlayChannel, data);
  }

  scheduleObjects(
    objects: readonly CoreSpiritObject[],
    revision: CoreSpiritVelaOutputRevision,
  ): Promise<boolean> {
    if (this.disposed || !this.outputRevisionGate.accept(revision)) return Promise.resolve(false);
    const previousObjects = [...this.committedObjects];
    try {
      // One synchronous state commit. NativeRenderer owns frame timing, so a
      // second requestAnimationFrame here would only add avoidable latency.
      // applyFrame diffs against the current retained series and replaces the
      // layer's immutable payload. Avoid tearing down native series on every run.
      this.applyObjects([...objects]);
      return Promise.resolve(true);
    } catch (error) {
      try {
        if (!this.disposed) this.applyObjects(previousObjects as CoreSpiritObject[]);
      } catch (restoreError) {
        return Promise.reject(new AggregateError([error, restoreError], 'Vela output commit and rollback both failed'));
      }
      return Promise.reject(error);
    }
  }

  applyObjects(objects: CoreSpiritObject[]): void {
    const frame: CoreSpiritOutputFrame = { plots: new Map(), plotStyles: new Map(), drawingCount: 0, signals: [], drawings: [], visuals: [], labels: [], tables: [] };
    const groups = new Map<string, Array<{ time: number; value: number | null }>>();
    for (const o of objects) {
      if (o.kind === 'series') { const id = o.seriesId || o.name || 'coreSpirit:plot:0'; const arr = groups.get(id) || []; arr.push({ time: o.time, value: o.value }); groups.set(id, arr); if (o.style) frame.plotStyles.set(id, o.style); }
      else if (o.kind === 'signal') frame.signals.push(o);
      else if (o.kind === 'label') frame.labels.push(o);
      else if (o.kind === 'line' || o.kind === 'zone' || o.kind === 'polyline' || o.kind === 'hline' || o.kind === 'polygon') frame.drawings.push(o);
      else if (o.kind === 'table') frame.tables.push(o);
      else if (o.kind === 'footprint') frame.visuals.push(o);
      else if (o.kind === 'box' || o.kind === 'band' || o.kind === 'arrow' || o.kind === 'shape' || o.kind === 'background' || o.kind === 'barcolor' || o.kind === 'customVisual') frame.visuals.push(o);
    }
    frame.plots = groups;
    this.applyFrame(frame);
    this.committedObjects = Object.freeze([...objects]);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.outputRevisionGate.clear();
    this.reset();
    try { this.chart.renderer.removeIndicator(this.overlayHandle); } catch {}
  }

  private patchSeriesValues(
    series: ISeriesApi<'Line'>,
    previous: readonly { time:number; value?:number|null }[],
    current: readonly { time:number; value?:number|null }[],
  ): void {
    const patchable = series as ISeriesApi<'Line'> & {
      patch?: (patch: {
        type:'append'|'replaceLast'|'replaceRange'|'removeRange';
        from?:number;
        to?:number;
        values?: readonly { time:number; value?:number|null }[];
      }) => void;
    };
    if (!previous.length) {
      series.setData(current as any);
      return;
    }
    if (previous.length === current.length && previous.every((point,index) => point.time === current[index]?.time && point.value === current[index]?.value)) return;

    let prefix = 0;
    while (prefix < previous.length && prefix < current.length &&
      previous[prefix]?.time === current[prefix]?.time && previous[prefix]?.value === current[prefix]?.value) prefix += 1;

    let suffix = 0;
    while (
      suffix < previous.length - prefix &&
      suffix < current.length - prefix &&
      previous[previous.length - 1 - suffix]?.time === current[current.length - 1 - suffix]?.time &&
      previous[previous.length - 1 - suffix]?.value === current[current.length - 1 - suffix]?.value
    ) suffix += 1;

    const previousEnd = previous.length - suffix - 1;
    const currentEnd = current.length - suffix - 1;

    // The dominant live-chart case is a forming-bar mutation: same cardinality,
    // same historical prefix, only the last point changed. Keep this on the
    // O(1) replace-last path instead of sending a range patch or rebuilding the series.
    if (previous.length === current.length && current.length > 0 && prefix === current.length - 1 && suffix === 0) {
      patchable.patch?.({type:'replaceLast', values:current.slice(-1)});
      if (!patchable.patch) series.setData(current as any);
      return;
    }
    if (prefix === previous.length && current.length > previous.length) {
      patchable.patch?.({type:'append', values:current.slice(previous.length)});
      if (!patchable.patch) series.setData(current as any);
      return;
    }
    if (prefix === current.length && previous.length > current.length) {
      patchable.patch?.({type:'removeRange', from:prefix, to:previous.length - 1});
      if (!patchable.patch) series.setData(current as any);
      return;
    }

    if (prefix === current.length - suffix && previousEnd === prefix - 1) {
      patchable.patch?.({type:'append', values:current.slice(prefix, currentEnd + 1)});
      if (!patchable.patch) series.setData(current as any);
      return;
    }

    if (prefix === previous.length - suffix && currentEnd === prefix - 1) {
      patchable.patch?.({type:'removeRange', from:prefix, to:previousEnd});
      if (!patchable.patch) series.setData(current as any);
      return;
    }

    if (previousEnd >= prefix) {
      patchable.patch?.({
        type:'replaceRange',
        from:prefix,
        to:previousEnd,
        values:current.slice(prefix, currentEnd + 1),
      });
    } else {
      patchable.patch?.({
        type:'append',
        values:current.slice(prefix, currentEnd + 1),
      });
    }
    if (!patchable.patch) series.setData(current as any);
  }

  private remove(series:any){try{this.chart.removeSeries(series);}catch{}}
}
