import {
  registerSidePanel, registerWidgetAction,
  type SidePanelDescriptor, type WidgetActionDescriptor,
} from './velaChartFacade';
import { tradingCoreRuntime } from '../../runtime/TradingCoreRuntime';
import { beginVelaPricePick, cancelVelaPricePick, getVelaOrderDraft, setVelaOrderDraft } from './tcoVelaTradingInteractions';

const nativeTaGroups: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['Trend / average', ['moving-average','rma','zlema','vidya','linear-regression','supertrend','parabolic-sar','pivot-points','aroon','average-directional-index','vortex-indicator']],
  ['Momentum / oscillator', ['rsi','stochastic','stochastic-rsi','macd','ppo','awesome-oscillator','commodity-channel-index','williams-percent-r','chande-momentum-oscillator','connors-rsi','rate-of-change','ultimate-oscillator']],
  ['Volatility', ['average-true-range','historical-volatility','standard-deviation','ulcer-index','choppiness-index','chaikin-volatility']],
  ['Bands / channels', ['bollinger-bands','keltner-channels','donchian-channels','chandelier-exit','ma-envelope']],
  ['Volume / flow', ['vwap','on-balance-volume','accumulation-distribution','chaikin-money-flow','chaikin-oscillator','ease-of-movement','force-index','money-flow-index','volume-oscillator','volume-flow-indicator','intraday-intensity']],
] as const;

function root(body:HTMLElement):HTMLDivElement{
  body.textContent='';
  const el=document.createElement('div');
  el.style.cssText='height:100%;display:flex;flex-direction:column;gap:8px;padding:10px;box-sizing:border-box;background:var(--vela-bg,#080b12);color:var(--vela-fg,#e5e7eb);font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;overflow:auto;';
  body.appendChild(el); return el;
}
function button(label:string):HTMLButtonElement{
  const b=document.createElement('button'); b.type='button'; b.textContent=label;
  b.style.cssText='border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px 8px;background:#0c1118;color:#cbd5e1;font:10px ui-monospace;cursor:pointer;text-align:left;';
  return b;
}

const quickOrderPanel:SidePanelDescriptor={
  id:'tco.quick-order',title:'Chart Order',icon:'zap',order:12,width:360,resizable:true,minWidth:300,maxWidth:520,
  mount(ctx,body,header){
    header.setTitle('Chart Order');
    const el=root(body);
    const state=document.createElement('div'); state.style.cssText='font-size:9px;color:#64748b;line-height:1.5;'; el.appendChild(state);
    const form=document.createElement('div'); form.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:7px;'; el.appendChild(form);
    const field=(labelText:string,initial:string)=>{
      const wrap=document.createElement('label'); wrap.style.cssText='display:flex;flex-direction:column;gap:4px;';
      const l=document.createElement('span'); l.textContent=labelText.toUpperCase(); l.style.cssText='font-size:8px;color:#94a3b8;letter-spacing:.08em;';
      const i=document.createElement('input'); i.value=initial; i.inputMode='decimal'; i.style.cssText='width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px 8px;background:#0b1018;color:#e2e8f0;font:10px ui-monospace;outline:none;';
      wrap.append(l,i); form.appendChild(wrap); return i;
    };
    const entry=field('Entry price',''); const qty=field('Quantity','1'); const stop=field('Stop loss',''); const target=field('Target','');
    const selects=document.createElement('div'); selects.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:7px;'; el.appendChild(selects);
    const orderType=document.createElement('select'); orderType.innerHTML='<option value="Limit">Limit</option><option value="Market">Market</option>'; orderType.style.cssText='border:1px solid rgba(255,255,255,.08);border-radius:7px;padding:7px;background:#0b1018;color:#cbd5e1;font:10px ui-monospace;';
    const product=document.createElement('select'); product.innerHTML='<option value="MIS">MIS</option><option value="CNC">CNC</option><option value="NRML">NRML</option>'; product.style.cssText=orderType.style.cssText; selects.append(orderType,product);
    const picks=document.createElement('div'); picks.style.cssText='display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;'; el.appendChild(picks);
    const makePick=(text:string,targetInput:HTMLInputElement,reason:'entry'|'stop'|'target')=>{const b=button(text);b.onclick=()=>beginVelaPricePick(ctx,reason,p=>{targetInput.value=String(Number(p.price.toFixed(2)));render();});picks.appendChild(b);};
    makePick('Pick Entry',entry,'entry'); makePick('Pick SL',stop,'stop'); makePick('Pick Target',target,'target');
    const actions=document.createElement('div'); actions.style.cssText='display:grid;grid-template-columns:1fr 1fr;gap:6px;'; el.appendChild(actions);
    const submit=(side:'Buy'|'Sell')=>{
      const b=button(side==='Buy'?'BUY / CONFIRM':'SELL / CONFIRM'); b.style.fontWeight='700'; actions.appendChild(b);
      b.onclick=async()=>{
        const symbol=String(ctx.symbol||'').trim(); const nQty=Math.floor(Number(qty.value)); const nEntry=Number(entry.value); const nStop=Number(stop.value); const nTarget=Number(target.value);
        if(!symbol||!Number.isFinite(nQty)||nQty<=0){ctx.toast('Enter a valid quantity.','error');return;}
        if(orderType.value==='Limit'&&(!Number.isFinite(nEntry)||nEntry<=0)){ctx.toast('Limit orders require a valid price.','error');return;}
        if(Number.isFinite(nStop)&&Number.isFinite(nEntry)&&nStop>0 && ((side==='Buy'&&nStop>=nEntry)||(side==='Sell'&&nStop<=nEntry))){ctx.toast('Stop loss must be below entry for buys and above entry for sells.','error');return;}
        const confirmed=window.confirm(side+' '+nQty+' '+symbol+' '+orderType.value+(orderType.value==='Limit'?' @ '+nEntry:'')+'\nSL: '+(nStop>0?nStop:'none')+' · Target: '+(nTarget>0?nTarget:'none'));
        if(!confirmed)return; b.disabled=true;
        try{
          const result=await tradingCoreRuntime.placeOrder({symbol,instrument_token:symbol,quantity:nQty,side,orderType:orderType.value as any,product:product.value as any,...(orderType.value==='Limit'?{price:nEntry}:{}),...(nStop>0&&Number.isFinite(nStop)?{stopLoss:nStop}:{}),...(nTarget>0&&Number.isFinite(nTarget)?{takeProfit:nTarget}:{}),idempotencyKey:'tco-chart-'+Date.now()+'-'+side});
          state.textContent='SUBMITTED · '+result.status+' · '+result.orderId; ctx.toast(result.status+' · '+result.orderId,'success');
        }catch(error){ctx.toast(error instanceof Error?error.message:String(error),'error');}finally{b.disabled=false;}
      };
    };
    submit('Buy'); submit('Sell');
    const clear=button('Cancel pick / reset'); clear.style.marginTop='2px'; clear.onclick=()=>{cancelVelaPricePick();entry.value='';stop.value='';target.value='';setVelaOrderDraft(null);render();}; el.appendChild(clear);
    const render=()=>{
      const draft=getVelaOrderDraft();
      if(draft){if(!entry.value)entry.value=String(draft.price);state.textContent=draft.side.toUpperCase()+' '+draft.symbol+' · pointer '+draft.price.toFixed(2)+(draft.time?' · '+new Date(draft.time).toLocaleString('en-IN'):'');}
      else state.textContent=String(ctx.symbol||'No symbol')+' · explicit confirmation required before live order';
      entry.disabled=orderType.value==='Market';
    };
    orderType.addEventListener('change',render); render();
    return {onOpen:render,onChart:render,destroy:()=>{cancelVelaPricePick();orderType.removeEventListener('change',render);}};
  },
};

const nativeTaPanel:SidePanelDescriptor={
  id:'tco.native-ta',title:'Native TA',icon:'indicators',order:30,width:360,resizable:true,minWidth:300,maxWidth:520,
  mount(ctx,body,header){
    header.setTitle('Vela Native Technical Analysis'); const el=root(body);
    const meta=document.createElement('div'); meta.style.cssText='font-size:9px;color:#64748b;'; el.appendChild(meta);
    const status=document.createElement('div'); status.style.cssText='font-size:9px;color:#cbd5e1;'; el.appendChild(status);
    const list=document.createElement('div'); list.style.cssText='display:flex;flex-direction:column;gap:7px;'; el.appendChild(list);
    let generation=0;
    const render=async()=>{
      const chart=ctx.chart; const g=++generation; meta.textContent=ctx.symbol+' · '+ctx.timeframe;
      try{
        const catalog=await chart.availableNativeIndicators(); if(g!==generation)return;
        list.textContent=''; const byType=new Map(catalog.map(x=>[x.type,x]));
        for(const [group,types] of nativeTaGroups){
          const heading=document.createElement('div'); heading.textContent=group.toUpperCase(); heading.style.cssText='font-size:8px;color:#94a3b8;letter-spacing:.12em;border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:3px;'; list.appendChild(heading);
          for(const type of types){
            const info=byType.get(type); if(!info)continue;
            const b=button((info.present?'✓ ':'')+info.title+(info.supported?'':' · unsupported')); b.disabled=!info.supported; b.onclick=()=>{ctx.addNativeIndicator(info.type); ctx.toast(info.title+' added to Vela','success'); render();}; list.appendChild(b);
          }
        }
        status.textContent='Native indicators on chart: '+chart.presentNativeIndicators().length;
      }catch(error){status.textContent=error instanceof Error?error.message:String(error);}
    };
    void render(); return {onOpen:()=>void render(),onChart:()=>void render()};
  },
};

const quickOrderTopbar:WidgetActionDescriptor={id:'tco.quick-order.topbar',target:'topbar',label:'Quick Order',icon:'zap',iconOnly:true,align:'right',order:11,mobile:'menu',run(ctx){ctx.togglePanel('tco.quick-order');}};
const contextBuy:WidgetActionDescriptor={id:'tco.context.buy-limit',target:'context:body',label:'Buy limit at price',icon:'arrow-up',order:10,when:ctx=>ctx.pointer?.paneKind==='price'&&Number.isFinite(Number(ctx.pointer?.price)),run(ctx){const p=ctx.pointer!;setVelaOrderDraft({side:'Buy',symbol:ctx.symbol,price:Number(p.price),time:p.time,source:'context',quantity:1,orderType:'Limit',product:'MIS'});ctx.togglePanel('tco.quick-order');}};
const contextSell:WidgetActionDescriptor={id:'tco.context.sell-limit',target:'context:body',label:'Sell limit at price',icon:'arrow-down',order:11,when:ctx=>ctx.pointer?.paneKind==='price'&&Number.isFinite(Number(ctx.pointer?.price)),run(ctx){const p=ctx.pointer!;setVelaOrderDraft({side:'Sell',symbol:ctx.symbol,price:Number(p.price),time:p.time,source:'context',quantity:1,orderType:'Limit',product:'MIS'});ctx.togglePanel('tco.quick-order');}};
const contextPickRisk:WidgetActionDescriptor={id:'tco.context.pick-risk',target:'context:body',label:'Pick risk levels',icon:'crosshair',order:12,when:ctx=>ctx.pointer?.paneKind==='price',run(ctx){ctx.togglePanel('tco.quick-order');beginVelaPricePick(ctx,'stop',pick=>{setVelaOrderDraft({side:'Buy',symbol:ctx.symbol,price:pick.price,time:pick.time,source:'pick',quantity:1,orderType:'Limit',product:'MIS'});ctx.toast('Stop selected at '+pick.price.toFixed(2),'success');});}};
const nativeTaTopbar:WidgetActionDescriptor={id:'tco.native-ta.topbar',target:'topbar',label:'Native TA',icon:'indicators',iconOnly:true,align:'right',order:12,mobile:'menu',run(ctx){ctx.togglePanel('tco.native-ta');}};

registerSidePanel(quickOrderPanel); registerSidePanel(nativeTaPanel);
registerWidgetAction(quickOrderTopbar); registerWidgetAction(contextBuy); registerWidgetAction(contextSell); registerWidgetAction(contextPickRisk); registerWidgetAction(nativeTaTopbar);

export { quickOrderPanel, nativeTaPanel };