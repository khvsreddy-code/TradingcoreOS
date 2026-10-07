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

export function outputDirtySpan(output: CoreSpiritObject): { from:number; to:number } | null {
    const n=(value:unknown)=>Number(value);
    const pointTimes=(points:unknown): number[] => Array.isArray(points)
        ? points.map((point:any)=>n(point?.time ?? point?.x)).filter(Number.isFinite)
        : [];
    const span=(from:unknown,to:unknown): {from:number;to:number}|null => {
        const a=n(from),b=n(to);
        if(Number.isFinite(a)&&Number.isFinite(b))return {from:Math.min(a,b),to:Math.max(a,b)};
        if(Number.isFinite(a))return {from:a,to:a};
        if(Number.isFinite(b))return {from:b,to:b};
        return null;
    };
    const value=output as any;

    // Every time-bearing visual primitive gets an exact bar-time span.
    if(Number.isFinite(n(value.time))){
        const base=n(value.time);
        const end=n(value.metadata?.endTime ?? value.metadata?.toTime);
        return Number.isFinite(end) ? span(base,end) : {from:base,to:base};
    }

    if(output.kind==='line'||output.kind==='arrow'){
        return span(value.start?.time,value.end?.time);
    }
    if(output.kind==='box'||output.kind==='zone'){
        return span(value.left,value.right);
    }
    if(output.kind==='polyline'||output.kind==='polygon'){
        const times=pointTimes(value.points);
        return times.length ? {from:Math.min(...times),to:Math.max(...times)} : null;
    }
    if(output.kind==='band'){
        const end=n(value.metadata?.endTime ?? value.metadata?.toTime);
        return Number.isFinite(end) ? span(value.time,end) : null;
    }
    if(output.kind==='background'){
        return span(value.time,value.metadata?.endTime ?? value.metadata?.toTime ?? value.time);
    }
    if(output.kind==='table'){
        return span(value.metadata?.fromTime ?? value.metadata?.time, value.metadata?.toTime ?? value.metadata?.endTime);
    }
    if(output.kind==='footprint'||output.kind==='customVisual'||output.kind==='event'||output.kind==='scanCandidate'||output.kind==='orderIntent'||output.kind==='barcolor'||output.kind==='marker'||output.kind==='signal'){
        const times=pointTimes(value.points ?? value.geometry?.points);
        if(times.length)return {from:Math.min(...times),to:Math.max(...times)};
        if(Number.isFinite(n(value.time)))return {from:n(value.time),to:n(value.time)};
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
    private readonly rectBatches = new Map<string, TcoRectInstance[]>();
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
        this.rectBatches.clear();
        this.rectBatchMeta.clear();
        for (const values of Object.values(this.collections)) values.splice(0, values.length);
        this.markerSeriesMounted = false;
    }

    seed(outputs: CoreSpiritObject[]): void {
        for (const output of outputs) this.applyOutput(output, false);
        this.seriesMounted.clear();
        for (const id of this.points.keys()) this.seriesMounted.add(id);
        this.markerSeriesMounted = this.markers.size > 0;
    }

    snapshot(): CoreSpiritSceneSnapshot {
        return {
            points: this.points,
            markers: [...this.markers.values()].sort((a, b) => Number(a.time) - Number(b.time)),
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
        let from = dirty.from;
        let to = dirty.to;

        for (const output of outputs) {
            const result = this.applyOutput(output, true);
            if (result?.schema) out.push(result.schema);
            if (result?.delta) series.push(result.delta);
            if (result?.collection) collections.push(result.collection);
            if (result?.instanceDelta) instanceBatches.push(result.instanceDelta);
            const span = outputDirtySpan(output);
            if (span) { from=Math.min(from,span.from); to=Math.max(to,span.to); }
        }

        if (!this.markerSeriesMounted && this.markers.size > 0) {
            out.push({
                kind: 'schema',
                indicatorId: this.indicatorId,
                added: [{
                    id: this.markerSeriesId, title: 'Signals', paneId: 'price', kind: 'markers',
                    markers: [...this.markers.values()].sort((a, b) => Number(a.time) - Number(b.time)),
                    visible: true, overlay: true,
                } as any],
                removed: [], changed: [],
            });
            this.markerSeriesMounted = true;
            for (let i = series.length - 1; i >= 0; i--) if (series[i]!.seriesId === this.markerSeriesId) series.splice(i, 1);
        }

        if (series.length || collections.length || instanceBatches.length) out.push({
            kind: 'value', indicatorId: this.indicatorId, dirty: { from, to }, series,
            ...(collections.length ? { collections } : {}),
            ...(instanceBatches.length ? { instanceBatches } : {}),
        });
        return out;
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

    private applyMarker(output: Extract<CoreSpiritObject, { kind: 'marker' | 'signal' }>, emit: boolean): SceneDiffEmission {
        const key = markerKey(output);
        const before = [...this.markers.entries()].sort((a, b) => Number(a[1].time) - Number(b[1].time));
        if (removed(output)) {
            const idx = before.findIndex(([candidate]) => candidate === key);
            if (idx < 0) return null;
            this.markers.delete(key);
            return emit ? { delta: { seriesId: this.markerSeriesId, kind: 'markers', markers: [], op: 'replace-range', start: idx, remove: 1 } } : null;
        }
        const value = marker(output);
        const was = this.markers.has(key);
        this.markers.set(key, value);
        if (!emit) return null;
        const after = [...this.markers.values()].sort((a, b) => Number(a.time) - Number(b.time));
        const idx = after.findIndex(candidate => candidate.time === value.time && candidate.shape === value.shape);
        if (!was) return { delta: { seriesId: this.markerSeriesId, kind: 'markers', markers: [value], op: 'replace-range', start: Math.max(0, idx), remove: 0 } };
        return { delta: { seriesId: this.markerSeriesId, kind: 'markers', markers: [value], op: 'replace-range', start: Math.max(0, idx), remove: 1 } };
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
