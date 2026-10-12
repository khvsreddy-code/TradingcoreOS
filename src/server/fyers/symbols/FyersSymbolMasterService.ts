export type FyersMasterName = 'NSE_CM'|'NSE_FO'|'NSE_CD'|'NSE_COM'|'BSE_CM'|'BSE_FO'|'MCX_COM';
export type FyersSymbolRecord = Record<string, unknown>;

const MASTER_NAMES: FyersMasterName[] = ['NSE_CM','NSE_FO','NSE_CD','NSE_COM','BSE_CM','BSE_FO','MCX_COM'];
const BASE = 'https://public.fyers.in/sym_details';

interface CacheEntry { records: Map<string,FyersSymbolRecord>; expiresAt: number; }
export class FyersSymbolMasterService {
  private static cache = new Map<FyersMasterName, CacheEntry>();
  static masterNames(): FyersMasterName[] { return [...MASTER_NAMES]; }
  static async load(master: FyersMasterName): Promise<Map<string,FyersSymbolRecord>> {
    const cached=this.cache.get(master); if(cached && cached.expiresAt>Date.now()) return cached.records;
    const response=await fetch(`${BASE}/${master}_sym_master.json`, { headers:{Accept:'application/json'} });
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
    this.cache.set(master,{records,expiresAt:Date.now()+24*60*60*1000});
    return records;
  }
  static async find(master:FyersMasterName, symbol:string):Promise<FyersSymbolRecord|undefined>{ return (await this.load(master)).get(symbol.trim()); }
  static async search(master:FyersMasterName, query:string, limit=50):Promise<FyersSymbolRecord[]>{
    const q=query.trim().toUpperCase(); if(!q) return [];
    const maximum = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.trunc(limit))) : 50;
    const out:FyersSymbolRecord[]=[];
    for(const [key,row] of (await this.load(master)).entries()){
      const haystack=[key,row.symbol,row.symbol_ticker,row.symTicker,row.exSymName,row.symDetails].map(value=>String(value ?? '')).join(' ').toUpperCase();
      if(haystack.includes(q)){out.push(row); if(out.length>=maximum)break;}
    }
    return out;
  }
}
