import { registerDrawingType } from './registry';
import { DEFAULT_DRAWING_COLOR } from './style';
import { svg24 } from '../icons';
import { ParallelChannel } from './types/ParallelChannel';
import { DisjointChannel } from './types/DisjointChannel';
import { FlatTopBottom } from './types/FlatTopBottom';
import { RegressionChannel } from './types/RegressionChannel';
import { Pitchfork } from './types/Pitchfork';
import { SchiffPitchfork } from './types/SchiffPitchfork';
import { ModifiedSchiffPitchfork } from './types/ModifiedSchiffPitchfork';
import { InsidePitchfork } from './types/InsidePitchfork';
import { Arrow } from './types/Arrow';
import { Ellipse } from './types/Ellipse';
import { Triangle } from './types/Triangle';
import { Polyline } from './types/Polyline';
import { Freehand } from './types/Freehand';
import { Highlighter } from './types/Highlighter';
import { Circle } from './types/Circle';
import { RotatedRect } from './types/RotatedRect';
import { Path } from './types/Path';
import { Arc } from './types/Arc';
import { Curve } from './types/Curve';
import { ArrowMarkUp, ArrowMarkDown } from './types/ArrowMark';
import { FlagMark, IconStamp } from './types/GlyphStamp';

export function registerAdvancedDrawingTypes(): void {
    // ── lines & channels ──
    const PARALLEL_ICON =
        svg24('<line x1="3" y1="16" x2="21" y2="8"/><line x1="3" y1="21" x2="21" y2="13"/>');
    const DISJOINT_ICON =
        svg24('<line x1="3" y1="7" x2="21" y2="10"/><line x1="3" y1="18" x2="21" y2="14"/>');
    const PITCHFORK_ICON =
        svg24('<circle cx="4" cy="12" r="1.6" fill="currentColor"/><line x1="4" y1="12" x2="10" y2="12"/><line x1="10" y1="6" x2="10" y2="18"/><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>');
    
    registerDrawingType({
        type: 'parallelchannel',
        group: 'channels',
        label: 'Parallel Channel',
        icon: PARALLEL_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}1a` },
        create: (init) => new ParallelChannel(init),
    });
    
    registerDrawingType({
        type: 'disjointchannel',
        group: 'channels',
        label: 'Disjoint Channel',
        icon: DISJOINT_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}1a` },
        create: (init) => new DisjointChannel(init),
    });
    
    const FLATTOP_ICON =
        svg24('<line x1="3" y1="7" x2="21" y2="7"/><line x1="3" y1="18" x2="21" y2="11"/>');
    
    registerDrawingType({
        type: 'flattopbottom',
        group: 'channels',
        label: 'Flat Top/Bottom',
        icon: FLATTOP_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}1a` },
        create: (init) => new FlatTopBottom(init),
    });
    
    const REGRESSION_ICON =
        svg24('<line x1="3" y1="8" x2="21" y2="4"/><line x1="3" y1="16" x2="21" y2="12"/><line x1="3" y1="12" x2="21" y2="8" stroke-dasharray="3 3"/>');
    
    registerDrawingType({
        type: 'regressionchannel',
        group: 'channels',
        label: 'Linear Regression',
        icon: REGRESSION_ICON,
        defaultStyle: { lineColor: NEUTRAL, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new RegressionChannel(init),
    });
    
    registerDrawingType({
        type: 'pitchfork',
        group: 'pitchforks',
        label: 'Pitchfork',
        icon: PITCHFORK_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new Pitchfork(init),
    });
    
    const SCHIFF_ICON =
        svg24('<circle cx="4" cy="8" r="1.6" fill="currentColor"/><line x1="4" y1="8" x2="10" y2="12"/><line x1="10" y1="6" x2="10" y2="18"/><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>');
    const MODSCHIFF_ICON =
        svg24('<circle cx="6" cy="9" r="1.6" fill="currentColor"/><line x1="6" y1="9" x2="10" y2="12"/><line x1="10" y1="6" x2="10" y2="18"/><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/>');
    const INSIDE_ICON =
        svg24('<line x1="4" y1="12" x2="10" y2="12"/><line x1="10" y1="8" x2="10" y2="16"/><line x1="10" y1="8" x2="21" y2="8"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="16" x2="21" y2="16"/>');
    
    registerDrawingType({
        type: 'schiffpitchfork',
        group: 'pitchforks',
        label: 'Schiff Pitchfork',
        icon: SCHIFF_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new SchiffPitchfork(init),
    });
    
    registerDrawingType({
        type: 'modifiedschiffpitchfork',
        group: 'pitchforks',
        label: 'Modified Schiff Pitchfork',
        icon: MODSCHIFF_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new ModifiedSchiffPitchfork(init),
    });
    
    registerDrawingType({
        type: 'insidepitchfork',
        group: 'pitchforks',
        label: 'Inside Pitchfork',
        icon: INSIDE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new InsidePitchfork(init),
    });
    
    // ── shapes & annotations ──
    const ARROW_ICON =
        svg24('<path d="M7 7h10v10"/><path d="M7 17 17 7"/>');
    const ELLIPSE_ICON = svg24('<ellipse cx="12" cy="12" rx="9" ry="6"/>');
    const TRIANGLE_ICON =
        svg24('<path d="M12 4 20 19 4 19Z"/>');
    
    registerDrawingType({
        type: 'arrow',
        group: 'shapes',
        label: 'Arrow',
        icon: ARROW_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', arrowRight: true },
        create: (init) => new Arrow(init),
    });
    
    registerDrawingType({
        type: 'ellipse',
        group: 'shapes',
        label: 'Ellipse',
        icon: ELLIPSE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}1a` },
        create: (init) => new Ellipse(init),
    });
    
    registerDrawingType({
        type: 'triangle',
        group: 'shapes',
        label: 'Triangle',
        icon: TRIANGLE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}1a` },
        create: (init) => new Triangle(init),
    });
    
    const POLYLINE_ICON =
        svg24('<polyline points="3 17 9 10 13 14 21 5"/>');
    const FREEHAND_ICON =
        svg24('<path d="M9.5 12 17 4.5a2.12 2.12 0 0 1 3 3L12.5 15"/><path d="M7 14a3 3 0 0 0-3 3c0 1.3-1.2 1.5-1.5 2 .8.9 2 1.5 3.5 1.5a3.5 3.5 0 0 0 3.5-3.5 3 3 0 0 0-2.5-3Z"/>');
    const HIGHLIGHTER_ICON =
        svg24('<path d="M9 11 15 5l4 4-6 6H9Z"/><path d="M9 15l-2 2"/><path d="M4 21h6"/>');
    
    registerDrawingType({
        type: 'polyline',
        group: 'shapes',
        label: 'Polyline',
        icon: POLYLINE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new Polyline(init),
    });
    
    registerDrawingType({
        type: 'freehand',
        group: 'shapes',
        label: 'Brush',
        icon: FREEHAND_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new Freehand(init),
    });
    
    registerDrawingType({
        type: 'highlighter',
        group: 'shapes',
        label: 'Highlighter',
        icon: HIGHLIGHTER_ICON,
        // A marker: wide + translucent by default (the alpha in the color is the highlight's see-through).
        defaultStyle: { lineColor: `${MARKER}59`, lineWidth: 14, lineStyle: 'solid' },
        create: (init) => new Highlighter(init),
    });
    
    const CIRCLE_ICON = svg24('<circle cx="12" cy="12" r="8"/>');
    const ROTRECT_ICON = svg24('<path d="M5 14 9.5 5 19 10 14.5 19 Z"/>');
    const PATH_ICON =
        svg24('<path d="M4 19 9 11 13 14 17 8 20 4"/><path d="M17.2 5.5 20 4 19.4 7.1"/>');
    const ARC_ICON =
        svg24('<path d="M4 17a8 8 0 0 1 16 0"/><path d="M4 17 20 17"/>');
    const CURVE_ICON = svg24('<path d="M4 18Q12 1 20 14"/>');
    const ARROW_UP_ICON =
        svg24('<path d="M12 5 12 19"/><path d="M6 11 12 5 18 11"/>');
    const ARROW_DOWN_ICON =
        svg24('<path d="M12 5 12 19"/><path d="M6 13 12 19 18 13"/>');
    
    registerDrawingType({
        type: 'circle',
        group: 'shapes',
        label: 'Circle',
        icon: CIRCLE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}1a` },
        create: (init) => new Circle(init),
    });
    
    registerDrawingType({
        type: 'rotatedrect',
        group: 'shapes',
        label: 'Rotated Rectangle',
        icon: ROTRECT_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}26` },
        create: (init) => new RotatedRect(init),
    });
    
    registerDrawingType({
        type: 'path',
        group: 'shapes',
        label: 'Path',
        icon: PATH_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new Path(init),
    });
    
    registerDrawingType({
        type: 'arc',
        group: 'shapes',
        label: 'Arc',
        icon: ARC_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid', fillColor: `${DEFAULT_DRAWING_COLOR}26` },
        create: (init) => new Arc(init),
    });
    
    registerDrawingType({
        type: 'curve',
        group: 'shapes',
        label: 'Curve',
        icon: CURVE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new Curve(init),
    });
    
    registerDrawingType({
        type: 'arrowmarkup',
        group: 'shapes',
        label: 'Arrow Mark Up',
        icon: ARROW_UP_ICON,
        defaultStyle: { lineColor: BULLISH, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new ArrowMarkUp(init),
    });
    
    registerDrawingType({
        type: 'arrowmarkdown',
        group: 'shapes',
        label: 'Arrow Mark Down',
        icon: ARROW_DOWN_ICON,
        defaultStyle: { lineColor: BEARISH, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new ArrowMarkDown(init),
    });
    
    // ── stamps (single-click glyph markers) ──
    const FLAG_MARK_ICON =
        svg24('<path d="M6 21V4"/><path d="M6 5h11l-2.5 3.5L17 12H6" fill="currentColor" stroke="none"/>');
    const ICON_STAMP_ICON =
        svg24('<path d="m12 3 2.6 5.8 6.4.6-4.8 4.2 1.4 6.2L12 16.9 6.4 19.8 7.8 13.6 3 9.4l6.4-.6Z"/>');
    
    registerDrawingType({
        type: 'flagmark',
        group: 'stamps',
        label: 'Flag',
        icon: FLAG_MARK_ICON,
        defaultStyle: { lineColor: ACCENT, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FlagMark(init),
    });
    
    registerDrawingType({
        type: 'iconstamp',
        group: 'stamps',
        label: 'Icon',
        icon: ICON_STAMP_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new IconStamp(init),
    });
    
}
