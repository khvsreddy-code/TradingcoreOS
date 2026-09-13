/** TradingCore quick-order UX bridge: index options vs equity cash. */
(() => {
  const q = <T extends Element = Element>(selector: string, root: ParentNode = document) => root.querySelector<T>(selector);
  const optionUnderlying = (label: string) => {
    const n = label.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (n.includes('NIFTY50')) return 'NSE:NIFTY50-INDEX';
    if (n.includes('BANKNIFTY') || n.includes('NIFTYBANK')) return 'NSE:NIFTYBANK-INDEX';
    if (n.includes('FINNIFTY') || n.includes('FINANCIALSERVICES')) return 'NSE:FINNIFTY-INDEX';
    if (n.includes('MIDCPNIFTY') || n.includes('MIDCAPSELECT')) return 'NSE:MIDCPNIFTY-INDEX';
    if (n.includes('SENSEX')) return 'BSE:SENSEX-INDEX';
    return null;
  };
  const nativeValue = (element: HTMLInputElement | HTMLSelectElement, value: string) => {
    const proto = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(element, value);
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const selectedInstrument = () => {
    const header = q('header');
    const strip = header?.lastElementChild as HTMLElement | null;
    const cards = strip ? Array.from(strip.children).filter(x => x instanceof HTMLElement) as HTMLElement[] : [];
    const card = cards.find(x => x.className.includes('border-[#10b981]/50'));
    if (card) {
      const lines = (card.innerText || '').split('\n').map(x => x.trim()).filter(Boolean);
      return { label: lines[1] || lines[0] || '', type: lines[3] || lines[2] || '' };
    }
    const chart = Array.from(document.querySelectorAll('main section button')).find(x => (x.textContent || '').includes('·'));
    const text = chart?.textContent || '';
    return { label: text.replace(/·.*$/, '').trim(), type: text.match(/·\s*(.+)$/)?.[1]?.trim() || '' };
  };
  const quickPanel = () => {
    const submit = Array.from(document.querySelectorAll('button')).find(x => (x.textContent || '').includes('LIVE ORDER')) as HTMLButtonElement | undefined;
    return (submit?.closest('.rounded-xl') as HTMLElement | null) || null;
  };
  const chain = async (key: string) => {
    const response = await fetch(`/api/trading/fyers/option-chain?instrument_key=${encodeURIComponent(key)}`, { credentials: 'include' });
    const payload = await response.json();
    if (!response.ok || payload?.success === false) throw new Error(payload?.error || 'Option chain unavailable');
    return payload?.data || {};
  };
  const pick = (data: any, side: 'CE' | 'PE', mode: string) => {
    const rows = Array.isArray(data?.contracts) ? data.contracts : [];
    const spot = Number(data?.spot || 0);
    const strikes = [...new Set(rows.map((r: any) => Number(r.strike)).filter(Number.isFinite))].sort((a: number, b: number) => a - b);
    if (!rows.length || !spot || !strikes.length) return null;
    let atm = 0;
    for (let i = 1; i < strikes.length; i++) if (Math.abs(strikes[i] - spot) < Math.abs(strikes[atm] - spot)) atm = i;
    if (mode === 'ATM') return rows.find((r: any) => Number(r.strike) === strikes[atm])?.[side === 'CE' ? 'call' : 'put'] || null;
    const match = mode.match(/(ITM|OTM)\s*\+(\d+)/);
    if (!match) return null;
    const steps = Number(match[2]);
    const direction = match[1] === 'ITM' ? (side === 'CE' ? -1 : 1) : (side === 'CE' ? 1 : -1);
    const strike = strikes[Math.max(0, Math.min(strikes.length - 1, atm + direction * steps))];
    const row = rows.find((r: any) => Number(r.strike) === strike);
    return row?.[side === 'CE' ? 'call' : 'put'] ? { ...row[side === 'CE' ? 'call' : 'put'], strike, expiry: row.expiry } : null;
  };
  const addOption = (select: HTMLSelectElement, values: string[]) => values.forEach(value => { const o = document.createElement('option'); o.value = value; o.textContent = value; select.appendChild(o); });
  const mkSelect = (values: string[]) => { const s = document.createElement('select'); s.className = 'tco-qo-select'; addOption(s, values); return s; };
  const mkInput = (placeholder: string, type = 'text') => { const i = document.createElement('input'); i.type = type; i.placeholder = placeholder; i.className = 'tco-qo-input'; return i; };
  const styles = () => {
    if (q('#tco-qo-styles')) return;
    const s = document.createElement('style'); s.id = 'tco-qo-styles'; s.textContent = `.tco-qo-ui{display:flex;flex-direction:column;gap:8px;font-family:JetBrains Mono,monospace}.tco-qo-title{font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#d1d5db}.tco-qo-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px}.tco-qo-select,.tco-qo-input{width:100%;box-sizing:border-box;background:#090a0f;border:1px solid #222636;border-radius:6px;padding:8px;color:#d1d5db;font:10px JetBrains Mono,monospace;outline:none}.tco-qo-contract{min-height:28px;display:flex;align-items:center;padding:6px 8px;border:1px solid #222636;border-radius:6px;background:#090a0f;color:#64748b;font-size:9px}.tco-qo-submit{width:100%;padding:9px;border:0;border-radius:6px;background:#10b981;color:#06110d;font:700 10px JetBrains Mono,monospace;cursor:pointer}.tco-qo-submit:hover{filter:brightness(1.08)}`; document.head.appendChild(s);
  };
  function render() {
    const panel = quickPanel(); if (!panel) return;
    styles();
    const instrument = selectedInstrument();
    const underlying = optionUnderlying(instrument.label);
    const isIndex = /index/i.test(instrument.type) || Boolean(underlying);
    const signature = `${instrument.label}|${instrument.type}|${underlying || 'cash'}`;
    if (panel.dataset.tcoQoSignature === signature && q('[data-tco-qo-ui]', panel)) return;
    panel.dataset.tcoQoSignature = signature;
    let ui = q<HTMLElement>('[data-tco-qo-ui]', panel);
    if (!ui) { ui = document.createElement('div'); ui.dataset.tcoQoUi = '1'; panel.appendChild(ui); }
    Array.from(panel.children).forEach(x => { if (x !== ui) (x as HTMLElement).style.display = 'none'; });
    ui.innerHTML = ''; ui.className = 'tco-qo-ui';
    const title = document.createElement('div'); title.className = 'tco-qo-title'; title.textContent = isIndex ? `${instrument.label} · OPTIONS` : `${instrument.label} · CASH`; ui.appendChild(title);
    const side = mkSelect(['Buy','Sell']); const type = mkSelect(['Market','Limit','SL','SL-M']);
    const qty = mkInput('Quantity','number'); qty.min='1'; qty.value='1';
    const price = mkInput('Limit price','number'); price.style.display='none';
    const trigger = mkInput('Trigger price','number'); trigger.style.display='none';
    const product = isIndex ? mkSelect(['MIS','NRML']) : mkSelect(['CNC']);
    let cepe: HTMLSelectElement | null = null; let strike: HTMLSelectElement | null = null; let contract: any = null; let loading = false;
    if (isIndex && underlying) {
      cepe = mkSelect(['CE','PE']); strike = mkSelect(['ATM','ITM +1','ITM +2','ITM +3','OTM +1','OTM +2','OTM +3']);
      const row1=document.createElement('div'); row1.className='tco-qo-grid'; row1.append(cepe,strike); ui.appendChild(row1);
    }
    const row2=document.createElement('div'); row2.className='tco-qo-grid'; row2.append(side,type); ui.appendChild(row2);
    const row3=document.createElement('div'); row3.className='tco-qo-grid'; row3.append(qty,product); ui.appendChild(row3);
    if (!isIndex) { const token=mkInput('Instrument token'); ui.appendChild(token); }
    if (isIndex && underlying) { const c=document.createElement('div'); c.className='tco-qo-contract'; c.textContent='Loading ATM contract…'; ui.appendChild(c); }
    ui.appendChild(price); ui.appendChild(trigger);
    const submit=document.createElement('button'); submit.type='button'; submit.className='tco-qo-submit'; submit.textContent=isIndex?'BUY CE · LIVE ORDER':'BUY CASH · LIVE ORDER'; ui.appendChild(submit);
    const updateLabels=()=>{submit.textContent=`${side.value.toUpperCase()} ${isIndex?(cepe?.value || 'CE'):'CASH'} · LIVE ORDER`;};
    side.addEventListener('change',updateLabels); cepe?.addEventListener('change',updateLabels);
    type.addEventListener('change',()=>{price.style.display=type.value==='Market'?'none':'';trigger.style.display=['SL','SL-M'].includes(type.value)?'':'none';});
    const loadContract=async()=>{
      if (!isIndex || !underlying || !cepe || !strike) return;
      const display=q<HTMLElement>('.tco-qo-contract',ui); loading=true; if(display) display.textContent='Loading contract…';
      try { const data=await chain(underlying); contract=pick(data,cepe.value as 'CE'|'PE',strike.value); if(display) display.textContent=contract?.instrumentKey ? `${cepe.value} ${contract.strike} · ${contract.expiry || data.expiry || ''}` : 'Contract unavailable'; }
      catch(e:any){contract=null;if(display)display.textContent=e?.message||'Option chain unavailable';} finally{loading=false;}
    };
    cepe?.addEventListener('change',loadContract); strike?.addEventListener('change',loadContract);
    submit.addEventListener('click',()=>{
      if (loading) return;
      if (isIndex && !contract?.instrumentKey) { const d=q<HTMLElement>('.tco-qo-contract',ui); if(d)d.textContent='Select a valid option contract first.'; return; }
      const inputs=Array.from(panel.querySelectorAll('input')) as HTMLInputElement[]; const selects=Array.from(panel.querySelectorAll('select')) as HTMLSelectElement[];
      const token=inputs.find(x=>x.placeholder==='Instrument token'); const originalQty=inputs.find(x=>x.type==='number'&&x!==qty&&x.placeholder!=='Price'&&x.placeholder!=='Trigger price'&&x.placeholder!=='Limit price');
      const originalPrice=inputs.find(x=>x.placeholder==='Price'); const originalTrigger=inputs.find(x=>x.placeholder==='Trigger price');
      const originalSide=selects.find(x=>Array.from(x.options).some(o=>o.value==='Buy')&&Array.from(x.options).some(o=>o.value==='Sell')); const originalType=selects.find(x=>Array.from(x.options).some(o=>o.value==='Market')&&Array.from(x.options).some(o=>o.value==='Limit')); const originalProduct=selects.find(x=>Array.from(x.options).some(o=>o.value==='MIS')&&Array.from(x.options).some(o=>o.value==='CNC'));
      if(!token||!originalQty||!originalSide||!originalType||!originalProduct)return;
      nativeValue(token,isIndex?contract.instrumentKey:(q<HTMLInputElement>('[placeholder="Instrument token"]',ui)?.value||'')); nativeValue(originalQty,qty.value||'1'); nativeValue(originalSide,side.value); nativeValue(originalType,type.value); nativeValue(originalProduct,product.value); if(originalPrice)nativeValue(originalPrice,price.value||''); if(originalTrigger)nativeValue(originalTrigger,trigger.value||'');
      const originalButton=Array.from(panel.querySelectorAll('button')).find(x=>(x.textContent||'').includes('LIVE ORDER')&&x!==submit) as HTMLButtonElement|undefined; originalButton?.click();
    });
    void loadContract();
  }
  function install(){
    const root=q('#root'); if(!root)return; render(); const observer=new MutationObserver(()=>window.requestAnimationFrame(render)); observer.observe(root,{childList:true,subtree:true}); window.addEventListener('resize',render,{passive:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
