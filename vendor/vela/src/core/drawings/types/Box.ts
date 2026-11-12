import { msg } from '../../i18n/message';
import type { LineStyle } from '../../model/series';
import { Drawing, type AnchorSlot, type SerializedDrawing } from '../Drawing';
import type { DrawingPoint, Projector } from '../geometry';
import type { SettingsSchema } from '../schema';
import { TEXT_FIELDS, BORDER_FIELDS, LINE_STYLE_OPTIONS } from '../schema';
import { distToSegment, handleAt, pointInBox } from '../hittest';

/** A rectangle's own settings (round-trip through `props`). */
export interface BoxSettings {
    /** A line at the halfway price between the top and the bottom. */
    midline: boolean;
    /** The midline's color; absent = the border color, followed as it changes. */
    midColor?: string;
    midStyle: LineStyle;
}

function defaults(): BoxSettings {
    return { midline: false, midStyle: 'dashed' };
}

const LINE_STYLES = new Set<string>(LINE_STYLE_OPTIONS.map((o) => o.value));
const MIDLINE_ON = { path: 'box.midline', in: [true] } as const;

/**
 * A rectangle defined by two opposite corners. Optional fill + border, and an optional midline
 * at the halfway price.
 *
 * Eight handles: the two anchor corners (0, 1), the other two corners (2, 3), then the edge
 * midpoints (4â€“7). Corners resize both ways; an edge handle moves only its own side.
 */
export class Box extends Drawing {
    readonly type = 'box' as const;
    declare box: BoxSettings;

    constructor(init: Partial<SerializedDrawing> & { paneId: string }) {
        super(init);
        if ¶»§q«^