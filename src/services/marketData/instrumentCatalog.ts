export type InstrumentClass = 'Index' | 'Stock' | 'Commodity' | 'Stock Future' | 'Index Future' | 'Commodity Future' | 'Stock Option' | 'Index Option' | 'Commodity Option' | 'Currency' | 'Currency Future' | 'Currency Option';

export interface InstrumentSuggestion {
  key: string;
  label: string;
  short: string;
  type: InstrumentClass;
  exchange: 'NSE' | 'BSE' | 'MCX' | 'NFO' | 'CDS';
  search?: string[];
}

// Stable fallback universe used for instant local suggestions. Broker-specific
// symbol discovery can extend this list without changing the workspace UI.
export const INSTRUMENT_CATALOG: InstrumentSuggestion[] = [
  {key:'NSE_INDEX|Nifty 50',label:'NIFTY 50',short:'NIFTY',type:'Index',exchange:'NSE',search:['nifty','index']},
  {key:'NSE_INDEX|Nifty Bank',label:'BANK NIFTY',short:'BANK',type:'Index',exchange:'NSE',search:['banknifty','index']},
  {key:'NSE_INDEX|Nifty Financial Services',label:'FIN NIFTY',short:'FINNIFTY',type:'Index',exchange:'NSE',search:['financial','index']},
  {key:'NSE_INDEX|Nifty Midcap Select',label:'MIDCAP SELECT',short:'MIDCP',type:'Index',exchange:'NSE',search:['midcap','index']},
  {key:'BSE_INDEX|Sensex',label:'SENSEX',short:'SENSEX',type:'Index',exchange:'BSE',search:['bse','index']},
  {key:'NSE:RELIANCE-EQ',label:'RELIANCE',short:'RELIANCE',type:'Stock',exchange:'NSE'},
  {key:'NSE:TCS-EQ',label:'TCS',short:'TCS',type:'Stock',exchange:'NSE'},
  {key:'NSE:HDFCBANK-EQ',label:'HDFC BANK',short:'HDFCBANK',type:'Stock',exchange:'NSE'},
  {key:'NSE:ICICIBANK-EQ',label:'ICICI BANK',short:'ICICIBANK',type:'Stock',exchange:'NSE'},
  {key:'NSE:INFY-EQ',label:'INFOSYS',short:'INFY',type:'Stock',exchange:'NSE'},
  {key:'NSE:SBIN-EQ',label:'STATE BANK OF INDIA',short:'SBIN',type:'Stock',exchange:'NSE'},
  {key:'NSE:ITC-EQ',label:'ITC',short:'ITC',type:'Stock',exchange:'NSE'},
  {key:'NSE:LT-EQ',label:'LARSEN & TOUBRO',short:'LT',type:'Stock',exchange:'NSE'},
  {key:'NSE:BHARTIARTL-EQ',label:'BHARTI AIRTEL',short:'BHARTIARTL',type:'Stock',exchange:'NSE'},
  {key:'NSE:AXISBANK-EQ',label:'AXIS BANK',short:'AXISBANK',type:'Stock',exchange:'NSE'},
  {key:'NSE:KOTAKBANK-EQ',label:'KOTAK MAHINDRA BANK',short:'KOTAKBANK',type:'Stock',exchange:'NSE'},
  {key:'NSE:MARUTI-EQ',label:'MARUTI SUZUKI',short:'MARUTI',type:'Stock',exchange:'NSE'},
  {key:'NSE:BAJFINANCE-EQ',label:'BAJAJ FINANCE',short:'BAJFINANCE',type:'Stock',exchange:'NSE'},
  {key:'NSE:WIPRO-EQ',label:'WIPRO',short:'WIPRO',type:'Stock',exchange:'NSE'},
  {key:'MCX:GOLDM-I',label:'GOLD',short:'GOLD',type:'Commodity Future',exchange:'MCX',search:['gold future','commodity']},
  {key:'MCX:GOLDGUINEA-I',label:'GOLD GUINEA',short:'GOLDGUINEA',type:'Commodity Future',exchange:'MCX'},
  {key:'MCX:SILVERMIC-I',label:'SILVER',short:'SILVER',type:'Commodity Future',exchange:'MCX',search:['silver future','commodity']},
  {key:'MCX:CRUDEOIL-I',label:'CRUDE OIL',short:'CRUDE',type:'Commodity Future',exchange:'MCX',search:['crude oil','commodity']},
  {key:'MCX:NATURALGAS-I',label:'NATURAL GAS',short:'NATGAS',type:'Commodity Future',exchange:'MCX'},
  {key:'MCX:COPPER-I',label:'COPPER',short:'COPPER',type:'Commodity Future',exchange:'MCX'},
  {key:'MCX:ZINC-I',label:'ZINC',short:'ZINC',type:'Commodity Future',exchange:'MCX'},
  {key:'MCX:ALUMINIUM-I',label:'ALUMINIUM',short:'ALUMINIUM',type:'Commodity Future',exchange:'MCX'},
  {key:'MCX:COTTON-I',label:'COTTON',short:'COTTON',type:'Commodity Future',exchange:'MCX'},
  {key:'NFO:NIFTY-FUT',label:'NIFTY FUTURE',short:'NIFTY FUT',type:'Index Future',exchange:'NFO',search:['nifty future','futures']},
  {key:'NFO:BANKNIFTY-FUT',label:'BANK NIFTY FUTURE',short:'BANK FUT',type:'Index Future',exchange:'NFO',search:['banknifty future','futures']},
  {key:'NFO:RELIANCE-FUT',label:'RELIANCE FUTURE',short:'RELIANCE FUT',type:'Stock Future',exchange:'NFO'},
  {key:'NFO:TCS-FUT',label:'TCS FUTURE',short:'TCS FUT',type:'Stock Future',exchange:'NFO'},
  {key:'NFO:HDFCBANK-FUT',label:'HDFC BANK FUTURE',short:'HDFC FUT',type:'Stock Future',exchange:'NFO'},
  {key:'NFO:NIFTY-OPT',label:'NIFTY OPTIONS',short:'NIFTY OPT',type:'Index Option',exchange:'NFO',search:['nifty call put option']},
  {key:'NFO:BANKNIFTY-OPT',label:'BANK NIFTY OPTIONS',short:'BANK OPT',type:'Index Option',exchange:'NFO',search:['banknifty call put option']},
  {key:'NFO:RELIANCE-OPT',label:'RELIANCE OPTIONS',short:'RELIANCE OPT',type:'Stock Option',exchange:'NFO'},
  {key:'NFO:TCS-OPT',label:'TCS OPTIONS',short:'TCS OPT',type:'Stock Option',exchange:'NFO'},
  {key:'MCX:GOLD-OPT',label:'GOLD OPTIONS',short:'GOLD OPT',type:'Commodity Option',exchange:'MCX'},
  {key:'MCX:CRUDEOIL-OPT',label:'CRUDE OIL OPTIONS',short:'CRUDE OPT',type:'Commodity Option',exchange:'MCX'},
  {key:'CDS:USDINR-I',label:'USD/INR',short:'USDINR',type:'Currency Future',exchange:'CDS'},
  {key:'CDS:EURINR-I',label:'EUR/INR',short:'EURINR',type:'Currency Future',exchange:'CDS'},
  {key:'CDS:GBPINR-I',label:'GBP/INR',short:'GBPINR',type:'Currency Future',exchange:'CDS'},
  {key:'CDS:JPYINR-I',label:'JPY/INR',short:'JPYINR',type:'Currency Future',exchange:'CDS'},
];

export function searchInstrumentCatalog(query: string, limit = 18): InstrumentSuggestion[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return INSTRUMENT_CATALOG.slice(0, limit);
  const terms = normalized.split(/\s+/).filter(Boolean);
  return INSTRUMENT_CATALOG
    .map(item => ({ item, haystack: [item.key,item.label,item.short,item.type,item.exchange,...(item.search||[])].join(' ').toLowerCase() }))
    .filter(({haystack}) => terms.every(term => haystack.includes(term)))
    .sort((a,b) => {
      const aExact = a.item.label.toLowerCase() === normalized || a.item.short.toLowerCase() === normalized ? 0 : 1;
      const bExact = b.item.label.toLowerCase() === normalized || b.item.short.toLowerCase() === normalized ? 0 : 1;
      return aExact - bExact || a.item.label.localeCompare(b.item.label);
    })
    .slice(0, limit)
    .map(({item}) => item);
}
