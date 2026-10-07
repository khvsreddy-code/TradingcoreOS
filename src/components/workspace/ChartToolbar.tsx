import { MousePointer2, Undo2, Eraser, ChevronRight, Minus } from 'lucide-react';
import { CORE_SPIRIT_DRAWING_TOOL_CATALOG } from '../../services/core/chart/velaDrawingCatalog';

type DrawingTool = string;

type ToolGroup = {
  id: string;
  label: string;
  tools: readonly string[];
};

const GROUPS: readonly ToolGroup[] = [
  {
    id: 'lines',
    label: 'Lines',
    tools: ['trendline','hline','ray','extendedline','vline','hray','crossline','infoline','trendangle','parallelchannel','disjointchannel','flattopbottom','regressionchannel','pitchfork','schiffpitchfork','modifiedschiffpitchfork','insidepitchfork'],
  },
  {
    id: 'fibonacci',
    label: 'Fibonacci / Gann',
    tools: ['fibretracement','fibextension','fibextensiontrend','fibfan','fibtimezones','fibchannel','fibspeedfan','trendfibtime','fibcircles','fibarcs','fibwedge','fibspiral','gannfan','gannbox','gannsquare','dedekind','sonic','supersonic','goldensonic','goldensupersonic'],
  },
  {
    id: 'patterns',
    label: 'Patterns / Waves',
    tools: ['xabcd','abcd','elliottimpulse','elliottcorrection','headshoulders','gartley','bat','butterfly','crab','shark','cypher'],
  },
  {
    id: 'measure',
    label: 'Measurements / Volume',
    tools: ['datepricerange','position','magnifier','anchoredvwap','fixedrangevp'],
  },
  {
    id: 'shapes',
    label: 'Brushes / Shapes / Arrows',
    tools: ['freehand','highlighter','arrow','arrowmarkup','arrowmarkdown','box','ellipse','triangle','polyline','circle','rotatedrect','path','arc','curve'],
  },
  {
    id: 'text',
    label: 'Text',
    tools: ['text','callout','note','pricenote','comment','pricelabel','signpost'],
  },
  {
    id: 'icons',
    label: 'Icons',
    tools: ['flagmark','iconstamp'],
  },
];

const LABELS: Record<string, string> = {
  trendline:'Trend Line',hline:'Horizontal Line',ray:'Ray',extendedline:'Extended Line',vline:'Vertical Line',hray:'Horizontal Ray',crossline:'Cross Line',infoline:'Info Line',trendangle:'Trend Angle',
  parallelchannel:'Parallel Channel',disjointchannel:'Disjoint Channel',flattopbottom:'Flat Top / Bottom Channel',regressionchannel:'Regression Channel',
  pitchfork:'Pitchfork',schiffpitchfork:'Schiff Pitchfork',modifiedschiffpitchfork:'Modified Schiff Pitchfork',insidepitchfork:'Inside Pitchfork',
  fibretracement:'Fibonacci Retracement',fibextension:'Fibonacci Extension',fibextensiontrend:'Fibonacci Extension Trend',fibfan:'Fibonacci Fan',fibtimezones:'Fibonacci Time Zones',fibchannel:'Fibonacci Channel',fibspeedfan:'Fibonacci Speed / Resistance Fan',trendfibtime:'Trend-Based Fibonacci Time',
  fibcircles:'Fibonacci Circles',fibarcs:'Fibonacci Arcs',fibwedge:'Fibonacci Wedge',fibspiral:'Fibonacci Spiral',gannfan:'Gann Fan',gannbox:'Gann Box',gannsquare:'Gann Square',
  dedekind:'Dedekind',sonic:'Sonic',supersonic:'Super Sonic',goldensonic:'Golden Sonic',goldensupersonic:'Golden Super Sonic',
  xabcd:'XABCD',abcd:'ABCD',elliottimpulse:'Elliott Impulse',elliottcorrection:'Elliott Correction',headshoulders:'Head & Shoulders',gartley:'Gartley',bat:'Bat',butterfly:'Butterfly',crab:'Crab',shark:'Shark',cypher:'Cypher',
  datepricerange:'Date & Price Range',position:'Long / Short Position',magnifier:'Magnifier',anchoredvwap:'Anchored VWAP',fixedrangevp:'Fixed Range Volume Profile',
  freehand:'Freehand',highlighter:'Highlighter',arrow:'Arrow',arrowmarkup:'Arrow Markup',arrowmarkdown:'Arrow Mark Down',box:'Rectangle',ellipse:'Ellipse',triangle:'Triangle',polyline:'Polyline',circle:'Circle',rotatedrect:'Rotated Rectangle',path:'Path',arc:'Arc',curve:'Curve',
  text:'Text',callout:'Callout',note:'Note',pricenote:'Price Note',comment:'Comment',pricelabel:'Price Label',signpost:'Signpost',flagmark:'Flag',iconstamp:'Icon Stamp',
};

export function ChartToolbar({
  activeTool,
  onSelectTool,
  onUndo,
  onClear,
}: {
  activeTool: DrawingTool;
  onSelectTool: (tool: string) => void;
  onUndo: () => void;
  onClear: () => void;
}) {
  const registered = new Set<string>(CORE_SPIRIT_DRAWING_TOOL_CATALOG);

  return (
    <div className="absolute left-1 top-2 z-30 flex w-10 flex-col items-center gap-1 rounded-lg border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/95 p-1 shadow-2xl backdrop-blur">
      <button title="Pointer" onClick={() => onSelectTool('none')} className={`flex h-8 w-8 items-center justify-center rounded ${activeTool === 'none' ? 'bg-[var(--tco-accent)]/20 text-[var(--tco-accent-soft)]' : 'text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white'}`}>
        <MousePointer2 size={15} />
      </button>

      {GROUPS.map((group) => (
        <div key={group.id} className="group relative w-8">
          <button
            title={`${group.label} · Vela drawing tools`}
            className={`flex h-8 w-8 items-center justify-center rounded text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white ${group.tools.includes(activeTool) ? 'bg-[var(--tco-accent)]/15 text-[var(--tco-accent-soft)]' : ''}`}
          >
            <Minus size={14} className="-rotate-45" />
            <ChevronRight size={9} className="absolute right-0.5 opacity-60" />
          </button>
          <div className="pointer-events-none invisible absolute left-9 top-0 max-h-[70vh] w-56 overflow-y-auto rounded-lg border border-[var(--tco-control)] bg-[var(--tco-surface-2)]/98 p-1 shadow-2xl group-hover:pointer-events-auto group-hover:visible">
            <div className="px-2 py-1.5 text-[8px] uppercase tracking-widest text-[var(--tco-dim)]">{group.label}</div>
            {group.tools.filter((tool) => registered.has(tool)).map((tool) => (
              <button
                key={tool}
                title={LABELS[tool] || tool}
                onClick={() => onSelectTool(tool)}
                className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-[9px] font-mono ${activeTool === tool ? 'bg-[var(--tco-accent)]/15 text-[var(--tco-accent-soft)]' : 'text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white'}`}
              >
                <span>{LABELS[tool] || tool}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="my-1 h-px w-7 bg-[var(--tco-border)]" />
      <button title="Undo last drawing" onClick={onUndo} className="flex h-8 w-8 items-center justify-center rounded text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-white"><Undo2 size={15} /></button>
      <button title="Clear all drawings" onClick={onClear} className="flex h-8 w-8 items-center justify-center rounded text-[var(--tco-muted)] hover:bg-[var(--tco-hover)] hover:text-[#ef4444]"><Eraser size={15} /></button>
    </div>
  );
}
