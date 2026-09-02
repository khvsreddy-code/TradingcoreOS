const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let sessionId=null, accountSocket=null, accountState={orders:[],positions:[],funds:{},summary:{},exposure:[]};
const indicators=['EMA','SMA','VWAP','Anchored VWAP','VWAP Deviation','Bollinger Bands','Supertrend','Donchian','Keltner','RSI','MACD','ATR','ADX','CPR','Camarilla','FVG','Market Structure','Previous Day High/Low','Opening Range','OI Walls','Max Pain'];
function nav(){ $$('#nav button').forEach(b=>b.onclick=()=>{ $$('#nav button').forEach(x=>x.classList.remove('active'));b.classList.add('active');$$('.page').forEach(p=>p.classList.remove('active'));$('#'+b.dataset.page).classList.add('active');if(b.dataset.page==='portfolio') refreshAccount();}); }
function modal(){const m=$('#modal'); const render=q=>{const a=indicators.filter(x=>x.toLowerCase().includes(q.toLowerCase()));$('#modalList').innerHTML=a.map(x=>`<button>${x}<span style="float:right;color:#8294aa">＋</span></button>`).join('')};$('#search').oninput=e=>render(e.target.value);$('#indBtn').onclick=()=>{m.classList.add('open');render('')};$('.close').onclick=()=>m.classList.remove('open');document.addEventListener('keydown',e=>{if(e.key==='Escape')m.classList.remove('open')});}
function accountWS(){if(!sessionId)return;if(accountSocket)accountSocket.close();const proto=location.protocol==='https:'?'wss':'ws';accountSocket=new WebSocket(`${proto}://${location.host}/ws/account/${sessionId}`);accountSocket.onopen=()=>{ $('#status').textContent='● ACCOUNT STREAM'; $('#status').style.color='var(--green)' };accountSocket.onmessage=e=>{const x=JSON.parse(e.data);if(x.type==='account_snapshot'){accountState={...accountState,...x};renderPortfolio()}else if(x.type==='account_update'){applyUpdate(x);renderPortfolio()}};accountSocket.onclose=()=>{ $('#status').textContent='● SNAPSHOT MODE'; $('#status').style.color='var(--amber)' }}
function applyUpdate(x){const t=x.update_type,d=x.data||{};if(t==='order'||t==='orderupdate'){const id=d.order_id||d.orderId;accountState.orders=[...accountState.orders.filter(o=>(o.order_id||o.orderId)!==id),d]}if(t==='position'||t==='positionupdate'){const k=d.instrument_key||d.symbol;accountState.positions=[...accountState.positions.filter(o=>(o.instrument_key||o.symbol)!==k),d]}}
async function refreshAccount(){if(!sessionId){renderPortfolio();return}try{const r=await fetch(`/api/brokers/${sessionId}/account/snapshot`);if(!r.ok)throw new Error(await r.text());accountState=await r.json();renderPortfolio();accountWS()}catch(e){$('#portfolioData').textContent='Account error: '+e.message}}
function money(v){return Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:2})}function pnl(v){const n=Number(v||0);return `<span class="${n>=0?'pnlPos':'pnlNeg'}">${n>=0?'+':''}₹${money(n)}</span>`}
function renderPortfolio(){const s=accountState.summary||{},f=accountState.funds||{},g=accountState.greeks||[],ex=accountState.exposure||[],tr=accountState.trades||[];const avail=f.available_to_trade||{};const cash=avail.cash||{};$('#portfolioData').innerHTML=`<div class="accountGrid"><div class="stat">Unrealized P&L<b>${pnl(s.unrealized_pnl)}</b></div><div class="stat">Realized P&L<b>${pnl(s.realized_pnl)}</b></div><div class="stat">Net P&L<b>${pnl(s.net_pnl)}</b></div><div class="stat">Available to Trade<b>₹${money(cash.available_to_trade??cash.available??avail.available_to_trade??0)}</b></div></div><div class="tables"><div class="tableCard"><h3>Positions <span class="muted">${s.open_quantity||0} qty</span></h3><table class="dataTable"><thead><tr><th>Symbol</th><th>Qty</th><th>Avg</th><th>LTP</th><th>P&L</th></tr></thead><tbody>${(accountState.positions||[]).map(p=>`<tr><td>${p.normalized_symbol||p.trading_symbol||p.symbol||'-'}</td><td>${p.quantity??p.net_qty??'-'}</td><td>₹${money(p.average_price||p.avg_price)}</td><td>₹${money(p.ltp||p.last_price)}</td><td>${pnl(p.unrealized_pnl??p.pnl)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No open positions</td></tr>'}</tbody></table></div><div class="tableCard"><h3>Order Blotter <span class="muted">${s.orders||0} orders</span></h3><table class="dataTable"><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Status</th></tr></thead><tbody>${(accountState.orders||[]).slice(-30).reverse().map(o=>`<tr><td>${o.order_timestamp||o.timestamp||'-'}</td><td>${o.normalized_symbol||o.trading_symbol||o.symbol||'-'}</td><td>${o.side||o.transaction_type||'-'}</td><td>${o.filled_quantity??o.quantity??'-'}</td><td>${o.status||'-'}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No orders</td></tr>'}</tbody></table></div><div class="tableCard"><h3>Exposure</h3><table class="dataTable"><thead><tr><th>Symbol</th><th>Value</th><th>Weight</th><th>P&L</th></tr></thead><tbody>${ex.map(x=>`<tr><td>${x.symbol||'-'}</td><td>₹${money(x.market_value)}</td><td>${(x.weight*100).toFixed(1)}%</td><td>${pnl(x.pnl)}</td></tr>`).join('')||'<tr><td colspan="4" class="muted">No exposure</td></tr>'}</tbody></table></div><div class="tableCard"><h3>Greeks / Option Exposure</h3><table class="dataTable"><thead><tr><th>Symbol</th><th>Δ</th><th>Γ</th><th>Θ</th><th>Vega</th></tr></thead><tbody>${g.map(x=>`<tr><td>${x.symbol}</td><td>${x.delta.toFixed(3)}</td><td>${x.gamma.toFixed(5)}</td><td>${x.theta.toFixed(3)}</td><td>${x.vega.toFixed(3)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">Broker position feed has no Greeks for current positions</td></tr>'}</tbody></table></div><div class="tableCard"><h3>Trade History</h3><table class="dataTable"><thead><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Avg</th></tr></thead><tbody>${tr.slice(-30).reverse().map(x=>`<tr><td>${x.order_timestamp||x.timestamp||'-'}</td><td>${x.normalized_symbol||'-'}</td><td>${x.side||'-'}</td><td>${x.filled_quantity||x.quantity||0}</td><td>₹${money(x.average_price||x.average_price_filled)}</td></tr>`).join('')||'<tr><td colspan="5" class="muted">No completed trades</td></tr>'}</tbody></table></div><div class="tableCard"><h3>Margin Snapshot</h3><div class="row"><span>Cash available</span><b>₹${money(cash.available_to_trade??cash.available??0)}</b></div><div class="row"><span>Opening balance</span><b>₹${money(cash.opening_balance)}</b></div><div class="row"><span>Margin used</span><b>₹${money(cash.margin_used)}</b></div><div class="row"><span>Unrealized loss</span><b>${pnl(cash.unrealised_loss)}</b></div></div></div>`}
function setup(){nav();modal();$('#strategyBtn').onclick=()=>$('#strategyPanel').classList.toggle('open');$('#strategyClose').onclick=()=>$('#strategyPanel').classList.remove('open');$('#theme').onclick=()=>document.body.classList.toggle('light');$('#loadPositions') && ($('#loadPositions').onclick=refreshAccount);$('#loadOrders') && ($('#loadOrders').onclick=refreshAccount);$('#killSwitch') && ($('#killSwitch').onclick=async()=>{const r=await fetch('/api/risk/kill-switch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({armed:true})});alert((await r.json()).armed?'Kill switch armed':'Unable to arm')});$('#riskPreflight') && ($('#riskPreflight').onclick=()=>alert('Run preflight from the live order ticket after selecting quantity and instrument.'));$('#status').onclick=()=>{if(sessionId)accountWS()};}
async function refreshAlerts(){const x=await (await fetch('/api/alerts')).json();$('#alertList').innerHTML=(x.alerts||[]).map(a=>`<div class="row"><span>${a.symbol} · ${a.kind} ${a.condition} ${a.value??''}</span><span><button onclick="toggleAlert('${a.id}',${!a.enabled})">${a.enabled?'ON':'OFF'}</button> <button onclick="deleteAlert('${a.id}')">×</button></span></div>`).join('')||'<p class="muted">No active alerts</p>';$('#alertHistory').innerHTML=(x.history||[]).map(e=>`<div class="row"><span>${e.symbol} · ${e.kind} ${e.condition}</span><small>${new Date(e.timestamp*1000).toLocaleTimeString()}</small></div>`).join('')||'<p class="muted">No triggered alerts yet</p>'}
window.toggleAlert=async(id,enabled)=>{await fetch('/api/alerts/'+id+'/toggle',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled})});refreshAlerts()};window.deleteAlert=async id=>{await fetch('/api/alerts/'+id,{method:'DELETE'});refreshAlerts()};
const oldSetup=setup; setup=function(){oldSetup();$('#createAlert')?.addEventListener('click',async()=>{let kind=$('#alertKind').value,condition=$('#alertCondition').value;const value=$('#alertValue').value;await fetch('/api/alerts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,symbol:$('#alertSymbol').value,condition,value:value===''?null:+value})});refreshAlerts()});};setup();
// Phase 11.1 — persistent TradingView-style timeframe/chart controller.
(()=>{
 const TF={SECONDS:['1s','5s','15s','30s'],MINUTES:['1m','2m','3m','5m','10m','15m','30m','45m'],HOURS:['1H','2H','3H','4H'],HIGHER:['1D','1W','1M']};
 let tf=localStorage.getItem('tc.tf')||'5m', bars=[], marketSocket=null, activeStudies=JSON.parse(localStorage.getItem('tc.studies')||'[]');
 const candles=$('#candles'), title=$('#chartTitle'), age=$('#feedAge');
 function renderStudies(){ $('#activeStudies').innerHTML=activeStudies.map(x=>`<span class="studyChip">${x}<button data-study="${x}">×</button></span>`).join(''); $$('#activeStudies button').forEach(b=>b.onclick=()=>{activeStudies=activeStudies.filter(x=>x!==b.dataset.study);persistStudies();renderStudies()}) }
 function persistStudies(){localStorage.setItem('tc.studies',JSON.stringify(activeStudies))}
 function setTf(next){tf=next;localStorage.setItem('tc.tf',tf);$('#timeframe').value=tf;$('#timeframeMenu').textContent=tf+' ▾';title.textContent='PRICE • NIFTY 50 • '+tf;$$('#tfQuick button').forEach(b=>b.classList.toggle('on',b.dataset.tf===tf));$$('#tfGroups button').forEach(b=>b.classList.toggle('on',b.dataset.tf===tf));loadBars()}
 async function loadBars(){bars=[];renderBars();age.textContent='LOADING '+tf;try{const r=await fetch('/api/market/candles/NIFTY50?timeframe='+encodeURIComponent(tf)+'&limit=600');const x=await r.json();bars=x.candles||[];renderBars();age.textContent=bars.length?'LIVE • '+tf:'LIVE • '+tf+' • WAITING DATA'}catch(e){age.textContent='FEED RETRYING'} }
 function renderBars(){if(!candles)return;const data=bars.slice(-100);if(!data.length){candles.innerHTML='<div class="chartEmpty">Waiting for normalized market data…</div>';return}const lo=Math.min(...data.map(b=>b.low)),hi=Math.max(...data.map(b=>b.high)),span=Math.max(hi-lo,.01);candles.innerHTML=data.map(b=>{const o=(b.open-lo)/span*100,c=(b.close-lo)/span*100,h=(b.high-lo)/span*100,l=(b.low-lo)/span*100,up=b.close>=b.open;const body=Math.max(1,Math.abs(c-o)),bottom=Math.min(c,o);return `<i class="candle ${up?'up':'down'}" style="left:${data.indexOf(b)/data.length*100}%;bottom:${bottom}%;height:${body}%;--h:${h}%;--l:${l}%"></i>`}).join('')}
 function connectMarket(){const proto=location.protocol==='https:'?'wss':'ws';const cid='chart-'+(sessionId||localStorage.getItem('tc.client')||crypto.randomUUID());localStorage.setItem('tc.client',cid);try{marketSocket=new WebSocket(`${proto}://${location.host}/ws/market/${cid}`);marketSocket.onopen=()=>{marketSocket.send(JSON.stringify({op:'subscribe',instruments:['NIFTY50','NSE_INDEX|Nifty 50']}));age.textContent='LIVE • '+tf};marketSocket.onmessage=e=>{const m=JSON.parse(e.data);if(m.type==='tick'){const c=(m.candles||[]).find(x=>x.interval===({ '1s':1,'5s':5,'15s':15,'30s':30,'1m':60,'2m':120,'3m':180,'5m':300,'10m':600,'15m':900,'30m':1800,'45m':2700,'1H':3600,'2H':7200,'3H':10800,'4H':14400,'1D':86400,'1W':604800,'1M':2592000}[tf]));if(c){const i=bars.findIndex(x=>x.time===c.time);if(i>=0)bars[i]=c;else bars.push(c);bars=bars.slice(-600);renderBars()}streamAge=Math.round(m.latency?.tick_age_ms||0);window.tcSetStreamLatency?.(streamAge);age.textContent='LIVE • '+tf+' • '+streamAge+'ms'}};marketSocket.onclose=()=>{age.textContent='RECONNECTING';setTimeout(connectMarket,1000)}}catch(_){age.textContent='OFFLINE'}}
 function setupTf(){Object.entries(TF).forEach(([name,list])=>$('#tfGroups').insertAdjacentHTML('beforeend',`<div class="tfGroup"><small>${name}</small><div class="tfOptions">${list.map(x=>`<button data-tf="${x}">${x}</button>`).join('')}</div></div>`));$('#timeframeMenu').onclick=()=>$('#tfModal').classList.add('open');$('#tfModal').onclick=e=>{if(e.target===$('#tfModal'))$('#tfModal').classList.remove('open')};$$('#tfGroups button').forEach(b=>b.onclick=()=>{setTf(b.dataset.tf);$('#tfModal').classList.remove('open')});$$('#tfQuick button').forEach(b=>b.onclick=()=>setTf(b.dataset.tf));$('#timeframe').onchange=e=>setTf(e.target.value);document.addEventListener('keydown',e=>{if(e.key==='Escape')$('#tfModal').classList.remove('open');if(e.altKey&&['1','3','5'].includes(e.key))setTf(e.key+'m')})}
 function wireIndicatorAdd(){document.addEventListener('click',e=>{const b=e.target.closest('#modalList button');if(!b)return;const name=(b.firstChild?.textContent||'').trim();if(name&&!activeStudies.includes(name)){activeStudies.push(name);persistStudies();renderStudies()}$('#modal').classList.remove('open')})}
 setupTf();renderStudies();wireIndicatorAdd();setTf(tf);connectMarket();
})();
// Phase 13 — resilient interaction wiring + low-overhead UI updates.
(()=>{
 const safe=(sel,fn)=>{const el=$(sel);if(el)el.addEventListener('click',fn)};
 const toast=(msg,type='info')=>{let t=$('#tcToast');if(!t){t=document.createElement('div');t.id='tcToast';t.className='tcToast';document.body.appendChild(t)}t.textContent=msg;t.dataset.type=type;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),2800)};
 const busy=async(btn,fn)=>{if(!btn||btn.dataset.busy)return;btn.dataset.busy='1';const text=btn.textContent;btn.disabled=true;try{return await fn()}catch(e){toast(e.message||'Action failed','error')}finally{btn.disabled=false;btn.textContent=text;delete btn.dataset.busy}};
 // Repair legacy setup crashes caused by optional controls not present on this page.
 safe('#loadPositions',()=>busy($('#loadPositions'),refreshAccount));
 safe('#loadOrders',()=>busy($('#loadOrders'),refreshAccount));
 safe('#riskPreflight',()=>toast('Select CE/PE, strike and quantity, then submit from the ticket.'));
 safe('#theme',()=>{document.body.classList.toggle('light');localStorage.setItem('tc.theme',document.body.classList.contains('light')?'light':'dark')});
 if(localStorage.getItem('tc.theme')==='light')document.body.classList.add('light');
 safe('#otype',()=>{});$('#otype')?.addEventListener('change',e=>$('#priceWrap').hidden=e.target.value!=='LIMIT');
 $$('.switch button').forEach(b=>b.addEventListener('click',()=>{$$('.switch button').forEach(x=>x.classList.toggle('on',x===b));$('#modeLabel').textContent=b.dataset.mode;}));
 $$('.actions button').forEach(b=>b.addEventListener('click',()=>busy(b,async()=>{
   const mode=$('#modeLabel').textContent.trim().toUpperCase();
   if(mode==='LIVE'&&!sessionId)throw new Error('Connect your broker before sending a live order.');
   if(mode==='LIVE'&&!confirm(`${b.dataset.side} ${b.dataset.leg} as a LIVE order?`))return;
   const strike=Number((b.dataset.leg==='CE'?$('#ce'):$('#pe')).value||0), lots=Math.max(1,Number($('#lots').value||1));
   const payload={broker:'UPSTOX',mode,side:b.dataset.side,leg:b.dataset.leg,strike,expiry:$('#ticketExpiry').value,qty:lots,lot_size:1,order_type:$('#otype').value,price:$('#otype').value==='LIMIT'?Number($('#price').value||0):null,ltp:Number($('#ltp').textContent.replace(/[^0-9.]/g,'')||0)};
   const headers={'Content-Type':'application/json'};if(sessionId)headers['X-TradingCore-Session']=sessionId;
   const r=await fetch('/api/orders',{method:'POST',headers,body:JSON.stringify(payload)});if(!r.ok)throw new Error((await r.json().catch(()=>({detail:'Order rejected'}))).detail||'Order rejected');
   const x=await r.json();toast(`${mode} order ${x.accepted?'accepted':'submitted'}`, 'success');
 }))); 
 // Close overlays and panels reliably when clicking backdrop or pressing Escape.
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){$$('#modal,.tfModal').forEach(x=>x.classList.remove('open'));$('#strategyPanel')?.classList.remove('open') }});
 document.addEventListener('click',e=>{if(e.target.matches('.modal,.tfModal'))e.target.classList.remove('open')});
 // Prevent high-frequency websocket updates from causing redundant paints.
 let queued=false;const orig=window.requestAnimationFrame;window.tcScheduleRender=(fn)=>{if(queued)return;queued=true;orig(()=>{queued=false;fn()})};
 window.addEventListener('error',e=>toast('UI recovered from an interaction error','error'));
})();

// V30.3 Performance & interaction pass.
(()=>{
 const perf={}; window.tcLatency=perf; const rawFetch=window.fetch;
 window.fetch=async(...args)=>{const t=performance.now();try{return await rawFetch(...args)}finally{const k=typeof args[0]==='string'?args[0]:'request';(perf[k]??=[]).push(performance.now()-t);if(perf[k].length>100)perf[k].shift()}};
 document.addEventListener('click',e=>{const b=e.target.closest('button');if(b&&!b.disabled)b.dataset.lastClick=String(performance.now())});
 $('#indicators')?.addEventListener('click',e=>{const d=e.target.closest('.library div');if(d){$('#indBtn')?.click();$('#search').value=d.textContent;$('#search').dispatchEvent(new Event('input'))}});
 window.addEventListener('online',()=>{if(sessionId)accountWS()});
})();
// V30.4 — broker-first onboarding and zero-dead-button interaction layer.
(()=>{
 const go=page=>{const b=document.querySelector(`#nav button[data-page="${page}"]`); if(b)b.click()};
 const brokerModal=$('#brokerModal'); let selectedBroker='UPSTOX';
 const state=$('#connectState'), token=$('#brokerToken'), client=$('#brokerClientId'), clientWrap=$('#brokerClientWrap');
 const hasGoogleSession=()=>Object.keys(localStorage).some(k=>/supabase.*auth.*token|google.*auth|tc\.user/i.test(k));
 const setBroker=b=>{selectedBroker=b;$('#brokerModalTitle').textContent=`Connect ${b==='UPSTOX'?'Upstox':'FYERS'}`;clientWrap.hidden=b!=='FYERS';token.value='';client.value='';state.textContent='';brokerModal.classList.add('open');setTimeout(()=>token.focus(),0)};
 $$('.connectBroker').forEach(b=>b.addEventListener('click',()=>setBroker(b.dataset.broker)));
 safe('#cancelBroker',()=>brokerModal.classList.remove('open'));
 document.querySelector('[data-close-broker]')?.addEventListener('click',()=>brokerModal.classList.remove('open'));
 brokerModal?.addEventListener('click',e=>{if(e.target===brokerModal)brokerModal.classList.remove('open')});
 safe('#openLiveFromWelcome',()=>go('live'));
 // Persist only the opaque TradingCore session id, never the broker access token.
 const remembered=localStorage.getItem('tc.broker.session');
 if(remembered&&!sessionId){sessionId=remembered;$('#welcomeSession').textContent='Checking saved broker session…';fetch(`/api/brokers/${encodeURIComponent(sessionId)}/account/snapshot`).then(r=>{if(!r.ok)throw 0;return r.json()}).then(x=>{accountState=x;$('#welcomeSession').textContent=`Connected to ${x.broker||'broker'} • ready`;$('#status').textContent='● BROKER CONNECTED';accountWS()}).catch(()=>{localStorage.removeItem('tc.broker.session');sessionId=null;$('#welcomeSession').textContent='No broker connected'})}
 safe('#submitBroker',()=>busy($('#submitBroker'),async()=>{
   const access=(token.value||'').trim(); const clientId=(client.value||'').trim();
   if(access.length<8)throw new Error('Enter the broker access token first.');
   if(selectedBroker==='FYERS'&&!clientId)throw new Error('FYERS Client ID is required.');
   state.textContent='Connecting securely…';
   const r=await fetch('/api/brokers/connect',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({broker:selectedBroker,access_token:access,client_id:clientId||null})});
   const x=await r.json().catch(()=>({})); if(!r.ok)throw new Error(x.detail||'Broker connection failed.');
   sessionId=x.session_id; localStorage.setItem('tc.broker.session',sessionId); token.value='';client.value='';
   $('#welcomeSession').textContent=`Connected to ${x.broker} • ready`;$('#status').textContent='● '+x.broker+' CONNECTED';brokerModal.classList.remove('open');toast(`${x.broker} connected successfully`,'success');accountWS();go('live');
 }));
 // If a Google/Supabase login is already present, never route back to a marketing/landing surface.
 // This build uses Broker Center as the authenticated destination; anonymous users can still inspect it.
 if(hasGoogleSession()){$('#welcomeSession').textContent='Signed in • connect a broker to unlock account-linked features'}
 // Replace costly page switching with a single frame-batched switch and never refresh portfolio twice.
 let switching=false; document.querySelector('#nav')?.addEventListener('click',e=>{
   const b=e.target.closest('button[data-page]'); if(!b||switching)return; switching=true;
   requestAnimationFrame(()=>{switching=false;$$('#nav button').forEach(x=>x.classList.toggle('active',x===b));$$('.page').forEach(p=>p.classList.toggle('active',p.id===b.dataset.page));if(b.dataset.page==='portfolio'&&sessionId)refreshAccount();});
 });
 // Reconnect account socket with exponential backoff instead of tight reconnect loops.
 let reconnectTimer=0,reconnectDelay=600; const oldAccountWS=accountWS;
 accountWS=function(){clearTimeout(reconnectTimer);oldAccountWS();if(accountSocket){accountSocket.onopen=()=>{reconnectDelay=600;$('#status').textContent='● ACCOUNT STREAM';$('#status').style.color='var(--green)'};accountSocket.onclose=()=>{if(!sessionId)return;$('#status').textContent='● RECONNECTING';reconnectTimer=setTimeout(accountWS,reconnectDelay);reconnectDelay=Math.min(reconnectDelay*1.8,10000)}}};
})();

// V30.5 — visible latency monitor. Lightweight polling; no impact on order hot path.
(()=>{
 let browserRtt=0, streamAge=0, timer=null;
 const fmt=v=>v===undefined||v===null||!Number.isFinite(+v)?'—':`${Math.round(+v*10)/10} ms`;
 async function probe(){const t=performance.now();try{await fetch('/api/health',{cache:'no-store'});browserRtt=performance.now()-t}catch(_){browserRtt=NaN}}
 async function refreshLatency(){try{await probe();const r=await fetch('/api/performance/latency',{cache:'no-store'});const d=await r.json();const c=d.core||{},b=d.broker||{};
  $('#latencyCore').textContent='Core '+fmt(c.avg); $('#latencyBroker').textContent='Broker '+fmt(b.avg); $('#latencyStream').textContent='Stream '+fmt(streamAge);
  $('#latCoreBig').textContent=fmt(c.avg);$('#latCore50').textContent=fmt(c.p50);$('#latCore95').textContent=fmt(c.p95);$('#latCore99').textContent=fmt(c.p99);
  $('#latBrokerBig').textContent=fmt(b.avg);$('#latBroker50').textContent=fmt(b.p50);$('#latBroker95').textContent=fmt(b.p95);$('#latBroker99').textContent=fmt(b.p99);
  $('#latBrowserBig').textContent=fmt(browserRtt);$('#latStreamBig').textContent=fmt(streamAge);
  $('#latSamples').textContent=d.samples?`${d.samples} completed execution sample${d.samples===1?'':'s'}`:'No completed order samples yet'; $('#latUpdated').textContent='Updated '+new Date().toLocaleTimeString();
 }catch(_){$('#latencyCore').textContent='Core unavailable'}}
 $('#latencyBtn')?.addEventListener('click',()=>{$('#latencyModal')?.classList.add('open');refreshLatency()});$('#latencyClose')?.addEventListener('click',()=>$('#latencyModal')?.classList.remove('open'));
 document.addEventListener('click',e=>{if(e.target===$('#latencyModal'))$('#latencyModal').classList.remove('open')});
 window.tcSetStreamLatency=v=>{streamAge=Number(v)||0};refreshLatency();timer=setInterval(refreshLatency,5000);
})();
