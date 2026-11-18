/** Renderer-neutral graphics budgeting contracts. GPU memory values are estimates,
 * never claims about private driver allocations or dedicated VRAM. */
export type NativeGraphicsBackend = 'webgl2' | 'canvas2d';

export interface NativeGraphicsPolicy {
    backend: NativeGraphicsBackend;
    /** Resolution scale relative to the display's physical device-pixel ratio. */
    resolutionScale: number;
    /** Optional GPU glow effects are retained for the active chart only under budget. */
    glowEnabled: boolean;
    reason?: string;
}

export interface NativeGraphicsDiagnostics {
    backend: NativeGraphicsBackend | 'unknown';
    cssWidth: number;
    cssHeight: number;
    devicePixelRatio: number;
    resolutionScale: number;
    visibleBars: number;
    indicatorCount: number;
    drawingLayerCount: number;
    estimatedGpuBytes: number;
    estimatedCanvasBytes: number;
    maxTextureSize?: number;
    p95FrameMs: number;
    frameBudgetMissRate: number;
    frameBudgetMs: number;
}

export interface GraphicsBudgetCellInput {
    cellId: string;
    active: boolean;
    visible: boolean;
    width: number;
    height: number;
    devicePixelRatio: number;
    visibleBars: number;
    indicatorCount: number;
    drawingLayerCount: number;
    estimatedGpuBytes: number;
    frameP95Ms: number;
    frameBudgetMissRate: number;
}

export interface GraphicsHardwareProfile {
    webgl2Supported: boolean;
    deviceMemoryGiB: number;
    hardwareConcurrency: number;
    maxTextureSize: number;
}

export interface GraphicsBudgetDecision extends NativeGraphicsPolicy {
    cellId: string;
    priority: number;
    estimatedPixels: number;
}

/** Deterministic policy function: favors the active chart, then visible area and workload.
 * Context limits are deliberately conservative because WebGL does not expose the browser's
 * remaining page-wide context allowance. */
export function planAdaptiveGraphicsBudget(
    cells: readonly GraphicsBudgetCellInput[],
    hardware: GraphicsHardwareProfile,
    forcedBackend?: NativeGraphicsBackend,
): GraphicsBudgetDecision[] {
    const memory = Number.isFinite(hardware.deviceMemoryGiB) && hardware.deviceMemoryGiB > 0
        ? hardware.deviceMemoryGiB : 4;
    const threads = Number.isFinite(hardware.hardwareConcurrency) && hardware.hardwareConcurrency > 0
        ? hardware.hardwareConcurrency : 4;
    const maxContexts = memory <= 4 || threads <= 4 ? 1
        : memory < 8 || threads < 8 ? 2
        : memory < 16 || threads < 12 ? 3 : 4;
    const pixelBudget = memory <= 4 ? 6_000_000
        : memory <= 8 ? 12_000_000
        : memory <= 16 ? 24_000_000 : 36_000_000;
    const maxTextureSize = Math.max(0, Number(hardware.maxTextureSize) || 0);
    const priorityOf = (cell: GraphicsBudgetCellInput): number => {
        const area = Math.max(0, cell.width) * Math.max(0, cell.height);
        const workload = 1
            + Math.max(0, cell.indicatorCount) * 0.08
            + Math.max(0, cell.drawingLayerCount) * 0.025
            + Math.min(20_000, Math.max(0, cell.visibleBars)) / 20_000 * 0.12;
        return (cell.active ? 1e15 : 0) + (cell.visible ? 1e12 : 0) + area * workload;
    };
    const ordered = [...cells].sort((a, b) =>
        priorityOf(b) - priorityOf(a) || a.cellId.localeCompare(b.cellId));
    let remainingPixels = pixelBudget;
    let allocatedContexts = 0;
    const decisions = new Map<string, GraphicsBudgetDecision>();

    for (const cell of ordered) {
        const width = Math.max(0, Number(cell.width) || 0);
        const height = Math.max(0, Number(cell.height) || 0);
        const physicalDpr = Math.max(0.75, Math.min(4, Number(cell.devicePixelRatio) || 1));
        const rawPixels = width * height * physicalDpr * physicalDpr;
        const textureScale = maxTextureSize > 0 && Math.max(width, height) > 0
            ? maxTextureSize / (Math.max(width, height) * physicalDpr) : 1;
        const qualityTarget = cell.active ? 1 : cell.visible ? 0.82 : 0.68;
        const framePressure = cell.frameP95Ms > 20 || cell.frameBudgetMissRate > 0.25 ? 0.82
            : cell.frameP95Ms > 17 || cell.frameBudgetMissRate > 0.12 ? 0.92 : 1;
        // Existing canvas/GPU allocations count against the shared page budget too.
        // Use the larger of physical surface pixels and renderer-reported GPU estimates
        // to avoid double-counting the same surface while still respecting extra textures.
        const resourcePixels = Math.max(rawPixels, Math.max(0, Number(cell.estimatedGpuBytes) || 0) / 4);
        const pixelScale = resourcePixels > 0 ? Math.sqrt(Math.max(0, remainingPixels) / resourcePixels) : 1;
        const scale = Math.max(0.5, Math.min(1, qualityTarget, framePressure, pixelScale, textureScale));
        const estimatedPixels = resourcePixels * scale * scale;
        remainingPixels = Math.max(0, remainingPixels - estimatedPixels);

        let backend: NativeGraphicsBackend;
        if (forcedBackend) {
            backend = forcedBackend;
        } else if (hardware.webgl2Supported && cell.visible && allocatedContexts < maxContexts) {
            backend = 'webgl2';
            allocatedContexts += 1;
        } else {
            backend = 'canvas2d';
        }
        const glowEnabled = cell.active && cell.visible && cell.frameP95Ms <= 17
            && cell.frameBudgetMissRate <= 0.12 && scale >= 0.9;
        decisions.set(cell.cellId, {
            cellId: cell.cellId,
            backend,
            resolutionScale: scale,
            glowEnabled,
            priority: priorityOf(cell),
            estimatedPixels,
            reason: forcedBackend ? 'explicit backend override'
                : !cell.visible ? 'background or hidden chart'
                : backend === 'canvas2d' ? 'WebGL context budget'
                : scale < 0.9 ? 'pixel or frame-time budget' : 'active graphics budget',
        });
    }
    return cells.map(cell => decisions.get(cell.cellId)!).filter(Boolean);
}
