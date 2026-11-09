import type { VelaWorkspaceOptions } from './velaWorkspaceLoader';
import { createTcoVelaDataProvider } from '../../../TcoVelaDataProvider';
import type { LazyCoreSpiritVelaEngine } from '../../coreSpirit/coreSpiritVelaEngineLoader';
import { registerLayout } from '../../../../vendor/vela/src/workspace/layouts';

const TCO_VELA_LAYOUT_PRESETS = [
  {
    id: 'big-left-2',
    label: 'Big left, 2 right',
    cols: [1, 1],
    rows: [1, 1],
    areas: ['a b', 'a c'],
    cells: [{ id: 'c1', area: 'a' }, { id: 'c2', area: 'b' }, { id: 'c3', area: 'c' }],
  },
  {
    id: 'big-left-3',
    label: 'Big left, 3 right',
    cols: [1, 1],
    rows: [1, 1, 1],
    areas: ['a b', 'a c', 'a d'],
    cells: [{ id: 'c1', area: 'a' }, { id: 'c2', area: 'b' }, { id: 'c3', area: 'c' }, { id: 'c4', area: 'd' }],
  },
  {
    id: 'big-right-2',
    label: '2 left, big right',
    cols: [1, 1],
    rows: [1, 1],
    areas: ['b a', 'c a'],
    cells: [{ id: 'c1', area: 'a' }, { id: 'c2', area: 'b' }, { id: 'c3', area: 'c' }],
  },
  {
    id: 'big-top-2',
    label: 'Big top, 2 below',
    cols: [1, 1],
    rows: [1, 1],
    areas: ['a a', 'b c'],
    cells: [{ id: 'c1', area: 'a' }, { id: 'c2', area: 'b' }, { id: 'c3', area: 'c' }],
  },
  {
    id: 'big-top-3',
    label: 'Big top, 3 below',
    cols: [1, 1, 1],
    rows: [1, 1],
    areas: ['a a a', 'b c d'],
    cells: [{ id: 'c1', area: 'a' }, { id: 'c2', area: 'b' }, { id: 'c3', area: 'c' }, { id: 'c4', area: 'd' }],
  },
  {
    id: 'big-bottom-2',
    label: '2 top, big below',
    cols: [1, 1],
    rows: [1, 1],
    areas: ['b c', 'a a'],
    cells: [{ id: 'c1', area: 'a' }, { id: 'c2', area: 'b' }, { id: 'c3', area: 'c' }],
  },
] as const;

/** Match Vela's asymmetric multi-chart presets while keeping all cells Vela-native. */
function registerTcoVelaLayoutPresets(): void {
  for (const preset of TCO_VELA_LAYOUT_PRESETS) registerLayout(preset);
}

export type TcoVelaTerminalDependencies = {
  symbol:string;
  timeframe:string;
  layout:string|false;
  storage:VelaWorkspaceOptions['storage'];
  createDataProvider:typeof createTcoVelaDataProvider;
  createCoreSpiritEngine:()=>LazyCoreSpiritVelaEngine;
  resolveIndicatorManifest:NonNullable<VelaWorkspaceOptions['indicators']>;
};

export const TCO_VELA_TERMINAL_TOPOLOGY = Object.freeze({
  shell:'VelaWorkspace',
  sharedSurface:[
    'topbar',
    'objectTree',
    'dataWindow',
    'drawingToolbar',
    'workspaceReplay',
    'panelDock',
  ],
  chartCell:[
    'TCO DataProvider',
    'CoreSpirit engine',
    'TCO native indicators',
    'TCO renderer layers',
    'TCO drawing/data contributions',
  ],
  docks:[
    'tco.research',
    'tco.automation',
    'tco.trading',
    'tco.workspace-frame',
  ],
} as const);

export function createTcoVelaTerminalOptions(
  deps:TcoVelaTerminalDependencies,
): VelaWorkspaceOptions {
  const { symbol, timeframe, layout, storage } = deps;

  registerTcoVelaLayoutPresets();

  return {
    layout,
    symbol,
    timeframe,
    bars:2_000,
    timeframes:['1','3','5','10','15','30','45','60','120','240','D','W','M'],
    live:true,
    // Match Vela's current production visual language: neutral charcoal canvas,
    // restrained grid, standard Vela candle colors, and eased zoom/pan.
    theme:{
      background:'#141518',
      textColor:'#9ca3af',
      gridColor:'#24262e',
      borderColor:'#2b2d36',
      upColor:'#089981',
      downColor:'#f23645',
      fontFamily:'Inter, system-ui, sans-serif',
    },
    animations:{ zoom:true, pan:true, liveBar:false },
    defaultLanguage:'corespirit',
    providers:{
      tco:()=>deps.createDataProvider(),
    },
    engines:{
      corespirit:()=>deps.createCoreSpiritEngine(),
    },
    indicators:deps.resolveIndicatorManifest,
    drawings:true,
    drawingToolbar:true,
    indicatorPicker:true,
    // Keep TradingCoreOS application panels in Vela's native right sidebar. The chart
    // topbar remains dedicated to market controls, indicator discovery, Save and Alerts.
    sidebar:true,
    topbar:{
      left:['symbol','timeframes','style','layout','indicators'],
      right:['tco.save-workspace','alerts'],
    },
    sync:{
      symbol:false,
      timeframe:false,
      crosshair:true,
      viewport:false,
      style:true,
      drawings:false,
    },
    volume:true,
    watermark:true,
    statusline:true,
    bottombar:false,
    autofocus:false,
    persist:'tradingcore-live-vela-v5',
    storage,
    maxWebglCells:8,
    alertCap:100,
    cells:{
      primary:{symbol:'NSE:NIFTY50-INDEX',timeframe:'5'},
      bank:{symbol:'NSE:NIFTYBANK-INDEX',timeframe:'5'},
      sensex:{symbol:'BSE:SENSEX-INDEX',timeframe:'5'},
      finnifty:{symbol:'NSE:FINNIFTY-INDEX',timeframe:'5'},
      midcap:{symbol:'NSE:MIDCPNIFTY-INDEX',timeframe:'5'},
      nifty1m:{symbol:'NSE:NIFTY50-INDEX',timeframe:'1'},
      nifty15m:{symbol:'NSE:NIFTY50-INDEX',timeframe:'15'},
      nifty60m:{symbol:'NSE:NIFTY50-INDEX',timeframe:'60'},
    },
  };
}
