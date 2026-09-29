import { useEffect, useState } from 'react';
import {
  MousePointer2, ArrowUpRight, MoveHorizontal, Minus, MoveVertical, Waves, Square, Circle,
  GitBranch, Triangle, Ruler, Type, Paintbrush, Highlighter, Target, Crosshair, Undo2, Eraser
} from 'lucide-react';

type Tool = string;
type Props = { chartIndex?: number };

const tools: Array<[Tool,string,any]> = [
  ['none','Pointer',MousePointer2],
  ['trendline','Trend line',ArrowUpRight],
  ['ray','Ray',ArrowUpRight],
  ['extendedLine','Extended line',MoveHorizontal],
  ['horizontal','Horizontal line',Minus],
  ['horizontalRay','Horizontal ray',Minus],
  ['vertical','Vertical line',MoveVertical],
  ['parallelChannel','Parallel channel',Waves],
  ['rectangle','Rectangle',Square],
  ['ellipse','Ellipse',Circle],
  ['fib','Fibonacci retracement',GitBranch],
  ['fibExtension','Fibonacci extension',GitBranch],
  ['pitchfork','Pitchfork',Triangle],
  ['arrow','Arrow',ArrowUpRight],
  ['priceRange','Price range',Ruler],
  ['dateRange','Date range',Ruler],
  ['brush','Brush',Paintbrush],
  ['highlighter','Highlighter',Highlighter],
  ['text','Text',Type],
  ['longPosition','Long position',Target],
  ['shortPosition','Short position',Target],
  ['measure','Measure',Ruler],
  ['crosshair','Crosshair',Crosshair],
];

export function CoreDrawingToolbar({ chartIndex }: Props) {
  const [active, setActive] = useState('none');

  useEffect(() => {
    const onTool = (event: Event) => {
      const detail = (event as CustomEvent).detail || {};
      if (typeof detail === 'string') {
        setActive(detail);
        return;
      }
      if (detail.chartIndex == null || detail.chartIndex === chartIndex) {
        setActive(String(detail.tool || 'none'));
      }
    };
    const onClear = () => setActive('none');
    window.addEventListener('TRADINGCORE_DRAW_TOOL', onTool);
    window.addEventListener('TRADINGCORE_CLEAR_DRAWINGS', onClear);
    return () => {
      window.removeEventListener('TRADINGCORE_DRAW_TOOL', onTool);
      window.removeEventListener('TRADINGCORE_CLEAR_DRAWINGS', onClear);
    };
  }, [chartIndex]);

  const select = (tool: Tool) => {
    setActive(tool);
    window.dispatchEvent(new CustomEvent('TRADINGCORE_DRAW_TOOL', {
      detail: { tool, chartIndex }
    }));
  };

  const clear = () => {
    setActive('none');
    window.dispatchEvent(new CustomEvent('TRADINGCORE_CLEAR_DRAWINGS', {
      detail: { chartIndex }
    }));
  };

  return (
    <aside className="tco-drawing-rail" aria-label="Chart drawing tools">
      <div className="tco-drawing-rail-group">
        {tools.map(([tool, label, Icon]) => (
          <button
            key={tool}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={active === tool}
            onClick={() => select(tool)}
            className={`tco-drawing-tool ${active === tool ? 'active' : ''}`}
          >
            <Icon size={16} strokeWidth={1.7} />
          </button>
        ))}
      </div>
      <div className="tco-drawing-divider" />
      <button type="button" title="Undo last drawing" aria-label="Undo last drawing" className="tco-drawing-tool" onClick={() => window.dispatchEvent(new CustomEvent('TRADINGCORE_UNDO_DRAWING', { detail: { chartIndex } }))}>
        <Undo2 size={16} strokeWidth={1.7} />
      </button>
      <button type="button" title="Clear all drawings" aria-label="Clear all drawings" className="tco-drawing-tool danger" onClick={clear}>
        <Eraser size={16} strokeWidth={1.7} />
      </button>
    </aside>
  );
}
