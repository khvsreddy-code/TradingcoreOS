import { OptionChain, OptionContract, OIObservation } from '../../types/market';

export type OIWallSide = 'CALL' | 'PUT';
export type OIWallState = 'ACTIVE' | 'TESTING' | 'MITIGATED';
export type OILevelSide = 'support' | 'resistance';
export interface OIWall { strike:number; side:OIWallSide; oi:number; deltaOi:number; strength:number; width:1|2|3|4; state:OIWallState; distance:number; distanceStrikes:number; }
export interface OILevel { strike:number; side:OILevelSide; oi:number; deltaOi:number; strength:number; width:1|2|3|4; state:OIWallState; distance:number; distanceStrikes:number; label:string; }
export interface OIZone { strike:number; side:OIWallSide; lower:number; upper:number; strength:number; width:1|2|3|4; state:OIWallState; }
export interface OIFlip { strike:number; netOi:number; direction:'PUT_DOMINANT'|'CALL_DOMINANT'; confidence:number; }
export interface OIChartAnalytics { spot:number; pcr:number; callOi:number; putOi:number; callDeltaOi:number; putDeltaOi:number; maxCallWall?:OIWall; maxPutWall?:OIWall; maxPain?:number; flip?:OIFlip; walls:OIWall[]; levels:OILevel[]; zones:OIZone[]; updatedAt:string; }

const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n);
const num=(n:unknown)=>finite(n)?n:0;
const round=(n:number)=>Math.round(n*100)/100;
function quoteOi(contract:OptionContract,side:'call'|'put'){const q=side==='call'?contract.call:contract.put;const oi=num(q?.oi);const previous=finite(q?.previousOi)?q!.previousOi!:oi;return {oi,delta:oi-previous};}

export function getOILevelCount():4|6 {
  try { const n=Number(localStorage.getItem('tradingcore:oi-level-count')); return n===4?4:6; } catch { return 6; }
}
export function setOILevelCount(count:4|6):void { try { localStorage.setItem('tradingcore:oi-level-count',String(count)); } catch {} }

export function buildOIChartAnalytics(chain:OptionChain,spotOverride?:number,atr=0):OIChartAnalytics{
 const contracts=(chain.contracts||[]).filter(c=>finite(c.strike)).sort((a,b)=>a.strike-b.strike); const spot=num(spotOverride??chain.spot);
 if(!contracts.length||!spot)return {spot,pcr:0,callOi:0,putOi:0,callDeltaOi:0,putDeltaOi:0,walls:[],levels:[],zones:[],updatedAt:new Date().toISOString()};
 const strikes=[...new Set(contracts.map(c=>c.strike))].sort((a,b)=>a-b); const atmIndex=strikes.reduce((best,strike,i)=>Math.abs(strike-spot)<Math.abs(strikes[best]-spot)?i:best,0);
 const observations:OIObservation[]=contracts.map(c=>{const call=quoteOi(c,'call'),put=quoteOi(c,'put');return {strike:c.strike,callOi:call.oi,callChangeOi:call.delta,putOi:put.oi,putChangeOi:put.delta};});
 const callOi=observations.reduce((s,x)=>s+num(x.callOi),0),putOi=observations.reduce((s,x)=>s+num(x.putOi),0),callDeltaOi=observations.reduce((s,x)=>s+num(x.callChangeOi),0),putDeltaOi=observations.reduce((s,x)=>s+num(x.putChangeOi),0),pcr=callOi>0?putOi/callOi:0;
 const maxCall=Math.max(...observations.map(x=>num(x.callOi)),0),maxPut=Math.max(...observations.map(x=>num(x.putOi)),0),maxOi=Math.max(maxCall,maxPut,1),tolerance=Math.max(atr*.18,spot*.00035,1);
 const walls:OIWall[]=observations.flatMap(x=>[
  {strike:x.strike,side:'CALL' as const,oi:num(x.callOi),deltaOi:num(x.callChangeOi)},
  {strike:x.strike,side:'PUT' as const,oi:num(x.putOi),deltaOi:num(x.putChangeOi)},
 ]).filter(x=>x.oi>0).map(x=>{const strength=Math.max(0,Math.min(1,x.oi/maxOi));const width=(strength>=.78?4:strength>=.55?3:strength>=.32?2:1) as 1|2|3|4;const distance=Math.abs(spot-x.strike);const distanceStrikes=Math.abs(strikes.indexOf(x.strike)-atmIndex);const state:OIWallState=x.side==='PUT'?(spot<x.strike-tolerance?'MITIGATED':distance<=tolerance?'TESTING':'ACTIVE'):(spot>x.strike+tolerance?'MITIGATED':distance<=tolerance?'TESTING':'ACTIVE');return {strike:round(x.strike),side:x.side,oi:x.oi,deltaOi:x.deltaOi,strength:round(strength),width,state,distance:round(distance),distanceStrikes};}).sort((a,b)=>b.oi-a.oi);
 const stateFor=(side:OILevelSide,strike:number):OIWallState=>{const d=Math.abs(spot-strike);if(side==='support')return spot<strike-tolerance?'MITIGATED':d<=tolerance?'TESTING':'ACTIVE';return spot>strike+tolerance?'MITIGATED':d<=tolerance?'TESTING':'ACTIVE';};
 const deltaScale=Math.max(maxOi*.25,1);
 const score=(w:OIWall)=>w.strength*.52+Math.min(1,Math.abs(w.deltaOi)/deltaScale)*.33+Math.max(0,1-Math.max(0,w.distanceStrikes-3)/5)*.15;
 const candidates=(side:OILevelSide)=>walls.filter(w=>w.side===(side==='support'?'PUT':'CALL')).filter(w=>side==='support'?w.strike<spot:w.strike>spot).filter(w=>w.distanceStrikes>=3&&w.distanceStrikes<=7).filter(w=>w.state!=='MITIGATED').map(w=>({w,score:score(w)})).sort((a,b)=>b.score-a.score||a.w.distance-b.w.distance);
 const fallback=(side:OILevelSide)=>walls.filter(w=>w.side===(side==='support'?'PUT':'CALL')).filter(w=>side==='support'?w.strike<spot:w.strike>spot).filter(w=>w.distanceStrikes>=1&&w.distanceStrikes<=7).filter(w=>w.state!=='MITIGATED').map(w=>({w,score:score(w)})).sort((a,b)=>b.score-a.score||a.w.distance-b.w.distance);
 const levelCount=getOILevelCount();
 const chooseSide=(side:OILevelSide)=>{
  const target=Math.ceil(levelCount/2); const preferred=candidates(side); const pool=preferred.length>=target?preferred:fallback(side); const selected:Array<{w:OIWall;score:number}>=[];
  for(const c of pool){
   if(selected.some(x=>Math.abs(x.w.distanceStrikes-c.w.distanceStrikes)<2))continue;
   selected.push(c); if(selected.length>=target)break;
  }
  if(selected.length<target)for(const c of pool){if(!selected.some(x=>x.w.strike===c.w.strike)){selected.push(c);if(selected.length>=target)break;}}
  return selected.map(({w},i)=>({strike:w.strike,side,oi:w.oi,deltaOi:w.deltaOi,strength:w.strength,width:w.width,state:stateFor(side,w.strike),distance:w.distance,distanceStrikes:w.distanceStrikes,label:`OI ${side==='support'?'S':'R'}${i+1}`}));
 };
 const levels=[...chooseSide('support'),...chooseSide('resistance')];
 const activeWalls=walls.filter(w=>w.state!=='MITIGATED');
 const zones:OIZone[]=activeWalls.slice(0,8).map(w=>({strike:w.strike,side:w.side,lower:round(w.strike-tolerance),upper:round(w.strike+tolerance),strength:w.strength,width:w.width,state:w.state}));
 const net=observations.map(x=>({strike:x.strike,netOi:num(x.putOi)-num(x.callOi)})); let flip:OIFlip|undefined; let bestDist=Infinity;
 for(let i=0;i<net.length-1;i++){const a=net[i],b=net[i+1];if(a.netOi===0||(a.netOi<0&&b.netOi>0)||(a.netOi>0&&b.netOi<0)){const candidate=a.netOi===0?a.strike:(Math.abs(a.netOi)/(Math.abs(a.netOi)+Math.abs(b.netOi)))*(b.strike-a.strike)+a.strike;const d=Math.abs(candidate-spot);if(d<bestDist){const netOi=Math.abs(a.netOi)<Math.abs(b.netOi)?a.netOi:b.netOi;flip={strike:round(candidate),netOi,direction:netOi>=0?'PUT_DOMINANT':'CALL_DOMINANT',confidence:round(Math.min(1,Math.abs(a.netOi-b.netOi)/Math.max(1,Math.abs(a.netOi)+Math.abs(b.netOi))))};bestDist=d;}}}
 let maxPain:number|undefined,minPain=Infinity; for(const candidate of strikes){let pain=0;for(const x of observations){pain+=num(x.callOi)*Math.max(0,candidate-x.strike);pain+=num(x.putOi)*Math.max(0,x.strike-candidate);}if(pain<minPain){minPain=pain;maxPain=candidate;}}
 return {spot:round(spot),pcr:round(pcr),callOi,putOi,callDeltaOi,putDeltaOi,maxCallWall:walls.find(w=>w.side==='CALL'&&w.oi===maxCall),maxPutWall:walls.find(w=>w.side==='PUT'&&w.oi===maxPut),maxPain,flip,walls,levels,zones,updatedAt:new Date().toISOString()};
}
