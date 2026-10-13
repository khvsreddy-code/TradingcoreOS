import assert from 'node:assert/strict';
import { FyersSymbolMasterService } from './server/fyers/symbols/FyersSymbolMasterService.ts';
import { filterSymbols } from '../vendor/vela/src/widget/symbol-picker.ts';

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

console.log('FYERS_OPTION_SEARCH_TOKEN_CONTRACT_OK');
