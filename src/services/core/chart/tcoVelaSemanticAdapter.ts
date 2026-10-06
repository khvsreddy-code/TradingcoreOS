import type { IndicatorMeta, IndicatorModel } from '../../../../vendor/vela/src/core/model/indicator';
import type { SeriesPoint, SeriesSpec } from '../../../../vendor/vela/src/core/model/series';
import type { HighCardinalityRectBatch } from '../../../../vendor/vela/src/core/model/instances';
import type { CoreSpiritObject } from '../../coreSpirit/types';

export type CoreSpiritVelaMarker = {
  time:number;
  position:'aboveBar'|'belowBar'|'inBar';
  shape:string;
  color:string;
  text?:string;
};

export type CoreSpiritVelaPriceLine = {
  id:string;
  paneId:string;
  price:number;
  color?:string;
  lineStyle?:'solid'|'dashed'|'dotted';
  width?:number;
  title?:string;
};

export type CoreSpiritVelaDirtyRange = { from:number; to:number };

export function coreSpiritSignalToVelaMarker(
  output: Extract<CoreSpiritObject,{kind:'signal'}>,
): CoreSpiritVelaMarker {
  return {
    time:Number(output.time),
    position:output.metadata?.position === 'below' ? 'belowBar' : 'aboveBar',
    shape:output.metadata?.shape === 'arrowUp' ? 'arrowUp' : 'circle',
    color:String(output.metadata?.color || '#9b8aff'),
    ...(output.type ? { text:String(output.type) } : {}),
  };
}

/**
 * TCO semantic adapter: translates CoreSpirit execution outputs into Vela's
 * native IndicatorModel. It does not recreate Vela's chart/workspace API. Steady-state
 * execution is patch-based; this model is only the retained initial/structural snapshot.
 */
export function buildCoreSpiritVelaIndicatorModel(
  id:string,
  meta:IndicatorMeta,
  points:Map<string, SeriesPoint[]>,
  markers:readonly CoreSpiritVelaMarker[],
  priceLines:CoreSpiritVelaPriceLine[],
  rectBatches:readonly HighCardinalityRectBatch[] = [],
  anchorTime?:number,
  dirty?:CoreSpiritVelaDirtyRange,
): IndicatorModel {
  const series:SeriesSpec[]=[...points.entries()].map(([seriesId, seriesPoints], index)=>({
    id:`${id}:series:${seriesId}`,
    title:seriesId.includes(':') ? seriesId.split(':').pop() || 'CoreSpirit' : seriesId,
    paneId:'price',
    kind:'line',
    points:seriesPoints,
    style:{
      color:index===0 ? '#9b8aff' : '#c4b5fd',
      width:2,
      lineStyle:'solid',
    },
    visible:true,
    overlay:true,
  }));

  if(markers.length){
    series.push({
      id:`${id}:signals`,
      title:'Signals',
      paneId:'price',
      kind:'markers',
      markers:[...markers],
      visible:true,
      overlay:true,
    } as SeriesSpec);
  }

  return {
    id,
    ...(dirty ? {dirty} : {}),
    title:meta.title,
    shorttitle:meta.shorttitle,
    overlay:true,
    paneHint:'price',
    legend:true,
    anchorTime:anchorTime as IndicatorModel['anchorTime'],
    series,
    fills:[],
    backgrounds:[],
    ...(rectBatches.length ? { instanceBatches:[...rectBatches] } : {}),
    priceLines,
    inputs:[],
    inputValues:{},
  };
}
