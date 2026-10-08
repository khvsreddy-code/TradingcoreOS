import type { VelaWorkspaceOptions } from './velaWorkspaceLoader';
import { createTcoVelaDataProvider } from '../../../TcoVelaDataProvider';
import { LazyCoreSpiritVelaEngine } from '../../coreSpirit/coreSpiritVelaEngineLoader';

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
    'bottombar',
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
    animations:false,
    defaultLanguage:'corespirit',
    providers:{
      tco:()=>deps.createDataProvider(),
    },
    engines:{
      corespirit:()=>deps.createCoreSpiritEngine(),
    },
    indicators:()=>deps.resolveIndicatorManifest(),
    drawings:true,
    drawingToolbar:true,
    indicatorPicker:true,
    topbar:{
      left:['tco.brand','symbol','timeframes','style','layout','indicators'],
      right:[
        'tco.watchlist',
        'tco.research',
        'tco.automation',
        'tco.trading',
        'tco.journal',
        'tco.replay',
        'tco.positions',
        'tco.risk',
        'tco.orderbook',
        'tco.options',
        'tco.data-window',
        'tco.vpvr',
        'alerts',
        'panels',
        'tco.profile',
        'tco.broker-connection',
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
    persist:'tradingcore-live-vela-v6',
    storage,
    maxWebglCells:8,
    alertCap:100,
  };
}
