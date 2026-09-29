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
    const payloadRecord = payload && typeof payload === 'object' ? payload as Record<string, unknown> : null;
    const dataRows = payloadRecord?.data;
    const rows: unknown[] = Array.isArray(payload) ? payload : (Array.isArray(dataRows) ? dataRows : payloadRecord ? Object.values(payloadRecord) : []);
    for(const row of rows){
      if(!row || typeof row!=='object') continue;
      const rowRecord = row as FyersSymbolRecord;
      const symbol=String(rowRecord.symbol ?? rowRecord.symbol_ticker ?? rowRecord.fyToken ?? rowRecord.fytoken ?? '').trim();
      if(symbol) records.set(symbol,row);
    }
    this.cache.set(master,{records,expiresAt:Date.now()+24*60*60*1000});
    return records;
  }
  static async find(master:FyersMasterName, symbol:string):Promise<FyersSymbolRecord|undefined>{ return (await this.load(master)).get(symbol.trim()); }
  static async search(master:FyersMasterName, query:string, limit=50):Promise<FyersSymbolRecord[]>{
    const q=query.trim().toUpperCase(); if(!q) return []; const out:FyersSymbolRecord[]=[];
    for(const row of (await this.load(master)).values()){ const symbol=String(row.symbol ?? row.symbol_ticker ?? '').toUpperCase(); if(symbol.includes(q)){out.push(row); if(out.length>=limit)break;} }
    return out;
  }
}
