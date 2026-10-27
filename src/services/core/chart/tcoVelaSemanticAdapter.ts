import type { IndicatorMeta, IndicatorModel, SeriesPoint, SeriesSpec, HighCardinalityRectBatch, InputSchema, InputValue } from './velaNativeChartKernel';
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
  inputs:readonly InputSchema[] = [],
  inputValues:Readonly<Record<string,InputValue>> = {},
  props:readonly InputSchema[] = [],
  propValues:Readonly<Record<string,InputValue>> = {},
  drawings?:{
    seriesStyles?:ReadonlyMap<string,{title?:string;style?:{color?:string;width?:number;lineStyle?:'solid'|'dashed'|'dotted'}}>;
    lines?:NonNullable<IndicatorModel['lines']>;
    boxes?:NonNullable<IndicatorModel['boxes']>;
    labels?:NonNullable<IndicatorModel['labels']>;
    polylines?:NonNullable<IndicatorModel['polylines']>;
    backgrounds?:NonNullable<IndicatorModel['backgrounds']>;
  },
): IndicatorModel {
  const series:SeriesSpec[]=[...points.entries()].map(([seriesId, seriesPoints], index)=>{
    const presentation=drawings?.seriesStyles?.get(seriesId);
    return ({
    id:`${id}:series:${seriesId}`,
    title:presentation?.title || (seriesId.includes(':') ? seriesId.split(':').pop() || 'CoreSpirit' : seriesId),
    paneId:'price',
    kind:'line',
    // Vela retains model points between patches; never expose CoreSpirit's mutable scene buffers.
    points:seriesPoints.map(point=>({...point})),
    style:{
      color:presentation?.style?.color ?? (index===0 ? '#9b8aff' : '#c4b5fd'),
      width:presentation?.style?.width ?? 2,
      lineStyle:presentation?.style?.lineStyle ?? 'solid',
    },
    visible:true,
    // Only price-overlay scripts should force their series onto Vela's price pane.
    // For overlay:false, Vela routes the model into its dedicated study pane.
    overlay:meta.overlay,
  });
  });

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
    overlay:meta.overlay,
    ...(meta.precision !== undefined ? { precision:meta.precision } : {}),
    ...(meta.format ? { format:meta.format } : {}),
    paneHint:meta.overlay ? 'price' : 'new',
    legend:true,
    anchorTime:anchorTime as IndicatorModel['anchorTime'],
    series,
    fills:[],
    backgrounds:drawings?.backgrounds?.length ? drawings.backgrounds.map(value=>({...value})) : [],
    ...(drawings?.lines?.length ? { lines:drawings.lines.map(value=>({...value})) } : {}),
    ...(drawings?.boxes?.length ? { boxes:drawings.boxes.map(value=>({...value})) } : {}),
    ...(drawings?.labels?.length ? { labels:drawings.labels.map(value=>({...value})) } : {}),
    ...(drawings?.polylines?.length ? { polylines:drawings.polylines.map(value=>({...value,points:value.points.map(point=>({...point}))})) } : {}),
    ...(rectBatches.length ? { instanceBatches:rectBatches.map(batch=>({...batch,instances:batch.instances.map(instance=>({...instance}))})) } : {}),
    priceLines:priceLines.map(value=>({...value})),
    inputs:[...inputs],
    inputValues:{...inputValues},
    ...(props.length ? { props:[...props], propValues:{...propValues} } : {}),
  };
}
