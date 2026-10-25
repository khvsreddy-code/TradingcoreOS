import type { CoreSpiritSurfaceMetadata } from './languageConcepts';

export const CORE_SPIRIT_RESEARCH_SURFACE_VERSION=1 as const;

export type CoreSpiritResearchEvaluationMetric =
  | 'sharpe'
  | 'sortino'
  | 'max_drawdown'
  | 'turnover'
  | 'hit_rate'
  | 'profit_factor'
  | 'exposure'
  | string;

export interface CoreSpiritResearchModelSpec {
  name:string;
  features:readonly string[];
  target?:string;
}

export interface CoreSpiritResearchBacktest {
  id:string;
  model:string;
  from?:string;
  to?:string;
  evaluations:readonly CoreSpiritResearchEvaluationMetric[];
}

export interface CoreSpiritResearchPlan {
  version:typeof CORE_SPIRIT_RESEARCH_SURFACE_VERSION;
  backtests:readonly CoreSpiritResearchBacktest[];
  models:readonly string[];
  modelSpecs:readonly CoreSpiritResearchModelSpec[];
}

function splitMetrics(text:string):string[]{
  return text.split(/[\s,]+/).map(value=>value.trim()).filter(Boolean);
}

function splitFeatureExpressions(text:string):string[]{
  const out:string[]=[];
  let start=0;
  let depth=0;
  let quote:'"'|"'"|null=null;
  let escaped=false;
  for(let i=0;i<text.length;i+=1){
    const ch=text[i];
    if(quote){
      if(escaped){escaped=false;continue;}
      if(ch==='\\'){escaped=true;continue;}
      if(ch===quote)quote=null;
      continue;
    }
    if(ch==='"'||ch==="'"){quote=ch;continue;}
    if(ch==='('||ch==='[')depth+=1;
    else if(ch===')'||ch===']')depth=Math.max(0,depth-1);
    else if(ch===','&&depth===0){
      const item=text.slice(start,i).trim();
      if(item)out.push(item);
      start=i+1;
    }
  }
  const tail=text.slice(start).trim();
  if(tail)out.push(tail);
  return out;
}

export function buildCoreSpiritResearchPlan(
  source:string,
  surface?:CoreSpiritSurfaceMetadata,
):CoreSpiritResearchPlan{
  const lines=String(source||'').replace(/\r\n?/g,'\n').split('\n');
  const backtests:CoreSpiritResearchBacktest[]=[];
  const modelSpecs:CoreSpiritResearchModelSpec[]=[];
  let current:CoreSpiritResearchBacktest|undefined;
  let activeModel:CoreSpiritResearchModelSpec|undefined;
  let activeModelIndent:number|undefined;
  let activeModelSection:'features'|'target'|undefined;
  for(let i=0;i<lines.length;i+=1){
    const raw=lines[i];
    const line=raw.trim();
    // Comments are not model/backtest declarations and must not change inferred authoring level.
    if (!line || line.startsWith('//')) continue;
    const indent=raw.match(/^[ \t]*/)?.[0].replace(/\t/g,'  ').length??0;

    const modelMatch=line.match(/^model\s+(?:"([^"]+)"|'([^']+)'|([A-Za-z_][A-Za-z0-9_]*))\s*(?::|\{)\s*$/i);
    if(modelMatch){
      activeModel={name:modelMatch[1]??modelMatch[2]??modelMatch[3]??'Model',features:[]};
      activeModelIndent=indent;
      activeModelSection=undefined;
      modelSpecs.push(activeModel);
      continue;
    }
    if(activeModel){
      if(line==='}' && indent<=activeModelIndent!){
        activeModel=undefined; activeModelIndent=undefined; activeModelSection=undefined; continue;
      }
      if(indent<=activeModelIndent!){
        activeModel=undefined; activeModelIndent=undefined; activeModelSection=undefined;
      } else if(/^(?:features?|inputs?)\s*:\s*(.*)$/i.test(line)){
        const value=line.match(/^(?:features?|inputs?)\s*:\s*(.*)$/i)?.[1]?.trim()??'';
        activeModelSection='features';
        if(value) activeModel={...activeModel,features:[...activeModel.features,...splitFeatureExpressions(value)]};
        modelSpecs[modelSpecs.length-1]=activeModel;
        continue;
      } else if(/^(?:targets?|predict)\s*:\s*(.*)$/i.test(line)){
        const value=line.match(/^(?:targets?|predict)\s*:\s*(.*)$/i)?.[1]?.trim()??'';
        activeModelSection='target';
        if(value) activeModel={...activeModel,target:value};
        modelSpecs[modelSpecs.length-1]=activeModel;
        continue;
      } else if(activeModelSection==='features'){
        if(line) activeModel={...activeModel,features:[...activeModel.features,...splitFeatureExpressions(line.replace(/,$/,''))]};
        modelSpecs[modelSpecs.length-1]=activeModel;
        continue;
      } else if(activeModelSection==='target'){
        if(line) activeModel={...activeModel,target:line.replace(/,$/,'')};
        modelSpecs[modelSpecs.length-1]=activeModel;
        continue;
      }
    }

    const match=line.match(/^backtest\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+from\s+(?:"([^"]+)"|'([^']+)'))?(?:\s+to\s+(?:"([^"]+)"|'([^']+)'))?\s*;?$/i);
    if(match){
      current={
        id:`backtest:${match[1]}:${i}`,
        model:match[1],
        ...(match[2]||match[3]?{from:match[2]??match[3]}:{}),
        ...(match[4]||match[5]?{to:match[4]??match[5]}:{}),
        evaluations:[],
      };
      backtests.push(current);
      continue;
    }
    if(current){
      const fromMatch=line.match(/^(?:from|start)\s+(?:"([^"]+)"|'([^']+)')\s*;?$/i);
      if(fromMatch){
        current={...current,from:fromMatch[1]??fromMatch[2]};
        backtests[backtests.length-1]=current;
        continue;
      }
      const toMatch=line.match(/^(?:to|end)\s+(?:"([^"]+)"|'([^']+)')\s*;?$/i);
      if(toMatch){
        current={...current,to:toMatch[1]??toMatch[2]};
        backtests[backtests.length-1]=current;
        continue;
      }
    }
    if(current && /^evaluate\s*\{?\s*$/i.test(line)){
      const evalIndent=lines[i].match(/^[ \t]*/)?.[0].replace(/\t/g,'  ').length??0;
      const metrics:string[]=[];
      let j=i+1;
      for(;j<lines.length;j+=1){
        const metricLine=lines[j];
        if(metricLine.trim() && (metricLine.match(/^[ \t]*/)?.[0].replace(/\t/g,'  ').length??0)<=evalIndent) break;
        metrics.push(...splitMetrics(metricLine.trim().replace(/,$/,'')));
      }
      current={...current,evaluations:Object.freeze([...new Set(metrics)])};
      backtests[backtests.length-1]=current;
      i=j-1;
    }
  }
  const frozenBacktests=backtests.map(item=>Object.freeze({
    ...item,
    evaluations:Object.freeze([...item.evaluations]),
  }));
  return Object.freeze({
    version:CORE_SPIRIT_RESEARCH_SURFACE_VERSION,
    backtests:Object.freeze(frozenBacktests),
    models:Object.freeze([...(surface?.declarations??[]).filter(item=>item.kind==='model').map(item=>item.name)]),
    modelSpecs:Object.freeze(modelSpecs.map(spec=>Object.freeze({...spec,features:Object.freeze([...spec.features])}))),
  });
}
