export type FyersMasterName = 'NSE_CM'|'NSE_FO'|'NSE_CD'|'NSE_COM'|'BSE_CM'|'BSE_FO'|'MCX_COM';
export type FyersSymbolRecord = Record<string, unknown>;

const MASTER_NAMES: FyersMasterName[] = ['NSE_CM','NSE_FO','NSE_CD','NSE_COM','BSE_CM','BSE_FO','MCX_COM'];
const BASE = 'https://public.fyers.in/sym_details';

interface CacheEntry { records: Map<string,FyersSymbolRecord>; expiresAt: number; }
export class FyersSymbolMasterService {
  private static cache = new Map<FyersMasterName, CacheEntry>();
  private static inFlight = new Map<FyersMasterName, Promise<Map<string,FyersSymbolRecord>>>();
  static masterNames(): FyersMasterName[] { return [...MASTER_NAMES]; }

  /**
   * Cache the in-progress request as well as the resulting master. Debounced search
   * can issue several queries while the first multi-megabyte download is pending;
   * all those queries must share one fetch per master per server instance.
   */
  static load(master: FyersMasterName): Promise<Map<string,FyersSymbolRecord>> {
    const cached=this.cache.get(master);
    if(cached && cached.expiresAt>Date.now()) return Promise.resolve(cached.records);
    const inFlight=this.inFlight.get(master);
    if(inFlight) return inFlight;

    const request=this.fetchAndIndex(master).then((records) => {
      this.cache.set(master,{records,expiresAt:Date.now()+24*60*60*1000});
      return records;
    }).finally(() => {
      if(this.inFlight.get(master) === request) this.inFlight.delete(master);
    });
    this.inFlight.set(master,request);
    return request;
  }

  private static async fetchAndIndex(master: FyersMasterName): Promise<Map<string,FyersSymbolRecord>> {
    const response=await fetch(`${BASE}/${master}_sym_master.json`, {
      headers:{Accept:'application/json'},
      signal:AbortSignal.timeout(12_000),
    });
    if(!response.ok) throw new Error(`FYERS symbol master ${master} returned ${response.status}`);
    const payload: unknown = await response.json();
    const records = new Map<string,FyersSymbolRecord>();
    const payloadRecord = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
    const dataRows = payloadRecord?.data;
    const rows: Array<{symbolKey?: string; value: unknown}> = Array.isArray(payload)
      ? payload.map((value) => ({value}))
      : Array.isArray(dataRows)
        ? dataRows.map((value) => ({value}))
        : payloadRecord
          ? Object.entries(payloadRecord).map(([symbolKey, value]) => ({symbolKey, value}))
          : [];
    for(const entry of rows){
      const row = entry.value;
      if(!row || typeof row!=='object' || Array.isArray(row)) continue;
      const rowRecord = row as FyersSymbolRecord;
      const explicitSymbol=String(rowRecord.symbol ?? rowRecord.symbol_ticker ?? rowRecord.symTicker ?? '').trim();
      // The real FYERS masters key each row by a canonical PREFIX:TICKER. Preserve that
      // key ahead of fyToken (which is a numeric provider token, not a chart symbol).
      const keyedTicker=String(entry.symbolKey ?? '').trim();
      const symbol=keyedTicker.includes(':') ? keyedTicker : (explicitSymbol || keyedTicker || String(rowRecord.fyToken ?? rowRecord.fytoken ?? '').trim());
      if(symbol) records.set(symbol,{...rowRecord, symbol});
    }
    return records;
  }

  static async find(master:FyersMasterName, symbol:string):Promise<FyersSymbolRecord|undefined>{ return (await this.load(master)).get(symbol.trim()); }

  static async search(master:FyersMasterName, query:string, limit=50):Promise<FyersSymbolRecord[]>{
    // FYERS option tickers are compact (for example NIFTY26...22600PE), while users
    // naturally type human-readable queries such as "NIFTY 22600 PE". Split into tokens
    // and require every token to match instead of requiring the whole phrase contiguously.
    const sourceQuery=query.trim().replace(/^[A-Z0-9_-]{2,16}:/i,'').toUpperCase();
    const tokens=sourceQuery.match(/[A-Z]+|\d+(?:\.\d+)?/g) ?? [];
    if(!tokens.length) return [];
    const maximum = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 50;
    const compactQuery=sourceQuery.replace(/[^A-Z0-9.]/g,'');
    const ranked: Array<{row:FyersSymbolRecord; ticker:string; rank:number}> = [];
    for(const [key,row] of (await this.load(master)).entries()){
      const symbol=String(row.symbol ?? row.symbol_ticker ?? row.symTicker ?? key).toUpperCase();
      const ticker=symbol.split(':').pop() ?? symbol;
      const compactTicker=ticker.replace(/[^A-Z0-9.]/g,'');
      const description=String(row.exSymName ?? row.symDetails ?? row.description ?? row.name ?? '').toUpperCase();
      const detailFields=[
        row.strikePrice, row.strike_price, row.strike, row.optionType, row.option_type,
        row.optType, row.instrumentType, row.instrument_type, row.expiryDate, row.expiry,
        row.exSeries, row.series,
      ].map((value)=>String(value ?? '')).join(' ').toUpperCase();
      const searchable=[symbol,ticker,description,detailFields].join(' ');
      // Match the requested strike/side whether they appear in the compact ticker or as
      // separate fields/words in the human-readable description.
      if(!tokens.every((token)=>compactTicker.includes(token) || searchable.includes(token))) continue;
      const tickerHasEveryToken=tokens.every((token)=>compactTicker.includes(token));
      const rank=ticker===sourceQuery ? 0
        : compactQuery.length > 0 && compactTicker.startsWith(compactQuery) ? 1
        : compactQuery.length > 0 && compactTicker.includes(compactQuery) ? 2
        : tickerHasEveryToken ? 3
        : 4;
      ranked.push({row,ticker,rank});
    }
    ranked.sort((a,b)=>a.rank-b.rank || a.ticker.localeCompare(b.ticker));
    return ranked.slice(0,maximum).map((item)=>item.row);
  }
}

