import { ArrowUpRight, ArrowUpRight as RayIcon, MoveHorizontal, MoveVertical, Minus, Waves, Square, Circle, GitBranch, Triangle, Ruler, Paintbrush, Highlighter, Type, Target, MousePointer2, Undo2, Eraser } from 'lucide-react';
import { CORE_DRAWING_TOOLS } from '../../services/core/drawing/drawingTools';

type DrawingTool = string;

export function ChartToolbar({
  activeTool,
  onSelectTool,
  onUndo,
  onClear,
}: {
  activeTool: DrawingTool;
  onSelectTool: (tool: DrawingTool) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const icons: Record<string, any> = {
    none: MousePointer2, trendline: ArrowUpRight, ray: RayIcon, extendedLine: MoveHorizontal,
    horizontal: Minus, horizontalRay: Minus, vertical: MoveVertical, parallelChannel: Waves,
    rectangle: Square, ellipse: Circle, fib: GitBranch, fibExtension: GitBranch, pitchfork: Triangle,
    arrow: ArrowUpRight, priceRange: Ruler, dateRange: Ruler, brush: Paintbrush,
    highlighter: Highlighter, text: Type, longPosition: Target, shortPosition: Target, measure: Ruler,
  };

  return <div className="absolute left-1 top-2 z-30 flex w-10 flex-col items-center gap-1 rounded-lg border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/95 p-1 shadow-2xl backdrop-blur">
    {CORE_DRAWING_TOOLS.filter(tool => tool.uiReady).map(({ kind, label }) => {
      const Icon = icons[kind] || MousePointer2;
      return <button key={kind} title={label} onClick={() => onSelectTool(kind)} className={`flex h-8 w-8 items-center justify-center rounded ${activeTool === kind ? 'bg-[#2563eb]/20 text-[#60a5fa]' : 'text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white'}`}><Icon size={15} /></button>;
    })}
    <div className="my-1 h-px w-7 bg-[var(--tco-border)]" />
    <button title="Undo last drawing" onClick={onUndo} className="flex h-8 w-8 items-center justify-center rounded text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white"><Undo2 size={15} /></button>
    <button title="Clear all drawings" onClick={onClear} className="flex h-8 w-8 items-center justify-center rounded text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-[#ef4444]"><Eraser size={15} /></button>
  </div>;
}
