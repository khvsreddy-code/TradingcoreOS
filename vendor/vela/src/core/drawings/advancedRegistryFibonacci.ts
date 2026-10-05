import { registerDrawingType } from './registry';
import { DEFAULT_DRAWING_COLOR } from './style';
import { svg24 } from '../icons';
import { Circle } from './types/Circle';
import { Arc } from './types/Arc';
import { FibRetracement } from './types/FibRetracement';
import { FibExtension } from './types/FibExtension';
import { FibExtensionTrend } from './types/FibExtensionTrend';
import { FibFan } from './types/FibFan';
import { FibTimeZones } from './types/FibTimeZones';
import { FibChannel } from './types/FibChannel';
import { FibSpeedFan } from './types/FibSpeedFan';
import { TrendFibTime } from './types/TrendFibTime';
import { FibCircles } from './types/FibCircles';
import { FibArcs } from './types/FibArcs';
import { FibWedge } from './types/FibWedge';
import { FibSpiral } from './types/FibSpiral';
import { GannFan } from './types/GannFan';
import { GannBox } from './types/GannBox';
import { GannSquare } from './types/GannSquare';
import { DedekindTessellation } from './types/DedekindTessellation';
import { Sonic, Supersonic } from './types/MachFigure';
import { GoldenSonic, GoldenSupersonic } from './types/GoldenMach';

export function registerAdvancedDrawingTypes(): void {
    // ── fibonacci ──
    const FIB_RETRACE_ICON =
        svg24('<line x1="3" y1="5" x2="21" y2="5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="3" y1="14" x2="21" y2="14"/><line x1="3" y1="19" x2="21" y2="19"/>');
    
    const FIB_EXTEND_ICON =
        svg24('<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="11" x2="21" y2="11"/><line x1="3" y1="15" x2="14" y2="15"/><line x1="3" y1="20" x2="14" y2="20"/>');
    
    registerDrawingType({
        type: 'fibretracement',
        group: 'fibonacci',
        label: 'Fib Retracement',
        icon: FIB_RETRACE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibRetracement(init),
    });
    
    registerDrawingType({
        type: 'fibextension',
        group: 'fibonacci',
        label: 'Fib Extension',
        icon: FIB_EXTEND_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibExtension(init),
    });
    
    const FIB_TREND_ICON =
        svg24('<path d="M3 20 10 9l4 5"/><path d="M14 14h7M14 9h7M14 4h7"/>');
    
    registerDrawingType({
        type: 'fibextensiontrend',
        group: 'fibonacci',
        label: 'Trend-Based Fib Extension',
        icon: FIB_TREND_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibExtensionTrend(init),
    });
    
    const FIB_FAN_ICON =
        svg24('<path d="M4 20 20 5M4 20 21 11M4 20 21 17M4 20 20 20"/>');
    const FIB_TZ_ICON =
        svg24('<path d="M3 5v14M6 5v14M11 5v14M19 5v14"/>');
    
    registerDrawingType({
        type: 'fibfan',
        group: 'fibonacci',
        label: 'Fib Fan',
        icon: FIB_FAN_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibFan(init),
    });
    
    registerDrawingType({
        type: 'fibtimezones',
        group: 'fibonacci',
        label: 'Fib Time Zones',
        icon: FIB_TZ_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'dashed' },
        create: (init) => new FibTimeZones(init),
    });
    
    const FIB_CHANNEL_ICON =
        svg24('<path d="M3 18 18 9M5 21 20 12M6 13 21 4"/>');
    const FIB_SPEEDFAN_ICON =
        svg24('<path d="M4 4 20 20M4 4 20 12M4 4 12 20M4 4 20 4M4 4 4 20"/>');
    const FIB_TRENDTIME_ICON =
        svg24('<path d="M3 19 9 8M9 8 12 5v14M14 5v14M18 5v14M21 5v14"/>');
    
    registerDrawingType({
        type: 'fibchannel',
        group: 'fibonacci',
        label: 'Fib Channel',
        icon: FIB_CHANNEL_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibChannel(init),
    });
    
    registerDrawingType({
        type: 'fibspeedfan',
        group: 'fibonacci',
        label: 'Fib Speed Resistance Fan',
        icon: FIB_SPEEDFAN_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibSpeedFan(init),
    });
    
    registerDrawingType({
        type: 'trendfibtime',
        group: 'fibonacci',
        label: 'Trend-Based Fib Time',
        icon: FIB_TRENDTIME_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'dashed' },
        create: (init) => new TrendFibTime(init),
    });
    
    const FIB_CIRCLES_ICON =
        svg24('<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="6.5"/><circle cx="12" cy="12" r="10"/>');
    const FIB_ARCS_ICON =
        svg24('<path d="M8 20a4 4 0 0 1 8 0"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/><circle cx="12" cy="20" r="1.4" fill="currentColor" stroke="none"/>');
    const FIB_WEDGE_ICON =
        svg24('<path d="M4 20 20 16M4 20 14 4"/><path d="M11.8 18.1A8 8 0 0 0 8.2 13.2"/><path d="M16.6 16.9A13 13 0 0 0 10.9 9"/>');
    const FIB_SPIRAL_ICON =
        svg24('<path d="M13 12a2 2 0 1 1-2-2 4 4 0 0 1 4 4 6 6 0 0 1-9 5.2 9 9 0 0 1 .5-15"/>');
    
    registerDrawingType({
        type: 'fibcircles',
        group: 'fibonacci',
        label: 'Fib Circles',
        icon: FIB_CIRCLES_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibCircles(init),
    });
    
    registerDrawingType({
        type: 'fibarcs',
        group: 'fibonacci',
        label: 'Fib Speed Resistance Arcs',
        icon: FIB_ARCS_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibArcs(init),
    });
    
    registerDrawingType({
        type: 'fibwedge',
        group: 'fibonacci',
        label: 'Fib Wedge',
        icon: FIB_WEDGE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FibWedge(init),
    });
    
    registerDrawingType({
        type: 'fibspiral',
        group: 'fibonacci',
        label: 'Fib Spiral',
        icon: FIB_SPIRAL_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new FibSpiral(init),
    });
    
    // ── gann ──
    const GANN_FAN_ICON =
        svg24('<path d="M4 20 20 20M4 20 20 13M4 20 20 6M4 20 15 4M4 20 9 4M4 20 4 4"/>');
    const GANN_BOX_ICON =
        svg24('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 12h16M12 4v16M4 4 20 20" opacity="0.6"/>');
    
    registerDrawingType({
        type: 'gannfan',
        group: 'fibonacci',
        label: 'Gann Fan',
        icon: GANN_FAN_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new GannFan(init),
    });
    
    registerDrawingType({
        type: 'gannbox',
        group: 'fibonacci',
        label: 'Gann Box',
        icon: GANN_BOX_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new GannBox(init),
    });
    
    const GANN_SQUARE_ICON =
        svg24('<rect x="4" y="4" width="16" height="16" rx="1"/><path d="M4 20 20 4M4 20 20 12M4 20 12 4" opacity="0.7"/><path d="M4 20a16 16 0 0 1 16-16" opacity="0.5"/>');
    
    registerDrawingType({
        type: 'gannsquare',
        group: 'fibonacci',
        label: 'Gann Square',
        icon: GANN_SQUARE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new GannSquare(init),
    });
    
    const DEDEKIND_ICON = svg24(
        '<path d="M2 20h20"/><path d="M4 20a8 8 0 0 1 16 0" opacity="0.9"/>' +
            '<path d="M6 20a4 4 0 0 1 8 0" opacity="0.75"/><path d="M10 20a2 2 0 0 1 4 0" opacity="0.6"/>' +
            '<path d="M8 20v-6M12 20v-9M16 20v-6" opacity="0.45"/>',
    );
    
    registerDrawingType({
        type: 'dedekind',
        group: 'geometry',
        label: 'Dedekind Tessellation',
        icon: DEDEKIND_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new DedekindTessellation(init),
    });
    
    const SONIC_ICON = svg24(
        '<circle cx="16" cy="12" r="5" opacity="0.55"/><circle cx="13" cy="12" r="3.5" opacity="0.75"/><circle cx="10.5" cy="12" r="2"/>' +
            '<path d="M8 4v16"/>',
    );
    
    const SUPERSONIC_ICON = svg24(
        '<circle cx="17" cy="12" r="4.5" opacity="0.45"/><circle cx="13" cy="12" r="3" opacity="0.7"/><circle cx="10" cy="12" r="1.6"/>' +
            '<path d="M6 12 16 5M6 12 16 19"/>',
    );
    
    registerDrawingType({
        type: 'sonic',
        group: 'geometry',
        label: 'Sonic',
        icon: SONIC_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new Sonic(init),
    });
    
    registerDrawingType({
        type: 'supersonic',
        group: 'geometry',
        label: 'Supersonic',
        icon: SUPERSONIC_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new Supersonic(init),
    });
    
    const GOLDEN_SONIC_ICON = svg24(
        '<circle cx="16" cy="12" r="5" opacity="0.4"/><circle cx="13" cy="12" r="3.2" opacity="0.65"/><circle cx="10.8" cy="12" r="1.8"/>' +
            '<path d="M8 4v16"/><path d="M15 8.5h2M12.5 10h2" opacity="0.5"/>',
    );
    
    const GOLDEN_SUPERSONIC_ICON = svg24(
        '<circle cx="17" cy="12" r="4.5" opacity="0.4"/><circle cx="12.5" cy="12" r="2.8" opacity="0.65"/><circle cx="9.8" cy="12" r="1.4"/>' +
            '<path d="M6 12 16 5M6 12 16 19"/>',
    );
    
    registerDrawingType({
        type: 'goldensonic',
        group: 'geometry',
        label: 'Golden Sonic',
        icon: GOLDEN_SONIC_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new GoldenSonic(init),
    });
    
    registerDrawingType({
        type: 'goldensupersonic',
        group: 'geometry',
        label: 'Golden Supersonic',
        icon: GOLDEN_SUPERSONIC_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new GoldenSupersonic(init),
    });
    
    // ── patterns ──
}
