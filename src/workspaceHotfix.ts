/**
 * TradingCore workspace resilience bridge.
 * Stage 5 keeps the canonical watchlist inside the Core Chart workspace
 * as a right-side panel. This file must not inject or clone a second rail.
 */
(() => {
  function installRequestCache(){
    const originalFetch=window.fetch.bind(window);
    const cache=new Map<string,{expiresAt:number;response:Response}>();
    const inflight=new Map<string,Promise<Response>>();
    window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
      const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();
      const url=typeof input==='string'?input:input instanceof URL?input.toString():input.url;
      if(method!=='GET'||!url.includes('/api/trading/'))return originalFetch(input,init);
      const isOptionChain=url.includes('/option-chain'), isInstrumentSearch=url.includes('/instruments/search');
      if(!isOptionChain&&!isInstrumentSearch)return originalFetch(input,init);
      const ttl=isOptionChain?30000:10000;
      const cached=cache.get(url); if(cached&&cached.expiresAt>Date.now())return cached.response.clone();
      const existing=inflight.get(url); if(existing)return(await existing).clone();
      const request=originalFetch(input,init).then(response=>{if(response.ok)cache.set(url,{expiresAt:Date.now()+ttl,response:response.clone()});return response}).finally(()=>inflight.delete(url));
      inflight.set(url,request); return request;
    };
  }
  function bindChartRefreshBridge(){
    document.addEventListener('click',event=>{
      const button=(event.target as Element|null)?.closest('button');
      if(!button||button.classList.contains('toolbar-pill'))return;
      if(!['1m','3m','5m','15m','30m','1H','1D'].includes((button.textContent||'').trim()))return;
      window.setTimeout(()=>{
        const oi=Array.from(document.querySelectorAll('button.toolbar-pill')).find(x=>(x.textContent||'').trim()==='OI') as HTMLButtonElement|undefined;
        if(!oi||!oi.classList.contains('toolbar-pill-active'))return;
        oi.click(); window.setTimeout(()=>oi.click(),80);
      },250);
    },true);
  }
  function bindLevelsBridge(){
    document.addEventListener('click',event=>{
      const button=(event.target as Element|null)?.closest('button');
      if(!button||button.classList.contains('toolbar-pill'))return;
      if((button.textContent||'').trim()!=='Levels')return;
      window.setTimeout(()=>{
        const toolbar=Array.from(document.querySelectorAll('button.toolbar-pill')).find(x=>(x.textContent||'').trim()==='Levels') as HTMLButtonElement|undefined;
        toolbar?.click();
      },0);
    },true);
  }
  function install(){installRequestCache();bindChartRefreshBridge();bindLevelsBridge();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
