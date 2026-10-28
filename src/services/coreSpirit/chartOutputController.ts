import { IChartApi, ISeriesApi, VelaNativeSeriesKernel, LineSeries, Time, createSeriesMarkers } from '../core/chart/velaNativeChartKernel';
import { CoreSpiritOutputFrame } from './outputDispatcher';
import { CoreSpiritObject } from './types';
import { CORE_SPIRIT_VELA_OUTPUT_LAYER_ID, CORE_SPIRIT_VELA_OUTPUT_UNDERLAY_LAYER_ID, type CoreSpiritVelaOutputLayerData } from '../core/chart/coreSpiritVelaOutputLayer';
import type { CoreSpiritVelaOutputRevision } from './velaOutputAdapter';
import {
  CoreSpiritVisualAbiStore,
  createCoreSpiritVisualSnapshot,
  createCoreSpiritVisualPatch,
  isCoreSpiritCustomLayerObject,
  isCoreSpiritChartTargetObject,
  isCoreSpiritVisualVisibleObject,
  coreSpiritPaneIdOf,
  normalizeCoreSpiritVisualObjects,
  projectCoreSpiritObjectsToVela,
  type CoreSpiritVelaDrawingCollections,
} from '../core/chart/coreSpiritVisualAbi';
import type { CollectionPatchName, CollectionValueDelta } from '../../../vendor/vela/src/core/model/patch';

/**
 * Thin CoreSpirit → Vela adapter.
 *
 * CoreSpirit owns compilation, evaluation, state and output truth. This controller
 * maps output snapshots into Vela-native series/markers and publishes rich visual
 * data through Vela's registered renderer layer. It creates no canvas, owns no
 * coordinate transforms, and never invokes compilation or evaluation from a frame.
 */
let coreSpiritOutputControllerSerial = 0;

function stableVisualSignature(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableVisualSignature).join(',')}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object).sort().map(key => `${JSON.stringify(key)}:${stableVisualSignature(object[key])}`).join(',')}}`;
}

function visualCollectionDelta(
  collection: CollectionPatchName,
  previous: readonly unknown[],
  current: readonly unknown[],
): CollectionValueDelta | undefined {
  const signature = (value: unknown) => stableVisualSignature(value);
  const same = (left: unknown, right: unknown) => signature(left) === signature(right);
  if (previous.length === current.length && previous.every((value, index) => same(value, current[index]))) return undefined;

  let prefix = 0;
  while (prefix < previous.length && prefix < current.length && same(previous[prefix], current[prefix])) prefix += 1;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < current.length - prefix &&
         same(previous[previous.length - 1 - suffix], current[current.length - 1 - suffix])) suffix += 1;

  const remove = previous.length - prefix - suffix;
  const values = current.slice(prefix, current.length - suffix);
  return { collection, values: [...values], op: 'replace-range', start: prefix, remove };
}

export class CoreSpiritChartOutputController {
  private plotSeries = new Map<string, ISeriesApi<'Line'>>();
  private markerPlugin: any = null;
  private candle?: ISeriesApi<'Candlestick'>;
  private lastFrame?: CoreSpiritOutputFrame;
  private committedObjects: readonly CoreSpiritObject[] = [];
  private disposed = false;
  private readonly visualAbiStore = new CoreSpiritVisualAbiStore();
  private latestStreamId?: string;
  private latestDatasetRevision = 0;
  private latestOutputRevision = 0;
  private committedRevision?: CoreSpiritVelaOutputRevision;
  private readonly overlayChannel = `tco-corespirit-output:${++coreSpiritOutputControllerSerial}`;
  private overlayHandle: { readonly id: string };
  private readonly paneLayerHandles = new Map<string, { paneId: string; role: 'underlay' | 'overlay'; channel: string; handle: { readonly id: string } }>();
  private renderRevision = 0;
  private nativeDrawingCollections?: CoreSpiritVelaDrawingCollections;

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
    this.paneLayerHandles.set(this.paneLayerKey('price', 'overlay'), { paneId: 'price', role: 'overlay', channel: this.overlayChannel, handle: this.overlayHandle });
  }

  private paneLayerKey(paneId: string, role: 'underlay' | 'overlay'): string {
    return `${paneId}\u0000${role}`;
  }

  private ensurePaneLayerHandle(paneId: string, role: 'underlay' | 'overlay'): { channel: string; handle: { readonly id: string } } {
    const pane = paneId.trim() || 'price';
    const key = this.paneLayerKey(pane, role);
    const existing = this.paneLayerHandles.get(key);
    if (existing) return existing;
    const channel = role === 'overlay' && pane === 'price'
      ? this.overlayChannel
      : `${this.overlayChannel}:pane:${encodeURIComponent(pane)}:${role}`;
    const layerId = role === 'underlay' ? CORE_SPIRIT_VELA_OUTPUT_UNDERLAY_LAYER_ID : CORE_SPIRIT_VELA_OUTPUT_LAYER_ID;
    const handle = this.chart.renderer.mountIndicator({
      id: channel,
      title: `CoreSpirit ${role} · ${pane}`,
      overlay: pane === 'price',
      paneHint: pane === 'price' ? 'price' : 'new',
      paneId: pane,
      native: { type: layerId, channel },
      legend: false,
      series: [],
      fills: [],
      backgrounds: [],
      priceLines: [],
      inputs: [],
      inputValues: {},
    });
    const entry = { paneId: pane, role, channel, handle };
    this.paneLayerHandles.set(key, entry);
    return entry;
  }

  setCandleSeries(candle: ISeriesApi<'Candlestick'>) { this.candle = candle; }
  /** Retained for call-site compatibility. Overlay ownership now belongs to Vela. */
  setHost(host: HTMLElement) { void host; }

  reset(): void {
    for (const series of this.plotSeries.values()) this.remove(series);
    this.plotSeries.clear();
    try { this.markerPlugin?.setMarkers?.([]); this.markerPlugin?.detach?.(); } catch {}
    this.markerPlugin = null;
    this.lastFrame = undefined;
    this.committedObjects = [];
    this.visualAbiStore.clearObjects(this.latestStreamId);
    this.clearNativeDrawingCollections();
    for (const { channel } of this.paneLayerHandles.values()) this.chart.renderer.setNativeData(channel, undefined);
  }

  applyFrame(frame: CoreSpiritOutputFrame, revision?: CoreSpiritVelaOutputRevision): void {
    this.lastFrame = frame;
    const activeRevision: CoreSpiritVelaOutputRevision = revision ?? this.committedRevision ?? {
      streamId: this.overlayChannel,
      datasetRevision: 0,
      outputRevision: 0,
    };
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

    // Standard lines/boxes/labels are committed through Vela's retained drawing
    // collections below; the SDK renderer owns their transforms, clipping and style.
    this.publishNativeDrawingCollections(frame, activeRevision, revision !== undefined);
    this.publishVelaOutputLayer(frame, activeRevision);
  }

  /**
   * Keep the realtime chart path incremental. Initial history is materialized once;
   * subsequent frames append/replace only the changed tail. Full replacement remains
   * the correctness fallback for genuine historical rewrites.
   */
  private applyPlotPoints(series: ISeriesApi<'Line'>, points: readonly { time: number; value: number | null }[]): void {
    const valid = (point: { time: number; value: number | null }): boolean =>
      Number.isFinite(point.time) && (point.value == null || Number.isFinite(point.value));

    const current = series instanceof VelaNativeSeriesKernel ? series.snapshotPoints() : [];
    // An empty series is a real output state (e.g. a lookback has not warmed up
    // after a symbol/timeframe change). Leaving the previous data in place makes
    // an indicator look valid while its current computation emitted no points.
    if (!points.length) {
      if (current.length) series.setData([]);
      return;
    }
    if (!current.length) {
      const initial = points.filter(valid).map((p) =>
        p.value == null
          ? ({ time: p.time as Time } as any)
          : ({ time: p.time as Time, value: p.value } as any),
      );
      // Commit even an empty filtered result so malformed/NaN-only snapshots
      // cannot leave stale chart pixels behind.
      series.setData(initial as any);
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
    // Full replacement is also the recovery path for a snapshot whose points
    // all became invalid; an empty result must clear, not preserve, old data.
    series.setData(replacement as any);
  }

  private publishNativeDrawingCollections(
    frame: CoreSpiritOutputFrame,
    revision: CoreSpiritVelaOutputRevision,
    revisioned = true,
  ): void {
    const objects = [
      ...(frame.drawings || []),
      ...(frame.visuals || []),
      ...(frame.labels || []),
      ...(frame.tables || []),
    ].filter(isCoreSpiritChartTargetObject).filter(isCoreSpiritVisualVisibleObject);
    const projected = projectCoreSpiritObjectsToVela(objects, 'price');
    // Replacing the Vela collection arrays is a full collection snapshot. Vela's
    // own scene patch path now manages object lifetime and redraw invalidation.
    const dirtyObjects = revisioned ? [...this.committedObjects, ...objects] : objects;
    const hasViewportGeometry = dirtyObjects.some(object => object.kind === 'zone' && object.domain === 'viewport');
    const timestamps = dirtyObjects.flatMap(object => {
      const item = object as unknown as Record<string, any>;
      const values: unknown[] = [];
      if (item.time != null) values.push(item.time);
      if (item.start?.time != null) values.push(item.start.time);
      if (item.end?.time != null) values.push(item.end.time);
      if (item.left != null && item.domain !== 'viewport') values.push(item.left);
      if (item.right != null && item.domain !== 'viewport') values.push(item.right);
      for (const point of Array.isArray(item.points) ? item.points : []) if (point?.time != null) values.push(point.time);
      return values.map(Number).filter(Number.isFinite);
    });
    const from = hasViewportGeometry ? 0 : timestamps.length ? Math.min(...timestamps) : 0;
    const to = hasViewportGeometry ? Number.MAX_SAFE_INTEGER : timestamps.length ? Math.max(...timestamps) + 1 : 0;
    const previous = this.nativeDrawingCollections;
    const deltas: CollectionValueDelta[] = [];
    if (revisioned && previous) {
      const collectionNames: CollectionPatchName[] = ['lines', 'boxes', 'labels', 'polylines', 'backgrounds', 'priceLines', 'tables'];
      for (const collection of collectionNames) {
        const delta = visualCollectionDelta(collection, previous[collection], projected[collection]);
        if (delta) deltas.push(delta);
      }
    }
    this.chart.renderer.updateIndicator(this.overlayHandle, {
      kind: 'value',
      indicatorId: this.overlayHandle.id,
      ...(revisioned ? { revision: {
        streamId: revision.streamId,
        datasetRevision: revision.datasetRevision,
        outputRevision: revision.outputRevision,
      } } : {}),
      dirty: { from, to },
      series: [],
      ...(revisioned && previous
        ? { collections: deltas }
        : {
            lines: projected.lines,
            boxes: projected.boxes,
            labels: projected.labels,
            polylines: projected.polylines,
            backgrounds: projected.backgrounds,
            priceLines: projected.priceLines,
            tables: projected.tables,
          }),
      barColors: projected.barColors,
    });
    this.nativeDrawingCollections = projected;
  }

  private publishVelaOutputLayer(frame: CoreSpiritOutputFrame, revision: CoreSpiritVelaOutputRevision): void {
    const objects = [
      ...(frame.drawings || []),
      ...(frame.visuals || []),
      ...(frame.labels || []),
      ...(frame.tables || []),
    ].filter(isCoreSpiritChartTargetObject).filter(isCoreSpiritVisualVisibleObject).filter(isCoreSpiritCustomLayerObject);
    const grouped = new Map<string, { paneId: string; role: 'underlay' | 'overlay'; objects: CoreSpiritObject[] }>();
    for (const object of objects) {
      const paneId = coreSpiritPaneIdOf(object, 'price');
      const role: 'underlay' | 'overlay' =
        object.kind === 'band' ||
        object.kind === 'background' ||
        (object.kind === 'zone' && object.domain === 'viewport')
          ? 'underlay'
          : 'overlay';
      const key = this.paneLayerKey(paneId, role);
      const group = grouped.get(key) ?? { paneId, role, objects: [] };
      group.objects.push(object);
      grouped.set(key, group);
    }

    for (const [key, group] of grouped) {
      const { channel } = this.ensurePaneLayerHandle(group.paneId, group.role);
      const drawings = group.objects.filter(item => item.kind === 'zone') as CoreSpiritObject[];
      const visuals = group.objects.filter(item => item.kind !== 'zone') as CoreSpiritObject[];
      const data: CoreSpiritVelaOutputLayerData = Object.freeze({
        revision: ++this.renderRevision,
        schemaVersion: 1,
        scriptInstanceId: this.overlayChannel,
        datasetRevision: revision.datasetRevision,
        outputRevision: revision.outputRevision,
        coordinateSystem: 'vela-epoch-milliseconds-price+tagged-visual-space',
        paneId: group.paneId,
        layerRole: group.role,
        visible: true,
        drawings: Object.freeze(drawings),
        visuals: Object.freeze(visuals),
        labels: Object.freeze([]),
        tables: Object.freeze([]),
      });
      this.chart.renderer.setNativeData(channel, data);
    }

    // Missing groups mean deletion, not an instruction to retain prior pixels.
    // Keep handles/revision identity allocated but clear inactive pane/layer data.
    for (const [key, { channel }] of this.paneLayerHandles) {
      if (!grouped.has(key)) this.chart.renderer.setNativeData(channel, undefined);
    }
  }

  private clearNativeDrawingCollections(): void {
    this.nativeDrawingCollections = undefined;
    this.chart.renderer.updateIndicator(this.overlayHandle, {
      kind: 'value',
      indicatorId: this.overlayHandle.id,
      dirty: { from: 0, to: 0 },
      series: [],
      lines: [], boxes: [], labels: [], polylines: [], linefills: [],
      backgrounds: [], priceLines: [], tables: [], barColors: [],
    });
  }

  scheduleObjects(
    objects: readonly CoreSpiritObject[],
    revision: CoreSpiritVelaOutputRevision,
  ): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const mutation = createCoreSpiritVisualSnapshot(objects, revision, this.overlayChannel);
    const prepared = this.visualAbiStore.prepare(mutation);
    if (!prepared) return Promise.resolve(false);
    const previousObjects = [...this.committedObjects];
    try {
      this.applyObjects([...prepared.objects], revision, true);
      this.visualAbiStore.commit(prepared);
      this.commitOutputRevision(revision);
      return Promise.resolve(true);
    } catch (error) {
      try {
        if (!this.disposed) this.applyObjects(previousObjects as CoreSpiritObject[], undefined, true, true);
      } catch (restoreError) {
        return Promise.reject(new AggregateError([error, restoreError], 'Vela output commit and rollback both failed'));
      }
      return Promise.reject(error);
    }
  }

  /** Incremental scene mutation. Replaying a patch is idempotent by revision and stable object id. */
  schedulePatch(
    upsert: readonly CoreSpiritObject[],
    removeIds: readonly string[],
    revision: CoreSpiritVelaOutputRevision,
  ): Promise<boolean> {
    if (this.disposed) return Promise.resolve(false);
    const mutation = createCoreSpiritVisualPatch(upsert, removeIds, revision, this.overlayChannel);
    const prepared = this.visualAbiStore.prepare(mutation);
    if (!prepared) return Promise.resolve(false);
    const previousObjects = [...this.committedObjects];
    try {
      this.applyObjects([...prepared.objects], revision, true);
      this.visualAbiStore.commit(prepared);
      this.commitOutputRevision(revision);
      return Promise.resolve(true);
    } catch (error) {
      try {
        if (!this.disposed) this.applyObjects(previousObjects as CoreSpiritObject[], undefined, true, true);
      } catch (restoreError) {
        return Promise.reject(new AggregateError([error, restoreError], 'Vela output patch and rollback both failed'));
      }
      return Promise.reject(error);
    }
  }

  applyObjects(objects: CoreSpiritObject[], revision?: CoreSpiritVelaOutputRevision, alreadyNormalized = false, rollback = false): void {
    const activeRevision: CoreSpiritVelaOutputRevision = revision ?? (rollback
      ? this.committedRevision ?? { streamId:this.overlayChannel, datasetRevision:0, outputRevision:0 }
      : {
          streamId:this.latestStreamId ?? this.overlayChannel,
          datasetRevision:this.latestDatasetRevision,
          outputRevision:this.latestOutputRevision + 1,
        });
    const normalized = alreadyNormalized
      ? [...objects]
      : normalizeCoreSpiritVisualObjects(objects, this.overlayChannel, activeRevision);

    if (!alreadyNormalized) {
      this.applyObjects(normalized, activeRevision, true, rollback);
      if (!revision && !rollback) this.commitOutputRevision(activeRevision);
      return;
    }

    const frame: CoreSpiritOutputFrame = {
      plots:new Map(), plotStyles:new Map(), drawingCount:0,
      signals:[], drawings:[], visuals:[], labels:[], tables:[],
    };
    for (const object of normalized) {
      // Program UI visuals (panel/side-panel/floating) are not chart objects.
      // They remain in the ABI snapshot but must never be projected over candles.
      if (!isCoreSpiritChartTargetObject(object) || !isCoreSpiritVisualVisibleObject(object)) continue;
      if (object.kind === 'series') {
        const id = object.seriesId || object.name || 'coreSpirit:plot:0';
        const points = frame.plots.get(id) || [];
        points.push({ time:object.time, value:object.value });
        frame.plots.set(id, points);
        if (object.style) frame.plotStyles.set(id, object.style);
      } else if (object.kind === 'signal') frame.signals.push(object);
      else if (object.kind === 'label') frame.labels.push(object);
      else if (object.kind === 'table') frame.tables.push(object);
      else if (object.kind === 'footprint' || object.kind === 'band' || object.kind === 'background' ||
               object.kind === 'barcolor' || object.kind === 'shape' || object.kind === 'customVisual') frame.visuals.push(object);
      else if (object.kind === 'line' || object.kind === 'zone' || object.kind === 'box' ||
               object.kind === 'arrow' || object.kind === 'hline' || object.kind === 'polyline' ||
               object.kind === 'polygon' || object.kind === 'marker') frame.drawings.push(object);
    }
    frame.drawingCount = frame.drawings.length + frame.visuals.length + frame.labels.length + frame.tables.length;
    this.applyFrame(frame, rollback ? undefined : activeRevision);
    this.committedObjects = Object.freeze([...normalized]);
    if (!revision && !rollback) this.commitOutputRevision(activeRevision);
  }

  private commitOutputRevision(revision: CoreSpiritVelaOutputRevision): void {
    this.committedRevision = revision;
    this.latestStreamId = revision.streamId;
    this.latestDatasetRevision = revision.datasetRevision;
    this.latestOutputRevision = revision.outputRevision;
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.visualAbiStore.clear();
    this.reset();
    for (const { handle } of this.paneLayerHandles.values()) {
      try { this.chart.renderer.removeIndicator(handle); } catch {}
    }
    this.paneLayerHandles.clear();
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
