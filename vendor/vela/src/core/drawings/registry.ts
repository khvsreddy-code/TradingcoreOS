import { Drawing, type DrawingTypeKey, type SerializedDrawing } from './Drawing';
import type { DrawingStyle } from './style';
import { DEFAULT_DRAWING_COLOR } from './style';
import { svg24 } from '../icons';
import { ACCENT, BEARISH, BULLISH, INFO, MARKER, NEUTRAL } from '../palette';
import { TrendLine } from './types/TrendLine';
import { HorizontalLine } from './types/HorizontalLine';
import { Ray } from './types/Ray';
import { ExtendedLine } from './types/ExtendedLine';
import { VerticalLine } from './types/VerticalLine';
import { HorizontalRay } from './types/HorizontalRay';
import { CrossLine } from './types/CrossLine';
import { InfoLine } from './types/InfoLine';
import { TrendAngle } from './types/TrendAngle';
import { Box } from './types/Box';
import { TextLabel } from './types/TextLabel';
import { Note } from './types/Note';
import { PriceLabel } from './types/PriceLabel';
import { Callout } from './types/Callout';
import { PriceNote } from './types/PriceNote';
import { Comment } from './types/Comment';
import { Signpost } from './types/Signpost';
/** What a drawing type contributes to the toolbar + factory (renderer-neutral). */
export interface DrawingTypeMeta {
    type: DrawingTypeKey;
    /** Toolbar group id (e.g. `'lines'`, `'shapes'`, `'annotations'`). */
    group: string;
    label: string;
    /** Inline SVG markup for the toolbar button — no DOM, renderer paints it. */
    icon: string;
    defaultStyle: DrawingStyle;
    /** The tool's body REPLACES the series pixels inside its area (an opaque inset): a fresh
     *  instance then starts ABOVE the pane's series stack instead of just under the candles —
     *  under them its content would be buried. The user can still reorder it afterwards. */
    coversSeries?: boolean;
    /** One short sentence prompting the placement gesture, shown by the renderer at the
     *  bottom of the chart while the tool is armed and no placement has started yet. */
    placementHint?: string;
    /** Build an instance from a (partial) serialized record. Serves create + deserialize. */
    create(init: Partial<SerializedDrawing> & { paneId: string }): Drawing;
}

const REGISTRY = new Map<string, DrawingTypeMeta>();

/** Register (or replace) a drawing type. Built-ins register at module load; new
 *  types (fibs/patterns) call this — no base/port/facade change. */
export function registerDrawingType(meta: DrawingTypeMeta): void {
    REGISTRY.set(meta.type, meta);
}

export function getDrawingType(type: string): DrawingTypeMeta | undefined {
    return REGISTRY.get(type) ?? lazyDrawingTypes(drawingFamilyForType(type as DrawingTypeKey)).find((meta) => meta.type === type);
}

export function drawingTypes(): DrawingTypeMeta[] {
    return [...REGISTRY.values()];
}

export function allDrawingTypeMetadata(): DrawingTypeMeta[] {
    return [...REGISTRY.values(), ...lazyDrawingTypes()];
}

/** Build a fresh drawing of `type` on `paneId`, seeding the type's default style. */
export function createDrawing(type: DrawingTypeKey, init: Partial<SerializedDrawing> & { paneId: string }): Drawing | null {
    const meta = REGISTRY.get(type);
    if (!meta) return null;
    // Merge any caller style onto the type's default so a partial override keeps the
    // rest (e.g. a box keeps its default fill when only the line color is set), and an
    // absent/undefined style doesn't clobber the default.
    const style = { ...meta.defaultStyle, ...(init.style ?? {}) };
    return meta.create({ ...init, style });
}

/**
 * Restore a drawing's cosmetics + type extras to the type's factory defaults.
 * Keeps identity / geometry / lock / visibility / z-order, and preserves typed
 * text content (`text.value`) when the type seeds a text block.
 */
export function resetDrawingSettings(drawing: Drawing): void {
    const fresh = createDrawing(drawing.type, { paneId: drawing.paneId });
    if (!fresh) return;
    drawing.style = { ...fresh.style };
    const keptValue = drawing.text?.value;
    if (fresh.text) {
        drawing.text = { ...fresh.text };
        if (keptValue !== undefined) drawing.text.value = keptValue;
    } else {
        // Drop lazily-created text styling (e.g. measure-box label color/size).
        drawing.text = undefined;
    }
    const props = fresh.serialize().props;
    if (props !== undefined) drawing.applyProps(props);
}

/** Rehydrate a {@link Drawing} from a plain record, or null for an unknown type. */
export function deserializeDrawing(doc: SerializedDrawing): Drawing | null {
    const meta = REGISTRY.get(doc.type);
    return meta ? meta.create(doc) : null;
}

// ── built-in lean-core types ──
const LINE_ICON = svg24('<line x1="4" y1="19" x2="20" y2="5"/>');
const HLINE_ICON = svg24('<line x1="3" y1="12" x2="21" y2="12"/>');

registerDrawingType({
    type: 'trendline',
    group: 'lines',
    label: 'Trend Line',
    icon: LINE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
    create: (init) => new TrendLine(init),
});

registerDrawingType({
    type: 'hline',
    group: 'lines',
    label: 'Horizontal Line',
    icon: HLINE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'dashed' },
    create: (init) => new HorizontalLine(init),
});

const RAY_ICON = svg24('<line x1="3" y1="20" x2="21" y2="6"/><circle cx="3" cy="20" r="1.6" fill="currentColor"/>');
const BOX_ICON = svg24('<rect x="4" y="6" width="16" height="12" rx="1"/>');
const TEXT_ICON = svg24('<path d="M5 6h14M12 6v13"/>');

registerDrawingType({
    type: 'ray',
    group: 'lines',
    label: 'Ray',
    icon: RAY_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
    create: (init) => new Ray(init),
});

const EXTLINE_ICON =
    svg24('<path d="M5 19 19 5"/><path d="M5 19 8.5 19M5 19 5 15.5"/><path d="M19 5 15.5 5M19 5 19 8.5"/>');
const VLINE_ICON = svg24('<line x1="12" y1="3" x2="12" y2="21"/>');
const HRAY_ICON =
    svg24('<line x1="5" y1="12" x2="21" y2="12"/><circle cx="5" cy="12" r="1.6" fill="currentColor"/>');
const CROSSLINE_ICON =
    svg24('<line x1="3" y1="12" x2="21" y2="12"/><line x1="12" y1="3" x2="12" y2="21"/>');
const INFOLINE_ICON =
    svg24('<path d="M4 20 20 4"/><rect x="9" y="9" width="9" height="6" rx="1"/>');
const TRENDANGLE_ICON =
    svg24('<path d="M4 20 20 6"/><path d="M4 20 15 20"/><path d="M11 20a7 7 0 0 0-2-4.9"/>');

registerDrawingType({
    type: 'extendedline',
    group: 'lines',
    label: 'Extended Line',
    icon: EXTLINE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
    create: (init) => new ExtendedLine(init),
});

registerDrawingType({
    type: 'vline',
    group: 'lines',
    label: 'Vertical Line',
    icon: VLINE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
    create: (init) => new VerticalLine(init),
});

registerDrawingType({
    type: 'hray',
    group: 'lines',
    label: 'Horizontal Ray',
    icon: HRAY_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
    create: (init) => new HorizontalRay(init),
});

registerDrawingType({
    type: 'crossline',
    group: 'lines',
    label: 'Cross Line',
    icon: CROSSLINE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
    create: (init) => new CrossLine(init),
});

registerDrawingType({
    type: 'infoline',
    group: 'lines',
    label: 'Info Line',
    icon: INFOLINE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
    create: (init) => new InfoLine(init),
});

registerDrawingType({
    type: 'trendangle',
    group: 'lines',
    label: 'Trend Angle',
    icon: TRENDANGLE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
    create: (init) => new TrendAngle(init),
});

registerDrawingType({
    type: 'box',
    group: 'shapes',
    label: 'Rectangle',
    icon: BOX_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}26` },
    create: (init) => new Box(init),
});

registerDrawingType({
    type: 'text',
    group: 'annotations',
    label: 'Text',
    icon: TEXT_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
    create: (init) => new TextLabel(init),
});

const CALLOUT_ICON =
    svg24('<path d="M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-6l-5 5v-5H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/>');

registerDrawingType({
    type: 'callout',
    group: 'annotations',
    label: 'Callout',
    icon: CALLOUT_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}d9` },
    create: (init) => new Callout(init),
});

const NOTE_ICON = svg24('<path d="M5 4h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-7l-4 4v-4H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"/><path d="M8 8.5h8M8 12h5"/>');
const PRICE_NOTE_ICON = svg24('<rect x="10" y="4.5" width="11" height="8" rx="1.5"/><path d="M10 8.5 4 16"/><circle cx="3.5" cy="16.5" r="1.6" fill="currentColor" stroke="none"/>');
const COMMENT_ICON = svg24('<path d="M5 4.5h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-7l-4 4v-4H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2Z"/>');
const PRICE_LABEL_ICON = svg24('<path d="M3 12 7 8h12a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7Z"/><path d="M10.5 12.5h6" stroke-width="1.4"/>');
const SIGNPOST_ICON = svg24('<path d="M12 11.5V21"/><rect x="5" y="4" width="14" height="7" rx="1"/><path d="M9 7.5h6"/>');

registerDrawingType({
    type: 'note',
    group: 'annotations',
    label: 'Note',
    icon: NOTE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}d9` },
    create: (init) => new Note(init),
});

registerDrawingType({
    type: 'pricenote',
    group: 'annotations',
    label: 'Price Note',
    icon: PRICE_NOTE_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}d9` },
    create: (init) => new PriceNote(init),
});

registerDrawingType({
    type: 'comment',
    group: 'annotations',
    label: 'Comment',
    icon: COMMENT_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}d9` },
    create: (init) => new Comment(init),
});

registerDrawingType({
    type: 'pricelabel',
    group: 'annotations',
    label: 'Price Label',
    icon: PRICE_LABEL_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}d9` },
    create: (init) => new PriceLabel(init),
});

registerDrawingType({
    type: 'signpost',
    group: 'annotations',
    label: 'Signpost',
    icon: SIGNPOST_ICON,
    defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}d9` },
    create: (init) => new Signpost(init),
});


export type AdvancedDrawingFamily = 'channels' | 'fibonacci' | 'patterns';

const ADVANCED_DRAWING_TYPES: Readonly<Record<AdvancedDrawingFamily, readonly DrawingTypeKey[]>> = Object.freeze({
    channels: Object.freeze([
        'parallelchannel','disjointchannel','flattopbottom','regressionchannel',
        'pitchfork','schiffpitchfork','modifiedschiffpitchfork','insidepitchfork',
        'arrow','ellipse','triangle','polyline','freehand','highlighter','circle','rotatedrect','path','arc','curve',
        'arrowmarkup','arrowmarkdown','flagmark','iconstamp',
    ]),
    fibonacci: Object.freeze([
        'fibretracement','fibextension','fibextensiontrend','fibfan','fibtimezones','fibchannel','fibspeedfan','trendfibtime',
        'fibcircles','fibarcs','fibwedge','fibspiral','gannfan','gannbox','gannsquare','dedekind',
        'sonic','supersonic','goldensonic','goldensupersonic',
        'anchoredvwap','fixedrangevp','position','datepricerange','magnifier',
    ]),
    patterns: Object.freeze([
        'xabcd','abcd','headshoulders','elliottimpulse','elliottcorrection',
        'gartley','bat','butterfly','crab','shark','cypher',
    ]),
});

export const ADVANCED_DRAWING_FAMILIES = Object.freeze([
    'channels','fibonacci','patterns',
] as const);

const ADVANCED_DRAWING_FAMILY_BY_TYPE = new Map<DrawingTypeKey, AdvancedDrawingFamily>(
    ADVANCED_DRAWING_FAMILIES.flatMap((family) => ADVANCED_DRAWING_TYPES[family].map((type) => [type, family] as const)),
);

function prettyLazyDrawingLabel(type: DrawingTypeKey): string {
    return type.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]+/g, ' ').replace(/\b\w/g, (value) => value.toUpperCase());
}

/** Metadata for tools whose implementation is intentionally not imported yet. */
export function lazyDrawingTypes(family?: AdvancedDrawingFamily): DrawingTypeMeta[] {
    const families = family ? [family] : ADVANCED_DRAWING_FAMILIES;
    const out: DrawingTypeMeta[] = [];
    for (const currentFamily of families) {
        for (const type of ADVANCED_DRAWING_TYPES[currentFamily]) {
            if (REGISTRY.has(type)) continue;
            out.push({
                type,
                group: currentFamily === 'channels' ? (['parallelchannel','disjointchannel','flattopbottom','regressionchannel'].includes(type) ? 'channels' : 'pitchforks')
                    : currentFamily === 'fibonacci' ? (type.startsWith('fib') || type.startsWith('trendfib') || type.startsWith('gann') || ['dedekind','sonic','supersonic','goldensonic','goldensupersonic'].includes(type) ? 'fibonacci' : 'measure')
                    : ['xabcd','abcd','headshoulders','elliottimpulse','elliottcorrection','gartley','bat','butterfly','crab','shark','cypher'].includes(type) ? 'patterns' : 'harmonics',
                label: prettyLazyDrawingLabel(type),
                icon: svg24('<circle cx="12" cy="12" r="7"/>'),
                defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
                create: () => { throw new Error(`Drawing type '${type}' is not loaded; load its advanced drawing family before creating it.`); },
            });
        }
    }
    return out;
}

export function drawingFamilyForType(type: DrawingTypeKey): AdvancedDrawingFamily | undefined {
    return ADVANCED_DRAWING_FAMILY_BY_TYPE.get(type);
}

const advancedFamilyPromises = new Map<AdvancedDrawingFamily, Promise<void>>();

export function loadDrawingFamily(family: AdvancedDrawingFamily): Promise<void> {
    const existing = advancedFamilyPromises.get(family);
    if (existing) return existing;
    const promise = (
        family === 'channels'
            ? import('./advancedRegistryChannels').then((module) => module.registerAdvancedDrawingTypes())
            : family === 'fibonacci'
                ? import('./advancedRegistryFibonacci').then((module) => module.registerAdvancedDrawingTypes())
                : import('./advancedRegistryPatterns').then((module) => module.registerAdvancedDrawingTypes())
    ).then(() => undefined);
    advancedFamilyPromises.set(family, promise);
    return promise;
}

export function loadDrawingFamiliesForTypes(types: readonly DrawingTypeKey[]): Promise<void> {
    const families = [...new Set(types.map((type) => drawingFamilyForType(type)).filter((family): family is AdvancedDrawingFamily => family !== undefined))];
    return Promise.all(families.map(loadDrawingFamily)).then(() => undefined);
}

/** Load all heavyweight drawing families for compatibility callers that explicitly request the full catalog. */
export function loadAdvancedDrawingCatalog(): Promise<void> {
    return Promise.all(ADVANCED_DRAWING_FAMILIES.map(loadDrawingFamily)).then(() => undefined);
}
