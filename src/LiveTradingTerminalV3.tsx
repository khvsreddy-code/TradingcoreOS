import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BriefcaseBusiness, ChevronDown, LayoutGrid, ListOrdered, Plus, RefreshCw, Search, ShieldCheck, Wallet, X, Zap } from 'lucide-react';
import { LiveChart } from './components/workspace/LiveChart';
import { tradingCoreRuntime } from './services/runtime/TradingCoreRuntime';
import { searchBrokerInstruments, SearchInstrument, InstrumentSearchSegment } from './services/marketData/instrumentSearch';
import { NormalizedMarketTick } from './types/market';
import { OrderRequest } from './services/brokers/BrokerAdapter';
import './services/runtime/historyRequestGuard';

const css = `
.tcv3{position:fixed;inset:58px 0 0;z-index:100;background:#080a0f;color:#e5e7eb;display:flex;min-height:0;font:12px Inter,system-ui,sans-serif}.tcv3 *{box-sizing:border-box}.tcv3 button,.tcv3 input,.tcv3 select{font:inherit}.tcv3-side{width:250px;min-width:250px;display:flex;flex-direction:column;min-height:0;border-right:1px solid #202532;background:#0b0e15}.tcv3-search{padding:9px;border-bottom:1px solid #202532}.tcv3-searchbox{height:34px;display:flex;align-items:center;gap:7px;padding:0 9px;border:1px solid #252b38;border-radius:7px;background:#090c12}.tcv3-searchbox input{width:100%;border:0;outline:0;background:transparent;color:#fff;font-size:11px}.tcv3-tabs{display:flex;gap:2px;padding:6px 8px;border-bottom:1px solid #202532;overflow:auto}.tcv3-tab,.tcv3-btn{border:1px solid #252b38;background:#10141d;color:#9aa4b7;border-radius:6px;padding:6px 8px;cursor:pointer;white-space:nowrap}.tcv3-tab{border:0;background:transparent;padding:5px 7px}.tcv3-tab.active,.tcv3-btn.active{background:#0d1b33;color:#dbeafe;border-color:#3b82f666}.tcv3-watchhead{display:flex;gap:5px;padding:7px 8px;border-bottom:1px solid #202532}.tcv3-watchhead select{flex:1;background:#11151f;color:#d1d5db;border:1px solid #252b38;border-radius:6px;padding:7px;font-size:10px}.tcv3-icon{width:31px;height:31px;padding:0;display:grid;place-items:center}.tcv3-list{flex:1;overflow:auto;min-height:0}.tcv3-row{display:flex;align-items:center;gap:7px;width:100%;padding:9px 8px;background:transparent;border:0;color:#d1d5db;text-align:left;cursor:pointer}.tcv3-row:hover{background:#111722}.tcv3-row.active{background:#0d1b33;box-shadow:inset 2px 0 #3b82f6}.tcv3-dot{width:5px;height:5px;border-radius:50%;background:#3b82f6}.tcv3-rowmain{min-width:0;flex:1}.tcv3-symbol{font:700 10px ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.tcv3-muted{font-size:9px;color:#64748b}.tcv3-price{text-align:right;font:10px ui-monospace,monospace}.tcv3-up{color:#60a5fa}.tcv3-down{color:#fb7185}.tcv3-results{max-height:190px;overflow:auto;border-bottom:1px solid #202532}.tcv3-result{width:100%;display:flex;gap:7px;align-items:center;border:0;background:transparent;color:#d1d5db;text-align:left;padding:9px;cursor:pointer}.tcv3-result:hover{background:#111722}.tcv3-main{flex:1;min-width:0;min-height:0;height:100%;display:flex;flex-direction:column}.tcv3-toolbar{height:48px;flex:none;display:flex;align-items:center;gap:6px;padding:6px 9px;border-bottom:1px solid #202532;background:#0c0f16;position:relative;overflow:visible}.tcv3-spacer{margin-left:auto;display:flex;gap:6px}.tcv3-grid{flex:1;min-height:0;width:100%;height:100%;padding:6px;display:grid;gap:6px;overflow:hidden}.tcv3-g1{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)}.tcv3-g2{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:minmax(0,1fr)}.tcv3-g4{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}.tcv3-g6{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}.tcv3-g9{grid-template-columns:repeat(3,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr))}.tcv3-chart{min-width:0;min-height:0;width:100%;height:100%;display:flex;flex-direction:column;overflow:hidden;border:1px solid #202532;border-radius:7px;background:#090c12}.tcv3-chart.focused{border-color:#3b82f699;box-shadow:0 0 0 1px #3b82f622}.tcv3-head{height:34px;min-height:34px;display:flex;align-items:center;gap:5px;padding:0 7px;border-bottom:1px solid #202532;background:#0d1119}.tcv3-head strong{min-width:0;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:700 10px ui-monospace,monospace}.tcv3-head select{max-width:170px;background:#11151f;color:#cbd5e1;border:1px solid #252b38;border-radius:4px;padding:3px;font-size:9px}.tcv3-body{flex:1;min-width:0;min-height:0;width:100%;height:100%;position:relative}.tcv3-body>div{width:100%!important;height:100%!important;min-height:0}.tcv3-layoutpop{position:absolute;left:8px;top:45px;z-index:140;width:300px;padding:10px;border:1px solid #303747;border-radius:9px;background:#0b0e15;box-shadow:0 20px 60px #000c}.tcv3-layouts{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:7px}.tcv3-layouts button{padding:8px;border:1px solid #252b38;background:#0e121a;color:#9aa4b7;border-radius:6px;cursor:pointer}.tcv3-layouts button.active{background:#0d1b33;color:#fff;border-color:#3b82f666}.tcv3-bottom{height:38px;min-height:38px;border-top:1px solid #202532;background:#0c0e15;display:flex;gap:3px;padding:4px 6px;overflow:auto}.tcv3-bottom button{border:0;background:transparent;color:#8c93a6;padding:6px 9px;cursor:pointer;border-radius:5px;white-space:nowrap}.tcv3-bottom button.active{background:#0d1b33;color:#3b82f6}.tcv3-panel{position:fixed;z-index:170;right:18px;top:118px;width:min(820px,calc(100vw - 36px));max-height:calc(100vh - 150px);overflow:auto;border:1px solid #303747;border-radius:10px;background:#0b0e15;box-shadow:0 30px 90px #000d}.tcv3-panelhead{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:8px;padding:10px;border-bottom:1px solid #252b38;background:#0e121a}.tcv3-panelhead b{font:700 11px ui-monospace,monospace}.tcv3-close{margin-left:auto}.tcv3-bodypanel{padding:10px}.tcv3-table{width:100%;border-collapse:collapse;font:10px ui-monospace,monospace}.tcv3-table th,.tcv3-table td{padding:7px;border-bottom:1px solid #1b202b;text-align:left}.tcv3-table th{color:#64748b;font-weight:400}.tcv3-blue{color:#3b82f6}.tcv3-red{color:#ef4444}.tcv3-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tcv3-card{border:1px solid #252b38;border-radius:7px;background:#090c12;padding:10px}.tcv3-input{width:100%;background:#11151f;color:#fff;border:1px solid #252b38;border-radius:6px;padding:8px;outline:0}.tcv3-label{display:block;color:#64748b;font:9px ui-monospace,monospace;margin-bottom:4px;text-transform:uppercase}.tcv3-order{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tcv3-wide{grid-column:1/-1}.tcv3-buy,.tcv3-sell{border-radius:6px;padding:9px;border:1px solid;cursor:pointer;font:700 10px ui-monospace,monospace}.tcv3-buy{background:#0d1b33;border-color:#3b82f655;color:#93c5fd}.tcv3-sell{background:#241013;border-color:#ef444455;color:#fca5a5}@media(max-width:900px){.tcv3-side{width:205px;min-width:205px}.tcv3-g6,.tcv3-g9{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(3,minmax(0,1fr))}.tcv3-grid2,.tcv3-order{grid-template-columns:1fr}}
`;

type WatchItem = SearchInstrument & { key:string; label:string; short?:string; type?:string };
const layouts = [
  ['1','tcv3-g1',1],['2','tcv3-g2',2],['4','tcv3-g4',4],['6','tcv3-g6',6],['9','tcv3-g9',9],
] as const;
const defaults=(broker:string):WatchItem[]=>broker==='upstox' ? [
  {key:'NSE_INDEX|Nifty 50',label:'NIFTY 50',symbol:'NIFTY',short:'NIFTY',type:'Index'},
  {key:'NSE_INDEX|Nifty Bank',label:'BANK NIFTY',symbol:'BANK NIFTY',short:'BANK',type:'Index'},
  {key:'BSE_INDEX|SENSEX',label:'SENSEX',symbol:'SENSEX',short:'SENSEX',type:'Index'},
] : [
  {key:'NSE:NIFTY50-INDEX',label:'NIFTY 50',symbol:'NIFTY 50',short:'NIFTY',type:'Index'},
  {key:'NSE:NIFTYBANK-INDEX',label:'BANK NIFTY',symbol:'BANK NIFTY',short:'BANK',type:'Index'},
  {key:'BSE:SENSEX-INDEX',label:'SENSEX',symbol:'SENSEX',short:'SENSEX',type:'Index'},
];
function normalize(broker:string,item:WatchItem):WatchItem{
  const label=String(item.label||item.symbol||item.key);
  if(broker==='upstox'){
    if(/NIFTY\s*50/i.test(label)||item.key.includes('NIFTY50-INDEX')) return {...item,key:'NSE_INDEX|Nifty 50',label:'NIFTY 50',short:'NIFTY',type:'Index'};
    if(/BANK\s*NIFTY/i.test(label)||item.key.includes('NIFTYBANK-INDEX')) return {...item,key:'NSE_INDEX|Nifty Bank',label:'BANK NIFTY',short:'BANK',type:'Index'};
    if(/SENSEX/i.test(label)||item.key.includes('SENSEX-INDEX')) return {...item,key:'BSE_INDEX|SENSEX',label:'SENSEX',short:'SENSEX',type:'Index'};
  }else{
    if(/NIFTY\s*50/i.test(label)||item.key.includes('Nifty 50')) return {...item,key:'NSE:NIFTY50-INDEX',label:'NIFTY 50',short:'NIFTY',type:'Index'};
    if(/BANK\s*NIFTY/i.test(label)||item.key.includes('Nifty Bank')) return {...item,key:'NSE:NIFTYBANK-INDEX',label:'BANK NIFTY',short:'BANK',type:'Index'};
    if(/SENSEX/i.test(label)||item.key.includes('BSE_INDEX|SENSEX')) return {...item,key:'BSE:SENSEX-INDEX',label:'SENSEX',short:'SENSEX',type:'Index'};
  }
  return item;
}

export function LiveTradingTerminalV3(){
  const initialBroker=String(tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId||'fyers').toLowerCase();
  const [broker,setBroker]=useState(initialBroker);
  const [watch,setWatch]=useState<WatchItem[]>(()=>defaults(initialBroker));
  const [selected,setSelected]=useState(defaults(initialBroker)[0].key);
  const [focused,setFocused]=useState(0);
  const [slotKeys,setSlotKeys]=useState<string[]>(()=>[defaults(initialBroker)[0].key]);
  const [layout,setLayout]=useState('tcv3-g1');
  const [layoutOpen,setLayoutOpen]=useState(false);
  const [query,setQuery]=useState('');
  const [segment,setSegment]=useState<InstrumentSearchSegment>('all');
  const [results,setResults]=useState<SearchInstrument[]>([]);
  const [searching,setSearching]=useState(false);
  const [ticks,setTicks]=useState<Record<string,NormalizedMarketTick>>({});
  const [panel,setPanel]=useState<'chain'|'levels'|'positions'|'orders'|'trades'|'ticket'|null>(null);
  const [analytics,setAnalytics]=useState<any>(null);
  const [portfolio,setPortfolio]=useState<any>({positions:[],orders:[],trades:[],funds:null});
  const [message,setMessage]=useState('');
  const [order,setOrder]=useState({side:'Buy' as OrderRequest['side'],orderType:'Market' as OrderRequest['orderType'],quantity:1,product:'MIS' as OrderRequest['product'],price:'',triggerPrice:'',symbol:selected});
  const [busy,setBusy]=useState(false);
  const slotCount=layouts.find(x=>x[1]===layout)?.[2]||1;
  const selectedItem=watch.find(x=>x.key===selected)||watch[0];

  useEffect(()=>{
    const sync=()=>setBroker(String(tradingCoreRuntime.getPrimaryBrokerInfo()?.brokerId||'fyers').toLowerCase());
    const a=tradingCoreRuntime.on('STATUS_CHANGED',sync),b=tradingCoreRuntime.on('BROKER_CONNECTED',sync),c=tradingCoreRuntime.on('BROKER_DISCONNECTED',sync);sync();
    return()=>{a();b();c();};
  },[]);
  useEffect(()=>{
    const next=defaults(broker);let nextWatch=next;
    try{const raw=localStorage.getItem(`tradingcore_terminal_watch_${broker}`);const saved=raw?JSON.parse(raw):null;const normalized=Array.isArray(saved)?saved.map((x:any)=>normalize(broker,x)).filter((x:any)=>x?.key):[];if(normalized.length)nextWatch=normalized;}catch{}
    setWatch(nextWatch);setSelected(nextWatch[0]?.key||'');setFocused(0);setSlotKeys([nextWatch[0]?.key||'']);setTicks({});setAnalytics(null);setMessage('');
  },[broker]);
  useEffect(()=>{try{localStorage.setItem(`tradingcore_terminal_watch_${broker}`,JSON.stringify(watch));}catch{}},[watch,broker]);
  useEffect(()=>{
    const q=query.trim();if(q.length<2){setResults([]);return;}
    let dead=false;const t=setTimeout(async()=>{setSearching(true);try{const r=await searchBrokerInstruments(broker,q,segment,broker==='upstox'?30:60);if(!dead)setResults(r);}catch{if(!dead)setResults([]);}finally{if(!dead)setSearching(false);}},180);
    return()=>{dead=true;clearTimeout(t)};
  },[query,segment,broker]);
  useEffect(()=>{
    const keys=Array.from(new Set(slotKeys.filter(Boolean)));if(!keys.length)return;
    return tradingCoreRuntime.subscribeMarketData(keys,e=>{if(e.type==='tick'&&e.tick)setTicks(p=>({...p,[e.tick!.instrumentKey]:e.tick!}));},slotKeys[focused]);
  },[slotKeys.join('|'),focused,broker]);
  useEffect(()=>{void tradingCoreRuntime.syncPortfolio().then(setPortfolio).catch(()=>{});},[broker]);
  useEffect(()=>{
    const id=requestAnimationFrame(()=>window.dispatchEvent(new Event('resize')));
    return()=>cancelAnimationFrame(id);
  },[layout,slotKeys.join('|')]);

  const changeLayout=(cls:string,count:number)=>{
    const fallback=selectedItem?.key||watch[0]?.key||'';
    setLayout(cls);setLayoutOpen(false);setFocused(Math.min(focused,count-1));
    setSlotKeys(prev=>Array.from({length:count},(_,i)=>prev[i]||watch[i%Math.max(1,watch.length)]?.key||fallback).map(k=>k||fallback));
  };
  const assign=(index:number,key:string)=>{setFocused(index);setSelected(key);setSlotKeys(prev=>{const n=Array.from({length:slotCount},(_,i)=>prev[i]||watch[i%Math.max(1,watch.length)]?.key||key);n[index]=key;return n;});};
  const add=(item:SearchInstrument)=>{if(!item.key)return;setWatch(w=>w.some(x=>x.key===item.key)?w:[...w,item as WatchItem]);setQuery('');setResults([]);assign(focused,item.key);};
  const remove=(key:string)=>{setWatch(w=>w.filter(x=>x.key!==key));setSlotKeys(s=>s.map(k=>k===key?(watch.find(x=>x.key!==key)?.key||''):k));if(selected===key)setSelected(watch.find(x=>x.key!==key)?.key||'');};
  const sync=async()=>{try{setPortfolio(await tradingCoreRuntime.syncPortfolio());}catch(e:any){setMessage(e?.message||'Portfolio sync failed');}};
  const openTicket=(side?:OrderRequest['side'],symbol?:string)=>{setOrder(o=>({...o,side:side||o.side,symbol:symbol||selected}));setPanel('ticket');};
  const submit=async(side?:OrderRequest['side'])=>{const finalSide=side||order.side;if(!order.symbol)return;setBusy(true);setMessage('');try{if(!window.confirm(`Confirm ${finalSide.toUpperCase()} ${order.quantity} ${order.symbol}?`))return;const r=await tradingCoreRuntime.placeOrder({symbol:order.symbol,instrument_token:order.symbol,quantity:order.quantity,orderType:order.orderType,side:finalSide,product:order.product,price:Number(order.price)||undefined,triggerPrice:Number(order.triggerPrice)||undefined,idempotencyKey:globalThis.crypto.randomUUID()} as any);setMessage(`${r.status||'submitted'} ${r.orderId||''}`);await sync();}catch(e:any){setMessage(e?.message||'Order rejected');}finally{setBusy(false);}};

  return <><style>{css}</style><div className="tcv3" onClick={()=>layoutOpen&&setLayoutOpen(false)}>
    <aside className="tcv3-side" onClick={e=>e.stopPropagation()}>
      <div className="tcv3-search"><div className="tcv3-searchbox"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search symbol, stock, option…"/><span className="tcv3-muted">{broker.toUpperCase()}</span></div></div>
      <div className="tcv3-tabs">{(['all','stocks','futures','options'] as InstrumentSearchSegment[]).map(x=><button key={x} className={`tcv3-tab ${segment===x?'active':''}`} onClick={()=>setSegment(x)}>{x.toUpperCase()}</button>)}</div>
      {query.trim().length>=2&&<div className="tcv3-results">{searching?<div className="tcv3-muted" style={{padding:10}}>Searching broker instruments…</div>:results.length?results.map(r=><button key={r.key} className="tcv3-result" onClick={()=>add(r)}><Plus size={13}/><div><div className="tcv3-symbol">{r.label||r.symbol}</div><div className="tcv3-muted">{r.exchange||''} {r.type||''} {r.expiry||''} {r.strike||''} {r.optionType||''}</div></div></button>):<div className="tcv3-muted" style={{padding:10}}>No matching broker instrument.</div>}</div>}
      <div className="tcv3-watchhead"><select value="main" onChange={()=>{}}><option>Main Watchlist · {watch.length}</option></select><button className="tcv3-btn tcv3-icon" onClick={()=>setQuery('NIFTY')}><Plus size={14}/></button></div>
      <div className="tcv3-list">{watch.map(i=>{const t=ticks[i.key],ch=t?.changePercent;return <div key={i.key} className={`tcv3-row ${selected===i.key?'active':''}`} onClick={()=>{setSelected(i.key);const ix=slotKeys.findIndex(k=>k===i.key);if(ix>=0)setFocused(ix);}}><span className="tcv3-dot"/><div className="tcv3-rowmain"><div className="tcv3-symbol">{i.short||i.label}</div><div className="tcv3-muted">{i.label!==i.short?i.label:''} {i.type||''}</div></div><div className="tcv3-price">{t?.ltp!=null?Number(t.ltp).toLocaleString('en-IN',{maximumFractionDigits:2}):'—'}<div className={ch==null?'tcv3-muted':ch>=0?'tcv3-up':'tcv3-down'}>{ch==null?'—':`${ch>=0?'+':''}${Number(ch).toFixed(2)}%`}</div></div><button className="tcv3-btn tcv3-icon" onClick={e=>{e.stopPropagation();remove(i.key)}}><X size={12}/></button></div>})}</div>
      <div className="tcv3-muted" style={{padding:8,borderTop:'1px solid #202532'}}>FOCUSED CHART · {focused+1}<br/>Click a chart, then change its ticker.</div>
    </aside>
    <main className="tcv3-main" onClick={()=>layoutOpen&&setLayoutOpen(false)}>
      <div className="tcv3-toolbar" onClick={e=>e.stopPropagation()}>
        <button className={`tcv3-btn ${layoutOpen?'active':''}`} onClick={()=>setLayoutOpen(v=>!v)}><LayoutGrid size={13}/>Layout {slotCount}<ChevronDown size={11}/></button>
        <button className="tcv3-btn" onClick={()=>setPanel('chain')}><ListOrdered size={13}/>Option Chain</button><button className="tcv3-btn" onClick={()=>setPanel('levels')}><BarChart3 size={13}/>Levels</button><button className="tcv3-btn" onClick={()=>setPanel('positions')}><BriefcaseBusiness size={13}/>Positions</button><button className="tcv3-btn" onClick={()=>setPanel('orders')}><ListOrdered size={13}/>Orders</button><button className="tcv3-btn" onClick={()=>setPanel('trades')}>Trades</button><button className="tcv3-btn" onClick={()=>openTicket()}><Wallet size={13}/>Order Ticket</button>
        <div className="tcv3-spacer"><button className="tcv3-btn" onClick={()=>void sync()}><RefreshCw size={13}/></button><button className="tcv3-btn" onClick={()=>openTicket('Buy')}><Zap size={13}/>Buy</button><button className="tcv3-btn" onClick={()=>openTicket('Sell')}><Zap size={13}/>Sell</button></div>
        {layoutOpen&&<div className="tcv3-layoutpop" onClick={e=>e.stopPropagation()}><div className="tcv3-muted">CHOOSE WORKSPACE LAYOUT</div><div className="tcv3-layouts">{layouts.map(([name,cls,count])=><button key={cls} className={layout===cls?'active':''} onClick={()=>changeLayout(cls,count)}>{name} charts</button>)}</div></div>}
      </div>
      <div className={`tcv3-grid ${layout}`} key={`${layout}:${slotKeys.join('|')}`}>
        {Array.from({length:slotCount},(_,i)=>{const key=slotKeys[i]||watch[i%Math.max(1,watch.length)]?.key||selectedItem?.key;if(!key)return <div key={i} className="tcv3-chart"><div className="tcv3-muted" style={{padding:12}}>No instrument assigned.</div></div>;const item=watch.find(x=>x.key===key)||selectedItem;return <div key={`${i}:${key}:${layout}`} className={`tcv3-chart ${focused===i?'focused':''}`} onClick={()=>{setFocused(i);setSelected(item?.key||key);}}>
          <div className="tcv3-head"><strong title={item?.label}>{item?.label||key}</strong><select value={key} onClick={e=>e.stopPropagation()} onChange={e=>assign(i,e.target.value)}>{watch.map(w=><option key={w.key} value={w.key}>{w.short||w.label}</option>)}</select><button className="tcv3-btn tcv3-icon" onClick={e=>{e.stopPropagation();setFocused(i);setSelected(key);setLayout('tcv3-g1');setSlotKeys([key]);}} title="Maximize">⌗</button><button className="tcv3-btn tcv3-icon" onClick={e=>{e.stopPropagation();openTicket(undefined,key)}} title="Order">⌁</button></div>
          <div className="tcv3-body"><LiveChart key={`${broker}:${i}:${key}:${layout}`} instrumentKey={key} brokerId={broker} tick={ticks[key]} onAnalytics={a=>{if(focused===i)setAnalytics(a)}} /></div>
        </div>})}
      </div>
      <div className="tcv3-bottom"><button className="active" onClick={()=>setPanel('levels')}>Levels</button><button onClick={()=>setPanel('chain')}>Option Chain</button><button onClick={()=>setPanel('positions')}>Positions</button><button onClick={()=>setPanel('orders')}>Orders</button><button onClick={()=>setPanel('trades')}>Trades</button><button onClick={()=>openTicket()}>Order Ticket</button><button onClick={()=>openTicket('Buy')}>BUY</button><button onClick={()=>openTicket('Sell')}>SELL</button></div>
    </main>
    {panel&&<div className="tcv3-panel"><div className="tcv3-panelhead"><ShieldCheck size={14}/><b>{panel==='chain'?'OPTION CHAIN':panel==='levels'?'CORE LEVELS':panel==='positions'?'POSITIONS':panel==='orders'?'ORDERS':panel==='trades'?'TRADES':'ORDER TICKET'}</b><span className="tcv3-muted">Chart {focused+1} · {selectedItem?.label||selected}</span><button className="tcv3-btn tcv3-icon tcv3-close" onClick={()=>setPanel(null)}><X size={13}/></button></div><div className="tcv3-bodypanel">
      {panel==='levels'&&<div className="tcv3-grid2"><div className="tcv3-card"><b className="tcv3-blue">Support</b>{analytics?.support?.length?analytics.support.map((x:any,i:number)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #1b202b'}}><span>{x.state||'ACTIVE'} · {x.source||'price action'}</span><b>₹{Number(x.price).toLocaleString('en-IN',{maximumFractionDigits:2})}</b></div>):<div className="tcv3-muted" style={{marginTop:8}}>Focus a chart and wait for candles.</div>}</div><div className="tcv3-card"><b className="tcv3-red">Resistance</b>{analytics?.resistance?.length?analytics.resistance.map((x:any,i:number)=><div key={i} style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderBottom:'1px solid #1b202b'}}><span>{x.state||'ACTIVE'} · {x.source||'price action'}</span><b>₹{Number(x.price).toLocaleString('en-IN',{maximumFractionDigits:2})}</b></div>):<div className="tcv3-muted" style={{marginTop:8}}>Focus a chart and wait for candles.</div>}</div></div>}
      {panel==='positions'&&<><button className="tcv3-btn" onClick={()=>void sync()}><RefreshCw size={12}/>Refresh</button><table className="tcv3-table"><thead><tr><th>Instrument</th><th>Qty</th><th>Avg</th><th>LTP</th><th>P&L</th></tr></thead><tbody>{(portfolio.positions||[]).map((p:any)=><tr key={p.id||p.symbol}><td>{p.symbol||p.instrument_token}</td><td>{p.quantity??p.netQuantity}</td><td>{p.averagePrice??p.avgPrice??'—'}</td><td>{p.lastPrice??p.ltp??'—'}</td><td>{p.pnl??p.unrealizedPnl??0}</td></tr>)}</tbody></table>{!portfolio.positions?.length&&<div className="tcv3-muted" style={{marginTop:10}}>No open positions.</div>}</>}
      {panel==='orders'&&<><button className="tcv3-btn" onClick={()=>void sync()}><RefreshCw size={12}/>Refresh</button><table className="tcv3-table"><thead><tr><th>Instrument</th><th>Side</th><th>Qty</th><th>Type</th><th>Status</th></tr></thead><tbody>{(portfolio.orders||[]).map((o:any)=><tr key={o.orderId||o.id}><td>{o.symbol||o.instrument_token}</td><td>{o.side}</td><td>{o.quantity}</td><td>{o.orderType||o.type}</td><td>{o.status}</td></tr>)}</tbody></table>{!portfolio.orders?.length&&<div className="tcv3-muted" style={{marginTop:10}}>No orders.</div>}</>}
      {panel==='trades'&&<table className="tcv3-table"><thead><tr><th>Instrument</th><th>Side</th><th>Qty</th><th>Price</th><th>Time</th></tr></thead><tbody>{(portfolio.trades||[]).map((t:any)=><tr key={t.tradeId||t.id}><td>{t.symbol}</td><td>{t.side}</td><td>{t.quantity}</td><td>₹{t.price}</td><td>{t.timestamp||t.tradeDate||'—'}</td></tr>)}</tbody></table>}
      {panel==='chain'&&<OptionChainPanel broker={broker} selected={selectedItem} onBuy={s=>openTicket('Buy',s)} />}
      {panel==='ticket'&&<div className="tcv3-order"><div className="tcv3-wide"><label className="tcv3-label">Instrument</label><input className="tcv3-input" value={order.symbol} onChange={e=>setOrder({...order,symbol:e.target.value})}/></div><div><label className="tcv3-label">Side</label><select className="tcv3-input" value={order.side} onChange={e=>setOrder({...order,side:e.target.value as OrderRequest['side']})}><option>Buy</option><option>Sell</option></select></div><div><label className="tcv3-label">Order Type</label><select className="tcv3-input" value={order.orderType} onChange={e=>setOrder({...order,orderType:e.target.value as OrderRequest['orderType']})}><option>Market</option><option>Limit</option><option>SL</option><option>SL-M</option></select></div><div><label className="tcv3-label">Quantity</label><input className="tcv3-input" type="number" min="1" value={order.quantity} onChange={e=>setOrder({...order,quantity:Math.max(1,Number(e.target.value)||1)})}/></div><div><label className="tcv3-label">Product</label><select className="tcv3-input" value={order.product} onChange={e=>setOrder({...order,product:e.target.value as OrderRequest['product']})}><option>MIS</option><option>CNC</option><option>NRML</option></select></div>{order.orderType!=='Market'&&<div><label className="tcv3-label">Price</label><input className="tcv3-input" type="number" value={order.price} onChange={e=>setOrder({...order,price:e.target.value})}/></div>}{(order.orderType==='SL'||order.orderType==='SL-M')&&<div><label className="tcv3-label">Trigger</label><input className="tcv3-input" type="number" value={order.triggerPrice} onChange={e=>setOrder({...order,triggerPrice:e.target.value})}/></div>}<div className="tcv3-wide tcv3-card">Available margin: <b>₹{portfolio.funds?.availableMargin!=null?Number(portfolio.funds.availableMargin).toLocaleString('en-IN'):'—'}</b></div><button disabled={busy} className="tcv3-buy" onClick={()=>void submit('Buy')}>{busy?'SENDING…':'BUY · SEND LIVE ORDER'}</button><button disabled={busy} className="tcv3-sell" onClick={()=>void submit('Sell')}>{busy?'SENDING…':'SELL · SEND LIVE ORDER'}</button>{message&&<div className="tcv3-wide tcv3-muted">{message}</div>}</div>}
    </div></div>}
  </div></>;
}

function OptionChainPanel({broker,selected,onBuy}:{broker:string;selected?:WatchItem;onBuy:(symbol:string)=>void}){
  const [loading,setLoading]=useState(false);const [data,setData]=useState<any>(null);const [error,setError]=useState('');
  const key=useMemo(()=>selected?.key||'',[selected?.key]);
  useEffect(()=>{if(!key)return;let dead=false;setLoading(true);setError('');const u=broker==='upstox'?key: key;tradingCoreRuntime.getOptionChain(u).then(x=>{if(!dead)setData(x)}).catch(e=>{if(!dead)setError(e?.message||'Option chain unavailable')}).finally(()=>{if(!dead)setLoading(false)});return()=>{dead=true}},[broker,key]);
  const rows=Array.isArray(data?.contracts)?data.contracts:Array.isArray(data)?data:[];
  if(loading)return <div className="tcv3-muted">Loading broker option chain…</div>;
  if(error)return <div className="tcv3-muted">{error}</div>;
  return rows.length?<table className="tcv3-table"><thead><tr><th>CALL LTP</th><th>STRIKE</th><th>PUT LTP</th><th>ACTION</th></tr></thead><tbody>{rows.map((r:any,i:number)=><tr key={i}><td>{r.call?.ltp??r.call?.lastPrice??'—'}</td><td><b>{r.strike??r.strikePrice??'—'}</b></td><td>{r.put?.ltp??r.put?.lastPrice??'—'}</td><td>{r.call?.instrumentKey&&<button className="tcv3-buy" onClick={()=>onBuy(r.call.instrumentKey)}>BUY CE</button>} {r.put?.instrumentKey&&<button className="tcv3-sell" onClick={()=>onBuy(r.put.instrumentKey)}>BUY PE</button>}</td></tr>)}</tbody></table>:<div className="tcv3-muted">No option-chain rows returned for this broker/instrument.</div>;
}
