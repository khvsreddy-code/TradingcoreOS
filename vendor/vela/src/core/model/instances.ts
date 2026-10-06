/** Screen-space GPU-ready high-cardinality rectangle batches.
 * Coordinates are media pixels after the canonical CoordinateSystem projection.
 * The batch contains no DOM objects and is rendered with one instanced GPU draw call. */
export interface HighCardinalityRectBatch {
    id: string;
    paneId: string;
    /** Interleave position: paint immediately before the series boundary at this z. */
    beforeZ: number;
    /** Packed [x1,y1,x2,y2] for every instance. */
    rects: Float32Array;
    /** Packed RGBA8 per instance. */
    colors: Uint8Array;
}

export function highCardinalityRectCount(batch: HighCardinalityRectBatch): number {
    return Math.floor(batch.rects.length / 4);
}
