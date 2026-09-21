import { CoreDrawingKind } from './coreDrawing';

export type DrawingToolInteraction = 'single-point' | 'two-point' | 'three-point' | 'multi-point' | 'freehand';

export type CoreDrawingToolDefinition = {
  kind: CoreDrawingKind;
  label: string;
  interaction: DrawingToolInteraction;
  minPoints: number;
  maxPoints?: number;
  extendsToViewport?: boolean;
  measurement?: boolean;
  description: string;
};

/**
 * Canonical drawing-tool catalog. Rendering and interaction stay in Core Chart;
 * this registry only describes the semantic contract of each individual tool.
 */
export const CORE_DRAWING_TOOLS: readonly CoreDrawingToolDefinition[] = [
  { kind: 'trendline', label: 'Trend line', interaction: 'two-point', minPoints: 2, maxPoints: 2, description: 'Finite line between two data coordinates.' },
  { kind: 'ray', label: 'Ray', interaction: 'two-point', minPoints: 2, maxPoints: 2, extendsToViewport: true, description: 'Line through two points extended forward.' },
  { kind: 'extendedLine', label: 'Extended line', interaction: 'two-point', minPoints: 2, maxPoints: 2, extendsToViewport: true, description: 'Line through two points extended in both directions.' },
  { kind: 'horizontal', label: 'Horizontal line', interaction: 'single-point', minPoints: 1, maxPoints: 1, extendsToViewport: true, description: 'Price level across the visible chart.' },
  { kind: 'horizontalRay', label: 'Horizontal ray', interaction: 'single-point', minPoints: 1, maxPoints: 1, extendsToViewport: true, description: 'Price level extending forward from an anchor.' },
  { kind: 'vertical', label: 'Vertical line', interaction: 'single-point', minPoints: 1, maxPoints: 1, extendsToViewport: true, description: 'Time level across the active price range.' },
  { kind: 'rectangle', label: 'Rectangle', interaction: 'two-point', minPoints: 2, maxPoints: 2, description: 'Axis-aligned price/time region.' },
  { kind: 'ellipse', label: 'Ellipse', interaction: 'two-point', minPoints: 2, maxPoints: 2, description: 'Ellipse bounded by two data-coordinate corners.' },
  { kind: 'parallelChannel', label: 'Parallel channel', interaction: 'three-point', minPoints: 3, maxPoints: 3, description: 'Base line plus an offset point defining a parallel channel.' },
  { kind: 'fib', label: 'Fibonacci retracement', interaction: 'two-point', minPoints: 2, maxPoints: 2, description: 'Retracement levels derived from an anchor range.' },
  { kind: 'fibExtension', label: 'Fibonacci extension', interaction: 'three-point', minPoints: 3, maxPoints: 3, description: 'Extension levels derived from three anchors.' },
  { kind: 'pitchfork', label: 'Pitchfork', interaction: 'three-point', minPoints: 3, maxPoints: 3, description: 'Median-line geometry from three anchors.' },
  { kind: 'arrow', label: 'Arrow', interaction: 'two-point', minPoints: 2, maxPoints: 2, description: 'Directed line with an arrow head.' },
  { kind: 'priceRange', label: 'Price range', interaction: 'two-point', minPoints: 2, maxPoints: 2, measurement: true, description: 'Price-distance measurement between two anchors.' },
  { kind: 'dateRange', label: 'Date range', interaction: 'two-point', minPoints: 2, maxPoints: 2, measurement: true, description: 'Elapsed-time measurement between two anchors.' },
  { kind: 'brush', label: 'Brush', interaction: 'freehand', minPoints: 2, description: 'Freehand data-coordinate path.' },
  { kind: 'highlighter', label: 'Highlighter', interaction: 'freehand', minPoints: 2, description: 'Wide freehand data-coordinate path.' },
  { kind: 'text', label: 'Text anchor', interaction: 'single-point', minPoints: 1, maxPoints: 1, description: 'Text annotation anchored to a data coordinate.' },
  { kind: 'longPosition', label: 'Long position', interaction: 'two-point', minPoints: 2, maxPoints: 2, measurement: true, description: 'Entry/risk/reward planning geometry.' },
  { kind: 'shortPosition', label: 'Short position', interaction: 'two-point', minPoints: 2, maxPoints: 2, measurement: true, description: 'Entry/risk/reward planning geometry.' },
  { kind: 'measure', label: 'Measure', interaction: 'two-point', minPoints: 2, maxPoints: 2, measurement: true, description: 'Generic time/price distance measurement.' },
];

const TOOL_MAP = new Map(CORE_DRAWING_TOOLS.map(tool => [tool.kind, tool]));

export function getCoreDrawingTool(kind: CoreDrawingKind): CoreDrawingToolDefinition | undefined {
  return TOOL_MAP.get(kind);
}

export function validateDrawingPoints(kind: CoreDrawingKind, points: unknown[]): boolean {
  const definition = getCoreDrawingTool(kind);
  if (!definition) return false;
  const count = Array.isArray(points) ? points.length : 0;
  return count >= definition.minPoints && (definition.maxPoints == null || count <= definition.maxPoints);
}
