import type { IndicatorModel } from './indicator';
import type { ScenePatch, SeriesPatchOperation } from './patch';

export function applyScenePatch(model: IndicatorModel, patch: ScenePatch): void {
    if (patch.kind === 'schema') {
        for (const id of patch.removed) {
            const index = model.series.findIndex((candidate) => candidate.id === id);
            if (index >= 0) model.series.splice(index, 1);
        }
        for (const spec of patch.added) model.series.push(spec);
        return;
    }

    if (patch.anchorTime !== undefined) model.anchorTime = patch.anchorTime ?? undefined;

    for (const delta of patch.series) {
        const series = model.series.find((candidate) => candidate.id === delta.seriesId);
        if (!series) continue;
        const op = delta.op ?? 'replace';
        if (delta.kind === 'points' && isLineLike(series)) {
            series.points = applyArrayDelta(series.points, delta.points, op, delta.start, delta.remove);
        } else if (delta.kind === 'bars' && (series.kind === 'candle' || series.kind === 'bar')) {
            series.bars = applyArrayDelta(series.bars, delta.bars, op, delta.start, delta.remove);
            if (delta.barColors !== undefined) {
                series.barColors = applyArrayDelta(series.barColors ?? [], delta.barColors, op, delta.start, delta.remove);
            }
        } else if (delta.kind === 'markers' && series.kind === 'markers') {
            series.markers = applyArrayDelta(series.markers, delta.markers, op, delta.start, delta.remove);
        }
    }

    for (const delta of patch.seriesStyles ?? []) {
        const series = model.series.find((candidate) => candidate.id === delta.seriesId);
        if (!series) continue;
        if (delta.style && isLineLike(series)) series.style = { ...series.style, ...delta.style };
        if (delta.display) series.display = { ...series.display, ...delta.display };
        if (delta.title !== undefined) series.title = delta.title;
        if (delta.visible !== undefined) series.visible = delta.visible;
    }

    for (const delta of patch.fillStyles ?? []) {
        const fill = model.fills.find((candidate) => candidate.id === delta.fillId);
        if (!fill) continue;
        if (delta.paneId !== undefined) fill.paneId = delta.paneId;
        if (delta.color !== undefined) fill.color = delta.color;
        if (delta.overlay !== undefined) fill.overlay = delta.overlay;
    }

    for (const delta of patch.fillDeltas ?? []) {
        const fill = model.fills.find((candidate) => candidate.id === delta.fillId);
        if (!fill) continue;
        const op = delta.op ?? 'replace';
        if (delta.colors !== undefined) fill.colors = applyArrayDelta(fill.colors ?? [], delta.colors, op, delta.start, delta.remove);
        if (delta.gradient !== undefined) fill.gradient = applyArrayDelta(fill.gradient ?? [], delta.gradient, op, delta.start, delta.remove);
    }

    if (patch.fills !== undefined) model.fills = patch.fills;
    if (patch.instanceBatches) {
        model.instanceBatches ??= [];
        for (const delta of patch.instanceBatches) {
            let batch = model.instanceBatches.find(candidate => candidate.id === delta.batchId);
            if (!batch) {
                batch = { id: delta.batchId, paneId: delta.paneId ?? model.paneId ?? 'price', overlay: delta.overlay, indexOffset: delta.indexOffset, instances: [] };
                model.instanceBatches.push(batch);
            }
            batch.instances = applyArrayDelta(batch.instances, delta.values, delta.op, delta.start, delta.remove);
            if (delta.paneId !== undefined) batch.paneId = delta.paneId;
            if (delta.overlay !== undefined) batch.overlay = delta.overlay;
            if (delta.indexOffset !== undefined) batch.indexOffset = delta.indexOffset;
        }
    }
    if (patch.backgrounds !== undefined) model.backgrounds = patch.backgrounds;
    if (patch.priceLines !== undefined) model.priceLines = patch.priceLines;
    if (patch.lines !== undefined) model.lines = patch.lines;
    if (patch.boxes !== undefined) model.boxes = patch.boxes;
    if (patch.labels !== undefined) model.labels = patch.labels;
    if (patch.polylines !== undefined) model.polylines = patch.polylines;
    if (patch.linefills !== undefined) model.linefills = patch.linefills;
    if (patch.tables !== undefined) model.tables = patch.tables;
    if (patch.barColors !== undefined) model.barColors = patch.barColors;
    if (patch.trades !== undefined) model.trades = patch.trades;

    if (patch.collections) {
        const target = model as unknown as Record<string, unknown[] | undefined>;
        for (const delta of patch.collections) {
            const current = target[delta.collection] ?? [];
            target[delta.collection] = applyArrayDelta(current, delta.values, delta.op ?? 'replace', delta.start, delta.remove);
        }
    }
}

function isLineLike(series: IndicatorModel['series'][number]): series is Extract<IndicatorModel['series'][number], { points: unknown[] }> {
    return series.kind !== 'candle' && series.kind !== 'bar' && series.kind !== 'markers';
}

function applyArrayDelta<T>(current: T[], incoming: T[], op: SeriesPatchOperation, start?: number, remove?: number): T[] {
    switch (op) {
        case 'append':
            current.push(...incoming);
            return current;
        case 'prepend':
            current.splice(0, 0, ...incoming);
            return current;
        case 'replace-last':
            if (incoming.length === 0) return current;
            if (current.length === 0) current.push(...incoming);
            else current[current.length - 1] = incoming[incoming.length - 1]!;
            return current;
        case 'replace-range':
            current.splice(Math.max(0, start ?? 0), Math.max(0, remove ?? incoming.length), ...incoming);
            return current;
        default:
            return incoming;
    }
}
