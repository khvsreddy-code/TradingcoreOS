import type { CoordinateSystem } from './CoordinateSystem';
import type { ViewportState } from './ViewportState';
import { clampBarSpacing } from './ViewportState';
import type { SnapMode } from '../../../core/drawings';
import type { FreePanEvent, FreePanTrigger } from '../../../core/options';

/** Whether `e` satisfies the configured {@link FreePanTrigger} (mouse/pen only; touch stays a time pan). */
export function matchesFreePan(trigger: FreePanTrigger, e: FreePanEvent): boolean {
    if (!trigger || e.pointerType === 'touch') return false;
    if (typeof trigger === 'function') return Boolean(trigger(e));
    if (e.button !== 0) return false;
    if (trigger === true || trigger === 'drag') return !e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
    if (trigger === 'alt') return e.altKey && !e.shiftKey && !e.ctrlKey && !e.metaKey;
    if (trigger === 'shift') return e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey;
    if (trigger === 'mod') return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey;
    return false;
}

export interface InputControllerDeps {
    getCoords(): CoordinateSystem;
    /** Apply a viewport instantly (drag pan, freeze-on-touch); stops any animation. */
    apply(viewport: ViewportState): void;
    /** Eased cursor-anchored zoom: glide barSpacing â†’ target, pinning `anchorLogical` at `anchorX`. */
    zoomTo(targetBarSpacing: number, anchorLogical: number, anchorX: number): void;
    /** Inertial pan: continue with this rightOffset vel¶»§q«^