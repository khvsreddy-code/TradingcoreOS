import {
  registerLegendAction,
  registerLegendCallout,
  registerSidePanel,
  registerStatePersistence,
  registerSymbolRanking,
  registerWidgetAction,
  type LegendCalloutSpec,
  type SidePanelDescriptor,
  type StatePersistenceHandler,
  type SymbolRankingHook,
  type WidgetActionDescriptor,
} from './velaChartFacade';
import { tradingCoreRuntime } from '../../runtime/TradingCoreRuntime';
import { loadTcoVelaJournal, saveTcoVelaJournal } from './tcoVelaSupabaseStorage';

type WatchlistItem = { symbol: string; label: string; short: string };

const DEFAULT_WATCHLIST: readonly WatchlistItem[] = [
  { symbol: 'NSE:NIFTY50-INDEX', label: 'NIFTY 50', short: 'NIFTY' },
  { symbol: 'NSE:NIFTYBANK-INDEX', label: 'NIFTY BANK', short: 'BANKNIFTY' },
  { symbol: 'NSE:FINNIFTY-INDEX', label: 'NIFTY FIN SERVICE', short: 'FINNIFTY' },
  { symbol: 'NSE:MIDCPNIFTY-INDEX', label: 'NIFTY MIDCAP SELECT', short: 'MIDCPNIFTY' },
  { symbol: 'BSE:SENSEX-INDEX', label: 'S&P BSE SENSEX', short: 'SENSEX' },
];
const WATCHLIST_STATE_KEY = 'tco.watchlist.v2';
const WATCHLIST_LOCAL_KEY = 'tradingcore:vela:watchlist:v2';
let watchlist: WatchlistItem[] = [...DEFAULT_WATCHLIST];
const watchlistRefreshers = new Set<()=>void>();

function normalizeWatchlist(value: unknown): WatchlistItem[] {
  const raw=Array.isArray(value)?value:value&&typeof value==='object'&&Array.isArray((value as Record<string,unknown>).items)?(value as Record<string,unknown>).items:[];
  const result: WatchlistItem[]=[]; const seen=new Set<string>();
  for(const item of raw){
    if(!item||typeof item!=='object')continue;
    const s=item as Record<string,unknown>;
    const symbol=String(s.symbol??'').trim().toUpperCase();
    if(!symbol||seen.has(symbol))continue;
    const parts=symbol.includes(':')?symbol.split(':',2):['NSE',symbol];
    const ticker=parts[1]||symbol;
    result.push({symbol,label:String(s.label??ticker).trim()||ticker,short:String(s.short??ticker).trim()||ticker});
    seen.add(symbol);
    if(result.length>=50)break;
  }
  return result.length?result:[...DEFAULT_WATCHLIST];
}
function persistWatchlistLocal(){try{localStorage.setItem(WATCHLIST_LOCAL_KEY,JSON.stringify({version:2,items:watchlist}));}catch{}}
function loadWatchlistLocal(){try{const raw=localStorage.getItem(WATCHLIST_LOCAL_KEY);if(raw)watchlist=normalizeWatchlist(JSON.parse(raw));}catch{}}
loadWatchlistLocal();

function descriptor(item:WatchlistItem){
  const parts=item.symbol.includes(':')?item.symbol.split(':',2):['NSE',item.symbol];
  return {ticker:parts[1]||item.symbol,prefix:parts[0]||'NSE',description:item.label,type:'index',provider:'tco'};
}
function applyWatchlist(next:WatchlistItem[], stateChanged?:()=>void){
  watchlist=normalizeWatchlist(next); persistWatchlistLocal(); stateChanged?.(); watchlistRefreshers.forEach(fn=>fn());
}

const watchlistStatePersistence: StatePersistenceHandler={
  key:WATCHLIST_STATE_KEY, scope:'global',
  serialize(){return {version:2,items:watchlist};},
  restore(payload){watchlist=normalizeWatchlist(payload);persistWatchlistLocal();watchlistRefreshers.forEach(fn=>fn());},
};
const watchlistSymbolRanking: SymbolRankingHook=(pool)=>{
  const existing=new Map(pool.map(x=>[`${String(x.prefix||'').toUpperCase()}:${String(x.ticker||'').toUpperCase()}`,x]));
  const preferred=watchlist.map(item=>{
    const d=descriptor(item); const key=`${d.prefix.toUpperCase()}:${d.ticker.toUpperCase()}`;
    return existing.get(key)||d;
  });
  const keys=new Set(preferred.map(x=>`${String(x.prefix||'').toUpperCase()}:${String(x.ticker||'').toUpperCase()}`));
  return [...preferred,...pool.filter(x=>!keys.has(`${String(x.prefix||'').toUpperCase()}:${String(x.ticker||'').toUpperCase()}`))];
};
registerStatePersistence(watchlistStatePersistence);
registerSymbolRanking(watchlistSymbolRanking);

const JOURNAL_KEY='tradingcore:vela:journal:v1';
function panelRoot(body:HTMLElement){body.textContent='';const root=document.createElement('div');root.style.cssText='height:100%;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;background:var(--vela-bg,#080b12);color:var(--vela-fg,#e5e7eb);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;';body.appendChild(root);return root;}

const bookmarksPanel: SidePanelDescriptor={
  id:'tco.bookmarks',title:'Watchlist',icon:'star',order:10,width:320,resizable:true,minWidth:260,maxWidth:460,
  mount(ctx,body,header){
    header.setTitle('Watchlist');
    const root=panelRoot(body);
    const meta=document.createElement('div');meta.style.cssText='font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;';root.appendChild(meta);
    const controls=document.createElement('div');controls.style.cssText='display:flex;justify-content:space-between;gap:8px;padding:2px 0 6px;';
    const add=document.createElement('button');add.type='button';add.textContent='+ Add current';add.style.cssText='border:1px solid rgba(155,138,255,.24);border-radius:6px;padding:5px 8px;background:rgba(124,92,255,.10);color:#ddd6fe;font:600 9px ui-monospace;cursor:pointer;';
    const search=document.createElement('button');search.type='button';search.textContent='Search';search.style.cssText='border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:5px 8px;background:#0c111a;color:#cbd5e1;font:600 9px ui-monospace;cursor:pointer;';
    controls.append(add,search);root.appendChild(controls);
    const rows=document.createElement('div');rows.style.cssText='display:flex;flex-direction:column;gap:2px;min-height:0;overflow:auto;';root.appendChild(rows);
    const quotes=new Map<string,{ltp:number;changePercent?:number}>();
    let stop:(()=>void)|undefined;
    const subscribe=()=>{stop?.();stop=undefined;const symbols=watchlist.map(x=>x.symbol);if(!symbols.length)return;stop=tradingCoreRuntime.subscribeMarketData(symbols,(e)=>{
      if(e.type!=='tick'||!e.tick)return;const symbol=String(e.tick.instrumentKey||'').trim();const ltp=Number(e.tick.ltp??e.tick.close);if(!symbol||!Number.isFinite(ltp))return;
      quotes.set(symbol,{ltp,changePercent:Number.isFinite(Number(e.tick.changePercent))?Number(e.tick.changePercent):undefined});render();
    });};
    const render=()=>{
      const current=String(ctx.symbol||'').toUpperCase();meta.textContent=`${current} · ${ctx.timeframe} · ${watchlist.length} symbols`;rows.textContent='';
      for(const item of watchlist){
        const q=quotes.get(item.symbol);const row=document.createElement('div');row.style.cssText='display:flex;align-items:center;gap:4px;width:100%;border:1px solid transparent;border-radius:7px;padding:4px 5px;background:transparent;box-sizing:border-box;';
        const selected=item.symbol===current;if(selected){row.style.background='rgba(124,92,255,.10)';row.style.borderColor='rgba(155,138,255,.22)';}
        const button=document.createElement('button');button.type='button';button.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1;min-width:0;border:0;border-radius:5px;padding:7px 6px;background:transparent;color:#e2e8f0;text-align:left;cursor:pointer;';
        const left=document.createElement('span');left.style.cssText='min-width:0;display:flex;flex-direction:column;gap:2px;';
        const sym=document.createElement('span');sym.textContent=item.short;sym.style.cssText='font-size:11px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        const detail=document.createElement('span');detail.textContent=item.label;detail.style.cssText='font-size:9px;color:#64748b;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';left.append(sym,detail);
        const right=document.createElement('span');right.style.cssText='display:flex;flex-direction:column;align-items:flex-end;gap:2px;flex:0 0 auto;';
        const ltp=document.createElement('span');ltp.textContent=q?q.ltp.toLocaleString('en-IN',{maximumFractionDigits:2}):'—';ltp.style.cssText='font-size:11px;font-weight:700;color:#cbd5e1;font-variant-numeric:tabular-nums;';
        const pct=document.createElement('span');const p=q?.changePercent;pct.textContent=Number.isFinite(p)?`${p!>=0?'+':''}${p!.toFixed(2)}%`:'LIVE —';pct.style.cssText=`font-size:9px;color:${Number.isFinite(p)?(p!>=0?'#4ade80':'#fb7185'):'#64748b'};font-variant-numeric:tabular-nums;`;right.append(ltp,pct);
        button.append(left,right);button.onclick=()=>ctx.setSymbol(item.symbol);button.onmouseenter=()=>{if(!selected)button.style.background='rgba(255,255,255,.04)';};button.onmouseleave=()=>{button.style.background='transparent';};
        const del=document.createElement('button');del.type='button';del.textContent='×';del.title='Remove';del.style.cssText='width:24px;height:24px;border:0;border-radius:5px;background:transparent;color:#475569;font:14px/1 sans-serif;cursor:pointer;';
        del.onclick=(e)=>{e.preventDefault();e.stopPropagation();applyWatchlist(watchlist.filter(x=>x.symbol!==item.symbol),ctx.stateChanged);subscribe();};
        row.append(button,del);rows.appendChild(row);
      }
    };
    const refresh=()=>{render();subscribe();};
    add.onclick=()=>{const symbol=String(ctx.symbol||'').trim().toUpperCase();if(!symbol)return;if(watchlist.some(x=>x.symbol===symbol)){ctx.toast(`${symbol} is already in the watchlist`,'info');return;}const parts=symbol.includes(':')?symbol.split(':',2):['NSE',symbol];applyWatchlist([...watchlist,{symbol,label:parts[1]||symbol,short:parts[1]||symbol}],ctx.stateChanged);subscribe();ctx.toast(`${symbol} added to watchlist`,'success');};
    search.onclick=()=>ctx.openSymbolSearch();
    watchlistRefreshers.add(refresh);refresh();
    return {onOpen:refresh,onChart:refresh,destroy(){watchlistRefreshers.delete(refresh);stop?.();}};
  },
};

const journalPanel: SidePanelDescriptor={
  id:'tco.journal',title:'Journal',icon:'calendar',order:20,width:340,resizable:true,minWidth:280,maxWidth:520,
  mount(ctx,body,header){
    header.setTitle('Journal');const root=panelRoot(body);const context=document.createElement('div');context.style.cssText='font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.12em;';root.appendChild(context);
    const textarea=document.createElement('textarea');textarea.value=localStorage.getItem(JOURNAL_KEY)??'';void loadTcoVelaJournal().then(v=>{if(v!=null&&document.contains(textarea))textarea.value=v;});textarea.placeholder='Trade notes, observations, setups, execution review...';textarea.style.cssText='flex:1;min-height:180px;resize:none;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:10px;background:#090d15;color:#e2e8f0;outline:none;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;box-sizing:border-box;';root.appendChild(textarea);
    const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;';const save=document.createElement('button');save.type='button';save.textContent='Save note';save.style.cssText='flex:1;border:1px solid rgba(155,138,255,.28);border-radius:7px;padding:8px;background:rgba(124,92,255,.12);color:#ddd6fe;font:11px ui-monospace;cursor:pointer;';save.onclick=()=>{localStorage.setItem(JOURNAL_KEY,textarea.value);void saveTcoVelaJournal(textarea.value);};const stamp=document.createElement('button');stamp.type='button';stamp.textContent='Stamp context';stamp.style.cssText='border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:8px 10px;background:#0c111a;color:#cbd5e1;font:11px ui-monospace;cursor:pointer;';stamp.onclick=()=>{const line=`[${new Date().toLocaleString('en-IN')}] ${ctx.symbol} · ${ctx.timeframe}`;textarea.value=textarea.value?`${textarea.value.replace(/\s*$/,'')}\n${line}`:line;textarea.focus();};actions.append(save,stamp);root.appendChild(actions);
    const refresh=()=>{context.textContent=`${ctx.symbol} · ${ctx.timeframe}`;};return {onOpen:refresh,onChart:refresh};
  },
};

const accountPanel: SidePanelDescriptor={
  id:'tco.account',title:'Account',icon:'user',order:5,width:300,resizable:false,minWidth:280,maxWidth:360,
  mount(_ctx,body,header){
    header.setTitle('TradingCoreOS Account');const root=panelRoot(body);const card=document.createElement('div');card.style.cssText='display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:linear-gradient(145deg,#11131a,#090b10);';
    const avatar=document.createElement('img');avatar.alt='Profile picture';avatar.width=64;avatar.height=64;avatar.style.cssText='width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid rgba(124,92,255,.45);';
    const name=document.createElement('div');name.style.cssText='font-size:13px;font-weight:700;color:#f8fafc;';const email=document.createElement('div');email.style.cssText='font-size:10px;color:#7f899e;';const actions=document.createElement('div');actions.style.cssText='display:flex;gap:6px;width:100%;margin-top:8px;';
    const profile=document.createElement('button');profile.type='button';profile.textContent='Profile';profile.style.cssText='flex:1;border:1px solid rgba(124,92,255,.3);border-radius:8px;padding:8px;background:rgba(124,92,255,.10);color:#ddd6fe;font:600 10px ui-monospace;cursor:pointer;';profile.onclick=()=>{window.history.pushState({},'', '/profile');window.dispatchEvent(new PopStateEvent('popstate'));};
    const settings=document.createElement('button');settings.type='button';settings.textContent='Settings';settings.style.cssText='flex:1;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:8px;background:#0d1017;color:#cbd5e1;font:600 10px ui-monospace;cursor:pointer;';settings.onclick=()=>window.dispatchEvent(new Event('tco:open-settings'));
    actions.append(profile,settings);card.append(avatar,name,email,actions);root.append(card);
    void (async()=>{try{const client=(await import('../../auth/supabaseClient')).getSupabaseClient();const u=(await client.auth.getUser()).data.user;if(!u)return;name.textContent=u.user_metadata?.full_name||u.email||'Trader';email.textContent=u.email||'';if(u.user_metadata?.avatar_url)avatar.src=String(u.user_metadata.avatar_url);const {data}=await client.from('profiles').select('name,email,avatar').eq('id',u.id).maybeSingle();if(data){name.textContent=data.name||name.textContent;email.textContent=data.email||email.textContent;if(data.avatar)avatar.src=String(data.avatar);}}catch{}})();
    return {};
  },
};

const coreSpiritOpenAction: Parameters<typeof registerLegendAction>[0]={
  id:'tco.corespirit.open',icon:'indicators',tooltip:'Open CoreSpirit source',order:10,when:(indicator)=>Boolean(indicator.source),
  run(_ctx,indicator){if(indicator.source)try{localStorage.setItem('tradingcore:corespirit:selected-source',indicator.source);}catch{};window.dispatchEvent(new Event('tco:corespirit-source-selected'));},
};
const coreSpiritStatusCallout: Parameters<typeof registerLegendCallout>[0]={
  id:'tco.corespirit.status',order:10,
  callout(indicator){if(!indicator.source)return null;const spec:LegendCalloutSpec={icon:'indicators',background:'rgba(124,92,255,.14)',color:'#c4b5fd',tooltip:'CoreSpirit executable',content:{title:indicator.title,items:[{type:'text',text:'CoreSpirit executable · Vela renderer'}]}};return spec;},
};
registerLegendAction(coreSpiritOpenAction);registerLegendCallout(coreSpiritStatusCallout);
registerSidePanel(accountPanel);registerSidePanel(bookmarksPanel);registerSidePanel(journalPanel);

const brandAction: WidgetActionDescriptor={id:'tco.brand',target:'topbar',label:'TradingCoreOS × Vela',iconOnly:false,align:'left',order:0,mobile:'menu',run(){}};
const watchlistAction: WidgetActionDescriptor={id:'tco.watchlist',target:'topbar',label:'Watchlist',icon:'star',iconOnly:false,align:'right',order:0,mobile:'menu',run(ctx){ctx.togglePanel('tco.bookmarks');}};
const journalAction: WidgetActionDescriptor={id:'tco.journal',target:'topbar',label:'Journal',icon:'calendar',iconOnly:false,align:'right',order:1,mobile:'menu',run(ctx){ctx.togglePanel('tco.journal');}};
const panelsAction: WidgetActionDescriptor={id:'tco.panels',target:'topbar',label:'Panels',icon:'layout',iconOnly:false,align:'right',order:2,mobile:'menu',run(ctx){ctx.togglePanel('tco.bookmarks');}};
const profileAction: WidgetActionDescriptor={id:'tco.profile',target:'topbar',label:'Account',icon:'user',iconOnly:true,align:'right',order:3,mobile:'menu',run(ctx){ctx.togglePanel('tco.account');}};
const brokerAction: WidgetActionDescriptor={id:'tco.broker-connection',target:'topbar',label:'Broker Connection',icon:'gear',iconOnly:true,align:'right',order:10,mobile:'menu',run(){window.dispatchEvent(new Event('tco:open-broker'));}};
registerWidgetAction(brandAction);registerWidgetAction(watchlistAction);registerWidgetAction(journalAction);registerWidgetAction(panelsAction);registerWidgetAction(profileAction);registerWidgetAction(brokerAction);
