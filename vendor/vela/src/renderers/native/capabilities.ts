import type { RendererCapabilities } from '../../core/ports/IChartRenderer';

/**
 * What the native renderer supports. Updated as phases land — P0 declares the
 * eventual target so capability-gated core logic behaves; features not yet
 * drawn are simply blank until their phase ships (tracked behind the playground
 * renderer toggle, with LwC as the parity oracle).
 */
export const NATIVE_CAPABILITIES: RendererCapabilities = {
    panes: true,
    paneManagement: true, // move/merge indicators, reorder + collapse/maximize panes
    fills: 'native', // first-class band primitive (no per-frame polygon rebuild)
    bgcolor: 'native',
    hline: 'native',
    markers: true,
    barcolor: 'native', // per-bar candle color channel
    perPointColor: true, // per-point color as a first-class attribute (no series split)
    drawings: true,
    userDrawings: true, // interactive drawing tools (toolbar + hit-test + handles)
    drawingDepth: true, // drawings share the series' z space (backend-composited interleave layers)
    tables: true, // canvas-painted into the owning indicator's interleave slice
    trades: true, // strategy order-fill markers (arrows + labels + fill-price ticks)
    timelineMarks: true, // host events on a lane above the time axis (glyphs + detail popup)
    inputsUI: true, // reuses the DOM InputsUI
};

/** Conservative public limits from a short-lived WebGL2 probe. Browsers do not expose
 * dedicated VRAM or a reliable maximum-context count, so the budgeter uses these limits
 * together with measured per-chart allocations and device hints. */
export interface WebGL2CapabilityProfile {
    supported: boolean;
    maxTextureSize: number;
    maxRenderbufferSize: number;
    maxViewportWidth: number;
    maxViewportHeight: number;
}

let webgl2Profile: WebGL2CapabilityProfile | null = null;

export function getWebGL2CapabilityProfile(): WebGL2CapabilityProfile {
    if (webgl2Profile) return webgl2Profile;
    const unsupported: WebGL2CapabilityProfile = {
        supported: false, maxTextureSize: 0, maxRenderbufferSize: 0,
        maxViewportWidth: 0, maxViewportHeight: 0,
    };
    if (typeof document === 'undefined') {
        webgl2Profile = unsupported;
        return webgl2Profile;
    }
    let gl: WebGL2RenderingContext | null = null;
    try {
        const canvas = document.createElement('canvas');
        gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
        if (!gl) {
            webgl2Profile = unsupported;
            return webgl2Profile;
        }
        const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
        webgl2Profile = {
            supported: true,
            maxTextureSize: Number(gl.getParameter(gl.MAX_TEXTURE_SIZE)) || 0,
            maxRenderbufferSize: Number(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)) || 0,
            maxViewportWidth: Number(viewport?.[0]) || 0,
            maxViewportHeight: Number(viewport?.[1]) || 0,
        };
    } catch {
        webgl2Profile = unsupported;
    } finally {
        // A capability probe must not consume a scarce page WebGL context.
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
    }
    return webgl2Profile;
}

export function supportsWebGL2(): boolean {
    return getWebGL2CapabilityProfile().supported;
}
