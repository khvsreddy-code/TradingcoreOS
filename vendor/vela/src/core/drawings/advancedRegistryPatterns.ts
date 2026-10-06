import { registerDrawingType } from './registry';
import { DEFAULT_DRAWING_COLOR } from './style';
import { ACCENT, BEARISH, BULLISH, INFO, MARKER, NEUTRAL } from '../palette';
import { svg24 } from '../icons';
import { AnchoredVwap } from './types/AnchoredVwap';
import { FixedRangeVolumeProfile } from './types/FixedRangeVolumeProfile';
import { XABCD } from './types/XABCD';
import { ABCDPattern } from './types/ABCDPattern';
import { ElliottImpulse } from './types/ElliottImpulse';
import { ElliottCorrection } from './types/ElliottCorrection';
import { HeadShoulders } from './types/HeadShoulders';
import { Gartley } from './types/Gartley';
import { Bat } from './types/Bat';
import { Butterfly } from './types/Butterfly';
import { Crab } from './types/Crab';
import { Shark } from './types/Shark';
import { Cypher } from './types/Cypher';
import { DatePriceRange } from './types/DatePriceRange';
import { PositionTool } from './types/PositionTool';
import { Magnifier } from './types/Magnifier';

export function registerAdvancedDrawingTypes(): void {
    const XABCD_ICON = svg24('<path d="M3 18 7 8 11 14 15 6 20 16"/>');
    const ABCD_ICON = svg24('<path d="M4 17 9 7 14 15 20 5"/>');
    const ELLIOTT_IMPULSE_ICON = svg24('<path d="M3 19 8 9 12 13 17 5 21 9"/>');
    const ELLIOTT_CORRECTION_ICON = svg24('<path d="M4 7 11 16 20 9"/>');
    const HEAD_SHOULDERS_ICON = svg24('<path d="M3 18 6 12 9 16 12 5 15 16 18 12 21 18"/>');
    
    registerDrawingType({
        type: 'xabcd',
        group: 'patterns',
        label: 'XABCD Pattern',
        icon: XABCD_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new XABCD(init),
    });
    
    registerDrawingType({
        type: 'abcd',
        group: 'patterns',
        label: 'ABCD Pattern',
        icon: ABCD_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new ABCDPattern(init),
    });
    
    registerDrawingType({
        type: 'elliottimpulse',
        group: 'patterns',
        label: 'Elliott Impulse Wave (1-5)',
        icon: ELLIOTT_IMPULSE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new ElliottImpulse(init),
    });
    
    registerDrawingType({
        type: 'elliottcorrection',
        group: 'patterns',
        label: 'Elliott Correction Wave (ABC)',
        icon: ELLIOTT_CORRECTION_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new ElliottCorrection(init),
    });
    
    registerDrawingType({
        type: 'headshoulders',
        group: 'patterns',
        label: 'Head & Shoulders',
        icon: HEAD_SHOULDERS_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new HeadShoulders(init),
    });
    
    // Named harmonics (XABCD with validated Fibonacci bands) — share an XABCD-shaped icon; the label names them.
    const HARMONIC_ICON = svg24('<path d="M3 17 7 6 12 14 17 5 21 16"/><path d="M3 17 21 16" opacity="0.45"/>');
    const harmonic = { group: 'patterns' as const, icon: HARMONIC_ICON, defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' as const } };
    
    registerDrawingType({ type: 'gartley', label: 'Gartley', ...harmonic, create: (init) => new Gartley(init) });
    registerDrawingType({ type: 'bat', label: 'Bat', ...harmonic, create: (init) => new Bat(init) });
    registerDrawingType({ type: 'butterfly', label: 'Butterfly', ...harmonic, create: (init) => new Butterfly(init) });
    registerDrawingType({ type: 'crab', label: 'Crab', ...harmonic, create: (init) => new Crab(init) });
    registerDrawingType({ type: 'shark', label: 'Shark', ...harmonic, create: (init) => new Shark(init) });
    registerDrawingType({ type: 'cypher', label: 'Cypher', ...harmonic, create: (init) => new Cypher(init) });
    
    // ── measurement ──
    const MEASURE_ICON =
        svg24('<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M4 18 20 6" opacity="0.5"/>');
    
    registerDrawingType({
        type: 'datepricerange',
        group: 'measure',
        label: 'Date & Price Range',
        icon: MEASURE_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new DatePriceRange(init),
    });
    
    // ── positions ──
    // Shaded target zone above the entry edge, hollow stop zone below it.
    const POSITION_ICON = svg24(
        '<rect x="4.5" y="4.5" width="15" height="7.5" rx="1" fill="currentColor" fill-opacity="0.25"/>' +
            '<rect x="4.5" y="12" width="15" height="7.5" rx="1"/>',
    );
    
    registerDrawingType({
        type: 'position',
        group: 'measure',
        label: 'Long/Short Position',
        icon: POSITION_ICON,
        defaultStyle: { lineColor: DEFAULT_DRAWING_COLOR, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new PositionTool(init),
    });
    
    // ── magnifier (lower-timeframe inset) ──
    const MAGNIFIER_ICON = svg24(
        '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.3 15.3 5.2 5.2"/><path d="M8 12.5v-3M10.5 13.5v-5.5M13 12v-2"/>',
    );
    
    registerDrawingType({
        type: 'magnifier',
        group: 'measure',
        label: 'Magnifier',
        icon: MAGNIFIER_ICON,
        // An empty border color means the THEME's contrast ink (white on dark, black on
        // light), resolved at paint time so it follows theme switches; a user pick wins.
        defaultStyle: { lineColor: '', lineWidth: 1, lineStyle: 'solid' },
        coversSeries: true, // the inset's backdrop must sit over the base candles it replaces
        placementHint: 'Drag an area on the chart to view it at a lower timeframe',
        create: (init) => new Magnifier(init),
    });
    
    // ── anchored VWAP ──
    const VWAP_ICON =
        svg24('<line x1="5" y1="3" x2="5" y2="21"/><path d="M5 16c4 0 5-9 8-9s3 5 8 3"/>');
    
    registerDrawingType({
        type: 'anchoredvwap',
        group: 'measure',
        label: 'Anchored VWAP',
        icon: VWAP_ICON,
        defaultStyle: { lineColor: INFO, lineWidth: 2, lineStyle: 'solid' },
        create: (init) => new AnchoredVwap(init),
    });
    
    // ── fixed-range volume profile ──
    const FRVP_ICON =
        svg24('<path d="M4 4v16"/><path d="M4 8h10"/><path d="M4 12h14"/><path d="M4 16h8"/><path d="M4 20h12"/>');
    
    registerDrawingType({
        type: 'fixedrangevp',
        group: 'measure',
        label: 'Fixed Range Volume Profile',
        icon: FRVP_ICON,
        defaultStyle: { lineColor: BULLISH, lineWidth: 1, lineStyle: 'solid' },
        create: (init) => new FixedRangeVolumeProfile(init),
    });
    
}
