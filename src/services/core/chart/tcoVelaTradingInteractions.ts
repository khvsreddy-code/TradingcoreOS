export type VelaPricePick = { price:number; time:number|null; reason:'entry'|'stop'|'target' };
export type VelaOrderDraft = { side:'Buy'|'Sell'; symbol:string; price:number; time:number|null; source:'context'|'pick'; quantity:number; orderType:'Limit'|'Market'; product:'CNC'|'MIS'|'NRML' };

let orderDraft: VelaOrderDraft|null = null;
let pickCancel:(()=>void)|null = null;

export function getVelaOrderDraft(): VelaOrderDraft|null { return orderDraft ? { ...orderDraft } : null; }
export function setVelaOrderDraft(next: VelaOrderDraft|null): void { orderDraft = next ? { ...next } : null; }

export function beginVelaPricePick(
  ctx: { chart: any; toast: (message:string, tone?:string)=>void },
  reason: VelaPricePick['reason'],
  onPicked: (pick:VelaPricePick)=>void,
): ()=>void {
  pickCancel?.();
  const renderer=ctx.chart?.renderer;
  if(!renderer || typeof renderer.onClick!=='function'){ ctx.toast('Price picking is unavailable on this renderer.','error'); return ()=>{}; }
  const previous=renderer.get?.('drawingsInteractive');
  renderer.set?.({ drawingsInteractive:false, crosshairOverride:{ vertical:true, horizontal:true, opacity:0.9, shadeRight:false } });
  let active=true;
  const cleanup=()=>{
    if(!active)return;
    active=false;
    off?.();
    renderer.set?.({ drawingsInteractive: previous === undefined ? true : previous, crosshairOverride:null });
    if(pickCancel===cleanup) pickCancel=null;
  };
  const off=renderer.onClick((event:any)=>{
    const price=Number(event?.price);
    if(!Number.isFinite(price)||price<=0)return;
    const time=event?.time==null?null:Number(event.time);
    onPicked({ price, time:Number.isFinite(Number(time))?time:null, reason });
    cleanup();
  });
  pickCancel=cleanup;
  ctx.toast(`Pick ${reason} price on the chart; drawings are temporarily non-interactive.`,'info');
  return cleanup;
}

export function cancelVelaPricePick():void { pickCancel?.(); }