import type { VelaWorkspaceOptions } from './velaWorkspaceLoader';
import { createTcoVelaDataProvider } from '../../../TcoVelaDataProvider';
import type { LazyCoreSpiritVelaEngine } from '../../coreSpirit/coreSpiritVelaEngineLoader';

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
    // Vela owns the chart chrome. Keep its native editing/history, alerts and screenshot
    // actions visible, while TCO integrations use compact icon actions with tooltips.
    topbar:{
      left:['symbol','timeframes','style','layout','indicators'],
      right:[
        'tco.research',
        'tco.automation',
        'tco.trading',
        'tco.journal',
        'tco.positions',
        'tco.save-workspace',
        'tco.workspace-frame',
        'tco.chart-settings',
        'alerts',
      ],
    },
    sync:{
      symbol:false,
      timeframe:false,
      crosshair:true,
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
