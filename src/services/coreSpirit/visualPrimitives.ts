import type {CoreSpiritObject,CoreSpiritVisualStyle} from './types';
export type CoreSpiritPlotShape='circle'|'square'|'diamond'|'triangleUp'|'triangleDown'|'arrowUp'|'arrowDown'|'cross'|'star';
export function coreSpiritPlotShape(id:string,time:number,price:number,shape:CoreSpiritPlotShape,style:CoreSpiritVisualStyle={}):CoreSpiritObject{
  if(!id.trim()||!Number.isFinite(time)||!Number.isFinite(price))throw new Error('plotshape requires a stable id and finite time/price coordinates.');
  return Object.freeze({kind:'shape',id,time,price,shape,style:Object.freeze({...style})});
}
export function coreSpiritPlotChar(id:string,time:number,price:number,char:string,style:CoreSpiritVisualStyle={}):CoreSpiritObject{
  if(!id.trim()||!Number.isFinite(time)||!Number.isFinite(price)||!char)throw new Error('plotchar requires a stable id, finite coordinates and a character.');
  return Object.freeze({kind:'label',id,time,price,text:char,position:'price',style:Object.freeze({color:style.textColor??style.color,background:style.fillColor,fontSize:style.size})});
}
/** Fill between two plotted series using native retained band objects; nulls break the fill instead of bridging gaps. */
export function coreSpiritFillSeries(id:string,times:readonly number[],first:readonly (number|null)[],second:readonly (number|null)[],style:CoreSpiritVisualStyle={}):CoreSpiritObject[]{
  if(!id.trim()||times.length!==first.length||times.length!==second.length)throw new Error('fill requires a stable id and equally sized time/series arrays.');
  const result:CoreSpiritObject[]=[];
  for(let i=0;i<times.length;i++){
    const a=first[i],b=second[i],time=times[i]!;
    if(!Number.isFinite(time))throw new Error('fill timestamps must be finite.');
    if(a==null||b==null||!Number.isFinite(a)||!Number.isFinite(b))continue;
    result.push(Object.freeze({kind:'band',id:id+':'+time,time,top:Math.max(a,b),bottom:Math.min(a,b),style:Object.freeze({...style})}));
  }
  return result;
}
