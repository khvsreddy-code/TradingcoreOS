import type { CoreSpiritSessionState } from './types';

export function resolveSession(timestamp: number, timezone = 'Asia/Kolkata'): CoreSpiritSessionState {
  const d = new Date(timestamp);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false }).formatToParts(d);
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  const marketDate=`${get('year')}-${get('month')}-${get('day')}`;
  const minutes=Number(get('hour'))*60+Number(get('minute'));
  const open=9*60+15, close=15*60+30;
  const phase = minutes < open ? 'pre' : minutes <= close ? 'open' : minutes < 24*60 ? 'post' : 'closed';
  return { id:`${marketDate}:${timezone}`, marketDate, isOpen:phase==='open', phase };
}
