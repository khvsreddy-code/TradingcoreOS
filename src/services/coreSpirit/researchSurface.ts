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
}

function splitMetrics(text:string):string[]{
  return text.split(/[\s,]+/).map(value=>value.trim()).filter(Boolean);
}

export function buildCoreSpiritResearchPlan(
  source:string,
  surface?:CoreSpiritSurfaceMetadata,
):CoreSpiritResearchPlan{
  const lines=String(source||'').replace(/\r\n?/g,'\n').split('\n');
  const backtests:CoreSpiritResearchBacktest[]=[];
  let current:CoreSpiritResearchBacktest|undefined;
  for(let i=0;i<lines.length;i+=1){
    const line=lines[i].trim();
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
  });
}
