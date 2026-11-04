type TcoSeriesPoint = { time:number; value:number|null; color?:string };
type TcoMarkerPoint = { time:number; position:'aboveBar'|'belowBar'|'inBar'; shape:string; color:string; text?:string; size?:'tiny'|'small'|'normal'|'large'|'huge'; textSize?:number; offset?:number };
type TcoPriceLine = PriceLine;
type TcoDrawingLine = DrawingLine;
type TcoDrawingBox = DrawingBox;
type TcoDrawingLabel = DrawingLabel;
type TcoDrawingPolyline = DrawingPolyline;
type TcoDrawingTable = DrawingTable;
type TcoBackground = Background;
type TcoBarColor = { time:number; color:string };
type TcoRectInstance = HighCardinalityRectInstance;
type TcoRectBatch = HighCardinalityRectBatch;
type TcoSeriesPresentation = { title?:string; style:ReturnType<typeof seriesStyle> };
import type {
    CollectionValueDelta,
    SchemaPatch,
    ScenePatch,
    SeriesValueDelta,
    DrawingBox,
    DrawingLabel,
    DrawingLine,
    DrawingPolyline,
    DrawingTable,
    TableCell,
    TablePosition,
    Background,
    PriceLine,
    HighCardinalityRectBatch,
    HighCardinalityRectDelta,
    HighCardinalityRectInstance,
} from './velaNativeChartKernel';
import type { CoreSpiritObject } from '../../coreSpirit/types';
import type { VelaTimeRange } from '../../../architecture/crossPlaneContracts';

type Identified = { id: string };
type CollectionName = 'lines' | 'boxes' | 'labels' | 'polylines' | 'backgrounds' | 'priceLines' | 'tables';

function style(value: unknown): 'solid' | 'dashed' | 'dotted' {
    const n = Number(value);
    return n === 1 ? 'dashed' : n === 2 ? 'dotted' : 'solid';
}
function color(value: unknown, fallback: string): string {
    return typeof value === 'string' && value.length > 0 ? value : fallback;
}
/** Bake opacity into a CSS color; Vela's GPU rect pass consumes CSS fill strings. */
function colorWithOpacity(value: unknown, opacity: unknown, fallback: string): string {
    const source = color(value, fallback).trim();
    const rawOpacity = Number(opacity);
    if (!Number.isFinite(rawOpacity)) return source;
    const factor = Math.max(0, Math.min(1, rawOpacity));
    const hex = source.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hex) {
        let digits = hex[1]!;
        if (digits.length === 3 || digits.length === 4) digits = [...digits].map(part => part + part).join('');
        const red = parseInt(digits.slice(0, 2), 16), green = parseInt(digits.slice(2, 4), 16), blue = parseInt(digits.slice(4, 6), 16);
        const alpha = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
        return `rgba(${red}, ${green}, ${blue}, ${Number((alpha * factor).toFixed(3))})`;
    }
    const rgb = source.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i);
    if (rgb) {
        const alpha = rgb[4] === undefined ? 1 : Math.max(0, Math.min(1, Number(rgb[4])));
        return `rgba(${Number(rgb[1])}, ${Number(rgb[2])}, ${Number(rgb[3])}, ${Number((alpha * factor).toFixed(3))})`;
    }
    return source;
}
function seriesStyle(output: Extract<CoreSpiritObject, { kind: 'series' }>) {
    return {
        color: color(output.style?.color, '#9b8aff'),
        width: Math.max(1, Math.min(8, Number(output.style?.lineWidth ?? 2))),
        lineStyle: style(output.style?.lineStyle),
    };
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

let nextScenePatchStreamId = 1;

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
    const anchor = finiteSpan(value.time);
    const end = value.metadata?.endTime ?? value.metadata?.toTime;
    const start = value.metadata?.startTime ?? value.metadata?.fromTime;
    const metadataSpan = Number.isFinite(Number(value.time))
        ? unionDirtySpans(anchor, finiteSpan(start, end ?? value.time))
        : finiteSpan(start, end);

    // Geometry must widen an object's anchor span. Checking time first used to
    // truncate anchored lines/polylines/footprints to a single bar, leaving stale
    // retained pixels at old geometry endpoints after an incremental update.
    if (output.kind === 'customVisual') {
        const geometry = value.geometry ? visualGeometryTimeSpan(value.geometry) : null;
        if (value.geometry && geometry === null) return null;
        return unionDirtySpans(metadataSpan, geometry);
    }
    if (output.kind === 'line' || output.kind === 'arrow') {
        return unionDirtySpans(metadataSpan, finiteSpan(value.start?.time, value.end?.time));
    }
    if (output.kind === 'box' || output.kind === 'zone') {
        // Viewport coordinates are not canonical market time; an anchor timestamp
        // cannot prove that the whole viewport object is bounded.
        if (value.domain === 'viewport') return null;
        return unionDirtySpans(metadataSpan, finiteSpan(value.left, value.right));
    }
    if (output.kind === 'polyline' || output.kind === 'polygon') {
        const geometry = pointTimeSpan(value.points);
        if (Array.isArray(value.points) && geometry === null) return null;
        return unionDirtySpans(metadataSpan, geometry);
    }
    if (output.kind === 'footprint' || output.kind === 'event' || output.kind === 'scanCandidate' || output.kind === 'orderIntent') {
        const points = value.points ?? value.geometry?.points;
        const geometry = pointTimeSpan(points);
        if (Array.isArray(points) && geometry === null) return null;
        return unionDirtySpans(metadataSpan, geometry);
    }
    if (output.kind === 'table') {
        return unionDirtySpans(metadataSpan, finiteSpan(value.metadata?.fromTime ?? value.metadata?.time, value.metadata?.toTime ?? value.metadata?.endTime));
    }
    return metadataSpan;
}
type SceneDiffEmission = {
    schema?: SchemaPatch;
    delta?: SeriesValueDelta;
    deltas?: SeriesValueDelta[];
    collection?: CollectionValueDelta;
    instanceDelta?: HighCardinalityRectDelta;
    barColorsChanged?: boolean;
} | null;
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
        size: Number(output.style?.size ?? 10) <= 8 ? 'tiny' : Number(output.style?.size ?? 10) >= 18 ? 'large' : 'small',
        textAlign: 'center', fontFamily: 'default', ...(output.style?.text ? { text: output.style.text } : {}),
        overlay: isPriceOverlay(output),
    };
    const fontSize = Number(output.style?.fontSize ?? 12);
    const requestedShape = output.style?.shape;
    const labelStyle = requestedShape === 'circle' ? 'circle'
        : requestedShape === 'box' ? 'label_center'
        : output.position === 'above' ? 'label_down'
        : output.position === 'below' ? 'label_up' : 'label_center';
    return {
        id: output.id, paneId: pane(output), xloc: 'bar_time', x: Number(output.time), y: Number(output.price),
        yloc: output.position === 'above' ? 'abovebar' : output.position === 'below' ? 'belowbar' : 'price',
        style: labelStyle,
        color: color(output.style?.background, '#9b8aff'), textColor: color(output.style?.color, '#fff'), text: output.text,
        size: fontSize <= 9 ? 'tiny' : fontSize <= 12 ? 'small' : fontSize <= 15 ? 'normal' : fontSize <= 20 ? 'large' : 'huge',
        textAlign: output.style?.textAlign === 'left' ? 'left' : output.style?.textAlign === 'right' ? 'right' : 'center',
        fontFamily: 'default',
        bold: output.style?.fontWeight === 'bold' || Number(output.style?.fontWeight) >= 600,
        italic: output.style?.fontStyle === 'italic',
        overlay: isPriceOverlay(output),
    };
}
function polyline(output: Extract<CoreSpiritObject, { kind: 'polyline' | 'polygon' }>): TcoDrawingPolyline {
    return {
        id: output.id, paneId: pane(output),
        points: output.points.map(point => ({ xloc: 'bar_time', x: Number(point.time), price: Number(point.price) })),
        curved: false, closed: output.kind === 'polygon',
        lineColor: color(output.style?.color, '#9b8aff'),
        fillColor: output.style?.fillColor ?? (output.kind === 'polygon' ? output.style?.color : undefined),
        lineWidth: Math.max(1, Number(output.style?.lineWidth ?? 1)), lineStyle: style(output.style?.lineStyle),
        arrowLeft: false, arrowRight: false, overlay: isPriceOverlay(output),
    };
}
function box(output: Extract<CoreSpiritObject, { kind: 'box' | 'zone' }>, id: string): TcoDrawingBox {
    const drawStyle = output.style ?? {};
    const border = drawStyle.borderColor ?? drawStyle.color;
    return {
        id, paneId: pane(output), xloc: 'bar_time', left: Number(output.left), right: Number(output.right),
        top: Number(output.top), bottom: Number(output.bottom), extend: 'none',
        ...(typeof border === 'string' && border.length ? { borderColor: colorWithOpacity(border, 1, '#9b8aff') } : {}),
        borderWidth: Math.max(0, Math.min(6, Number(drawStyle.borderWidth ?? drawStyle.lineWidth ?? 1))),
        borderStyle: style(drawStyle.lineStyle),
        ...(typeof drawStyle.text === 'string' ? { text: drawStyle.text } : {}),
        ...(typeof drawStyle.textColor === 'string' ? { textColor: drawStyle.textColor } : {}),
        textSize: 'auto', hAlign: 'left', vAlign: 'center', wrap: false, fontFamily: 'default',
        bold: false, italic: false, overlay: isPriceOverlay(output),
    };
}

function idIndex<T extends Identified>(items: readonly T[], id: string): number {
    return items.findIndex(item => item.id === id);
}

export interface CoreSpiritSceneSnapshot {
    points: Map<string, TcoSeriesPoint[]>;
    seriesStyles: Map<string, TcoSeriesPresentation>;
    markers: TcoMarkerPoint[];
    priceLines: TcoPriceLine[];
    rectBatches: TcoRectBatch[];
    lines: TcoDrawingLine[];
    boxes: TcoDrawingBox[];
    labels: TcoDrawingLabel[];
    polylines: TcoDrawingPolyline[];
    backgrounds: TcoBackground[];
    tables: TcoDrawingTable[];
    barColors: TcoBarColor[];
}

export class CoreSpiritSceneDiff {
    private readonly points = new Map<string, TcoSeriesPoint[]>();
    private readonly seriesStyles = new Map<string, TcoSeriesPresentation>();
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
    private readonly barColors = new Map<number, string>();
    private readonly collections: Record<CollectionName, Identified[]> = {
        lines: [], boxes: [], labels: [], polylines: [], backgrounds: [], priceLines: [], tables: [],
    };
    private markerSeriesMounted = false;
    private outputRevision = 0;
    private readonly patchStreamId: string;

    constructor(readonly indicatorId: string) {
        this.patchStreamId = `${indicatorId}:scene:${nextScenePatchStreamId++}`;
    }

    get markerSeriesId(): string { return `${this.indicatorId}:signals`; }

    reset(): void {
        this.points.clear();
        this.seriesStyles.clear();
        this.seriesMounted.clear();
        this.markers.clear();
        this.markerOrder.length = 0;
        this.markerIndexes.clear();
        this.markerOrdinal.clear();
        this.nextMarkerOrdinal = 0;
        this.retainedSpans.clear();
        this.rectBatches.clear();
        this.rectBatchMeta.clear();
        this.barColors.clear();
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

    /**
     * A model snapshot must never share mutable retained buffers with the live scene.
     * Vela keeps the returned IndicatorModel between patches; mutating a retained
     * plot array here would otherwise update the model without a corresponding patch.
     */
    snapshot(): CoreSpiritSceneSnapshot {
        return {
            points: new Map<string, TcoSeriesPoint[]>([...this.points.entries()].map(([id, values]) =>
                [id, values.map(point => ({ ...point }))] as [string, TcoSeriesPoint[]])),
            seriesStyles: new Map<string, TcoSeriesPresentation>([...this.seriesStyles.entries()].map(([id, presentation]) =>
                [id, { ...presentation, style: { ...presentation.style } }] as [string, TcoSeriesPresentation])),
            markers: this.orderedMarkers().map(value => ({ ...value })),
            priceLines: this.collections.priceLines.map(value => ({ ...value })) as TcoPriceLine[],
            rectBatches: [...this.rectBatches.entries()].map(([id, instances]) => ({
                id,
                paneId: this.rectBatchMeta.get(id)?.paneId ?? 'price',
                overlay: this.rectBatchMeta.get(id)?.overlay,
                indexOffset: this.rectBatchMeta.get(id)?.indexOffset,
                instances: instances.map(instance => ({ ...instance })),
            })),
            lines: this.collections.lines.map(value => ({ ...value })) as TcoDrawingLine[],
            boxes: this.collections.boxes.map(value => ({ ...value })) as TcoDrawingBox[],
            labels: this.collections.labels.map(value => ({ ...value })) as TcoDrawingLabel[],
            polylines: this.collections.polylines.map(value => {
                const polyline = value as TcoDrawingPolyline;
                return {
                    ...polyline,
                    points: polyline.points.map(point => ({ ...point })),
                };
            }),
            backgrounds: this.collections.backgrounds.map(value => ({ ...value })) as TcoBackground[],
            tables: this.collections.tables.map(value => {
                const table = value as TcoDrawingTable;
                return {
                    ...table,
                    cells: table.cells.map(row => row.map(cell => cell ? { ...cell } : null)),
                    merges: table.merges.map(merge => ({ ...merge })),
                };
            }),
            barColors: [...this.barColors.entries()].sort((left, right) => left[0] - right[0])
                .map(([time, color]) => ({ time, color })),
        };
    }

    apply(outputs: CoreSpiritObject[], dirty: VelaTimeRange, datasetRevision?: number): ScenePatch[] {
        const series: SeriesValueDelta[] = [];
        const collections: CollectionValueDelta[] = [];
        const instanceBatches: HighCardinalityRectDelta[] = [];
        let barColorsChanged = false;
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
            if (result?.barColorsChanged) barColorsChanged = true;

            if (result?.delta || result?.deltas || result?.collection || result?.instanceDelta || result?.barColorsChanged) {
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

        if (series.length || collections.length || instanceBatches.length || barColorsChanged) {
            const patchDirty = hasUnboundedValuePatch || !Number.isFinite(from) || !Number.isFinite(to)
                ? dirty
                : { from, to };
            out.push({
                kind: 'value', indicatorId: this.indicatorId, dirty: patchDirty, series,
                ...(collections.length ? { collections } : {}),
                ...(instanceBatches.length ? { instanceBatches } : {}),
                ...(barColorsChanged ? { barColors: [...this.barColors.entries()].sort((left, right) => left[0] - right[0]).map(([time, color]) => ({ time, color })) } : {}),
            });
        }
        // Stamp emitted schema/value patches so delayed worker replies cannot overwrite a
        // scene after a newer canonical data revision has committed.
        if (!Number.isSafeInteger(datasetRevision) || datasetRevision! < 0) return out;
        return out.map(patch => ({
            ...patch,
            revision: {
                streamId: this.patchStreamId,
                datasetRevision: datasetRevision!,
                outputRevision: ++this.outputRevision,
            },
        }));
    }

    private retainedSpanKey(output: CoreSpiritObject): string | null {
        const value = output as any;
        const id = typeof value.id === 'string' && value.id.length ? value.id : undefined;
        if (output.kind === 'marker' || output.kind === 'signal') return `markers:${markerKey(output as Extract<CoreSpiritObject, { kind: 'marker' | 'signal' }>)}`;
        if (!id) return null;
        if (output.kind === 'line' || output.kind === 'arrow') return `lines:${id}`;
        if (output.kind === 'box' || output.kind === 'zone') return `rectangles:${id}`;
        if (output.kind === 'label' || output.kind === 'shape') return `labels:${id}`;
        if (output.kind === 'polyline' || output.kind === 'polygon') return `polylines:${id}`;
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
        this.seriesStyles.set(name, { title: output.style?.title || name, style: seriesStyle(output) });
        const point: TcoSeriesPoint = { time, value: output.value == null ? null : Number(output.value) };
        list.splice(lo, exists ? 1 : 0, point); this.points.set(name, list);
        if (!wasMounted) this.seriesMounted.add(name);
        if (!emit) return wasMounted ? null : { schema: {
            kind: 'schema', indicatorId: this.indicatorId,
            added: [{ id: seriesId, title: output.style?.title || name, paneId: 'price', kind: 'line', points: [], style: seriesStyle(output), visible: true, overlay: true } as any],
            removed: [], changed: [],
        } };
        const schema = !wasMounted ? { schema: {
            kind: 'schema' as const, indicatorId: this.indicatorId,
            added: [{ id: seriesId, title: output.style?.title || name, paneId: 'price', kind: 'line' as const, points: [], style: seriesStyle(output), visible: true, overlay: true } as any],
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
        const id = output.id ?? `${batchId}:${target.length}`;
        const fillColor = output.style?.fillColor ?? output.style?.color;
        const value: TcoRectInstance = {
            id, xloc: 'bar_time', left: Number(output.left), right: Number(output.right),
            top: Number(output.top), bottom: Number(output.bottom),
            fill: colorWithOpacity(fillColor, output.style?.fillOpacity ?? output.style?.opacity ?? 0.16, 'rgba(155,138,255,0.16)'),
        };
        const idx = target.findIndex(item => item.id === value.id);
        const remove = removed(output);
        // Batched translucent fill + Vela-native box outline, sharing time/price anchors.
        const boxChange = output.kind === 'zone' && output.domain === 'viewport'
            ? null : this.applyCollection('boxes', box(output, id), emit, remove);
        const collection = boxChange?.collection;
        if (remove) {
            if (idx < 0) return boxChange;
            target.splice(idx, 1);
            if (target.length === 0) { this.rectBatches.delete(batchId); this.rectBatchMeta.delete(batchId); }
            else { this.rectBatches.set(batchId, target); this.rectBatchMeta.set(batchId, { paneId: pane(output), overlay: isPriceOverlay(output) }); }
            return {
                ...(emit ? { instanceDelta: { batchId, paneId: pane(output), overlay: isPriceOverlay(output), op: 'replace-range' as const, values: [], start: idx, remove: 1 } } : {}),
                ...(collection ? { collection } : {}),
            };
        }
        if (idx < 0) {
            target.push(value); this.rectBatches.set(batchId, target);
            this.rectBatchMeta.set(batchId, { paneId: pane(output), overlay: isPriceOverlay(output) });
            return {
                ...(emit ? { instanceDelta: { batchId, paneId: pane(output), overlay: isPriceOverlay(output), op: 'append' as const, values: [value] } } : {}),
                ...(collection ? { collection } : {}),
            };
        }
        target[idx] = value; this.rectBatches.set(batchId, target);
        this.rectBatchMeta.set(batchId, { paneId: pane(output), overlay: isPriceOverlay(output) });
        return {
            ...(emit ? { instanceDelta: { batchId, paneId: pane(output), overlay: isPriceOverlay(output), op: 'replace-range' as const, values: [value], start: idx, remove: 1 } } : {}),
            ...(collection ? { collection } : {}),
        };
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

    private applyBarColor(output: Extract<CoreSpiritObject, { kind: 'barcolor' }>, emit: boolean): SceneDiffEmission {
        const time = Number(output.time);
        if (!Number.isFinite(time)) return null;
        const previous = this.barColors.get(time);
        if (removed(output)) {
            if (previous === undefined) return null;
            this.barColors.delete(time);
            return emit ? { barColorsChanged: true } : null;
        }
        const next = colorWithOpacity(output.color, output.opacity ?? 1, output.color);
        if (previous === next) return null;
        this.barColors.set(time, next);
        return emit ? { barColorsChanged: true } : null;
    }

    private applyTable(output: Extract<CoreSpiritObject, { kind: 'table' }>, emit: boolean): SceneDiffEmission {
        const row = Number(output.row);
        const column = Number(output.column);
        // Tables are user-authored chart output; bound their dimensions so a malformed
        // worker result cannot allocate an unbounded cell grid on the chart thread.
        if (!Number.isSafeInteger(row) || row < 0 || row >= 100 ||
            !Number.isSafeInteger(column) || column < 0 || column >= 100) return null;

        const index = idIndex(this.collections.tables, output.id);
        if (removed(output) && index < 0) return null;
        const previous = index >= 0 ? this.collections.tables[index] as TcoDrawingTable : undefined;
        if (removed(output) && (!previous || row >= previous.rows || column >= previous.columns)) return null;

        const position = output.position.replace(/([A-Z])/g, '_$1').toLowerCase() as TablePosition;
        const rows = Math.max(previous?.rows ?? 0, row + 1);
        const columns = Math.max(previous?.columns ?? 0, column + 1);
        const cells: Array<Array<TableCell | null>> = previous
            ? previous.cells.map(existingRow => [...existingRow])
            : [];
        while (cells.length < rows) cells.push([]);
        for (let rowIndex = 0; rowIndex < rows; rowIndex += 1) {
            while (cells[rowIndex]!.length < columns) cells[rowIndex]!.push(null);
        }

        if (removed(output)) {
            cells[row]![column] = null;
        } else {
            const weight = String(output.style?.fontWeight ?? '500').toLowerCase();
            const numericWeight = Number(weight);
            cells[row]![column] = {
                text: output.text,
                ...(output.style?.color ? { textColor: output.style.color } : {}),
                ...(output.style?.background ? { bgColor: output.style.background } : {}),
                hAlign: output.style?.align ?? 'left',
                vAlign: 'center',
                textSize: Math.max(8, Math.min(32, Number(output.style?.fontSize ?? 11))),
                fontFamily: 'default',
                bold: weight === 'bold' || (Number.isFinite(numericWeight) && numericWeight >= 600),
                italic: false,
            };
        }

        const table: TcoDrawingTable = {
            id: output.id,
            paneId: pane(output),
            position,
            columns,
            rows,
            ...(previous?.bgColor ? { bgColor: previous.bgColor } : output.style?.background ? { bgColor: output.style.background } : {}),
            ...(previous?.frameColor ? { frameColor: previous.frameColor } : output.style?.border ? { frameColor: output.style.border } : {}),
            frameWidth: previous?.frameWidth ?? 1,
            ...(previous?.borderColor ? { borderColor: previous.borderColor } : output.style?.border ? { borderColor: output.style.border } : {}),
            borderWidth: previous?.borderWidth ?? 1,
            cells,
            merges: previous ? previous.merges.map(merge => ({ ...merge })) : [],
            overlay: isPriceOverlay(output),
        };
        const empty = cells.every(existingRow => existingRow.every(cell => cell == null));
        return this.applyCollection('tables', table, emit, removed(output) && empty);
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
            case 'polyline':
            case 'polygon': return this.applyCollection('polylines', polyline(output), emit, removed(output));
            case 'table': return this.applyTable(output, emit);
            case 'barcolor': return this.applyBarColor(output, emit);
            case 'background': {
                const start = Number(output.time);
                const end = Number(output.metadata?.endTime ?? start + 1);
                const value: TcoBackground = { id: output.id, paneId: pane(output), from: start, to: Math.max(start + 1, end), color: colorWithOpacity(output.color, output.opacity ?? 1, output.color), overlay: isPriceOverlay(output) };
                return this.applyCollection('backgrounds', value, emit, removed(output));
            }
            default: return null;
        }
    }
}
