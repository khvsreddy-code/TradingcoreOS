import type { ChartDataPlane } from '../../../marketData/chartDataPlane';
import type { ChartStore } from '../ChartStore';
import { marketDataStore } from '../../../marketData/MarketDataStore';

export type ChartDataControllerDeps={
  key:string;
  plane:ChartDataPlane;
  chartStore:ChartStore;
};

export function createChartDataController(deps:ChartDataControllerDeps){
  const {key,plane,chartStore}=deps;
  let attached=false;
  let detachStore:undefined|(()=>void);

  const attach=()=>{
    if(attached)return;
    attached=true;
    detachStore=marketDataStore.attach(key,plane);
  };

  const subscribe=(listener:(event:any)=>void)=>{
    attach();
    return marketDataStore.subscribe(key,(event)=>{
      listener(event);
    });
  };

  const loadOlderHistory=(visibleBars?:number)=>marketDataStore.requestOlder(key,visibleBars);
  const requestWarmHistory=(visibleBars?:number)=>marketDataStore.requestWarm(key,visibleBars);
  const readCanonical=()=>marketDataStore.readCanonical(key);

  const dispose=()=>{
    detachStore?.();
    detachStore=undefined;
    marketDataStore.detach(key);
    attached=false;
  };

  return {attach,subscribe,loadOlderHistory,requestWarmHistory,readCanonical,dispose};
}
