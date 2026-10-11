type TcoSeriesPoint = { time:number; value:number|null; color?:string };
type TcoMarkerPoint = { time:number; position:'aboveBar'|'belowBar'|'inBar'; shape:string; color:string; text?:string; size?:'tiny'|'small'|'normal'|'large'|'huge'; textSize?:number; offset?:number };
type TcoPriceLine = { id:string; paneId:string; price:number; color?:string; lineStyle?:'solid'|'dashed'|'dotted'; width?:number; title?:string };
type TcoDrawingLine = { id:string; paneId:string; xloc:'bar_time'; x1:number; y1:number; x2:number; y2:number; extend:'none'; color?:string; invisible:boolean; width:number; style:'solid'|'dashed'|'dotted'; arrowLeft:boolean; arrowRight:boolean; overlay?:boolean };
type TcoDrawingLabel = { id:string; paneId:string; xloc:'bar_time'; x:number; y:number; yloc:'price'|'abovebar'|'belowbar'; text?:string; style:string; color?:string; textColor?:string; size:'small'; textAlign:'left'|'center'|'right'; fontFamily?:'default'|'monospace'; bold?:boolean; italic?:boolean; overlay?:boolean };
type TcoDrawingPolyline = { id:string; paneId:string; points:Array<{xloc:'bar_time';x:number;price:number}>; curved:boolean; closed:boolean; lineColor?:string; fillColor?:string; lineWidth:number; lineStyle:'solid'|'dashed'|'dotted'; arrowLeft:boolean; arrowRight:boolean; overlay?:boolean };
type TcoBackground = { id:string; paneId:string; from:number; to:number; color:string; overlay?:boolean };
type TcoRectInstance = { id:string; xloc:'bar_time'; left:number; right:number; top:number; bottom:number; fill:string };
type TcoRectBatch = { id:string; paneId:string; overlay?:boolean; indexOffset?:number; instances:TcoRectInstance[] };
type ScenePatch = any;
type ValuePatch = any;


import type { CoreSpiritObject } from '../../coreSpirit/types';

type Identified = { id: string };
type CollectionName = 'lines' | 'boxes' | 'labels' | 'polylines' | 'backgrounds' | 'priceLines';

function style(value: unknown): 'solid' | 'dashed' | 'dotted' {
    const n = Number(value);
    return n === 1 ? 'dashed' : n === 2 ? 'dotted' : 'solid';
}
function color(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}
function pane(output: CoreSpiritObject): string {
    const visual = 'visual' in output ? output.visual : undefined;
    const area = visual?.area;
    return area?.kind === 'chart' && area.area !== 'price' ? 'study' : 'price';
}
function isPriceOverlay(output: CoreSpiritObject): boolean {
    return pane(output) === 'price';
}

type DirtySpan = { from: number; to: number };

function finiteSpan(from: unknown, to: unknown = from): DirtySpan | null {
    const a = Number(from), b = Number(to);
    if (Number.isFinite(a) && Number.isFinite(b)) return { from: Math.min(a, b), to: Math.max(a, b) };
    if (Number.isFinite(a)) return { from: a, to: a };
    if (Number.isFinite(b)) return { from: b, to: b };
    return null;
}

function unionDirtySpans(a: DirtySpan | null, b: DirtySpan | null): DirtySpan | null {
    if (!a) return b;
    if (!b) return a;
    return { from: Math.min(a.from, b.from), to: Math.max(a.to, b.to) };
}

function pointTimeSpan(points: unknown): DirtySpan | null {
    if (!Array.isArray(points)) return null;
    let from = Number.POSITIVE_INFINITY, to = Number.NEGATIVE_INFINITY;
    for (const point of points) {
        const space = (point as any)?.space;
        // Explicit non-time coordinate spaces are not comparable with the chart's
        // market-time dirty range. Return null for the whole geometry, not a partial span.
        if (typeof space === 'string' && space !== 'time') return null;
        const time = Number((point as any)?.time ?? (point as any)?.timestamp ?? (point as any)?.x);
        if (!Number.isFinite(time)) continue;
        from = Math.min(from, time);
        to = Math.max(to, time);
    }
    return Number.isFinite(from) && Number.isFinite(to) ? { from, to } : null;
}

function visualGeometryTimeSpan(geometry: unknown): DirtySpan | null {
    if (!geometry || typeof geometry !== 'object') return null;
    const value = geometry as any;
    const pointSpaceAllowed = (point: any) => !point || typeof point.space !== 'string' || point.space === 'time';
    if (value.kind === 'point') {
        return pointSpaceAllowed(value.point) ? finiteSpan(value.point?.x) : null;
    }
    if (value.kind === 'line' || value.kind === 'box') {
        if (!pointSpaceAllowed(value.from) || !pointSpaceAllowed(value.to)) return null;
        return finiteSpan(value.from?.x, value.to?.x);
    }
    if (value.kind === 'polygon' && Array.isArray(value.points)) {
        return pointTimeSpan(value.points);
    }
    // Support legacy renderer-neutral geometry that used bar-time x values before
    // coordinate spaces were explicit. Unknown explicit spaces remain conservative.
    if (Array.isArray(value.points)) return pointTimeSpan(value.points);
    return null;
}

/** Return the causal-time envelope for every time-bearing CoreSpirit output. */
export function outputDirtySpan(output: CoreSpiritObject): DirtySpan | null {
    const value = output as any;

    // Custom geometry can extend far beyond its anchor time.
    if (output.kind === 'customVisual') {
        if (value.geometry && visualGeometryTimeSpan(value.geometry) === null) return null;
        return unionDirtySpans(visualGeometryTimeSpan(value.geometry), finiteSpan(value.time));
    }

    if (Number.isFinite(Number(value.time))) {
        const baseTime = Number(value.time);
        const end = value.metadata?.endTime ?? value.metadata?.toTime;
        const anchor = finiteSpan(baseTime, end);
        const start = value.metadata?.startTime ?? value.metadata?.fromTime;
        return unionDirtySpans(anchor, finiteSpan(start, end ?? baseTime));
    }

    if (output.kind === 'line' || output.kind === 'arrow') {
        return finiteSpan(value.start?.time, value.end?.time);
    }
    if (output.kind === 'box' || output.kind === 'zone') {
        // Viewport coordinates are not canonical market time. Keep them conservative.
        return value.domain === 'viewport' ? null : finiteSpan(value.left, value.right);
    }
    if (output.kind === 'polyline' || output.kind === 'polygon') {
        return pointTimeSpan(value.points);
    }
    if (output.kind === 'table') {
        return finiteSpan(value.metadata?.fromTime ?? value.metadata?.time, value.metadata?.toTime ?? value.metadata?.endTime);
    }
    if (output.kind === 'footprint' || output.kind === 'event' || output.kind === 'scanCandidate' || output.kind === 'orderIntent') {
        return pointTimeSpan(value.points ?? value.geometry?.points);
    }
    return null;
}

type SceneDiffEmission = any;
function removed(output: CoreSpiritObject): boolean {
    return output.metadata?.removed === true;
}
function markerKey(output: Extract<CoreSpiritObject, { kind: 'marker' | 'signal' }>): string {
    return output.kind === 'signal'
        ? `signal:${output.type}:${output.time}`
        : String(output.id ?? `marker:${output.time}:${output.price}`);
}
function marker(output: Extract<CoreSpiritObject, { kind: 'marker' | 'signal' }>): TcoMarkerPoint {
    if (output.kind === 'signal') return {
        time: Number(output.time),
        position: output.metadata?.position === 'below' ? 'belowBar' : output.metadata?.position === 'inBar' ? 'inBar' : 'aboveBar',
        shape: output.metadata?.shape === 'arrowDown' ? 'arrowDown' : output.metadata?.shape === 'arrowUp' ? 'arrowUp' : 'circle',
        color: color(output.metadata?.color, '#9b8aff'),
        ...(output.type ? { text: String(output.type) } : {}),
    };
    return {
        time: Number(output.time),
        position: output.metadata?.position === 'below' ? 'belowBar' : output.metadata?.position === 'inBar' ? 'inBar' : 'aboveBar',
        shape: String(output.metadata?.shape ?? 'circle'),
        color: color(output.metadata?.color, '#9b8aff'),
        ...(output.metadata?.text != null ? { text: String(output.metadata.text) } : {}),
    };
}
function line(output: Extract<CoreSpiritObject, { kind: 'line' | 'arrow' }>, index: number): TcoDrawingLine {
    return {
        id: output.id ?? `line-${index}`, paneId: pane(output), xloc: 'bar_time',
        x1: Number(output.start.time), y1: Number(output.start.price), x2: Number(output.end.time), y2: Number(output.end.price),
        extend: 'none', color: color(output.style?.color, '#9b8aff'), invisible: false,
        width: Math.max(1, Number(output.style?.lineWidth ?? 1)), style: style(output.style?.lineStyle),
        arrowLeft: false, arrowRight: output.kind === 'arrow', overlay: pane(output) === 'price',
    };
}
function label(output: Extract<CoreSpiritObject, { kind: 'label' | 'shape' }>): TcoDrawingLabel {
    if (output.kind === 'shape') return {
        id: output.id, paneId: pane(output), xloc: 'bar_time', x: Number(output.time), y: Number(output.price), yloc: 'price',
        style: output.shape === 'triangleUp' ? 'triangleup' : output.shape === 'triangleDown' ? 'triangledown' : output.shape === 'diamond' ? 'diamond' : output.shape === 'square' ? 'square' : 'circle',
        color: color(output.style?.color, '#9b8aff'), textColor: color(output.style?.textColor, '#fff'),
        size: 'small', textAlign: 'center', ...(output.style?.text ? { text: output.style.text } : {}),
        overlay: isPriceOverlay(output),
    };
    return {
        id: output.id, paneId: pane(output), xloc: 'bar_time', x: Number(output.time), y: Number(output.price),
        yloc: output.position === 'above' ? 'abovebar' : output.position === 'below' ? 'belowbar' : 'price',
        style: output.style?.shape === 'circle' ? 'circle' : 'label_center',
        color: color(output.style?.background, '#9b8aff'), textColor: color(output.style?.color, '#fff'), text: output.text,
        size: 'small', textAlign: output.style?.textAlign === 'left' ? 'left' : output.style?.textAlign === 'right' ? 'right' : 'center',
        bold: output.style?.fontWeight === 'bold', italic: output.style?.fontStyle === 'italic',
        overlay: isPriceOverlay(output),
    };
}
function polyline(output: Extract<CoreSpiritObject, { kind: 'polyline' }>): TcoDrawingPolyline {
    return {
        id: output.id, paneId: pane(output),
        points: output.points.map(point => ({ xloc: 'bar_time', x: Number(point.time), price: Number(point.price) })),
        curved: false, closed: false, lineColor: color(output.style?.color, '#9b8aff'), fillColor: output.style?.fillColor,
        lineWidth: Math.max(1, Number(output.style?.lineWidth ?? 1)), lineStyle: style(output.style?.lineStyle),
        arrowLeft: false, arrowRight: false, overlay: isPriceOverlay(output),
    };
}

function idIndex<T extends Identified>(items: readonly T[], id: string): number {
    return items.findIndex(item => item.id === id);
}

export interface CoreSpiritSceneSnapshot {
    points: Map<string, TcoSeriesPoint[]>;
    markers: TcoMarkerPoint[];
    priceLines: TcoPriceLine[];
    rectBatches: TcoRectBatch[];
}

export class CoreSpiritSceneDiff {
    private readonly points = new Map<string, TcoSeriesPoint[]>();
    private readonly seriesMounted = new Set<string>();
    private readonly markers = new Map<string, TcoMarkerPoint>();
    /** Time-sorted marker keys plus indexes avoid sorting the whole marker scene per event. */
    private readonly markerOrder: string[] = [];
    private readonly markerIndexes = new Map<string, number>();
    private readonly markerOrdinal = new Map<string, number>();
    private nextMarkerOrdinal = 0;
    /** O(1) previous-time lookup for stable visual identities on incremental updates. */
    private readonly retainedSpans = new Map<string, DirtySpan>();
    private readonly rectBatches = new Map<string, TcoRectInstance[]>;
    private readonly rectBatchMeta = new Map<string, { paneId: string; overlay?: boolean; indexOffset?: number }>();
    private readonly collections: Record<CollectionName, Identified[]> = {
        lines: [], boxes: [], labels: [], polylines: [], backgrounds: [], priceLines: [],
    };
    private markerSeriesMounted = false;

    constructor(readonly indicatorId: string) {}

    get markerSeriesId(): string { return `${this.indicatorId}:signals`; }

    reset(): void {
        this.points.clear();
        this.seriesMounted.clear();
        this.markers.clear();
        this.markerOrder.length = 0;
        this.markerIndexes.clear();
        this.markerOrdinal.clear();
        this.nextMarkerOrdinal = 0;
        this.retainedSpans.clear();
        this.rectBatches.clear();
        this.rectBatchMeta.clear();
        for (const values of Object.values(this.collections)) values.splice(0, values.length);
        this.markerSeriesMounted = false;
    }

    seed(outputs: CoreSpiritObject[]): void {
        this.retainedSpans.clear();
        for (const output of outputs) {
            this.applyOutput(output, false);
            this.updateRetainedDirtySpan(output);
        }
        this.seriesMounted.clear();
        for (const id of this.points.keys()) this.seriesMounted.add(id);
        this.markerSeriesMounted = this.markers.size > 0;
    }

    snapshot(): CoreSpiritSceneSnapshot {
        return {
            points: this.points,
            markers: this.orderedMarkers(),
            priceLines: this.collections.priceLines as TcoPriceLine[],
            rectBatches: [...this.rectBatches.entries()].map(([id, instances]) => ({
                id,
                paneId: this.rectBatchMeta.get(id)?.paneId ?? 'price',
                overlay: this.rectBatchMeta.get(id)?.overlay,
                indexOffset: this.rectBatchMeta.get(id)?.indexOffset,
                instances,
            })),
        };
    }

    apply(outputs: CoreSpiritObject[], dirty: { from: number; to: number }): ScenePatch[] {
        const series: any[] = [];
        const collections: any[] = [];
        const instanceBatches: any[] = [];
        const out: ScenePatch[] = [];
        // Track the actual time extent of emitted changes. Initializing this to the
        // requested range silently widened every small patch back to the full range.
        let from = Number.POSITIVE_INFINITY;
        let to = Number.NEGATIVE_INFINITY;
        let hasUnboundedValuePatch = false;

        for (const output of outputs) {
            const span = unionDirtySpans(outputDirtySpan(output), this.retainedDirtySpan(output));
            // A stable-ID visual may move away from the requested range. Include its
            // retained extent before filtering so old pixels/state are not orphaned.
            if (span && (span.to < dirty.from || span.from > dirty.to)) continue;
            const result = this.applyOutput(output, true);
            this.updateRetainedDirtySpan(output);
            if (result?.schema) out.push(result.schema);
            if (result?.delta) series.push(result.delta);
            if (result?.deltas) series.push(...result.deltas);
            if (result?.collection) collections.push(result.collection);
            if (result?.instanceDelta) instanceBatches.push(result.instanceDelta);

            if (result?.delta || result?.deltas || result?.collection || result?.instanceDelta) {
                if (!span) {
                    hasUnboundedValuePatch = true;
                } else {
                    from = Math.min(from, span.from);
                    to = Math.max(to, span.to);
                }
            }
        }

        if (!this.markerSeriesMounted && this.markers.size > 0) {
            out.push({
                kind: 'schema',
                indicatorId: this.indicatorId,
                added: [{
                    id: this.markerSeriesId, title: 'Signals', paneId: 'price', kind: 'markers',
                    markers: this.orderedMarkers(),
                    visible: true, overlay: true,
                } as any],
                removed: [], changed: [],
            });
            this.markerSeriesMounted = true;
            for (let i = series.length - 1; i >= 0; i--) if (series[i]!.seriesId === this.markerSeriesId) series.splice(i, 1);
        }

        if (series.length || collections.length || instanceBatches.length) {
            const patchDirty = hasUnboundedValuePatch || !Number.isFinite(from) || !Number.isFinite(to)
                ? dirty
                : { from, to };
            out.push({
                kind: 'value', indicatorId: this.indicatorId, dirty: patchDirty, series,
                ...(collections.length ? { collections } : {}),
                ...(instanceBatches.length ? { instanceBatches } : {}),
            });
        }
        return out;
    }

    private retainedSpanKey(output: CoreSpiritObject): string | null {
        const value = output as any;
        const id = typeof value.id === 'string' && value.id.length ? value.id : undefined;
        if (output.kind === 'marker' || output.kind === 'signal') return `markers:${markerKey(output as Extract<CoreSpiritObject, { kind: 'marker' | 'signal' }>)}`;
        if (!id) return null;
        if (output.kind === 'line' || output.kind === 'arrow') return `lines:${id}`;
        if (output.kind === 'box' || output.kind === 'zone') return `rectangles:${id}`;
        if (output.kind === 'label' || output.kind === 'shape') return `labels:${id}`;
        if (output.kind === 'polyline') return `polylines:${id}`;
        if (output.kind === 'background') return `backgrounds:${id}`;
        return null;
    }

    private retainedDirtySpan(output: CoreSpiritObject): DirtySpan | null {
        const key = this.retainedSpanKey(output);
        return key ? this.retainedSpans.get(key) ?? null : null;
    }

    private updateRetainedDirtySpan(output: CoreSpiritObject): void {
        const key = this.retainedSpanKey(output);
        if (!key) return;
        if (removed(output)) {
            this.retainedSpans.delete(key);
            return;
        }
        const span = outputDirtySpan(output);
        if (span) this.retainedSpans.set(key, span);
        else this.retainedSpans.delete(key);
    }

    private applySeries(output: Extract<CoreSpiritObject, { kind: 'series' }>, emit: boolean): SceneDiffEmission {
        const name = String(output.seriesId || output.name || 'series');
        const seriesId = `${this.indicatorId}:series:${name}`;
        const list = this.points.get(name) ?? [];
        const wasMounted = this.seriesMounted.has(name);
        const time = Number(output.time);
        let lo = 0, hi = list.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (Number(list[mid]!.time) < time) lo = mid + 1; else hi = mid; }
        const exists = lo < list.length && Number(list[lo]!.time) === time;
        if (removed(output)) {
            if (!exists) return null;
            list.splice(lo, 1); this.points.set(name, list);
            return emit ? { delta: { seriesId, kind: 'points', points: [], op: 'replace-range', start: lo, remove: 1 } } : null;
        }
        const point: TcoSeriesPoint = { time, value: output.value == null ? null : Number(output.value) };
        list.splice(lo, exists ? 1 : 0, point); this.points.set(name, list);
        if (!wasMounted) this.seriesMounted.add(name);
        if (!emit) return wasMounted ? null : { schema: {
            kind: 'schema', indicatorId: this.indicatorId,
            added: [{ id: seriesId, title: name, paneId: 'price', kind: 'line', points: [], style: { color: '#9b8aff', width: 2, lineStyle: 'solid' }, visible: true, overlay: true } as any],
            removed: [], changed: [],
        } };
        const schema = !wasMounted ? { schema: {
            kind: 'schema' as const, indicatorId: this.indicatorId,
            added: [{ id: seriesId, title: name, paneId: 'price', kind: 'line' as const, points: [], style: { color: '#9b8aff', width: 2, lineStyle: 'solid' as const }, visible: true, overlay: true } as any],
            removed: [], changed: [],
        } } : {};
        if (exists && lo === list.length - 1) return { ...schema, delta: { seriesId, kind: 'points', points: [point], op: 'replace-last' } };
        if (!exists && lo === list.length - 1) return { ...schema, delta: { seriesId, kind: 'points', points: [point], op: 'append' } };
        return { ...schema, delta: { seriesId, kind: 'points', points: [point], op: 'replace-range', start: lo, remove: exists ? 1 : 0 } };
    }

    private orderedMarkers(): TcoMarkerPoint[] {
        return this.markerOrder.flatMap(key => {
            const value = this.markers.get(key);
            return value ? [value] : [];
        });
    }

    private reindexMarkers(from: number): void {
        for (let index = from; index < this.markerOrder.length; index += 1) {
            this.markerIndexes.set(this.markerOrder[index]!, index);
        }
    }

    private markerInsertionIndex(key: string): number {
        const value = this.markers.get(key)!;
        const time = Number(value.time);
        const ordinal = this.markerOrdinal.get(key) ?? 0;
        let low = 0, high = this.markerOrder.length;
        while (low < high) {
            const middle = (low + high) >>> 1;
            const middleKey = this.markerOrder[middle]!;
            const middleTime = Number(this.markers.get(middleKey)?.time);
            const middleOrdinal = this.markerOrdinal.get(middleKey) ?? 0;
            if (middleTime < time || (middleTime === time && middleOrdinal <= ordinal)) low = middle + 1;
            else high = middle;
        }
        return low;
    }

    private applyMarker(output: Extract<CoreSpiritObject, { kind: 'marker' | 'signal' }>, emit: boolean): SceneDiffEmission {
        const key = markerKey(output);
        const previousIndex = this.markerIndexes.get(key);
        const previousValue = this.markers.get(key);
        if (removed(output)) {
            if (previousIndex === undefined) return null;
            this.markers.delete(key);
            this.markerIndexes.delete(key);
            this.markerOrdinal.delete(key);
            this.markerOrder.splice(previousIndex, 1);
            this.reindexMarkers(previousIndex);
            return emit ? { delta: { seriesId: this.markerSeriesId, kind: 'markers', markers: [], op: 'replace-range', start: previousIndex, remove: 1 } } : null;
        }

        const value = marker(output);
        const was = previousIndex !== undefined;
        const sameTime = was && previousValue && Number(previousValue.time) === Number(value.time);
        if (sameTime) {
            // The hot path for a developing signal updates one array slot in O(1).
            this.markers.set(key, value);
            return emit ? { delta: { seriesId: this.markerSeriesId, kind: 'markers', markers: [value], op: 'replace-range', start: previousIndex, remove: 1 } } : null;
        }

        if (previousIndex !== undefined) {
            this.markerOrder.splice(previousIndex, 1);
            this.markerIndexes.delete(key);
            this.reindexMarkers(previousIndex);
        } else {
            this.markerOrdinal.set(key, this.nextMarkerOrdinal++);
        }
        this.markers.set(key, value);
        const nextIndex = this.markerInsertionIndex(key);
        this.markerOrder.splice(nextIndex, 0, key);
        this.reindexMarkers(nextIndex);

        if (!emit) return null;
        if (!was) return { delta: { seriesId: this.markerSeriesId, kind: 'markers', markers: [value], op: 'replace-range', start: nextIndex, remove: 0 } };
        if (previousIndex === nextIndex) return { delta: { seriesId: this.markerSeriesId, kind: 'markers', markers: [value], op: 'replace-range', start: nextIndex, remove: 1 } };
        // Vela applies series deltas in order. Insert at the final sorted index after removal.
        return {
            deltas: [
                { seriesId: this.markerSeriesId, kind: 'markers', markers: [], op: 'replace-range', start: previousIndex, remove: 1 },
                { seriesId: this.markerSeriesId, kind: 'markers', markers: [value], op: 'replace-range', start: nextIndex, remove: 0 },
            ],
        };
    }

    private applyRect(output: Extract<CoreSpiritObject, { kind: 'box' | 'zone' }>, emit: boolean): SceneDiffEmission {
        const batchId = `${this.indicatorId}:zones:${pane(output)}:${isPriceOverlay(output) ? 'overlay' : 'own'}`;
        const target = this.rectBatches.get(batchId) ?? [];
        const value: TcoRectInstance = {
            id: output.id ?? `${batchId}:${target.length}`,
            xloc: 'bar_time',
            left: Number(output.left),
            right: Number(output.right),
            top: Number(output.top),
            bottom: Number(output.bottom),
            fill: color(output.style?.fillColor ?? output.style?.color, 'rgba(155,138,255,0.16)'),
        };
        const idx = target.findIndex(item => item.id === value.id);
        const remove = removed(output);
        if (remove) {
            if (idx < 0) return null;
            target.splice(idx, 1);
            this.rectBatches.set(batchId, target);
            this.rectBatchMeta.set(batchId, { paneId: pane(output), overlay: isPriceOverlay(output) });
            return emit ? { instanceDelta: { batchId, paneId: pane(output), overlay: isPriceOverlay(output), op: 'replace-range', values: [], start: idx, remove: 1 } } : null;
        }
        if (idx < 0) {
            target.push(value);
            this.rectBatches.set(batchId, target);
            this.rectBatchMeta.set(batchId, { paneId: pane(output), overlay: isPriceOverlay(output) });
            return emit ? { instanceDelta: { batchId, paneId: pane(output), overlay: isPriceOverlay(output), op: 'append', values: [value] } } : null;
        }
        target[idx] = value;
        this.rectBatches.set(batchId, target);
        this.rectBatchMeta.set(batchId, { paneId: pane(output), overlay: isPriceOverlay(output) });
        return emit ? { instanceDelta: { batchId, paneId: pane(output), overlay: isPriceOverlay(output), op: 'replace-range', values: [value], start: idx, remove: 1 } } : null;
    }

    private applyCollection(name: CollectionName, value: Identified, emit: boolean, remove = false): SceneDiffEmission {
        const target = this.collections[name];
        const idx = idIndex(target, value.id);
        if (remove) {
            if (idx < 0) return null;
            target.splice(idx, 1);
            return emit ? { collection: { collection: name, values: [], op: 'replace-range', start: idx, remove: 1 } } : null;
        }
        if (idx < 0) { target.push(value); return emit ? { collection: { collection: name, values: [value], op: 'append' } } : null; }
        target[idx] = value;
        return emit ? { collection: { collection: name, values: [value], op: 'replace-range', start: idx, remove: 1 } } : null;
    }

    private applyOutput(output: CoreSpiritObject, emit: boolean): SceneDiffEmission {
        if (output.kind === 'series') return this.applySeries(output, emit);
        if (output.kind === 'marker' || output.kind === 'signal') return this.applyMarker(output, emit);
        if (output.kind === 'hline') {
            const value: TcoPriceLine = {
                id: output.id || `${this.indicatorId}:hline:${output.price}`, paneId: 'price', price: Number(output.price),
                color: color(output.style?.color, '#9b8aff'), lineStyle: style(output.style?.lineStyle),
                width: Math.max(1, Number(output.style?.lineWidth ?? 1)), title: output.style?.text,
            };
            return this.applyCollection('priceLines', value, emit, removed(output));
        }
        switch (output.kind) {
            case 'line':
            case 'arrow': return this.applyCollection('lines', line(output, this.collections.lines.length), emit, removed(output));
            case 'label':
            case 'shape': return this.applyCollection('labels', label(output), emit, removed(output));
            case 'box':
            case 'zone': return this.applyRect(output, emit);
            case 'polyline': return this.applyCollection('polylines', polyline(output), emit, removed(output));
            case 'background': {
                const start = Number(output.time);
                const end = Number(output.metadata?.endTime ?? start + 1);
                const value: TcoBackground = { id: output.id, paneId: pane(output), from: start, to: Math.max(start + 1, end), color: output.color, overlay: isPriceOverlay(output) };
                return this.applyCollection('backgrounds', value, emit, removed(output));
            }
            default: return null;
        }
    }
}
