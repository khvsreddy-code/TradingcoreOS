import { CoreDrawingKind } from './coreDrawing';

export type DrawingToolInteraction = 'single-point' | 'two-point' | 'three-point' | 'four-point' | 'multi-point' | 'freehand';
export type DrawingToolCoordinateSpace = 'data' | 'viewport';

export type CoreDrawingToolDefinition = {
  kind: CoreDrawingKind;
  category: 'trend' | 'geometry' | 'fibonacci' | 'gann' | 'annotation' | 'measurement' | 'pattern' | 'prediction' | 'freehand' | 'system';
  label: string;
  interaction: DrawingToolInteraction;
  coordinateSpace: DrawingToolCoordinateSpace;
  minPoints: number;
  maxPoints?: number;
  extendsToViewport?: boolean;
  measurement?: boolean;
  description: string;
  uiReady?: boolean;
  accepts: (pointCount: number) => boolean;
};

const define = (entry: Omit<CoreDrawingToolDefinition, 'accepts'>): CoreDrawingToolDefinition => ({
  ...entry,
  accepts: (count: number) => count >= entry.minPoints && (entry.maxPoints == null || count <= entry.maxPoints),
});

export const CORE_DRAWING_TOOLS: readonly CoreDrawingToolDefinition[] = [
  define({ kind: 'trendline', category: 'trend', label: 'Trend line', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, uiReady: true, description: 'Finite line between two data anchors.' }),
  define({ kind: 'ray', category: 'trend', label: 'Ray', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, extendsToViewport: true, uiReady: true, description: 'Line through two anchors extended forward.' }),
  define({ kind: 'extendedLine', category: 'trend', label: 'Extended line', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, extendsToViewport: true, uiReady: true, description: 'Line extended through both directions.' }),
  define({ kind: 'horizontal', category: 'trend', label: 'Horizontal line', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, extendsToViewport: true, uiReady: true, description: 'Price level across the pane.' }),
  define({ kind: 'horizontalRay', category: 'trend', label: 'Horizontal ray', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, extendsToViewport: true, uiReady: true, description: 'Forward price level.' }),
  define({ kind: 'vertical', category: 'trend', label: 'Vertical line', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, extendsToViewport: true, uiReady: true, description: 'Time level across the pane.' }),
  define({ kind: 'crossline', category: 'trend', label: 'Cross line', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, extendsToViewport: true, description: 'Time and price crosshair marker.' }),
  define({ kind: 'parallelChannel', category: 'geometry', label: 'Parallel channel', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, uiReady: true, description: 'Base line plus offset anchor.' }),
  define({ kind: 'disjointChannel', category: 'geometry', label: 'Disjoint channel', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Non-overlapping channel geometry.' }),
  define({ kind: 'flatChannel', category: 'geometry', label: 'Flat channel', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, description: 'Parallel horizontal channel.' }),
  define({ kind: 'rectangle', category: 'geometry', label: 'Rectangle', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, uiReady: true, description: 'Axis-aligned data region.' }),
  define({ kind: 'rotatedRectangle', category: 'geometry', label: 'Rotated rectangle', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Three-anchor rotated region.' }),
  define({ kind: 'ellipse', category: 'geometry', label: 'Ellipse', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, uiReady: true, description: 'Ellipse bounded by two anchors.' }),
  define({ kind: 'circle', category: 'geometry', label: 'Circle', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, description: 'Equal-radius circle from bounding anchors.' }),
  define({ kind: 'triangle', category: 'geometry', label: 'Triangle', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Three-anchor triangle.' }),
  define({ kind: 'fib', category: 'fibonacci', label: 'Fibonacci retracement', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, uiReady: true, description: 'Derived retracement levels.' }),
  define({ kind: 'fibExtension', category: 'fibonacci', label: 'Fibonacci extension', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, uiReady: true, description: 'Derived extension levels.' }),
  define({ kind: 'fibChannel', category: 'fibonacci', label: 'Fibonacci channel', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Parallel Fibonacci channel levels.' }),
  define({ kind: 'fibTime', category: 'fibonacci', label: 'Fibonacci time', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, description: 'Time ratios from two anchors.' }),
  define({ kind: 'fibSpeedResistanceFan', category: 'fibonacci', label: 'Fib speed/resistance fan', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, description: 'Angular Fibonacci fan.' }),
  define({ kind: 'pitchfork', category: 'fibonacci', label: 'Pitchfork', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, uiReady: true, description: 'Median-line geometry.' }),
  define({ kind: 'schiffPitchfork', category: 'fibonacci', label: 'Schiff pitchfork', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Shifted median-line geometry.' }),
  define({ kind: 'modifiedSchiffPitchfork', category: 'fibonacci', label: 'Modified Schiff pitchfork', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Modified shifted median-line geometry.' }),
  define({ kind: 'insidePitchfork', category: 'fibonacci', label: 'Inside pitchfork', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Inside median-line geometry.' }),
  define({ kind: 'gannBox', category: 'gann', label: 'Gann box', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, description: 'Time/price Gann box.' }),
  define({ kind: 'gannSquare', category: 'gann', label: 'Gann square', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, description: 'Fixed-ratio Gann square.' }),
  define({ kind: 'gannFan', category: 'gann', label: 'Gann fan', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, description: 'Angular Gann fan.' }),
  define({ kind: 'arrow', category: 'trend', label: 'Arrow', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, uiReady: true, description: 'Directed line.' }),
  define({ kind: 'priceRange', category: 'measurement', label: 'Price range', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, measurement: true, uiReady: true, description: 'Price distance measurement.' }),
  define({ kind: 'dateRange', category: 'measurement', label: 'Date range', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, measurement: true, uiReady: true, description: 'Time distance measurement.' }),
  define({ kind: 'datePriceRange', category: 'measurement', label: 'Date + price range', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, measurement: true, description: 'Combined time and price measurement.' }),
  define({ kind: 'measure', category: 'measurement', label: 'Measure', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, measurement: true, uiReady: true, description: 'Generic time/price measurement.' }),
  define({ kind: 'brush', category: 'freehand', label: 'Brush', interaction: 'freehand', coordinateSpace: 'data', minPoints: 2, uiReady: true, description: 'Freehand data path.' }),
  define({ kind: 'highlighter', category: 'freehand', label: 'Highlighter', interaction: 'freehand', coordinateSpace: 'data', minPoints: 2, uiReady: true, description: 'Wide freehand data path.' }),
  define({ kind: 'path', category: 'freehand', label: 'Path', interaction: 'multi-point', coordinateSpace: 'data', minPoints: 2, description: 'Arbitrary connected path.' }),
  define({ kind: 'polyline', category: 'freehand', label: 'Polyline', interaction: 'multi-point', coordinateSpace: 'data', minPoints: 2, description: 'Polyline with explicit vertices.' }),
  define({ kind: 'curve', category: 'freehand', label: 'Curve', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Three-anchor smooth curve.' }),
  define({ kind: 'doubleCurve', category: 'freehand', label: 'Double curve', interaction: 'four-point', coordinateSpace: 'data', minPoints: 4, maxPoints: 4, description: 'Four-anchor paired curve.' }),
  define({ kind: 'arc', category: 'geometry', label: 'Arc', interaction: 'three-point', coordinateSpace: 'data', minPoints: 3, maxPoints: 3, description: 'Three-anchor arc.' }),
  define({ kind: 'text', category: 'annotation', label: 'Text', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, uiReady: true, description: 'Text anchored to data.' }),
  define({ kind: 'note', category: 'annotation', label: 'Note', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, description: 'Note anchored to data.' }),
  define({ kind: 'anchoredText', category: 'annotation', label: 'Anchored text', interaction: 'single-point', coordinateSpace: 'viewport', minPoints: 0, maxPoints: 0, description: 'Viewport-fixed text.' }),
  define({ kind: 'anchoredNote', category: 'annotation', label: 'Anchored note', interaction: 'single-point', coordinateSpace: 'viewport', minPoints: 0, maxPoints: 0, description: 'Viewport-fixed note.' }),
  define({ kind: 'callout', category: 'annotation', label: 'Callout', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, description: 'Data anchor plus callout body.' }),
  define({ kind: 'signpost', category: 'annotation', label: 'Signpost', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, description: 'Text callout marker.' }),
  define({ kind: 'priceLabel', category: 'annotation', label: 'Price label', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, description: 'Price annotation.' }),
  define({ kind: 'flag', category: 'annotation', label: 'Flag', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, description: 'Flag marker.' }),
  define({ kind: 'icon', category: 'annotation', label: 'Icon', interaction: 'single-point', coordinateSpace: 'data', minPoints: 1, maxPoints: 1, description: 'Icon marker.' }),
  define({ kind: 'longPosition', category: 'prediction', label: 'Long position', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, measurement: true, uiReady: true, description: 'Entry/risk/reward planning geometry.' }),
  define({ kind: 'shortPosition', category: 'prediction', label: 'Short position', interaction: 'two-point', coordinateSpace: 'data', minPoints: 2, maxPoints: 2, measurement: true, uiReady: true, description: 'Entry/risk/reward planning geometry.' }),
  define({ kind: 'forecast', category: 'prediction', label: 'Forecast', interaction: 'multi-point', coordinateSpace: 'data', minPoints: 2, description: 'Projected data-coordinate path.' }),
];

const TOOL_MAP = new Map(CORE_DRAWING_TOOLS.map(tool => [tool.kind, tool]));

export function getCoreDrawingTool(kind: CoreDrawingKind): CoreDrawingToolDefinition | undefined { return TOOL_MAP.get(kind); }
export function validateDrawingPoints(kind: CoreDrawingKind, points: unknown[]): boolean {
  const definition = getCoreDrawingTool(kind);
  return definition ? definition.accepts(Array.isArray(points) ? points.length : 0) : false;
}
export function listCoreDrawingTools(category?: CoreDrawingToolDefinition['category']): CoreDrawingToolDefinition[] {
  return CORE_DRAWING_TOOLS.filter(tool => !category || tool.category === category).slice();
}
