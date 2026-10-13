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
    bars:500,
    timeframes:['1','3','5','10','15','30','60','120','240','D','W','M'],
    live:true,
    theme:{
      background:'#07080c',
      textColor:'#9aa1b2',
      gridColor:'#171b27',
      borderColor:'#252a35',
      upColor:'#46d89a',
      downColor:'#ef6b7a',
      fontFamily:'DM Sans, system-ui, sans-serif',
    },
    animations:false,
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
    // Match Vela's compact professional command surface: no duplicate TCO×Vela brand pill,
    // no duplicate Replay action, and no redundant icon-only panel shortcuts.
    topbar:{
      left:['symbol','timeframes','style','layout','indicators'],
      right:[
        'tco.watchlist',
        'tco.research',
        'tco.automation',
        'tco.trading',
        'tco.journal',
          'tco.positions',
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
