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
    bars:5000,
    timeframes:['1','3','5','10','15','30','60','120','240','D','W','M'],
    live:true,
    // Vela's native dark terminal palette: clear neutral chrome and high-contrast
    // teal/red price action, tuned to match the latest Vela workspace reference.
    theme:{
      background:'#111318',
      textColor:'#a5aab5',
      gridColor:'#252832',
      borderColor:'#2c303b',
      upColor:'#0fba91',
      downColor:'#f0445c',
      fontFamily:'Inter, DM Sans, system-ui, sans-serif',
    },
    // Keep market updates snappy while leaving native zoom/pan feedback enabled.
    animations:{ zoom:true, pan:100, autoscale:100, liveBar:false, intro:false },
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
    // Native Vela primary controls stay in the familiar left cluster. TCO's
    // trading modules keep their shortcuts as compact icon actions on the right.
    topbar:{
      left:['symbol','timeframes','style','layout','indicators','undo-redo'],
      right:[
        'tco.watchlist',
        'tco.research',
        'tco.automation',
        'tco.trading',
        'tco.journal',
        'tco.replay',
        'tco.positions',
        'tco.profile',
        'tco.broker-connection',
        'alerts',
        'panels',
        'screenshot',
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
    bottombar:true,
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
