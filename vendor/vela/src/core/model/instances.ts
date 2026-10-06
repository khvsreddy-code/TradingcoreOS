export type HighCardinalityRectXLoc = 'bar_time' | 'bar_index';

export interface HighCardinalityRectInstance {
    id: string;
    xloc: HighCardinalityRectXLoc;
    left: number;
    right: number;
    top: number;
    bottom: number;
    fill: string;
}

export interface HighCardinalityRectBatch {
    id: string;
    paneId: string;
    overlay?: boolean;
    indexOffset?: number;
    instances: HighCardinalityRectInstance[];
}

export interface HighCardinalityRectDelta {
    batchId: string;
    paneId?: string;
    overlay?: boolean;
    indexOffset?: number;
    op: 'replace' | 'append' | 'prepend' | 'replace-last' | 'replace-range';
    values: HighCardinalityRectInstance[];
    start?: number;
    remove?: number;
}

export interface GpuRectBatch {
    id: string;
    paneId: string;
    beforeZ: number;
    rects: Float32Array;
    colors: Uint8Array;
}
