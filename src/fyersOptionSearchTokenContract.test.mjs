import assert from 'node:assert/strict';
import { FyersSymbolMasterService } from './server/fyers/symbols/FyersSymbolMasterService.ts';
import { canonicalFyersSymbol } from './server/fyers/symbols/canonicalFyersSymbol.ts';
import { filterSymbols } from '../vendor/vela/src/widget/symbol-picker.ts';
import { rankFyersInstrumentRows } from './server/routes/instrument-search-priority.routes.ts';
import { chartBackgroundCss, DEFAULT_WORKSPACE_APPEARANCE, WORKSPACE_COLOR_PRESETS } from './theme/workspaceAppearance.ts';

assert.equal(canonicalFyersSymbol('NSE:NIFTY26JUN22600PE'), 'NSE:NIFTY26JUN22600PE',
  'history routing must not rewrite an option contract as an equity');
assert.equal(canonicalFyersSymbol('NSE:NIFTY26JUN22600CE'), 'NSE:NIFTY26JUN22600CE',
  'call contracts must stay on the requested derivatives instrument');
assert.equal(canonicalFyersSymbol('BSE:SENSEX26JUN80000PE'), 'BSE:SENSEX26JUN80000PE',
  'BSE index option contracts must keep their listing venue');
assert.match(searchRoute, /MCX_COM_sym_master\.json/, 'commodity instruments must be available to search');
assert.match(searchRoute, /rankFyersInstrumentRows/, 'live search must use the deterministic semantic ranker');
assert.match(searchRoute, /expiryTime\(a\.row\.expiry\) - expiryTime\(b\.row\.expiry\)/, 'futures results must prioritize nearest expiry');
assert.match(searchRoute, /FyersSymbolMasterService\.masterNames\(\)/, 'search should reuse the canonical per-master service and cache');
assert.match(symbolMaster, /'NSE_COM'.*'BSE_CM'.*'BSE_FO'.*'MCX_COM'/, 'the shared symbol master must cover commodities and all supported exchanges');
assert.match(searchRoute, /Promise\.allSettled/, 'one unavailable venue must not disable all instrument search');
assert.match(searchRoute, /intent\.side && \(!kind\.option \|\| kind\.side !== intent\.side\)/, 'requested option side must be a hard filter');
assert.match(searchRoute, /strikeTokens\.some\(\(token\) => Number\(token\) === strike\)/, 'an explicit strike must rank the exact contract above nearby strikes');
assert.match(searchRoute, /const normalizedSegment = segment\.toLowerCase\(\)/, 'segment selection should be case insensitive');
assert.match(searchClient, /searchInFlight\.get\(key\)/, 'search should deduplicate overlapping requests');
assert.match(searchClient, /data\.partial = payload\.partial === true/, 'partial symbol-master failures must reach the UI');
assert.match(workspace, /<WorkspaceAppearancePanel/, 'the live workspace must expose the appearance controls');
assert.match(workspace, /data-tco-workspace-zone="topbar"/, 'the top bar needs a scoped theme surface');
assert.match(workspace, /data-tco-workspace-zone="sidebar"/, 'both sidebars need scoped theme surfaces');
assert.match(workspace, /instrumentSearchPartial/, 'symbol search should visibly disclose when an exchange catalog is partially unavailable');
assert.match(appearancePanel, /WORKSPACE_COLOR_PRESETS\.map/, 'the appearance panel must offer an expanded accent palette');
assert.match(appearancePanel, /Sync workspace surface colors/, 'workspace areas must be synchronizable');
assert.match(appearancePanel, /chartBackgroundMode: 'gradient'/, 'chart background must offer a gradient mode');
assert.match(appearanceModel, /WORKSPACE_APPEARANCE_STORAGE_KEY/, 'appearance settings must persist');
assert.match(appearanceModel, /chartBackgroundCss/, 'solid and gradient backgrounds need one shared serializer');
assert.match(liveChart, /subscribeWorkspaceAppearance/, 'live charts must react to appearance changes without remounting');
assert.match(liveChart, /backgroundGradient:/, 'chart layout must carry the gradient settings into Vela');
assert.match(velaOptions, /backgroundGradient\?: \{ from: string; to: string; angle: number \}/, 'Vela theme should support an optional gradient without breaking solid themes');
assert.match(velaFacade, /mergeChartOptions\(this\.themeOptions, options\)/, 'partial theme updates must not reset text, grid or axis options');
assert.match(nativeRenderer, /createLinearGradient/, 'the native renderer/export path must paint the real gradient');
assert.match(nativeRenderer, /this\.wrapper\.style\.backgroundImage/, 'the live chart canvas surface must render the selected gradient');

assert.equal(canonicalFyersSymbol('NSE:RELIANCE'), 'NSE:RELIANCE-EQ',
  'ordinary NSE equity normalization should remain unchanged');


// Use a deterministic miniature instrument master so this contract checks the actual
// production matching logic without network access or a live broker session.
const originalLoad = FyersSymbolMasterService.load;
const master = new Map([
  ['NSE:NIFTY26JUN22600PE', {
    symbol: 'NSE:NIFTY26JUN22600PE',
    exSymName: 'NIFTY 26 JUN 22600 PE',
    strikePrice: '22600',
    optionType: 'PE',
  }],
  ['NSE:NIFTY26JUN22600CE', {
    symbol: 'NSE:NIFTY26JUN22600CE',
    exSymName: 'NIFTY 26 JUN 22600 CE',
    strikePrice: '22600',
    optionType: 'CE',
  }],
  ['NSE:NIFTY26JUN22500PE', {
    symbol: 'NSE:NIFTY26JUN22500PE',
    exSymName: 'NIFTY 26 JUN 22500 PE',
    strikePrice: '22500',
    optionType: 'PE',
  }],
]);

try {
  FyersSymbolMasterService.load = async () => master;
  const matches = await FyersSymbolMasterService.search('NSE_FO', 'NIFTY 22600 PE', 20);
  assert.deepEqual(matches.map((row) => row.symbol), ['NSE:NIFTY26JUN22600PE'],
    'backend search should match compact option symbols by underlying, strike, and side');

  const pickerRows = [
    { ticker: 'NIFTY26JUN22600PE', prefix: 'NSE', description: 'NIFTY 26 JUN 22600 PE', type: 'derivative', market: 'NSE_FO' },
    { ticker: 'NIFTY26JUN22600CE', prefix: 'NSE', description: 'NIFTY 26 JUN 22600 CE', type: 'derivative', market: 'NSE_FO' },
    { ticker: 'NIFTY26JUN22500PE', prefix: 'NSE', description: 'NIFTY 26 JUN 22500 PE', type: 'derivative', market: 'NSE_FO' },
  ];
  const visible = filterSymbols(pickerRows, 'NIFTY 22600 PE', 20, false);
  assert.deepEqual(visible.map((row) => row.ticker), ['NIFTY26JUN22600PE'],
    'symbol picker should preserve tokenized results from the exchange master');
} finally {
  FyersSymbolMasterService.load = originalLoad;
}


const rankingRows = [
  { master: 'NSE_FO', symbol: 'NSE:NIFTY26OCT26000PE', description: 'NIFTY 29 OCT 26000 PE', type: 'OPTIDX', expiry: '2026-10-29', strike: '26000', optionType: 'PE' },
  { master: 'NSE_FO', symbol: 'NSE:NIFTY26NOV26000PE', description: 'NIFTY 26 NOV 26000 PE', type: 'OPTIDX', expiry: '2026-11-26', strike: '26000', optionType: 'PE' },
  { master: 'NSE_FO', symbol: 'NSE:NIFTY26SEP26000PE', description: 'NIFTY 24 SEP 26000 PE', type: 'OPTIDX', expiry: '2026-09-24', strike: '26000', optionType: 'PE' },
  { master: 'NSE_FO', symbol: 'NSE:NIFTY26OCT26000CE', description: 'NIFTY 29 OCT 26000 CE', type: 'OPTIDX', expiry: '2026-10-29', strike: '26000', optionType: 'CE' },
  { master: 'NSE_FO', symbol: 'NSE:NIFTY26OCT25900PE', description: 'NIFTY 29 OCT 25900 PE', type: 'OPTIDX', expiry: '2026-10-29', strike: '25900', optionType: 'PE' },
  { master: 'MCX_COM', symbol: 'MCX:CRUDEOILOCT26FUT', description: 'CRUDE OIL FUTURES', type: 'FUTCOM', expiry: '2026-10-29', strike: '', optionType: '' },
  { master: 'MCX_COM', symbol: 'MCX:CRUDEOILNOV26FUT', description: 'CRUDE OIL FUTURES', type: 'FUTCOM', expiry: '2026-11-26', strike: '', optionType: '' },
  { master: 'MCX_COM', symbol: 'MCX:NATURALGASOCT26FUT', description: 'NATURAL GAS FUTURES', type: 'FUTCOM', expiry: '2026-10-27', strike: '', optionType: '' },
  { master: 'MCX_COM', symbol: 'MCX:CRUDEOILSEP26FUT', description: 'CRUDE OIL FUTURES', type: 'FUTCOM', expiry: '2026-09-29', strike: '', optionType: '' },
];
const futureSearchNow = Date.parse('2026-10-19T09:00:00.000Z');
const exactOption = rankFyersInstrumentRows(rankingRows, 'nifty 26,000 pe', 'all', 20, futureSearchNow).data;
assert.deepEqual(exactOption.map(row => row.symbol), ['NSE:NIFTY26OCT26000PE', 'NSE:NIFTY26NOV26000PE'],
  'underlying + normalized strike + PE must not return the CE or neighboring strikes');
const exactOptionNoGrouping = rankFyersInstrumentRows(rankingRows, 'nifty 26000 pe', 'all', 20, futureSearchNow).data;
assert.deepEqual(exactOptionNoGrouping.map(row => row.symbol), ['NSE:NIFTY26OCT26000PE', 'NSE:NIFTY26NOV26000PE'],
  'the common NIFTY 26000 PE query must return the exact strike and side');
const oilFutures = rankFyersInstrumentRows(rankingRows, 'crude oil futures', 'all', 20, futureSearchNow).data;
assert.deepEqual(oilFutures.map(row => row.symbol), ['MCX:CRUDEOILOCT26FUT', 'MCX:CRUDEOILNOV26FUT'],
  'commodity future query must include nearest expiry then later contracts, excluding other commodities');
assert.deepEqual(rankFyersInstrumentRows(rankingRows, 'crude oil', 'commodities', 20, futureSearchNow).data.map(row => row.symbol),
  ['MCX:CRUDEOILOCT26FUT', 'MCX:CRUDEOILNOV26FUT'],
  'commodity segment must include the MCX commodity master');


assert.ok(WORKSPACE_COLOR_PRESETS.length >= 24, 'the appearance picker should provide a broad accent palette');
assert.equal(chartBackgroundCss({ ...DEFAULT_WORKSPACE_APPEARANCE, chartBackgroundMode: 'solid', chartBackgroundStart: '#123456' }), '#123456');
assert.equal(chartBackgroundCss({ ...DEFAULT_WORKSPACE_APPEARANCE, chartBackgroundMode: 'gradient', chartBackgroundStart: '#123456', chartBackgroundEnd: '#abcdef', chartGradientAngle: 45 }), 'linear-gradient(45deg, #123456, #abcdef)');

console.log('FYERS_OPTION_SEARCH_TOKEN_CONTRACT_OK');

