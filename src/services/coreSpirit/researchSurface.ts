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
  return text.split(/[,s]+/).map(value=>value.trim()).filter(Boolean);
}

export function buildCoreSpiritResearchPlan(
  source:string,
  surface?:CoreSpiritSurfaceMetadata,
):CoreSpiritResearchPlan{
  const lines=String(source||'').replace(/\r\n?/g,'\n').split('\n');
  const backtests:CoreSpiritResearchBacktest[]=[];
  for(let i=0;i<lines.length;i+=1){
    const line=lines[i].trim();
    const match=line.match(/^backtest\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s+from\s+(?:"([^"]+)"|'([^']+)'))?(?:\s+to\s+(?:"([^"]+)"|'([^']+)'))?\s*;?$/i);
    if(!match) continue;
    const declaration:CoreSpiritResearchBacktest={
      id:`backtest:${match[1]}:${i}`,
      model:match[1],
      ...(match[2]||match[3]?{from:match[2]??match[3]}:{}),
      ...(match[4]||match[5]?{to:match[4]??match[5]}:{}),
      evaluations:[],
    };
    let j=i+1;
    while(j<lines.length){
      const candidate=lines[j];
      if(!candidate.trim()){j+=1;continue;}
      if((candidate.match(/^[ \t]*/)?.[0].length??0)<=((lines[i].match(/^[ \t]*/)?.[0].length??0))) break;
      const evaluate=candidate.trim().match(/^evaluate\s*\{?\s*$/i);
      if(evaluate){
        const evalIndent=candidate.match(/^[ \t]*/)?.[0].length??0;
        j+=1;
        while(j<lines.length){
          const metricLine=lines[j];
          if(metricLine.trim() && (metricLine.match(/^[ \t]*/)?.[0].length??0)<=evalIndent) break;
          const metrics=splitMetrics(metricLine.trim().replace(/,$/,''));
          if(metrics.length) declaration.evaluations=[...declaration.evaluations,...metrics];
          j+=1;
        }
        i=j-1;
        break;
      }
      j+=1;
    }
    backtests.push(Object.freeze({
      ...declaration,
      evaluations:Object.freeze([...new Set(declaration.evaluations)]),
    }));
  }
  return Object.freeze({
    version:CORE_SPIRIT_RESEARCH_SURFACE_VERSION,
    backtests:Object.freeze(backtests),
    models:Object.freeze([...(surface?.declarations??[]).filter(item=>item.kind==='model').map(item=>item.name)]),
  });
}
